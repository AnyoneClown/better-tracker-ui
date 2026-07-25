import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, safeReturnPath } from "@/lib/auth";

export function proxy(request: NextRequest): NextResponse {
  if (request.cookies.has(AUTH_COOKIE_NAME)) return NextResponse.next();

  const returnPath = safeReturnPath(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", returnPath);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/", "/money/:path*", "/training/:path*", "/nutrition/:path*", "/body/:path*"],
};
