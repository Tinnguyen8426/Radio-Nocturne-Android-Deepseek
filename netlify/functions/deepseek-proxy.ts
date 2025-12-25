import type { HandlerEvent } from "@netlify/functions";
import { Buffer } from "node:buffer";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const FUNCTION_PREFIX = "/.netlify/functions/deepseek-proxy";

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });

export default async function handler(event: HandlerEvent): Promise<Response> {
  const method = (event.httpMethod || "GET").toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
      },
    });
  }

  if (method !== "POST") {
    return jsonResponse(405, { error: `Method ${method} Not Allowed` });
  }

  const apiKey =
    process.env.DEEPSEEK_API_KEY || process.env.VITE_DEEPSEEK_API_KEY || "";
  if (!apiKey) {
    return jsonResponse(500, { error: "DeepSeek API key is not configured." });
  }

  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  const downstreamPath =
    (event.path || "").replace(FUNCTION_PREFIX, "") || "/chat/completions";
  const query = event.rawQuery ? `?${event.rawQuery}` : "";
  const url = `${baseUrl}${downstreamPath}${query}`;

  console.info("[deepseek-proxy] incoming request", {
    method,
    path: downstreamPath,
    query: event.rawQuery || "",
  });

  const body =
    event.body && event.isBase64Encoded
      ? Buffer.from(event.body, "base64")
      : event.body;

  const outboundHeaders = new Headers();
  Object.entries(event.headers || {}).forEach(([key, value]) => {
    if (!value) return;
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "content-length") return;
    outboundHeaders.set(key, value);
  });
  outboundHeaders.set("Authorization", `Bearer ${apiKey}`);
  if (!outboundHeaders.has("content-type")) {
    outboundHeaders.set("content-type", "application/json");
  }

  try {
    const upstream = await fetch(url, {
      method,
      headers: outboundHeaders,
      body,
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("DeepSeek proxy error:", error);
    return jsonResponse(502, {
      error: "DeepSeek proxy request failed.",
      details:
        error instanceof Error ? error.message : "Unknown error encountered.",
    });
  }
}
