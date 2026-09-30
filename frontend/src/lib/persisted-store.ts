"use client";

import * as React from "react";

type Store<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  getServerSnapshot: () => T;
  set: (next: T) => void;
};

const registry = new Map<string, Store<unknown>>();

function createStore<T>(key: string, fallback: T, parse: (raw: string) => T, serialise: (value: T) => string): Store<T> {
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  const read = (): T => {
    if (cached !== undefined) return cached;
    if (typeof window === "undefined") {
      cached = fallback;
      return cached;
    }
    const raw = window.localStorage.getItem(key);
    cached = raw === null ? fallback : parse(raw);
    return cached;
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: read,
    getServerSnapshot: () => fallback,
    set(next) {
      cached = next;
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, serialise(next));
      }
      for (const listener of listeners) listener();
    },
  };
}

function storeFor<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T,
  serialise: (value: T) => string,
): Store<T> {
  const existing = registry.get(key);
  if (existing) return existing as Store<T>;
  const created = createStore(key, fallback, parse, serialise);
  registry.set(key, created as Store<unknown>);
  return created;
}

export function usePersistedBoolean(key: string, fallback = false) {
  const store = storeFor<boolean>(
    key,
    fallback,
    (raw) => raw === "1",
    (value) => (value ? "1" : "0"),
  );
  const value = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return [value, store.set] as const;
}

export function usePersistedString<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  const store = storeFor<T>(
    key,
    fallback,
    (raw) => (allowed.includes(raw as T) ? (raw as T) : fallback),
    (value) => value,
  );
  const value = React.useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
  return [value, store.set] as const;
}
