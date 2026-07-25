import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

function backendBaseUrl(): URL | null {
  const configured = process.env.BETTER_TRACKER_API_URL;
  const candidate = configured
    ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : null);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) {
    return Response.json(
      {
        detail: "BETTER_TRACKER_API_URL is missing or invalid on the frontend deployment.",
      },
      { status: 503 },
    );
  }

  const { path } = await context.params;
  const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const target = new URL(safePath, `${baseUrl.toString().replace(/\/+$/, "")}/`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const header of ["accept", "content-type", "authorization"] as const) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return Response.json(
      { detail: "The Better Tracker backend is unavailable." },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("content-type", contentType);
  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;

