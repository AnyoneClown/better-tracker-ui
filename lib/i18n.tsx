"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

import type { AuthUser } from "@/lib/auth";

type Locale = AuthUser["locale"];

type LocaleContextValue = {
  locale: Locale;
  intlLocale: string;
  setLocale: (locale: Locale) => Promise<void>;
  t: (english: string, ukrainian: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
  const [locale, updateLocale] = useState(user.locale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
