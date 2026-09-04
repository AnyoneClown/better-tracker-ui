"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import { type AuthUser, isAuthUser } from "@/lib/auth";
import {
  browserAuthenticatedUserId,
  clearModuleDataSnapshots,
} from "@/lib/module-data-cache";

type Locale = AuthUser["locale"];

type LocaleContextValue = {
  userId: string;
  locale: Locale;
  intlLocale: string;
  setLocale: (locale: Locale) => Promise<void>;
  t: (english: string, ukrainian: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const AUTH_CHANNEL = "better-tracker:auth:v1";

export function announceAuthenticatedUser(userId: string | null): void {
  if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
  try {
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channel.postMessage(userId);
    channel.close();
  } catch {
    // The next full navigation still reconciles the shared session cookie.
  }
}

export function LocaleProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [locale, updateLocale] = useState(user.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    const controller = new AbortController();
    let checking = false;
    const reconcile = () => {
      clearModuleDataSnapshots(user.id);
      window.location.reload();
    };
    const repairMarker = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/auth/session", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (response.status === 401) return reconcile();
        if (!response.ok) return;
        const payload = await response.json() as { user?: unknown };
        if (!isAuthUser(payload.user) || payload.user.id !== user.id) return reconcile();
        if (browserAuthenticatedUserId() === user.id) window.location.reload();
      } catch {
        // Keep module data gated until the session can be reconciled.
      } finally {
        checking = false;
      }
    };
    const checkMarker = () => {
      const markedUserId = browserAuthenticatedUserId();
      if (markedUserId === user.id) return;
      clearModuleDataSnapshots(user.id);
      if (markedUserId === null) void repairMarker();
      else window.location.reload();
    };
    const checkVisibleMarker = () => {
      if (document.visibilityState === "visible") checkMarker();
    };

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      try {
        channel = new BroadcastChannel(AUTH_CHANNEL);
        channel.onmessage = (event) => {
          if (event.data !== user.id) reconcile();
        };
      } catch {
        channel = null;
      }
    }

    checkMarker();
    window.addEventListener("focus", checkMarker);
    window.addEventListener("pageshow", checkMarker);
    document.addEventListener("visibilitychange", checkVisibleMarker);
    return () => {
      controller.abort();
      channel?.close();
      window.removeEventListener("focus", checkMarker);
      window.removeEventListener("pageshow", checkMarker);
      document.removeEventListener("visibilitychange", checkVisibleMarker);
    };
  }, [user.id]);

  const setLocale = async (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    const previousLocale = locale;
    updateLocale(nextLocale);
    const response = await fetch("/api/auth/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale }),
      credentials: "same-origin",
    });
    if (!response.ok) {
      updateLocale(previousLocale);
      throw new Error("Could not update language");
    }
  };

  return (
    <LocaleContext.Provider value={{
      userId: user.id,
      locale,
      intlLocale: locale === "uk" ? "uk-UA" : "en-US",
      setLocale,
      t: (english, ukrainian) => locale === "uk" ? ukrainian : english,
    }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("useLocale must be used inside LocaleProvider");
  return context;
}
