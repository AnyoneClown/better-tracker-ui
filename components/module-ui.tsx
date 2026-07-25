"use client";

import { ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { getPeriod, getPeriodOptions } from "@/lib/tracker-api";

export function ModuleHeader({
  eyebrow,
  title,
  description,
  periodKey,
  initialPeriodKey,
  onPeriodChange,
  onAdd,
  addLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  periodKey: string;
  initialPeriodKey: string;
  onPeriodChange: (period: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  const options = getPeriodOptions(12, new Date(`${initialPeriodKey}-15T12:00:00.000Z`));
  const period = getPeriod(periodKey, new Date(`${initialPeriodKey}-15T12:00:00.000Z`));
  return (
    <header className="module-header">
      <div>
        <p className="module-kicker">{eyebrow} · {period.label}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="module-header-actions">
        <label className="month-picker">
          <span className="sr-only">Select month</span>
          <select value={periodKey} onChange={(event) => onPeriodChange(event.target.value)}>
            {options.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>
        <button className="quick-log-button" onClick={onAdd}><Plus size={18} /> {addLabel}</button>
      </div>
    </header>
  );
}

export function ModuleState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <section className={`dashboard-state ${error ? "error" : "loading"}`} role={error ? "alert" : "status"}>
      <span className="state-icon">{error ? <X size={20} /> : <RotateCcw size={20} />}</span>
      <div>
        <h2>{error ? "This module could not be loaded" : "Loading live backend data"}</h2>
        <p>{error ?? "Fetching the latest records from FastAPI…"}</p>
      </div>
      {error && <button onClick={onRetry}>Try again</button>}
    </section>
  );
}

export function DataNotice({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (!loading && !error) return null;
  return error ? (
    <div className="data-banner error" role="alert"><span>{error}</span><button onClick={onRetry}>Retry</button></div>
  ) : (
    <div className="data-banner loading" role="status"><RotateCcw size={14} className="spin" /> Refreshing backend data…</div>
  );
}

export function EmptyState({ icon, title, description, action, onAction }: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="module-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && onAction && <button className="secondary-button" onClick={onAction}>{action}</button>}
    </div>
  );
}

export function ModuleDialog({
  open,
  title,
  eyebrow,
  saving,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow: string;
  saving: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.querySelectorAll<HTMLElement>(".sidebar, .mobile-header, .main-content, .mobile-nav"));
    background.forEach((element) => { element.inert = true; });
    const focusTimer = window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus(), 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKey);
      background.forEach((element) => { element.inert = false; });
      previousFocusRef.current?.focus();
    };
  }, [open, onClose, saving]);
  if (!open) return null;
  return createPortal(
    <div className="dialog-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) onClose(); }}>
      <section className="quick-dialog module-dialog" role="dialog" aria-modal="true" aria-labelledby="module-dialog-title" ref={dialogRef}>
        <div className="dialog-header">
          <div><p className="eyebrow">{eyebrow}</p><h2 id="module-dialog-title">{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog" disabled={saving}><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function SaveActions({ saving, onCancel, label = "Save" }: { saving: boolean; onCancel: () => void; label?: string }) {
  return (
    <div className="dialog-actions">
      <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>Cancel</button>
      <button className="submit-button" type="submit" disabled={saving}>
        {saving && <RotateCcw size={17} className="spin" />} {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

export function ModuleToast({ message, tone, onClose }: { message: string; tone: "success" | "error"; onClose: () => void }) {
  return (
    <div className={`toast ${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="toast-check">{tone === "error" ? <X size={15} /> : "✓"}</span>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}
