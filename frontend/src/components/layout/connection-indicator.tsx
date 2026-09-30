"use client";

import { Check, CircleX, Loader2, Wifi } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { IconHint } from "@/components/ui/tooltip";
import { API_BASE_URL } from "@/lib/api/client";
import { useHealth } from "@/lib/api/queries";
import { cn } from "@/lib/utils";

export function ConnectionIndicator({ variant = "rail" }: { variant?: "rail" | "bar" }) {
  const { data, isPending, isError, refetch } = useHealth();
  const state = isError || (!isPending && !data) ? "offline" : isPending ? "checking" : "online";

  const tone =
    state === "online"
      ? "bg-positive"
      : state === "offline"
        ? "bg-critical"
        : "bg-ink-soft animate-pulse";

  const label =
    state === "online"
      ? `Connected to ${API_BASE_URL}${data ? ` · ${data.service} ${data.version}` : ""}`
      : state === "offline"
        ? `No response from ${API_BASE_URL}. Start the backend or check NEXT_PUBLIC_API_BASE_URL.`
        : `Contacting ${API_BASE_URL}`;

  const text = state === "online" ? "Connected" : state === "offline" ? "Offline" : "Checking";

  if (variant === "bar") {
    return (
      <IconHint label={label}>
        <button
          type="button"
          onClick={() => void refetch()}
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-sunken"
        >
          <span className={cn("size-1.5 rounded-full", tone)} aria-hidden />
          <span className="hidden sm:inline">{text}</span>
          <span className="sr-only">Backend connection status: {text}</span>
        </button>
      </IconHint>
    );
  }

  return (
    <IconHint label={label} side="right">
      <Button
        variant="rail"
        size="sm"
        onClick={() => void refetch()}
        className="w-full justify-start gap-2 px-2"
      >
        {state === "online" ? (
          <Check className="text-positive" aria-hidden />
        ) : state === "offline" ? (
          <CircleX className="text-critical" aria-hidden />
        ) : (
          <Loader2 className="animate-spin" aria-hidden />
        )}
        <span className="truncate text-[12px]">{text}</span>
      </Button>
    </IconHint>
  );
}

export function ConnectionDot() {
  const { data, isPending, isError } = useHealth();
  const state = isError || (!isPending && !data) ? "offline" : isPending ? "checking" : "online";
  return (
    <IconHint
      label={
        state === "online"
          ? `Backend connected at ${API_BASE_URL}`
          : state === "offline"
            ? `Backend offline at ${API_BASE_URL}`
            : "Checking backend"
      }
      side="right"
    >
      <span className="flex size-8 items-center justify-center rounded-md text-rail-muted">
        <Wifi
          className={cn(
            "size-4",
            state === "online" && "text-positive",
            state === "offline" && "text-critical",
            state === "checking" && "animate-pulse",
          )}
          aria-hidden
        />
        <span className="sr-only">Backend {state}</span>
      </span>
    </IconHint>
  );
}
