"use client";

import { PanelLeftClose, PanelLeftOpen, ScanLine } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ConnectionDot, ConnectionIndicator } from "@/components/layout/connection-indicator";
import type { NavItem } from "@/components/layout/nav-config";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { IconHint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function RailBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      href="/"
      aria-label="FATScope case workbench"
      className={cn(
        "flex items-center gap-2.5 rounded-md py-1 transition-colors",
        collapsed ? "justify-center px-0" : "px-1",
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent text-white shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
        <ScanLine className="size-4" aria-hidden />
      </span>
      {collapsed ? null : (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[13px] font-semibold tracking-tight text-rail-ink">FATScope</span>
          <span className="mt-1 truncate text-[10.5px] uppercase tracking-[0.1em] text-rail-muted">
            Forensic console
          </span>
        </span>
      )}
    </Link>
  );
}

export function RailNav({
  items,
  activeKey,
  collapsed,
  onNavigate,
}: {
  items: NavItem[];
  activeKey: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon;
        const active = item.key === activeKey;
        const link = (
          <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-md text-[13px] font-medium transition-colors",
              collapsed ? "h-9 w-9 justify-center" : "px-2.5 py-2",
              active
                ? "bg-rail-raised text-rail-ink"
                : "text-rail-muted hover:bg-rail-raised/70 hover:text-rail-ink",
            )}
          >
            {active ? (
              <span
                aria-hidden
                className={cn(
                  "absolute rounded-full bg-accent",
                  collapsed ? "-left-2 top-2 h-5 w-[3px]" : "-left-2 top-2.5 h-4 w-[3px]",
                )}
              />
            ) : null}
            <Icon className="size-4 shrink-0" aria-hidden />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </Link>
        );
        return (
          <li key={item.key}>
            {collapsed ? (
              <IconHint label={item.label} side="right">
                {link}
              </IconHint>
            ) : (
              link
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function RailSection({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {collapsed ? (
        <div className="mx-auto h-px w-6 bg-rail-line" aria-hidden />
      ) : (
        <p className="px-2.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-rail-muted/80">
          {label}
        </p>
      )}
      {children}
    </div>
  );
}

export function RailFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      className={cn(
        "mt-auto space-y-2 border-t border-rail-line pt-3",
        collapsed ? "flex flex-col items-center gap-2" : "",
      )}
    >
      {collapsed ? (
        <>
          <ConnectionDot />
          <ThemeToggle />
        </>
      ) : (
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <ConnectionIndicator />
          </div>
          <ThemeToggle />
        </div>
      )}
    </div>
  );
}

export function RailCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <IconHint label={collapsed ? "Expand sidebar" : "Collapse sidebar"} side="right">
      <Button
        variant="rail"
        size="iconSm"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
      </Button>
    </IconHint>
  );
}
