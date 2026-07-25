import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, isAuthUser } from "@/lib/auth";
import { backendUrl } from "@/lib/backend";
import { clearSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

function json(payload: unknown, status: number): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return json({ detail: "Not authenticated" }, 401);

  const target = backendUrl("/api/v1/auth/me");
  if (!target) {
    return json(
      { detail: "BETTER_TRACKER_API_URL is missing or invalid on the frontend deployment." },
      503,
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return json({ detail: "The Better Tracker backend is unavailable." }, 502);
  }

  const payload: unknown = await upstream.json().catch(() => null);
  if (!upstream.ok || !isAuthUser(payload)) {
    const response = json(
      payload ?? { detail: upstream.ok ? "The backend returned an invalid user response." : "Not authenticated" },
      upstream.ok ? 502 : upstream.status,
    );
    if (upstream.status === 401) clearSessionCookie(response);
    return response;
  }

  return json({ user: payload }, 200);
}
