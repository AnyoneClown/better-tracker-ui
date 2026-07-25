import { NextRequest, NextResponse } from "next/server";

import { isAuthUser } from "@/lib/auth";
import { backendUrl } from "@/lib/backend";
import { isSameOriginMutation } from "@/lib/request-security";
import { setSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

type Credentials = {
  email: string;
  password: string;
};

type AccessTokenResponse = {
  access_token: string;
  token_type: "bearer";
  expires_in: number;
};

function isCredentials(value: unknown): value is Credentials {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Credentials>;
  return typeof candidate.email === "string" && typeof candidate.password === "string";
}

function isAccessTokenResponse(value: unknown): value is AccessTokenResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AccessTokenResponse>;
  return (
    typeof candidate.access_token === "string"
    && candidate.access_token.length > 0
    && candidate.token_type === "bearer"
    && typeof candidate.expires_in === "number"
    && Number.isFinite(candidate.expires_in)
    && candidate.expires_in > 0
  );
}

function json(payload: unknown, status: number): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function postCredentials(target: URL, credentials: Credentials): Promise<Response> {
  return fetch(target, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return json({ detail: "Cross-origin requests are not allowed" }, 403);
  }

  let credentials: unknown;
  try {
    credentials = await request.json();
  } catch {
    return json({ detail: "A JSON request body is required" }, 400);
  }
  if (!isCredentials(credentials)) {
    return json({ detail: "Email and password are required" }, 422);
  }

  const registrationTarget = backendUrl("/api/v1/auth/register");
  const loginTarget = backendUrl("/api/v1/auth/login");
  if (!registrationTarget || !loginTarget) {
    return json(
      { detail: "BETTER_TRACKER_API_URL is missing or invalid on the frontend deployment." },
      503,
    );
  }

  let registration: Response;
  try {
    registration = await postCredentials(registrationTarget, credentials);
  } catch {
    return json({ detail: "The Better Tracker backend is unavailable." }, 502);
  }

  const registeredUser: unknown = await registration.json().catch(() => null);
  if (!registration.ok) {
    return json(
      registeredUser ?? { detail: `Backend request failed (${registration.status})` },
      registration.status,
    );
  }
  if (!isAuthUser(registeredUser)) {
    return json({ detail: "The backend returned an invalid registration response." }, 502);
  }

  let login: Response;
  try {
    login = await postCredentials(loginTarget, credentials);
  } catch {
    return json(
      { detail: "Your account was created, but automatic sign-in failed. Please sign in." },
      502,
    );
  }

  const tokenPayload: unknown = await login.json().catch(() => null);
  if (!login.ok || !isAccessTokenResponse(tokenPayload)) {
    return json(
      { detail: "Your account was created, but automatic sign-in failed. Please sign in." },
      502,
    );
  }

  const response = json({ user: registeredUser }, 201);
  setSessionCookie(response, tokenPayload.access_token, tokenPayload.expires_in);
  return response;
}
