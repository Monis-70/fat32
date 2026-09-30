"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconHint, Term } from "@/components/ui/tooltip";
import type { AnalysisStatus, ClusterState, Severity } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

export const SEVERITY_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_TONE: Record<Severity, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
  info: "info",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const SEVERITY_MEANING: Record<Severity, string> = {
  critical: "Data integrity is compromised. Treat affected files as unreliable.",
  high: "A structural defect that can change how files are interpreted.",
  medium: "An inconsistency worth explaining in the examination notes.",
  low: "A minor observation. Useful context rather than a defect.",
  info: "Neutral context recorded by the parser.",
};

export const CLUSTER_STATE_COLOR: Record<ClusterState, string> = {
  free: "var(--color-cluster-free)",
  allocated: "var(--color-cluster-allocated)",
  reserved: "var(--color-cluster-reserved)",
  bad: "var(--color-cluster-bad)",
  orphaned: "var(--color-cluster-orphaned)",
  crosslinked: "var(--color-cluster-crosslinked)",
  looped: "var(--color-cluster-looped)",
};

export const CLUSTER_STATE_LABEL: Record<ClusterState, string> = {
  free: "Free",
  allocated: "In use",
  reserved: "Reserved",
  bad: "Marked bad",
  orphaned: "Orphaned",
  crosslinked: "Cross-linked",
  looped: "Looped",
};

export const CLUSTER_STATE_MEANING: Record<ClusterState, string> = {
  free: "Not assigned to any file. May still hold recoverable deleted content.",
  allocated: "Claimed by a live directory entry.",
  reserved: "Reserved by the filesystem and not usable for file data.",
  bad: "Flagged unusable by the 0x0FFFFFF7 marker. Can be used to hide data.",
  orphaned: "Marked in use but no directory entry points at it.",
  crosslinked: "Claimed by more than one file, so at least one file is wrong.",
  looped: "Part of a chain that points back into itself.",
};

export function SeverityBadge({
  severity,
  withMeaning = false,
}: {
  severity: Severity;
  withMeaning?: boolean;
}) {
  const badge = (
    <Badge tone={SEVERITY_TONE[severity]} className="uppercase tracking-[0.06em]">
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
  if (!withMeaning) return badge;
  return <IconHint label={SEVERITY_MEANING[severity]}>{badge}</IconHint>;
}

export function SeverityRule({ severity }: { severity: Severity }) {
  return (
    <span
      aria-hidden
      className={cn(
        "block w-0.5 shrink-0 rounded-full",
        severity === "critical" && "bg-critical",
        severity === "high" && "bg-high",
        severity === "medium" && "bg-medium",
        severity === "low" && "bg-low",
        severity === "info" && "bg-info",
      )}
    />
  );
}

export function StatusBadge({ status }: { status: AnalysisStatus }) {
  const tone =
    status === "completed"
      ? "positive"
      : status === "failed"
        ? "critical"
        : status === "running"
          ? "accent"
          : "neutral";
  const label =
    status === "completed"
      ? "Complete"
      : status === "failed"
        ? "Failed"
        : status === "running"
          ? "Analysing"
          : "Queued";
  return (
    <Badge tone={tone} className="gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "completed" && "bg-positive",
          status === "failed" && "bg-critical",
          status === "running" && "animate-pulse bg-accent",
          status === "queued" && "bg-ink-soft",
        )}
        aria-hidden
      />
      {label}
    </Badge>
  );
}

export function DataRow({
  label,
  value,
  mono,
  definition,
  copyValue,
  title,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  definition?: string;
  copyValue?: string;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line-faint py-[7px] last:border-b-0">
      <dt className="shrink-0 text-xs text-ink-muted">
        {definition ? <Term definition={definition}>{label}</Term> : label}
      </dt>
      <dd
        className={cn(
          "flex min-w-0 items-center justify-end gap-1 text-right text-[13px] text-ink",
          mono && "font-mono text-xs",
        )}
        title={title ?? (typeof value === "string" ? value : undefined)}
      >
        <span className="truncate">{value}</span>
        {copyValue ? <CopyButton value={copyValue} label={`Copy ${label.toLowerCase()}`} /> : null}
      </dd>
    </div>
  );
}

export function DataList({
  items,
  className,
}: {
  items: {
    label: string;
    value: React.ReactNode;
    mono?: boolean;
    definition?: string;
    copyValue?: string;
    title?: string;
  }[];
  className?: string;
}) {
  return (
    <dl className={cn("w-full", className)}>
      {items.map((item) => (
        <DataRow key={item.label} {...item} />
      ))}
    </dl>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "neutral",
  definition,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "neutral" | "accent" | "critical" | "warning" | "positive";
  definition?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const valueTone = {
    neutral: "text-ink",
    accent: "text-accent",
    critical: "text-critical",
    warning: "text-medium",
    positive: "text-positive",
  }[tone];
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-surface px-3.5 py-3">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 shrink-0 text-ink-soft" /> : null}
        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
          {definition ? <Term definition={definition}>{label}</Term> : label}
        </p>
      </div>
      <p className={cn("text-[1.375rem] font-semibold leading-none tabular-nums", valueTone)}>
        {value}
      </p>
      {hint ? <p className="truncate text-xs text-ink-soft">{hint}</p> : null}
    </div>
  );
}

export function CopyButton({
  value,
  label,
  size = "iconXs",
}: {
  value: string;
  label: string;
  size?: "iconXs" | "iconSm";
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  return (
    <IconHint label={copied ? "Copied to clipboard" : label}>
      <Button
        variant="ghost"
        size={size}
        aria-label={label}
        className="shrink-0"
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            if (timer.current !== null) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="text-positive" aria-hidden /> : <Copy aria-hidden />}
      </Button>
    </IconHint>
  );
}

export function MonoValue({
  value,
  className,
  copyLabel,
  title,
}: {
  value: string;
  className?: string;
  copyLabel?: string;
  title?: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className={cn("truncate font-mono text-xs text-ink", className)} title={title ?? value}>
        {value}
      </span>
      {copyLabel ? <CopyButton value={value} label={copyLabel} /> : null}
    </span>
  );
}

export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-end justify-between gap-3", className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-soft">
        {children}
      </h2>
      {action}
    </div>
  );
}
