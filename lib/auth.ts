export const AUTH_COOKIE_NAME = "better_tracker_session";

export type AuthUser = {
  id: string;
  email: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ApiProblem = {
  detail?: string | Array<{ msg?: string }>;
};

export function apiProblemMessage(
  payload: ApiProblem | null,
  fallback: string,
): string {
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) {
    const messages = payload.detail
      .map((item) => item.msg?.replace(/^Value error,\s*/i, ""))
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) return messages.join("; ");
  }
  return fallback;
}

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.email === "string"
    && candidate.is_active === true
    && typeof candidate.created_at === "string"
    && typeof candidate.updated_at === "string"
  );
}

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length > 2_048
    || !value.startsWith("/")
    || value.startsWith("//")
    || value.includes("\\")
  ) {
    return "/";
  }

  try {
    const parsed = new URL(value, "http://better-tracker.local");
    if (parsed.origin !== "http://better-tracker.local") return "/";
    if (parsed.pathname === "/login" || parsed.pathname === "/register") {
      return "/";
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return "/";
  }
}

export function googleAuthErrorMessage(value: unknown): string | undefined {
  const reason = Array.isArray(value) ? value[0] : value;
  if (reason === "cancelled") return "Google sign-in was cancelled.";
  if (reason === "state") return "Google sign-in expired. Please try again.";
  if (reason === "config") return "Google sign-in is not configured yet.";
  if (reason === "exchange" || reason === "unavailable") {
    return "Could not sign in with Google. Please try again.";
  }
  return undefined;
}
