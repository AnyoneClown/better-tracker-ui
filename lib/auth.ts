export const AUTH_COOKIE_NAME = "better_tracker_session";

export function accessTokenSecondsRemaining(
  accessToken: string,
  nowSeconds = Date.now() / 1000,
): number | null {
  try {
    const encoded = accessToken.split(".")[1];
    if (!encoded) return null;
    const base64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
    const payload = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="))) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== "number" || !Number.isFinite(payload.exp)) return null;
    return Math.max(Math.ceil(payload.exp - nowSeconds), 0);
  } catch {
    return null;
  }
}

export type AuthUser = {
  id: string;
  email: string;
  is_active: boolean;
  locale: "en" | "uk";
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
  if (typeof payload?.detail === "string") return ({
    "A user with this email already exists": "Користувач із такою електронною адресою вже існує.",
    "Could not validate credentials": "Неправильна електронна адреса або пароль.",
    "Google sign-in is not configured": "Вхід через Google ще не налаштовано.",
    "Google authentication failed": "Не вдалося автентифікуватися через Google.",
    "Google authentication is unavailable": "Автентифікація через Google зараз недоступна.",
  } as Record<string, string>)[payload.detail] ?? payload.detail;
  if (Array.isArray(payload?.detail)) {
    const messages = payload.detail
      .map((item) => item.msg?.replace(/^Value error,\s*/i, ""))
      .filter((item): item is string => Boolean(item));
    if (messages.length > 0) return messages.map((message) => (
      message.startsWith("password must contain")
        ? "Пароль не відповідає вимогам."
        : message
    )).join("; ");
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
    && (candidate.locale === "en" || candidate.locale === "uk")
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
  if (reason === "cancelled") return "Вхід через Google скасовано.";
  if (reason === "state") return "Спроба входу через Google застаріла. Спробуйте ще раз.";
  if (reason === "config") return "Вхід через Google ще не налаштовано.";
  if (reason === "exchange" || reason === "unavailable") {
    return "Не вдалося увійти через Google. Спробуйте ще раз.";
  }
  return undefined;
}
