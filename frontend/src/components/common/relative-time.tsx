"use client";

import * as React from "react";

import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format";

const TICK_MS = 30_000;
const listeners = new Set<() => void>();
let snapshot = 0;
let timer: number | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === null) {
    snapshot = Date.now();
    timer = window.setInterval(() => {
      snapshot = Date.now();
      for (const registered of listeners) registered();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

function getSnapshot() {
  return snapshot;
}

function getServerSnapshot() {
  return 0;
}

export function useNow(): number {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsExpired(expiresAt: string | null | undefined): boolean {
  const now = useNow();
  if (!expiresAt || now === 0) return false;
  const normalised =
    expiresAt.endsWith("Z") || expiresAt.includes("+") ? expiresAt : `${expiresAt}Z`;
  const expiry = new Date(normalised).getTime();
  return Number.isFinite(expiry) && expiry < now;
}

export function RelativeTime({
  value,
  className,
  prefix,
}: {
  value: string | null | undefined;
  className?: string;
  prefix?: string;
}) {
  const now = useNow();
  if (!value) return <span className={className}>-</span>;
  const absolute = formatAbsoluteTime(value);
  const label = now === 0 ? absolute : formatRelativeTime(value, now);
  return (
    <span className={className} title={absolute}>
      {prefix ? `${prefix} ` : ""}
      {label}
    </span>
  );
}
