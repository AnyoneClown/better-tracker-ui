"use client";

import {
  Dumbbell,
  LayoutDashboard,
  Scale,
  ShieldCheck,
  Utensils,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { AccountSummary } from "@/components/account-summary";
import type { AuthUser } from "@/lib/auth";
import { LocaleProvider, useLocale } from "@/lib/i18n";

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 22.5 12.2 16.9 16.5 19.2 24 10.5" />
      <path d="M20 10.5h4v4" />
      <circle cx="7" cy="22.5" r="1.35" />
      <circle cx="12.2" cy="16.9" r="1.35" />
      <circle cx="16.5" cy="19.2" r="1.35" />
    </svg>
  );
}

function Navigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const navigation = [
    { label: t("Overview", "Огляд"), icon: LayoutDashboard, href: "/" },
    { label: t("Money", "Фінанси"), icon: WalletCards, href: "/money" },
    { label: t("Training", "Тренування"), icon: Dumbbell, href: "/training" },
    { label: t("Nutrition", "Харчування"), icon: Utensils, href: "/nutrition" },
    { label: t("Body", "Тіло"), icon: Scale, href: "/body" },
  ];
  return (
    <>
      {navigation.map(({ label, icon: Icon, href }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link className={active ? (mobile ? "active" : "nav-item active") : (mobile ? "" : "nav-item")} href={href} key={href} title={label} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={1.9} />
            <span>{label}</span>
            {!mobile && active && <span className="nav-dot" />}
          </Link>
        );
      })}
    </>
  );
}

function LocalizedModuleShell({ children, user }: { children: ReactNode; user: AuthUser }) {
  const { t } = useLocale();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">{t("Skip to dashboard", "Перейти до панелі")}</a>
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={t("Better Tracker home", "Головна Better Tracker")}>
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>

        <nav className="sidebar-nav" aria-label={t("Primary navigation", "Основна навігація")}>
          <p className="nav-eyebrow">{t("Workspace", "Робочий простір")}</p>
          <Navigation />
        </nav>

        <div className="sidebar-focus module-focus">
          <div className="focus-heading">
            <span><ShieldCheck size={16} /> {t("Backend connected", "Сервер підключено")}</span>
            <span className="focus-percent">{t("Live", "Онлайн")}</span>
          </div>
          <div className="focus-bar"><span style={{ width: "100%" }} /></div>
          <div className="focus-meta"><span>{t("Real records", "Реальні дані")}</span><span>{t("Synced", "Синхронізовано")}</span></div>
        </div>

        <AccountSummary user={user} />
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label={t("Better Tracker home", "Головна Better Tracker")}>
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="mobile-header-actions">
          <span className="live-indicator"><span /> {t("Live", "Онлайн")}</span>
          <AccountSummary user={user} compact />
        </div>
      </header>

      <main className="main-content module-main" id="main-content">{children}</main>

      <nav className="mobile-nav" aria-label={t("Mobile navigation", "Мобільна навігація")}>
        <Navigation mobile />
      </nav>
    </div>
  );
}

export function ModuleShell({ children, user }: { children: ReactNode; user: AuthUser }) {
  return <LocaleProvider user={user}><LocalizedModuleShell user={user}>{children}</LocalizedModuleShell></LocaleProvider>;
}
