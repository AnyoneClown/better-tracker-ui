"use client";

import { Languages, LoaderCircle, LogOut } from "lucide-react";
import { useState } from "react";

import type { AuthUser } from "@/lib/auth";
import { announceAuthenticatedUser, useLocale } from "@/lib/i18n";
import { clearModuleDataSnapshots } from "@/lib/module-data-cache";

function initials(email: string): string {
  const name = email.split("@", 1)[0] ?? "BT";
  const parts = name.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || "BT";
}

export function AccountSummary({
  user,
  compact = false,
}: {
  user: AuthUser;
  compact?: boolean;
}) {
  const { locale, setLocale, t } = useLocale();
  const [signingOut, setSigningOut] = useState(false);
  const [changingLocale, setChangingLocale] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) throw new Error(t("Sign out failed", "Не вдалося вийти"));
      clearModuleDataSnapshots(user.id);
      announceAuthenticatedUser(null);
      window.location.replace("/login");
    } catch {
      setError(t("Could not sign out. Please try again.", "Не вдалося вийти. Спробуйте ще раз."));
      setSigningOut(false);
    }
  };

  const toggleLocale = async () => {
    if (changingLocale) return;
    setChangingLocale(true);
    setError(null);
    try {
      await setLocale(locale === "uk" ? "en" : "uk");
    } catch {
      setError(t("Could not update language.", "Не вдалося змінити мову."));
    } finally {
      setChangingLocale(false);
    }
  };

  const languageButton = (
    <button
      className="account-locale"
      type="button"
      onClick={toggleLocale}
      disabled={changingLocale}
      aria-label={t("Switch language to Ukrainian", "Змінити мову на англійську")}
      title={t("Українська", "English")}
    >
      {changingLocale ? <LoaderCircle size={15} className="spin" /> : <Languages size={15} />}
      <span>{locale === "uk" ? "EN" : "UA"}</span>
    </button>
  );

  if (compact) {
    return (
      <>
        {languageButton}
        <button
          className="icon-button account-logout compact"
          type="button"
          onClick={signOut}
          disabled={signingOut}
          aria-label={`${t("Sign out", "Вийти")}: ${user.email}`}
          title={error ?? `${t("Signed in as", "Вхід як")} ${user.email}. ${t("Sign out", "Вийти")}`}
        >
          {signingOut ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}
        </button>
      </>
    );
  }

  return (
    <div className="profile-row account-row" title={`${t("Signed in as", "Вхід як")} ${user.email}`}>
      <span className="avatar" aria-hidden="true">{initials(user.email)}</span>
      <span className="profile-copy">
        <strong>{user.email}</strong>
        <small>{error ?? t("Private workspace", "Особистий простір")}</small>
      </span>
      {languageButton}
      <button
        className="account-logout"
        type="button"
        onClick={signOut}
        disabled={signingOut}
        aria-label={`${t("Sign out", "Вийти")}: ${user.email}`}
      >
        {signingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}
      </button>
    </div>
  );
}
