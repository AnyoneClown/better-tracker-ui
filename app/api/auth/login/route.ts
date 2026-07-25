import { NextRequest, NextResponse } from "next/server";

import { backendUrl } from "@/lib/backend";
import { isSameOriginMutation } from "@/lib/request-security";
import { setSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

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

  const target = backendUrl("/api/v1/auth/login");
  if (!target) {
    return json(
      { detail: "BETTER_TRACKER_API_URL is missing or invalid on the frontend deployment." },
      503,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(credentials),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return json({ detail: "The Better Tracker backend is unavailable." }, 502);
  }

  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return json(
      payload ?? { detail: `Backend request failed (${upstream.status})` },
      upstream.status,
    );
  }
  if (!isAccessTokenResponse(payload)) {
    return json({ detail: "The backend returned an invalid login response." }, 502);
  }

  const response = json({ authenticated: true }, 200);
  setSessionCookie(response, payload.access_token, payload.expires_in);
  return response;
}
