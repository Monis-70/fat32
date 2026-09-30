"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

export const DrawerContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    title: string;
    description?: string;
    side?: "left" | "right";
    headerAccessory?: React.ReactNode;
    bare?: boolean;
  }
>(
  (
    { className, children, title, description, side = "right", headerAccessory, bare = false, ...props },
    ref,
  ) => (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-ink/40 backdrop-blur-[1px] animate-fade-in dark:bg-black/60" />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-y-0 z-[70] flex w-full flex-col shadow-raised outline-none animate-slide-left",
          side === "right"
            ? "right-0 max-w-[580px] border-l border-line bg-surface"
            : "left-0 max-w-[290px] border-r border-rail-line bg-rail",
          className,
        )}
        {...props}
      >
        {bare ? (
          <>
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {description ?? title}
            </DialogPrimitive.Description>
            {children}
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-line bg-surface-muted px-4 py-2.5">
              <div className="min-w-0">
                <DialogPrimitive.Title className="truncate text-[13px] font-semibold text-ink">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-0.5 truncate font-mono text-[11px] text-ink-muted">
                  {description ?? ""}
                </DialogPrimitive.Description>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {headerAccessory}
                <DialogPrimitive.Close
                  aria-label="Close panel"
                  className="rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </DialogPrimitive.Close>
              </div>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  ),
);
DrawerContent.displayName = "DrawerContent";
