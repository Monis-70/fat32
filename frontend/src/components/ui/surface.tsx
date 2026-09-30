import * as React from "react";

import { cn } from "@/lib/utils";

export function Surface({
  className,
  as: Component = "section",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article" }) {
  return <Component className={cn("surface", className)} {...props} />;
}

export function SurfaceHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <header className={cn("surface-header", className)} {...props} />;
}

export function SurfaceTitle({
  className,
  as: Component = "h2",
  icon: Icon,
  hint,
  children,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement> & {
  as?: "h1" | "h2" | "h3";
  icon?: React.ComponentType<{ className?: string }>;
  hint?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Component
        className={cn("flex items-center gap-1.5 text-[13px] font-semibold text-ink", className)}
        {...props}
      >
        {Icon ? <Icon className="size-4 shrink-0 text-ink-soft" /> : null}
        <span className="truncate">{children}</span>
      </Component>
      {hint ? <p className="mt-0.5 text-xs leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function SurfaceBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

export function SurfaceFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <footer
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5",
        className,
      )}
      {...props}
    />
  );
}

export function Toolbar({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted px-3 py-2",
        className,
      )}
      {...props}
    />
  );
}

export function FieldLabel({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}
