"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/i18n";
import {
  browserAuthenticatedUserId,
  clearModuleDataSnapshots,
  readModuleDataSnapshot,
  writeModuleDataSnapshot,
} from "@/lib/module-data-cache";

type Loader<T> = (periodKey: string, signal?: AbortSignal) => Promise<T>;

export function useModuleData<T>(slot: string, periodKey: string, loader: Loader<T>) {
  const { t, userId } = useLocale();
  const scopeKey = `${userId}:${slot}`;
  const [result, setResult] = useState<{
    scopeKey: string | null;
    data: T | null;
    dataKey: string | null;
    error: string | null;
    settledKey: string | null;
  }>({ scopeKey: null, data: null, dataKey: null, error: null, settledKey: null });
  const [revision, setRevision] = useState(0);
  const requestKey = `${scopeKey}:${periodKey}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    if (browserAuthenticatedUserId() !== userId) return () => controller.abort();
    const cached = readModuleDataSnapshot<T>(userId, slot, periodKey);
    if (cached !== null) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setResult((current) => current.scopeKey !== scopeKey || current.dataKey !== periodKey
          ? { scopeKey, data: cached, dataKey: periodKey, error: null, settledKey: null }
          : current);
      });
    }
    void loader(periodKey, controller.signal)
      .then((nextData) => {
        if (controller.signal.aborted) return;
        if (browserAuthenticatedUserId() !== userId) {
          clearModuleDataSnapshots(userId);
          window.location.reload();
          return;
        }
        writeModuleDataSnapshot(userId, slot, periodKey, nextData);
        setResult({ scopeKey, data: nextData, dataKey: periodKey, error: null, settledKey: requestKey });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setResult((current) => ({
          ...current,
          error: reason instanceof Error ? reason.message : t("The backend request failed.", "Помилка запиту до сервера."),
          settledKey: requestKey,
        }));
      });
    return () => controller.abort();
  }, [loader, periodKey, requestKey, scopeKey, slot, t, userId]);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const updateData = useCallback((updater: (current: T) => T) => {
    setResult((current) => {
      if (
        browserAuthenticatedUserId() !== userId
        || current.scopeKey !== scopeKey
        || current.data === null
        || current.dataKey !== periodKey
      ) return current;
      const nextData = updater(current.data);
      if (Object.is(nextData, current.data)) return current;
      return { ...current, data: nextData };
    });
  }, [periodKey, scopeKey, userId]);

  const visible = result.scopeKey === scopeKey && browserAuthenticatedUserId() === userId;

  return {
    data: visible ? result.data : null,
    loading: result.settledKey !== requestKey,
    stale: visible && result.data !== null && result.dataKey !== periodKey,
    error: visible && result.settledKey === requestKey ? result.error : null,
    refresh,
    updateData,
  };
}
