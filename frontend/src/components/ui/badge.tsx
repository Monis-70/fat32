import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-px text-[11px] font-medium leading-[1.15rem] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-line-strong bg-surface-sunken text-ink-muted",
        outline: "border-line-strong bg-transparent text-ink-muted",
        accent: "border-accent-line bg-accent-soft text-accent-ink",
        critical: "border-critical-line bg-critical-soft text-critical",
        high: "border-high-line bg-high-soft text-high",
        medium: "border-medium-line bg-medium-soft text-medium",
        low: "border-low-line bg-low-soft text-low",
        info: "border-info-line bg-info-soft text-info",
        positive: "border-positive-line bg-positive-soft text-positive",
      },
      size: {
        sm: "px-1 text-[10px] leading-4",
        md: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, size }), className)} {...props} />;
}

export function Dot({ tone, className }: { tone: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: tone }}
    />
  );
}

export { badgeVariants };
