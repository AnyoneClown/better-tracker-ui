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

const navigation = [
  { label: "Overview", icon: LayoutDashboard, href: "/" },
  { label: "Money", icon: WalletCards, href: "/money" },
  { label: "Training", icon: Dumbbell, href: "/training" },
  { label: "Nutrition", icon: Utensils, href: "/nutrition" },
  { label: "Body", icon: Scale, href: "/body" },
];

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
  return (
    <>
      {navigation.map(({ label, icon: Icon, href }) => {
        const active = href === "/" ? pathname === href : pathname.startsWith(href);
        return (
          <Link className={active ? (mobile ? "active" : "nav-item active") : (mobile ? "" : "nav-item")} href={href} key={href} aria-current={active ? "page" : undefined}>
            <Icon size={19} strokeWidth={1.9} />
            <span>{label}</span>
            {!mobile && active && <span className="nav-dot" />}
          </Link>
        );
      })}
    </>
  );
}

export function ModuleShell({ children, user }: { children: ReactNode; user: AuthUser }) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>

        <nav className="sidebar-nav" aria-label="Primary navigation">
          <p className="nav-eyebrow">Workspace</p>
          <Navigation />
        </nav>

        <div className="sidebar-focus module-focus">
          <div className="focus-heading">
            <span><ShieldCheck size={16} /> Backend connected</span>
            <span className="focus-percent">Live</span>
          </div>
          <p>Every edit on these pages saves directly to FastAPI.</p>
          <div className="focus-bar"><span style={{ width: "100%" }} /></div>
          <div className="focus-meta"><span>Real records</span><span>Synced</span></div>
        </div>

        <AccountSummary user={user} />
      </aside>

      <header className="mobile-header">
        <Link className="brand" href="/" aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="mobile-header-actions">
          <span className="live-indicator"><span /> Live</span>
          <AccountSummary user={user} compact />
        </div>
      </header>

      <main className="main-content module-main">{children}</main>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <Navigation mobile />
      </nav>
    </div>
  );
}
