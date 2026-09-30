"use client";

import { ChevronRight, Menu, Search } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { ConnectionIndicator } from "@/components/layout/connection-indicator";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import type { NavItem } from "@/components/layout/nav-config";
import {
  RailBrand,
  RailCollapseToggle,
  RailFooter,
  RailNav,
  RailSection,
} from "@/components/layout/rail";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { usePersistedBoolean } from "@/lib/persisted-store";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

const SIDEBAR_STORAGE_KEY = "fatscope-sidebar-collapsed";

export function AppShell({
  navSections,
  activeKey,
  breadcrumbs,
  title,
  description,
  actions,
  sidebarAside,
  analysisId,
  children,
}: {
  navSections: { label: string; items: NavItem[] }[];
  activeKey: string | null;
  breadcrumbs: Crumb[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  sidebarAside?: (collapsed: boolean) => React.ReactNode;
  analysisId: string | null;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = usePersistedBoolean(SIDEBAR_STORAGE_KEY, false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const palette = useCommandPalette();

  const toggleCollapsed = () => setCollapsed(!collapsed);

  const railBody = (mobile: boolean) => (
    <div
      className={cn(
        "flex h-full flex-col gap-4 overflow-y-auto scroll-thin",
        mobile || !collapsed ? "px-3 py-3" : "px-3 py-3",
      )}
    >
      <div className={cn("flex items-center", collapsed && !mobile ? "justify-center" : "justify-between gap-2")}>
        <RailBrand collapsed={collapsed && !mobile} />
        {mobile ? null : <RailCollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} />}
      </div>

      {sidebarAside ? sidebarAside(collapsed && !mobile) : null}

      <nav aria-label="Primary" className="space-y-4">
        {navSections.map((section) => (
          <RailSection key={section.label} label={section.label} collapsed={collapsed && !mobile}>
            <RailNav
              items={section.items}
              activeKey={activeKey}
              collapsed={collapsed && !mobile}
              onNavigate={mobile ? () => setMobileOpen(false) : undefined}
            />
          </RailSection>
        ))}
      </nav>

      <RailFooter collapsed={collapsed && !mobile} />
    </div>
  );

  return (
    <div className="flex min-h-dvh bg-canvas">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-rail-line bg-rail transition-[width] duration-200 lg:block",
          collapsed ? "w-[68px]" : "w-[232px]",
        )}
      >
        {railBody(false)}
      </aside>

      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent
          side="left"
          title="FATScope navigation"
          description="Move between workspace sections"
          bare
          className="lg:hidden"
        >
          {railBody(true)}
        </DrawerContent>
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu aria-hidden />
            </Button>

            <div className="min-w-0 flex-1">
              <nav aria-label="Breadcrumb" className="hidden sm:block">
                <ol className="flex items-center gap-1 text-[11px] text-ink-soft">
                  {breadcrumbs.map((crumb, index) => (
                    <li key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
                      {index > 0 ? (
                        <ChevronRight className="size-3 shrink-0 text-ink-soft/70" aria-hidden />
                      ) : null}
                      {crumb.href ? (
                        <Link
                          href={crumb.href}
                          className="truncate rounded-sm transition-colors hover:text-ink"
                        >
                          {crumb.label}
                        </Link>
                      ) : (
                        <span className="truncate text-ink-muted" aria-current="page">
                          {crumb.label}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
              <h1 className="truncate text-[15px] font-semibold leading-tight text-ink">{title}</h1>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => palette.setOpen(true)}
                className="hidden h-8 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-xs text-ink-soft transition-colors hover:border-line-strong hover:text-ink-muted md:flex"
              >
                <Search className="size-3.5" aria-hidden />
                <span>Search</span>
                <kbd className="kbd ml-3">⌘K</kbd>
              </button>
              <Button
                variant="ghost"
                size="iconSm"
                className="md:hidden"
                aria-label="Open command palette"
                onClick={() => palette.setOpen(true)}
              >
                <Search aria-hidden />
              </Button>
              <div className="lg:hidden">
                <ConnectionIndicator variant="bar" />
              </div>
              {actions}
            </div>
          </div>
          {description ? (
            <p className="hidden truncate px-5 pb-2 text-xs text-ink-muted lg:block">
              {description}
            </p>
          ) : null}
        </header>

        <main
          id="workspace-content"
          className="min-w-0 flex-1 px-3 py-4 sm:px-5 sm:py-5"
          key={activeKey ?? "root"}
        >
          {children}
        </main>
      </div>

      <CommandPalette
        open={palette.open}
        onOpenChange={palette.setOpen}
        analysisId={analysisId}
      />
    </div>
  );
}
