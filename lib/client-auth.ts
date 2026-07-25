let redirectingToLogin = false;

export function redirectToLoginForExpiredSession(): void {
  if (typeof window === "undefined" || redirectingToLogin) return;
  if (window.location.pathname === "/login" || window.location.pathname === "/register") {
    return;
  }

  redirectingToLogin = true;
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(
    `/login?reason=session-expired&next=${encodeURIComponent(returnPath)}`,
  );
}
