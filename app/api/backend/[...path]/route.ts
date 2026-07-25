import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { backendBaseUrl } from "@/lib/backend";
import { isSameOriginMutation } from "@/lib/request-security";
import { clearSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  if (!isSameOriginMutation(request)) {
    return Response.json(
      { detail: "Cross-origin requests are not allowed" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

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
  if (safePath.startsWith("api/v1/auth/")) {
    return Response.json(
      { detail: "Use the frontend authentication routes" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }
  const target = new URL(safePath, `${baseUrl.toString().replace(/\/+$/, "")}/`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  for (const header of ["accept", "content-type"] as const) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }
  const accessToken = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (accessToken) headers.set("authorization", `Bearer ${accessToken}`);

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
  const authenticate = upstream.headers.get("www-authenticate");
  if (authenticate) responseHeaders.set("www-authenticate", authenticate);
  responseHeaders.set("cache-control", "no-store");

  const response = new NextResponse(upstream.status === 204 ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  if (upstream.status === 401 && accessToken) clearSessionCookie(response);
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
