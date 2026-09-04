import "server-only";

export function secureCookiesEnabled(): boolean {
  const configured = process.env.BETTER_TRACKER_COOKIE_SECURE
    ?.trim()
    .toLowerCase();

  if (configured === "true" || configured === "1") return true;
  if (configured === "false" || configured === "0") return false;
  return process.env.NODE_ENV === "production";
}
