"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group";
import { Check, Minus } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Separator = React.forwardRef<
  React.ComponentRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      "shrink-0 bg-line",
      orientation === "horizontal" ? "h-px w-full" : "h-5 w-px",
      className,
    )}
    {...props}
  />
));
Separator.displayName = "Separator";

export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    value: number;
    tone?: "accent" | "positive" | "critical";
  }
>(({ className, value, tone = "accent", ...props }, ref) => (
  <ProgressPrimitive.Root
    ref={ref}
    value={value}
    className={cn("h-1.5 w-full overflow-hidden rounded-sm bg-surface-sunken", className)}
    {...props}
  >
    <ProgressPrimitive.Indicator
      className={cn(
        "h-full rounded-sm transition-[width] duration-500 ease-out",
        tone === "accent" && "bg-accent",
        tone === "positive" && "bg-positive",
        tone === "critical" && "bg-critical",
      )}
      style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
    />
  </ProgressPrimitive.Root>
));
Progress.displayName = "Progress";

export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "flex size-4 shrink-0 items-center justify-center rounded-xs border border-line-strong bg-surface transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent",
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="text-white">
      {props.checked === "indeterminate" ? (
        <Minus className="size-3" aria-hidden />
      ) : (
        <Check className="size-3" aria-hidden />
      )}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = "Checkbox";

export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shimmer rounded-sm", className)} aria-hidden {...props} />;
}

export function SegmentedControl({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: string;
  onValueChange: (next: string) => void;
  options: { value: string; label: string; icon?: React.ComponentType<{ className?: string }> }[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => {
        if (next) onValueChange(next);
      }}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-line-strong bg-surface-muted p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <ToggleGroupPrimitive.Item
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className="inline-flex h-6 items-center gap-1 rounded-sm px-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-[0_1px_2px_rgba(22,25,29,0.08)]"
          >
            {Icon ? <Icon className="size-3.5" /> : null}
            {option.label}
          </ToggleGroupPrimitive.Item>
        );
      })}
    </ToggleGroupPrimitive.Root>
  );
}
