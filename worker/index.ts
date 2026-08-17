/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { DurableObject } from "cloudflare:workers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  SIGN_STATUS: DurableObjectNamespace;
  ESIGN_CLIENT_ID?: string;
  ESIGN_SECRET_KEY?: string;
  ESIGN_API_URL?: string;
  ESIGN_WEBHOOK_SECRET?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type StoredSignStatus = {
  signRequestId: string;
  state: string;
  signedFileUrl?: string;
  identityKey?: string;
  identityKeyExpiresAt?: string;
  expiresIn?: number;
  rejectedReason?: string;
  lastUpdatedAt: string;
};

// Kept for compatibility with the v1 Durable Object migration. Current status
// reads use BankHub plus webhook cache, so a cached PENDING value cannot block polling.
export class SignStatusStore extends DurableObject<Env> {
  private listeners: Set<WritableStreamDefaultWriter<Uint8Array>> = new Set();

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/stream" || request.headers.get("accept")?.includes("text/event-stream")) {
      const stored = await this.ctx.storage.get<StoredSignStatus>("status");
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      if (stored && ["COMPLETED", "REJECTED"].includes(stored.state)) {
        writer.write(encoder.encode(`data: ${JSON.stringify(stored)}\n\n`));
        writer.close();
      } else {
        this.listeners.add(writer);
        writer.write(encoder.encode(`: ok\n\n`));
      }

      return new Response(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    if (request.method === "GET") {
      const status = await this.ctx.storage.get<StoredSignStatus>("status");
      return status
        ? Response.json(status)
        : Response.json({ message: "Chưa có trạng thái yêu cầu ký." }, { status: 404 });
    }

    if (request.method === "PUT") {
      const status = await request.json<StoredSignStatus>();
      await this.ctx.storage.put("status", status);

      const encoder = new TextEncoder();
      const payload = encoder.encode(`data: ${JSON.stringify(status)}\n\n`);
      for (const writer of this.listeners) {
        try {
          await writer.write(payload);
          await writer.close();
        } catch {
          // Stream already closed
        }
      }
      this.listeners.clear();

      return Response.json(status);
    }

    return new Response("Method not allowed", { status: 405 });
  }
}

const statusCacheKey = (signRequestId: string): Request =>
  new Request(`https://sign-status.internal/status/${encodeURIComponent(signRequestId)}`);

const pdfCacheKey = (identityKey: string): Request =>
  new Request(`https://sign-status.internal/pdf/${encodeURIComponent(identityKey)}`);

const statusCache = (): Cache => (caches as CacheStorage & { default: Cache }).default;

const loadSignStatus = async (env: Env, signRequestId: string): Promise<StoredSignStatus | null> => {
  if (env.SIGN_STATUS) {
    try {
      const id = env.SIGN_STATUS.idFromName(signRequestId);
      const stub = env.SIGN_STATUS.get(id);
      const response = await stub.fetch("https://sign-status.internal/status");
      if (response.ok) {
        return await response.json<StoredSignStatus>();
      }
    } catch (error) {
      console.warn("[esign.status] DO read fallback", error);
    }
  }
  const response = await statusCache().match(statusCacheKey(signRequestId));
  return response ? response.json<StoredSignStatus>() : null;
};

const saveSignStatus = async (env: Env, status: StoredSignStatus): Promise<void> => {
  if (env.SIGN_STATUS) {
    try {
      const id = env.SIGN_STATUS.idFromName(status.signRequestId);
      const stub = env.SIGN_STATUS.get(id);
      await stub.fetch("https://sign-status.internal/status", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(status),
      });
    } catch (error) {
      console.warn("[esign.status] DO write fallback", error);
    }
  }
  await statusCache().put(statusCacheKey(status.signRequestId), Response.json(status, {
    headers: { "cache-control": "public, max-age=86400" },
  }));
};

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const sanitizeLogText = (value: string): string => value
  .slice(0, 2000)
  .replace(/\b\d{8,}\b/g, "[redacted-number]")
  .replace(/([?&](?:X-Amz-Signature|X-Amz-Credential)=)[^&]+/gi, "$1[redacted]");

const decodeBase64ToUint8Array = (input: string): Uint8Array => {
  let clean = input.trim().replace(/^"|"$/g, "").replace(/^data:application\/pdf;base64,/, "").replace(/[\s\r\n]+/g, "");
  clean = clean.replace(/-/g, "+").replace(/_/g, "/");
  const remainder = clean.length % 4;
  if (remainder === 2) {
    clean += "==";
  } else if (remainder === 3) {
    clean += "=";
  }

  try {
    const binaryString = atob(clean);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    if (typeof Buffer !== "undefined") {
      return new Uint8Array(Buffer.from(clean, "base64"));
    }
    throw e;
  }
};

