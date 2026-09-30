"use client";

import * as React from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (listener: () => void) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    [query],
  );
  const getSnapshot = React.useCallback(() => window.matchMedia(query).matches, [query]);
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const WIDE_QUERY = "(min-width: 1280px)";
export const DESKTOP_QUERY = "(min-width: 768px)";
