"use client";

import { LoaderCircle, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AuthUser } from "@/lib/auth";

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
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
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
      if (!response.ok) throw new Error("Sign out failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Could not sign out. Please try again.");
      setSigningOut(false);
    }
  };

  if (compact) {
    return (
      <button
        className="icon-button account-logout compact"
        type="button"
        onClick={signOut}
        disabled={signingOut}
        aria-label={`Sign out ${user.email}`}
        title={error ?? `Signed in as ${user.email}. Sign out`}
      >
        {signingOut ? <LoaderCircle size={17} className="spin" /> : <LogOut size={17} />}
      </button>
    );
  }

  return (
    <div className="profile-row account-row" title={`Signed in as ${user.email}`}>
      <span className="avatar" aria-hidden="true">{initials(user.email)}</span>
      <span className="profile-copy">
        <strong>{user.email}</strong>
        <small>{error ?? "Private workspace"}</small>
      </span>
      <button
        className="account-logout"
        type="button"
        onClick={signOut}
        disabled={signingOut}
        aria-label={`Sign out ${user.email}`}
      >
        {signingOut ? <LoaderCircle size={16} className="spin" /> : <LogOut size={16} />}
      </button>
    </div>
  );
}