const extractBase64String = (input: unknown): string | null => {
  if (typeof input === "string") {
    const trimmed = input.trim();
    const clean = trimmed.replace(/^data:application\/pdf;base64,/, "").replace(/[\s\r\n]+/g, "");
    if (clean.length > 20 && !clean.startsWith("{") && !clean.startsWith("<")) {
      return clean;
    }
  }
  if (input && typeof input === "object") {
    const keysToTry = ["file", "data", "fileContent", "file_content", "pdfBase64", "pdf_base64", "base64", "base64Data", "base64_data", "content", "document", "signedFile", "signed_file"];
    for (const key of keysToTry) {
      if ((input as Record<string, any>)[key]) {
        const found = extractBase64String((input as Record<string, any>)[key]);
        if (found) return found;
      }
    }
    for (const val of Object.values(input as Record<string, any>)) {
      const found = extractBase64String(val);
      if (found) return found;
    }
  }
  return null;
};

const fetchAndCacheSignedPdf = async (env: Env, identityKey: string): Promise<Response | null> => {
  try {
    const cache = statusCache();
    const key = pdfCacheKey(identityKey);
    const cachedResponse = await cache.match(key);
    if (cachedResponse) {
      console.info("[esign.download] returning cached PDF", { identityKey });
      return cachedResponse;
    }
    if (!env.ESIGN_CLIENT_ID || !env.ESIGN_SECRET_KEY) {
      console.warn("[esign.download] missing credentials", { identityKey });
      return Response.json({ message: "Máy chủ chưa được cấu hình thông tin kết nối API ký số." }, { status: 500 });
    }
    const apiBase = (env.ESIGN_API_URL || "https://production.bankhub.dev/esign/push-request-document")
      .replace(/\/(push-request-document|download-file|request-status)\/?$/, "");

    console.info("[esign.download] calling BankHub download-file API", {
      identityKey,
      upstreamUrl: `${apiBase}/download-file`,
    });

    const upstream = await fetch(`${apiBase}/download-file`, {
      method: "POST",
      headers: {
        "x-client-id": env.ESIGN_CLIENT_ID,
        "x-secret-key": env.ESIGN_SECRET_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identityKey }),
    });

    const buffer = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") || "";

    if (!upstream.ok) {
      return new Response(buffer, {
        status: upstream.status,
        headers: { "content-type": contentType || "application/json" },
      });
    }

    const headerSnippet = new TextDecoder().decode(buffer.slice(0, 10));
    const isDirectPdf = headerSnippet.startsWith("%PDF-") || contentType.includes("application/pdf");

    let pdfBytes: Uint8Array;

    if (isDirectPdf) {
      console.info("[esign.download] received direct PDF binary stream from BankHub", { identityKey, bytesCount: buffer.byteLength });
      pdfBytes = new Uint8Array(buffer);
    } else {
      const text = new TextDecoder().decode(buffer);
      console.info("[esign.download] BankHub download-file raw response", {
        identityKey,
        status: upstream.status,
        responseBody: sanitizeLogText(text),
      });

      let parsedJson: unknown = null;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        // plain text
      }

      const base64String = extractBase64String(parsedJson || text);
      if (!base64String) {
        console.error("[esign.download] could not extract base64 pdf string from BankHub response", { identityKey, responsePreview: sanitizeLogText(text) });
        return Response.json({ message: "Không thể trích xuất dữ liệu file PDF từ phản hồi BankHub.", responsePreview: sanitizeLogText(text) }, { status: 502 });
      }

      pdfBytes = decodeBase64ToUint8Array(base64String);
    }

    const pdfResponse = new Response(pdfBytes.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "cache-control": "public, max-age=86400",
      },
    });

    await cache.put(key, pdfResponse.clone());
    console.info("[esign.download] successfully downloaded & cached signed PDF", {
      identityKey,
      bytesCount: pdfBytes.length,
    });
    return pdfResponse;
  } catch (error) {
    console.error("[esign.download] download exception details", {
      identityKey,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return null;
  }
};

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
        const upstreamUrl = env.ESIGN_API_URL || "https://production.bankhub.dev/esign/push-request-document";
        const uploadedFile = formData.get("file");
        const signatureFieldsValue = formData.get("signatureFields");
        const documentNameValue = formData.get("documentName");
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
          documentName: typeof documentNameValue === "string" ? {
            length: documentNameValue.length,
            hasLeadingOrTrailingWhitespace: documentNameValue !== documentNameValue.trim(),
            containsControlCharacters: /[\u0000-\u001F\u007F]/.test(documentNameValue),
          } : null,
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

    if (url.pathname === "/api/esign/webhook") {
      const traceId = crypto.randomUUID();
      if (!env.ESIGN_WEBHOOK_SECRET) {
        console.error("[esign.webhook] missing webhook secret", { traceId });
        return Response.json({ message: "Webhook chưa được cấu hình.", traceId }, { status: 500 });
      }
      if (url.searchParams.get("token") !== env.ESIGN_WEBHOOK_SECRET) {
        console.warn("[esign.webhook] unauthorized", { traceId });
        return Response.json({ message: "Webhook token không hợp lệ.", traceId }, { status: 401 });
      }

      if (request.method === "GET") {
        return Response.json({
          status: "active",
          message: "Webhook URL hợp lệ và đang hoạt động. BankHub sẽ gửi callback bằng phương thức POST.",
          traceId,
        });
      }

      if (request.method === "POST") {
        try {
          const rawText = await request.text();
          console.info("[esign.webhook] incoming body", { traceId, bodyPreview: sanitizeLogText(rawText) });
          const payload = JSON.parse(rawText) as Record<string, any>;
          const signRequest = (payload.signRequest || payload) as Record<string, any>;
          const signRequestId = signRequest.signRequestId || signRequest.sign_request_id;
          const nextState = String(signRequest.state || payload.state || "").toUpperCase();
          const identityKey = signRequest.identityKey || signRequest.identity_key || payload.identityKey || payload.identity_key;
          const identityKeyExpiresAt = signRequest.identityKeyExpiresAt || signRequest.identity_key_expires_at || payload.identityKeyExpiresAt || payload.identity_key_expires_at;
          const signedFileUrl = signRequest.signedFileUrl || signRequest.signed_file_url || payload.signedFileUrl || payload.signed_file_url;
          const rejectedReason = signRequest.rejectedReason || signRequest.rejected_reason || payload.rejectedReason || payload.rejected_reason;
          const expiresIn = signRequest.expiresIn || signRequest.expires_in || payload.expiresIn || payload.expires_in;

          const webhookType = payload.webhookType || payload.webhook_type;
          const webhookCode = payload.webhookCode || payload.webhook_code;

          if (
            (webhookType && webhookType !== "SIGN")
            || (webhookCode && webhookCode !== "DEFAULT_UPDATE")
            || !signRequestId
            || !nextState
            || !["COMPLETED", "REJECTED"].includes(nextState)
          ) {
            console.warn("[esign.webhook] rejected invalid payload structure", { traceId, signRequestId, nextState, webhookType, webhookCode });
            return Response.json({ message: "Payload webhook không hợp lệ.", traceId }, { status: 400 });
          }

          const statusToStore: StoredSignStatus = {
            signRequestId,
            state: nextState,
            signedFileUrl,
            identityKey,
            identityKeyExpiresAt,
            expiresIn,
            rejectedReason,
            lastUpdatedAt: new Date().toISOString(),
          };

          await saveSignStatus(env, statusToStore);

          console.info("[esign.webhook] status stored successfully", {
            traceId,
            signRequestId,
            state: nextState,
            identityKey,
          });
          return Response.json({ ok: true, traceId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Không thể xử lý webhook.";
          console.error("[esign.webhook] invalid request exception", { traceId, message: sanitizeLogText(message) });
          return Response.json({ message: "Payload webhook không hợp lệ.", traceId }, { status: 400 });
        }
      }

      return Response.json({ message: "Phương thức không được hỗ trợ.", traceId }, { status: 405 });
    }

    if (url.pathname.startsWith("/api/esign/status/") && request.method === "GET") {
      const signRequestId = decodeURIComponent(url.pathname.slice("/api/esign/status/".length));
      if (!signRequestId) {
        return Response.json({ message: "Thiếu mã yêu cầu ký." }, { status: 400 });
      }
      try {
        const storedStatus = await loadSignStatus(env, signRequestId);
        if (storedStatus && ["COMPLETED", "REJECTED"].includes(storedStatus.state)) {
          return Response.json({ requestId: "webhook-state", signRequestStatus: storedStatus });
        }
        if (!env.ESIGN_CLIENT_ID || !env.ESIGN_SECRET_KEY) {
          return Response.json({ message: "Máy chủ chưa được cấu hình thông tin kết nối API ký số." }, { status: 500 });
        }
        const apiBase = (env.ESIGN_API_URL || "https://production.bankhub.dev/esign/push-request-document")
          .replace(/\/(push-request-document|download-file|request-status)\/?$/, "");
        const upstream = await fetch(`${apiBase}/request-status`, {
          method: "POST",
          headers: {
            "x-client-id": env.ESIGN_CLIENT_ID,
            "x-secret-key": env.ESIGN_SECRET_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ signRequestId }),
        });
        const contentType = upstream.headers.get("content-type") || "application/json";
        const payload = await upstream.arrayBuffer();
        if (upstream.ok) {
          try {
            const rawText = new TextDecoder().decode(payload);
            const parsed = JSON.parse(rawText) as Record<string, any>;
            const upstreamStatus = parsed.signRequestStatus || (parsed.signRequestId || parsed.state ? parsed : parsed.data);
            if (upstreamStatus?.state && ["COMPLETED", "REJECTED"].includes(String(upstreamStatus.state).toUpperCase())) {
              const state = String(upstreamStatus.state).toUpperCase();
              const normalizedStatus: StoredSignStatus = {
                signRequestId: upstreamStatus.signRequestId || signRequestId,
                state,
                signedFileUrl: upstreamStatus.signedFileUrl || storedStatus?.signedFileUrl,
                identityKey: upstreamStatus.identityKey || storedStatus?.identityKey,
                identityKeyExpiresAt: upstreamStatus.identityKeyExpiresAt || storedStatus?.identityKeyExpiresAt,
                expiresIn: upstreamStatus.expiresIn || storedStatus?.expiresIn,
                rejectedReason: upstreamStatus.rejectedReason || storedStatus?.rejectedReason,
                lastUpdatedAt: upstreamStatus.lastUpdatedAt || new Date().toISOString(),
              };
              ctx.waitUntil(saveSignStatus(env, normalizedStatus));
              return Response.json({ requestId: "upstream-api", signRequestStatus: normalizedStatus, ...parsed });
            }
            const mergedStatus = {
              ...(upstreamStatus || {}),
              identityKey: upstreamStatus?.identityKey || storedStatus?.identityKey,
              identityKeyExpiresAt: upstreamStatus?.identityKeyExpiresAt || storedStatus?.identityKeyExpiresAt,
            };
            return Response.json({ signRequestStatus: mergedStatus, ...parsed });
          } catch {
            // Return BankHub's response unchanged if it is not valid JSON.
          }
        }
        return new Response(payload, { status: upstream.status, headers: { "content-type": contentType } });
      } catch (error) {
        return Response.json({ message: error instanceof Error ? error.message : "Không thể lấy trạng thái ký." }, { status: 502 });
      }
    }

    if (url.pathname.startsWith("/api/esign/stream/") && request.method === "GET") {
      const signRequestId = decodeURIComponent(url.pathname.slice("/api/esign/stream/".length));
      if (!signRequestId) {
        return Response.json({ message: "Thiếu mã yêu cầu ký." }, { status: 400 });
      }
      if (env.SIGN_STATUS) {
        const id = env.SIGN_STATUS.idFromName(signRequestId);
        const stub = env.SIGN_STATUS.get(id);
        return stub.fetch("https://sign-status.internal/stream", {
          headers: { "accept": "text/event-stream" },
        });
      }
      return Response.json({ message: "Durable Object chưa được cấu hình." }, { status: 501 });
    }

    if (url.pathname === "/api/esign/signed-file" && ["GET", "POST"].includes(request.method)) {
      let identityKey = url.searchParams.get("identityKey");
      let signedFileUrl = url.searchParams.get("url");

      if (request.method === "POST" && !identityKey && !signedFileUrl) {
        try {
          const body = await request.json() as { identityKey?: string; url?: string };
          identityKey = body.identityKey || identityKey;
          signedFileUrl = body.url || signedFileUrl;
        } catch {
          // ignore invalid json body
        }
      }

      if (identityKey) {
        const response = await fetchAndCacheSignedPdf(env, identityKey);
        if (response) {
          return response;
        }
        return Response.json({ message: "Không thể tải file đã ký từ hệ thống BankHub." }, { status: 502 });
      }

      if (signedFileUrl) {
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

      return Response.json({ message: "Thiếu identityKey hoặc đường dẫn file đã ký." }, { status: 400 });
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
