import "server-only";

export function backendBaseUrl(): URL | null {
  const configured = process.env.BETTER_TRACKER_API_URL;
  const candidate = configured
    ?? (process.env.NODE_ENV === "development" ? "http://127.0.0.1:8000" : null);
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function backendUrl(path: string): URL | null {
  const baseUrl = backendBaseUrl();
  if (!baseUrl) return null;
  const safePath = path.replace(/^\/+/, "");
  return new URL(safePath, `${baseUrl.toString().replace(/\/+$/, "")}/`);
}
