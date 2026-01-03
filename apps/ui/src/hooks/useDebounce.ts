import { useCallback, useEffect, useRef } from "react";

type DebouncedFn<T> = (arg: T, signal: AbortSignal) => Promise<unknown>;

/**
 * useDebounce
 * - Accepts an async function `fn` and a delay in ms.
 * - Returns `{ trigger, cancel }` where `trigger(arg)` will debounce calls
 *   and call `fn(arg, signal)` after `delay` ms.
 * - Automatically aborts previous in-flight request when a new trigger happens.
 */
export function useDebounce<T>(fn: DebouncedFn<T>, delay = 300) {
  const timeoutRef = useRef<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (controllerRef.current) {
        try {
          controllerRef.current.abort();
        } catch {}
        controllerRef.current = null;
      }
    };
  }, []);

  const trigger = useCallback(
    (arg: T) => {
      // clear existing timer
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // abort any previous request
      if (controllerRef.current) {
        try {
          controllerRef.current.abort();
        } catch {}
        controllerRef.current = null;
      }

      // schedule new call
      const controller = new AbortController();
      controllerRef.current = controller;

      const id = window.setTimeout(() => {
        // call the provided function with the arg and abort signal
        void fn(arg, controller.signal);
      }, delay) as unknown as number;

      timeoutRef.current = id;
    },
    [fn, delay]
  );

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (controllerRef.current) {
      try {
        controllerRef.current.abort();
      } catch {}
      controllerRef.current = null;
    }
  }, []);

  return { trigger, cancel } as const;
}

export default useDebounce;
