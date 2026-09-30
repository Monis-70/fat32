"use client";

import { FolderOpen, Home } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { DemoCaseCard, SupportedFormatsCard } from "@/components/workbench/demo-card";
import { RecentCases } from "@/components/workbench/recent-cases";
import { UploadPanel } from "@/components/workbench/upload-panel";
import { Button } from "@/components/ui/button";
import { useAnalyses } from "@/lib/api/queries";
import { truncateMiddle } from "@/lib/format";

export default function WorkbenchPage() {
  const recents = useAnalyses(6, 0);

  return (
    <AppShell
      navSections={[
        {
          label: "Workspace",
          items: [
            {
              key: "workbench",
              label: "Case workbench",
              href: "/",
              icon: Home,
              exact: true,
              blurb: "Open evidence and review recent cases",
            },
          ],
        },
      ]}
      activeKey="workbench"
      breadcrumbs={[{ label: "Cases" }]}
      title="Case workbench"
      description="Open an authorised FAT32 evidence image, or return to a case already in progress."
      analysisId={null}
      sidebarAside={(collapsed) =>
        collapsed || !recents.data || recents.data.items.length === 0 ? null : (
          <div className="rounded-lg border border-rail-line bg-rail-raised p-2.5">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.11em] text-rail-muted">
              <FolderOpen className="size-3" aria-hidden />
              Jump to case
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {recents.data.items.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/analysis/${item.id}`}
                    className="block truncate rounded-sm px-1 py-1 text-[11.5px] text-rail-muted transition-colors hover:bg-rail/60 hover:text-rail-ink"
                    title={item.original_filename}
                  >
                    {truncateMiddle(item.original_filename, 24)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )
      }
      actions={
        <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
          <Link href="#recent-cases">Recent cases</Link>
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <UploadPanel />
          <div className="space-y-4">
            <DemoCaseCard />
            <SupportedFormatsCard />
          </div>
        </div>
        <div id="recent-cases" className="scroll-mt-20">
          <RecentCases />
        </div>
      </div>
    </AppShell>
  );
}
