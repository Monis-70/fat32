"use client";

import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description: React.ReactNode;
  details?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-ink/40 backdrop-blur-[1px] animate-fade-in dark:bg-black/60" />
        <AlertDialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[90] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-surface p-5 shadow-raised outline-none animate-fade-rise">
          <AlertDialogPrimitive.Title className="text-sm font-semibold text-ink">
            {title}
          </AlertDialogPrimitive.Title>
          <AlertDialogPrimitive.Description asChild>
            <div className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{description}</div>
          </AlertDialogPrimitive.Description>
          {details ? (
            <div className="mt-3 rounded-md border border-line bg-surface-muted p-3 text-xs text-ink-muted">
              {details}
            </div>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialogPrimitive.Cancel
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
            >
              {cancelLabel}
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
              className={cn(
                buttonVariants({
                  variant: tone === "danger" ? "danger" : "primary",
                  size: "sm",
                }),
              )}
            >
              {confirmLabel}
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
