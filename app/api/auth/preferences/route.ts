import { NextRequest, NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, isAuthUser } from "@/lib/auth";
import { backendUrl } from "@/lib/backend";
import { isSameOriginMutation } from "@/lib/request-security";

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ detail: "Cross-origin requests are not allowed" }, { status: 403 });
  }
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const target = backendUrl("/api/v1/auth/me");
  if (!token || !target) return NextResponse.json({ detail: "Not authenticated" }, { status: 401 });

  try {
    const upstream = await fetch(target, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const payload: unknown = await upstream.json().catch(() => null);
    return NextResponse.json(
      upstream.ok && isAuthUser(payload) ? { user: payload } : payload,
      { status: upstream.status, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ detail: "The Better Tracker backend is unavailable." }, { status: 502 });
  }
}
