"use client";

import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import * as React from "react";

import { TooltipProvider } from "@/components/ui/tooltip";
import { OFFLINE_RETRY_MS } from "@/lib/api/queries";

if (typeof window !== "undefined") {
  focusManager.setFocused(true);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 15_000,
            retry: 1,
            networkMode: "always",
            notifyOnChangeProps: "all",
            refetchIntervalInBackground: true,
            refetchInterval: (query) => (query.state.status === "error" ? OFFLINE_RETRY_MS : false),
          },
          mutations: {
            networkMode: "always",
          },
        },
      }),
  );
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
      storageKey="fatscope-theme"
    >
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={220} skipDelayDuration={400}>
          {children}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
