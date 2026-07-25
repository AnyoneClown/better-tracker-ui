import { NextRequest, NextResponse } from "next/server";

import { isSameOriginMutation } from "@/lib/request-security";
import { clearSessionCookie } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      { detail: "Cross-origin requests are not allowed" },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
  clearSessionCookie(response);
  return response;
}
