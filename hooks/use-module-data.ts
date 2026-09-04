"use client";

import { useCallback, useEffect, useState } from "react";

import { useLocale } from "@/lib/i18n";

type Loader<T> = (periodKey: string, signal?: AbortSignal) => Promise<T>;

export function useModuleData<T>(periodKey: string, loader: Loader<T>) {
  const { t } = useLocale();
  const [result, setResult] = useState<{
    data: T | null;
    dataKey: string | null;
    error: string | null;
    settledKey: string | null;
  }>({ data: null, dataKey: null, error: null, settledKey: null });
  const [revision, setRevision] = useState(0);
  const requestKey = `${periodKey}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    void loader(periodKey, controller.signal)
      .then((nextData) => {
        if (controller.signal.aborted) return;
        setResult({ data: nextData, dataKey: periodKey, error: null, settledKey: requestKey });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setResult((current) => ({
          data: current.data,
          dataKey: current.dataKey,
          error: reason instanceof Error ? reason.message : t("The backend request failed.", "Помилка запиту до сервера."),
          settledKey: requestKey,
        }));
      });
    return () => controller.abort();
  }, [loader, periodKey, requestKey, t]);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const updateData = useCallback((updater: (current: T) => T) => {
    setResult((current) => {
      if (current.data === null || current.dataKey !== periodKey) return current;
      const nextData = updater(current.data);
      if (Object.is(nextData, current.data)) return current;
      return { ...current, data: nextData };
    });
  }, [periodKey]);

  return {
    data: result.data,
    loading: result.settledKey !== requestKey,
    stale: result.data !== null && result.dataKey !== periodKey,
    error: result.settledKey === requestKey ? result.error : null,
    refresh,
    updateData,
  };
}
