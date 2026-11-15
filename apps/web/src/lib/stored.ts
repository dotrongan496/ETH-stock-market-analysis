"use client";

import { useSyncExternalStore } from "react";

export interface StoredValue<T> {
  /** Current value; the fallback during server render and hydration. */
  use(): T;
  get(): T;
  set(value: T): void;
}

/**
 * A small JSON value kept in localStorage, shared by every component that reads it and
 * synced across tabs. Storage that is blocked or full (private mode) silently falls back
 * to memory for this page view.
 */
export function storedValue<T>(
  key: string,
  fallback: T,
  parse: (raw: unknown) => T | null,
): StoredValue<T> {
  const listeners = new Set<() => void>();
  let cache: { raw: string | null; value: T } | null = null;
  let memoryOnly = false;

  const get = (): T => {
    if (memoryOnly) return cache?.value ?? fallback;
    let raw: string | null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return cache?.value ?? fallback;
    }
    if (cache && cache.raw === raw) return cache.value;
    let value = fallback;
    if (raw !== null) {
      try {
        value = parse(JSON.parse(raw)) ?? fallback;
      } catch {
        // Corrupt entry: use the fallback.
      }
    }
    cache = { raw, value };
    return value;
  };

  const set = (value: T) => {
    const raw = JSON.stringify(value);
    cache = { raw, value };
    try {
      localStorage.setItem(key, raw);
    } catch {
      memoryOnly = true;
    }
    listeners.forEach((listener) => listener());
  };

  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  };

  return {
    use: () => useSyncExternalStore(subscribe, get, () => fallback),
    get,
    set,
  };
}
