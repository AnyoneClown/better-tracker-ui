"use client";

import { ChevronDown, Plus, RotateCcw, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { getPeriod, getPeriodOptions } from "@/lib/tracker-api";
import { useLocale } from "@/lib/i18n";

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
  periodKey?: string;
  initialPeriodKey?: string;
  onPeriodChange?: (period: string) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const { intlLocale, t } = useLocale();
  const hasPeriod = Boolean(periodKey && initialPeriodKey && onPeriodChange);
  const referenceDate = new Date(`${initialPeriodKey ?? "2000-01"}-15T12:00:00.000Z`);
  const period = hasPeriod ? getPeriod(periodKey!, referenceDate, intlLocale) : null;
  const recentOptions = hasPeriod ? getPeriodOptions(12, referenceDate, intlLocale) : [];
  const options = period && !recentOptions.some((option) => option.key === period.key) ? [...recentOptions, period] : recentOptions;
  return (
    <header className="module-header">
      <div>
        <p className="module-kicker">{eyebrow}{period ? ` · ${period.label}` : ""}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {(hasPeriod || (onAdd && addLabel)) && <div className="module-header-actions">
        {hasPeriod && <label className="month-picker">
          <span className="sr-only">{t("Select month", "Виберіть місяць")}</span>
          <select value={periodKey} onChange={(event) => onPeriodChange?.(event.target.value)}>
            {options.map((option) => <option value={option.key} key={option.key}>{option.label}</option>)}
          </select>
          <ChevronDown size={15} aria-hidden="true" />
        </label>}
        {onAdd && addLabel && <button className="quick-log-button" onClick={onAdd}><Plus size={18} /> {addLabel}</button>}
      </div>}
    </header>
  );
}

function supportsMonthInput() {
  const input = document.createElement("input");
  input.type = "month";
  return input.type === "month";
}

const subscribeToBrowserFeatures = () => () => undefined;

export function MonthPickerInput({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const monthSupported = useSyncExternalStore(subscribeToBrowserFeatures, supportsMonthInput, () => true);
  const { intlLocale, t } = useLocale();
  if (monthSupported) return <input
      type="month"
      value={value}
      min={min}
      max={max}
      disabled={disabled}
      onChange={(event) => { if (event.target.value) onChange(event.target.value); }}
    />;

  const [year, month] = value.split("-");
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    const key = `${year}-${number}`;
    return {
      key,
      number,
      label: new Intl.DateTimeFormat(intlLocale, { month: "short", timeZone: "UTC" }).format(new Date(`2020-${number}-15T12:00:00Z`)),
      disabled: Boolean((min && key < min) || (max && key > max)),
    };
  });
  const firstYear = Math.min(Number(year), Number(min?.slice(0, 4) ?? 1900));
  const lastYear = Number(max?.slice(0, 4) ?? new Date().getFullYear());
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, index) => String(lastYear - index));
  return <div className="month-picker-fallback">
    <select value={month} disabled={disabled} aria-label={t("Month", "Місяць")} onChange={(event) => onChange(`${year}-${event.target.value}`)}>
      {monthOptions.map((option) => <option value={option.number} disabled={option.disabled} key={option.key}>{option.label}</option>)}
    </select>
    <select value={year} disabled={disabled} aria-label={t("Year", "Рік")} onChange={(event) => {
      const next = `${event.target.value}-${month}`;
      onChange(min && next < min ? min : max && next > max ? max : next);
    }}>
      {years.map((option) => <option value={option} key={option}>{option}</option>)}
    </select>
  </div>;
}

export function ModuleState({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { t } = useLocale();
  return (
    <section className={`dashboard-state ${error ? "error" : "loading"}`} role={error ? "alert" : "status"}>
      <span className="state-icon">{error ? <X size={20} /> : <RotateCcw size={20} />}</span>
      <div>
        <h2>{error ? t("This module could not be loaded", "Не вдалося завантажити цей розділ") : t("Loading live backend data", "Завантажуємо актуальні дані")}</h2>
        <p>{error ?? t("Fetching the latest records from FastAPI…", "Отримуємо останні записи…")}</p>
      </div>
      {error && <button onClick={onRetry}>{t("Try again", "Спробувати ще раз")}</button>}
    </section>
  );
}

export function DataNotice({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  const { t } = useLocale();
  if (!loading && !error) return null;
  return error ? (
    <div className="data-banner error" role="alert"><span>{error}</span><button onClick={onRetry}>{t("Retry", "Повторити")}</button></div>
  ) : (
    <div className="data-banner loading" role="status"><RotateCcw size={14} className="spin" /> {t("Refreshing backend data…", "Оновлюємо дані…")}</div>
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
  const { t } = useLocale();
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
          <button className="icon-button" onClick={onClose} aria-label={t("Close dialog", "Закрити діалог")} disabled={saving}><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

export function SaveActions({ saving, onCancel, label }: { saving: boolean; onCancel: () => void; label: string }) {
  const { t } = useLocale();
  return (
    <div className="dialog-actions">
      <button type="button" className="secondary-button" onClick={onCancel} disabled={saving}>{t("Cancel", "Скасувати")}</button>
      <button className="submit-button" type="submit" disabled={saving}>
        {saving && <RotateCcw size={17} className="spin" />} {saving ? t("Saving…", "Зберігаємо…") : label}
      </button>
    </div>
  );
}

export function ModuleToast({ message, tone, onClose }: { message: string; tone: "success" | "error"; onClose: () => void }) {
  const { t } = useLocale();
  return (
    <div className={`toast ${tone}`} role={tone === "error" ? "alert" : "status"} aria-live="polite">
      <span className="toast-check">{tone === "error" ? <X size={15} /> : "✓"}</span>
      <span>{message}</span>
      <button className="toast-close" onClick={onClose} aria-label={t("Dismiss", "Закрити")}><X size={15} /></button>
    </div>
  );
}
