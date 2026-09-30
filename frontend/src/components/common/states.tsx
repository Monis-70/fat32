"use client";

import {
  AlertTriangle,
  CircleSlash,
  Clock,
  FileQuestion,
  PlugZap,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/primitives";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";

export function SkeletonRows({
  rows = 6,
  className,
  height = "h-8",
}: {
  rows?: number;
  className?: string;
  height?: string;
}) {
  return (
    <div className={cn("space-y-2 p-3.5", className)} role="status" aria-label="Loading data">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(height, "w-full")}
          style={{ opacity: 1 - index * 0.08 }}
        />
      ))}
    </div>
  );
}

export function SkeletonSurface({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("surface overflow-hidden", className)}>
      <div className="surface-header">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3.5 w-20" />
      </div>
      <SkeletonRows rows={rows} />
    </div>
  );
}

export function SkeletonMetrics({ count = 6 }: { count?: number }) {
  return (
    <div className="surface overflow-hidden">
      <div className="hairline-grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="space-y-2 bg-surface px-3.5 py-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function LoadingLine({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-4 text-sm text-ink-muted" role="status">
      <RefreshCcw className="size-4 animate-spin text-accent" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon: Icon = FileQuestion,
  action,
  className,
  compact = false,
}: {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-6 text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      <span className="flex size-9 items-center justify-center rounded-lg border border-line bg-surface-muted">
        <Icon className="size-4 text-ink-soft" aria-hidden />
      </span>
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs leading-relaxed text-ink-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-1.5">{action}</div> : null}
    </div>
  );
}

const ERROR_PRESENTATION: Record<
  string,
  { icon: React.ComponentType<{ className?: string }>; title: string; plain: string }
> = {
  offline: {
    icon: PlugZap,
    title: "Analysis service unreachable",
    plain: "The browser could not reach the FATScope backend.",
  },
  not_found: {
    icon: CircleSlash,
    title: "Analysis not found",
    plain: "This case is no longer stored on the service.",
  },
  not_ready: {
    icon: Clock,
    title: "Analysis still running",
    plain: "Results appear as soon as the parser finishes.",
  },
  expired: {
    icon: Clock,
    title: "Retention window has passed",
    plain: "The evidence image was removed by the retention cleanup.",
  },
  unsupported: {
    icon: ShieldAlert,
    title: "Unsupported evidence image",
    plain: "FATScope reads FAT32 volume images and MBR disks only.",
  },
  too_large: {
    icon: ShieldAlert,
    title: "Evidence image too large",
    plain: "The upload exceeds the configured size limit.",
  },
  validation: {
    icon: AlertTriangle,
    title: "Request was rejected",
    plain: "One or more values were outside the accepted range.",
  },
  server: {
    icon: AlertTriangle,
    title: "The service returned an error",
    plain: "The request reached the backend but could not be completed.",
  },
  unknown: {
    icon: AlertTriangle,
    title: "Something went wrong",
    plain: "An unexpected error interrupted this request.",
  },
};

export function ErrorState({
  error,
  onRetry,
  className,
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const kind = apiError?.kind ?? "unknown";
  const presentation = ERROR_PRESENTATION[kind] ?? ERROR_PRESENTATION.unknown;
  const Icon = presentation.icon;
  const detail =
    apiError?.message ?? (error instanceof Error ? error.message : "An unexpected error occurred.");
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border border-line bg-surface-muted p-3.5",
        compact ? "items-center" : "items-start",
        className,
      )}
      role="alert"
    >
      <span className="mt-px flex size-7 shrink-0 items-center justify-center rounded-md border border-high-line bg-high-soft">
        <Icon className="size-3.5 text-high" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[13px] font-medium text-ink">{presentation.title}</p>
        <p className="text-xs leading-relaxed text-ink-muted">{presentation.plain}</p>
        <p className="text-xs leading-relaxed text-ink-soft">{detail}</p>
        {apiError?.hint ? (
          <p className="text-xs leading-relaxed text-ink-soft">{apiError.hint}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button size="sm" variant="secondary" onClick={onRetry} className="shrink-0">
          <RefreshCcw aria-hidden />
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function Notice({
  tone = "neutral",
  icon: Icon,
  title,
  children,
  className,
  action,
}: {
  tone?: "neutral" | "warning" | "critical" | "accent" | "positive";
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  const tones = {
    neutral: "border-line bg-surface-muted text-ink-muted",
    warning: "border-medium-line bg-medium-soft text-medium",
    critical: "border-critical-line bg-critical-soft text-critical",
    accent: "border-accent-line bg-accent-soft text-accent-ink",
    positive: "border-positive-line bg-positive-soft text-positive",
  } as const;
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-xs leading-relaxed",
        tones[tone],
        className,
      )}
    >
      {Icon ? <Icon className="mt-px size-3.5 shrink-0" aria-hidden /> : null}
      <div className="min-w-0 flex-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
