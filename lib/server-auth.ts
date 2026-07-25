import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  AUTH_COOKIE_NAME,
  type AuthUser,
  isAuthUser,
  safeReturnPath,
} from "@/lib/auth";
import { backendUrl } from "@/lib/backend";

export const getAuthenticatedUser = cache(async (): Promise<AuthUser | null> => {
  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const target = backendUrl("/api/v1/auth/me");
  if (!target) return null;

  try {
    const response = await fetch(target, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const payload: unknown = await response.json();
    return isAuthUser(payload) ? payload : null;
  } catch {
    return null;
  }
});

export async function requireAuthenticatedUser(
  returnPath: string,
): Promise<AuthUser> {
  const user = await getAuthenticatedUser();
  if (!user) {
    const nextPath = safeReturnPath(returnPath);
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return user;
}
