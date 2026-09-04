import "server-only";

import type { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME } from "@/lib/auth";
import { secureCookiesEnabled } from "@/lib/cookie-security";

const MAX_SESSION_SECONDS = 24 * 60 * 60;

export function setSessionCookie(
  response: NextResponse,
  accessToken: string,
  expiresIn: number,
): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: accessToken,
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.min(Math.max(Math.floor(expiresIn), 1), MAX_SESSION_SECONDS),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
