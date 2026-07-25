"use client";

import { useCallback, useEffect, useState } from "react";

type Loader<T> = (periodKey: string, signal?: AbortSignal) => Promise<T>;

export function useModuleData<T>(periodKey: string, loader: Loader<T>) {
  const [result, setResult] = useState<{
    data: T | null;
    error: string | null;
    settledKey: string | null;
  }>({ data: null, error: null, settledKey: null });
  const [revision, setRevision] = useState(0);
  const requestKey = `${periodKey}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    void loader(periodKey, controller.signal)
      .then((nextData) => {
        if (controller.signal.aborted) return;
        setResult({ data: nextData, error: null, settledKey: requestKey });
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted || (reason instanceof DOMException && reason.name === "AbortError")) return;
        setResult((current) => ({
          data: current.data,
          error: reason instanceof Error ? reason.message : "The backend request failed.",
          settledKey: requestKey,
        }));
      });
    return () => controller.abort();
  }, [loader, periodKey, requestKey]);

  const refresh = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  return {
    data: result.data,
    loading: result.settledKey !== requestKey,
    error: result.settledKey === requestKey ? result.error : null,
    refresh,
  };
}
