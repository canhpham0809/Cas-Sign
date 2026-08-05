/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  ESIGN_CLIENT_ID?: string;
  ESIGN_SECRET_KEY?: string;
  ESIGN_API_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const sanitizeLogText = (value: string): string => value
  .slice(0, 2000)
  .replace(/\b\d{8,}\b/g, "[redacted-number]")
  .replace(/([?&](?:X-Amz-Signature|X-Amz-Credential)=)[^&]+/gi, "$1[redacted]");

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/esign" && request.method === "POST") {
      const traceId = crypto.randomUUID();
      if (!env.ESIGN_CLIENT_ID || !env.ESIGN_SECRET_KEY) {
        console.error("[esign.push] missing server credentials", { traceId });
        return Response.json(
          { message: "Máy chủ chưa được cấu hình thông tin kết nối API ký số.", traceId },
          { status: 500, headers: { "x-cas-trace-id": traceId } },
        );
      }
      try {
        const formData = await request.formData();
        const upstreamUrl = env.ESIGN_API_URL || "https://sandbox.bankhub.dev/esign/push-request-document";
        const uploadedFile = formData.get("file");
        const signatureFieldsValue = formData.get("signatureFields");
        let signatureFieldCount: number | null = null;
        if (typeof signatureFieldsValue === "string") {
          try {
            const parsed = JSON.parse(signatureFieldsValue);
            signatureFieldCount = Array.isArray(parsed) ? parsed.length : null;
          } catch {
            signatureFieldCount = null;
          }
        }
        console.info("[esign.push] forwarding request", {
          traceId,
          upstreamUrl,
          fieldNames: Array.from(formData.keys()).sort(),
          signatureFieldCount,
          file: uploadedFile instanceof File ? {
            name: uploadedFile.name,
            type: uploadedFile.type,
            size: uploadedFile.size,
          } : null,
        });
        const upstream = await fetch(upstreamUrl, {
          method: "POST",
          headers: {
            "x-client-id": env.ESIGN_CLIENT_ID,
            "x-secret-key": env.ESIGN_SECRET_KEY,
          },
          body: formData,
        });
        const contentType = upstream.headers.get("content-type") || "application/json";
        const payload = await upstream.arrayBuffer();
        const responsePreview = sanitizeLogText(new TextDecoder().decode(payload));
        const logDetails = { traceId, upstreamUrl, status: upstream.status, contentType, responsePreview };
        if (upstream.ok) console.info("[esign.push] upstream response", logDetails);
        else console.error("[esign.push] upstream rejected request", logDetails);
        return new Response(payload, {
          status: upstream.status,
          headers: { "content-type": contentType, "x-cas-trace-id": traceId },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không thể kết nối dịch vụ ký số.";
        console.error("[esign.push] proxy failure", { traceId, message: sanitizeLogText(message) });
        return Response.json({ message, traceId }, { status: 502, headers: { "x-cas-trace-id": traceId } });
      }
    }

    if (url.pathname.startsWith("/api/esign/status/") && request.method === "GET") {
      if (!env.ESIGN_CLIENT_ID || !env.ESIGN_SECRET_KEY) {
        return Response.json({ message: "Máy chủ chưa được cấu hình thông tin kết nối API ký số." }, { status: 500 });
      }
      const signRequestId = decodeURIComponent(url.pathname.slice("/api/esign/status/".length));
      if (!signRequestId) {
        return Response.json({ message: "Thiếu mã yêu cầu ký." }, { status: 400 });
      }
      try {
        const apiBase = (env.ESIGN_API_URL || "https://sandbox.bankhub.dev/esign/push-request-document")
          .replace(/\/push-request-document\/?$/, "");
        const upstream = await fetch(`${apiBase}/requests/${encodeURIComponent(signRequestId)}/status`, {
          method: "GET",
          headers: {
            "x-client-id": env.ESIGN_CLIENT_ID,
            "x-secret-key": env.ESIGN_SECRET_KEY,
            "Content-Type": "application/json",
          },
        });
        const contentType = upstream.headers.get("content-type") || "application/json";
        const payload = await upstream.arrayBuffer();
        return new Response(payload, { status: upstream.status, headers: { "content-type": contentType } });
      } catch (error) {
        return Response.json({ message: error instanceof Error ? error.message : "Không thể lấy trạng thái ký." }, { status: 502 });
      }
    }

    if (url.pathname === "/api/esign/signed-file" && request.method === "GET") {
      const signedFileUrl = url.searchParams.get("url");
      if (!signedFileUrl) {
        return Response.json({ message: "Thiếu đường dẫn file đã ký." }, { status: 400 });
      }
      try {
        const target = new URL(signedFileUrl);
        const allowedHost = target.protocol === "https:" && (
          target.hostname === "s3.hn-2.cloud.cmctelecom.vn" || target.hostname.endsWith(".cloud.cmctelecom.vn")
        );
        if (!allowedHost) {
          return Response.json({ message: "Đường dẫn file đã ký không hợp lệ." }, { status: 400 });
        }
        const upstream = await fetch(target.toString());
        if (!upstream.ok) {
          return Response.json({ message: "Không thể tải file đã ký từ hệ thống lưu trữ." }, { status: upstream.status });
        }
        return new Response(upstream.body, {
          status: 200,
          headers: {
            "content-type": upstream.headers.get("content-type") || "application/pdf",
            "cache-control": "no-store",
          },
        });
      } catch {
        return Response.json({ message: "Không thể tải file đã ký." }, { status: 502 });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;
