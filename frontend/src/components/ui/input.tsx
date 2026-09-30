"use client";

import { Search, X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink transition-colors placeholder:text-ink-soft hover:border-ink-soft focus:border-accent disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-ink-soft",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-[72px] w-full rounded-md border border-line-strong bg-surface px-2.5 py-2 text-sm text-ink transition-colors placeholder:text-ink-soft hover:border-ink-soft focus:border-accent",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function SearchInput({
  value,
  onValueChange,
  placeholder,
  label,
  className,
  id,
}: {
  value: string;
  onValueChange: (next: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  id?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft"
        aria-hidden
      />
      <Input
        id={id}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        className="h-8 pl-7 pr-7 text-[13px]"
      />
      {value ? (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={() => onValueChange("")}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-ink-soft hover:text-ink"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("text-xs font-medium tracking-wide text-ink-muted", className)}
      {...props}
    />
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs text-critical">
      {children}
    </p>
  );
}
