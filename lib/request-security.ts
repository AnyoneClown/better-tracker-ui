import "server-only";

import type { NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSameOriginMutation(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return true;

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (origin === null) return true;

  const host = request.headers.get("host");
  const forwardedProtocol = request.headers
    .get("x-forwarded-proto")
    ?.split(",", 1)[0]
    ?.trim();
  const protocol = forwardedProtocol || request.nextUrl.protocol.replace(/:$/, "");
  const hostOrigin = host ? `${protocol}://${host}` : null;
  return origin === request.nextUrl.origin || origin === hostOrigin;
}
