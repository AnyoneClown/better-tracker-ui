import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { safeReturnPath } from "@/lib/auth";
import { backendUrl } from "@/lib/backend";
import { secureCookiesEnabled } from "@/lib/cookie-security";
import { setSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE = "better_tracker_google_oauth";

type OAuthFlow = {
  state: string;
  verifier: string;
  nextPath: string;
  mode: "login" | "register";
};

type AccessTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
};

function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccessTokenResponse>;
  return (
    typeof candidate.access_token === "string"
    && candidate.access_token.length > 0
    && candidate.token_type === "bearer"
    && typeof candidate.expires_in === "number"
    && candidate.expires_in > 0
  );
}

function parseFlow(value: string | undefined): OAuthFlow | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString()) as Partial<OAuthFlow>;
    if (
      typeof parsed.state !== "string"
      || typeof parsed.verifier !== "string"
      || typeof parsed.nextPath !== "string"
      || (parsed.mode !== "login" && parsed.mode !== "register")
    ) return null;
    return { ...parsed, nextPath: safeReturnPath(parsed.nextPath) } as OAuthFlow;
  } catch {
    return null;
  }
}

function sameState(received: string | null, expected: string): boolean {
  if (!received) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function clearOAuthCookie(response: NextResponse): void {
  response.cookies.set({
    name: OAUTH_COOKIE,
    value: "",
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
}

function authError(
  request: NextRequest,
  reason: string,
  flow?: OAuthFlow | null,
): NextResponse {
  const target = new URL(`/${flow?.mode ?? "login"}`, request.url);
  target.searchParams.set("next", flow?.nextPath ?? "/");
  target.searchParams.set("oauth_error", reason);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  clearOAuthCookie(response);
  return response;
}

async function startGoogleOAuth(request: NextRequest): Promise<NextResponse> {
  const mode = request.nextUrl.searchParams.get("mode") === "register"
    ? "register"
    : "login";
  const nextPath = safeReturnPath(request.nextUrl.searchParams.get("next"));
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = new URL("/api/auth/google", request.nextUrl.origin).toString();
  const target = backendUrl("/api/v1/auth/google/authorize");
  if (!target) return authError(request, "config", { state, verifier, nextPath, mode });
  target.searchParams.set("redirect_uri", redirectUri);
  target.searchParams.set("state", state);
  target.searchParams.set("code_challenge", codeChallenge);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return authError(request, "unavailable", { state, verifier, nextPath, mode });
  }
  const payload = await upstream.json().catch(() => null) as {
    authorization_url?: unknown;
  } | null;
  if (!upstream.ok || typeof payload?.authorization_url !== "string") {
    return authError(request, upstream.status === 503 ? "config" : "unavailable", {
      state,
      verifier,
      nextPath,
      mode,
    });
  }

  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(payload.authorization_url);
    if (
      authorizationUrl.protocol !== "https:"
      || authorizationUrl.hostname !== "accounts.google.com"
    ) throw new Error("Invalid Google authorization URL");
  } catch {
    return authError(request, "unavailable", { state, verifier, nextPath, mode });
  }

  const response = NextResponse.redirect(authorizationUrl);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set({
    name: OAUTH_COOKIE,
    value: Buffer.from(JSON.stringify({ state, verifier, nextPath, mode })).toString("base64url"),
    httpOnly: true,
    secure: secureCookiesEnabled(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 10 * 60,
  });
  return response;
}

async function finishGoogleOAuth(request: NextRequest): Promise<NextResponse> {
  const flow = parseFlow(request.cookies.get(OAUTH_COOKIE)?.value);
  if (!flow || !sameState(request.nextUrl.searchParams.get("state"), flow.state)) {
    return authError(request, "state", flow);
  }
  if (request.nextUrl.searchParams.has("error")) {
    return authError(request, "cancelled", flow);
  }
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return authError(request, "exchange", flow);

  const target = backendUrl("/api/v1/auth/google/exchange");
  if (!target) return authError(request, "config", flow);
  const redirectUri = new URL("/api/auth/google", request.nextUrl.origin).toString();
  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, redirect_uri: redirectUri, code_verifier: flow.verifier }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return authError(request, "unavailable", flow);
  }
  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok || !isAccessTokenResponse(payload)) {
    return authError(request, upstream.status === 503 ? "config" : "exchange", flow);
  }

  const response = NextResponse.redirect(new URL(flow.nextPath, request.url));
  response.headers.set("Cache-Control", "no-store");
  setSessionCookie(response, payload.access_token, payload.expires_in);
  clearOAuthCookie(response);
  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  return params.has("code") || params.has("state") || params.has("error")
    ? finishGoogleOAuth(request)
    : startGoogleOAuth(request);
}
