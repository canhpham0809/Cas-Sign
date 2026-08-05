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

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/esign" && request.method === "POST") {
      if (!env.ESIGN_CLIENT_ID || !env.ESIGN_SECRET_KEY) {
        return Response.json({ message: "Máy chủ chưa được cấu hình thông tin kết nối API ký số." }, { status: 500 });
      }
      try {
        const formData = await request.formData();
        const upstream = await fetch(env.ESIGN_API_URL || "https://sandbox.bankhub.dev/esign/push-request-document", {
          method: "POST",
          headers: {
            "x-client-id": env.ESIGN_CLIENT_ID,
            "x-secret-key": env.ESIGN_SECRET_KEY,
          },
          body: formData,
        });
        const contentType = upstream.headers.get("content-type") || "application/json";
        const payload = await upstream.arrayBuffer();
        return new Response(payload, { status: upstream.status, headers: { "content-type": contentType } });
      } catch (error) {
        return Response.json({ message: error instanceof Error ? error.message : "Không thể kết nối dịch vụ ký số." }, { status: 502 });
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
