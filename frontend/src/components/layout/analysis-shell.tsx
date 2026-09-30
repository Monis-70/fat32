"use client";

import { AlertTriangle, ArrowLeft, HardDrive, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { CopyButton, StatusBadge } from "@/components/common/data";
import { RelativeTime, useIsExpired } from "@/components/common/relative-time";
import { ErrorState, Notice, SkeletonMetrics, SkeletonSurface } from "@/components/common/states";
import { AppShell, type Crumb } from "@/components/layout/app-shell";
import { PAGE_TITLES, analysisNav, routeKeyFromPath } from "@/components/layout/nav-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/primitives";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { IconHint } from "@/components/ui/tooltip";
import { useAnalysis, useDeleteAnalysis } from "@/lib/api/queries";
import type { AnalysisSummary } from "@/lib/api/schemas";
import { formatBytes, shortHash, truncateMiddle } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AnalysisShell({ id, children }: { id: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, isPending, isError, error, refetch } = useAnalysis(id);
  const remove = useDeleteAnalysis();
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const routeKey = routeKeyFromPath(pathname, id);
  const page = PAGE_TITLES[routeKey] ?? PAGE_TITLES.overview;
  const nav = analysisNav(id);

  const breadcrumbs: Crumb[] = [
    { label: "Cases", href: "/" },
    {
      label: data ? truncateMiddle(data.original_filename, 28) : "Loading case",
      href: `/analysis/${id}`,
    },
    { label: page.title },
  ];

  return (
    <AppShell
      navSections={[{ label: "Investigation", items: nav }]}
      activeKey={routeKey}
      breadcrumbs={breadcrumbs}
      title={page.title}
      description={page.description}
      analysisId={id}
      actions={
        <>
          <IconHint label="Delete this case and every stored artefact">
            <Button
              variant="ghost"
              size="iconSm"
              aria-label="Delete this case"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 aria-hidden />
            </Button>
          </IconHint>
          <Button asChild variant="secondary" size="sm" className="hidden sm:inline-flex">
            <Link href="/">
              <ArrowLeft aria-hidden />
              Cases
            </Link>
          </Button>
        </>
      }
      sidebarAside={(collapsed) => <EvidenceRailCard analysis={data} collapsed={collapsed} />}
    >
      {isPending ? (
        <div className="space-y-4">
          <SkeletonMetrics />
          <SkeletonSurface rows={7} />
        </div>
      ) : null}

      {isError ? <ErrorState error={error} onRetry={() => void refetch()} /> : null}

      {data ? (
        <div className="space-y-4">
          <EvidenceStrip analysis={data} />
          {data.status === "completed" ? (
            children
          ) : data.status === "failed" ? (
            <FailurePanel message={data.error_message} hint={data.error_hint} />
          ) : (
            <ProgressPanel analysis={data} />
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this case?"
        description="The stored evidence image, recovered files, findings and database records for this analysis are removed immediately. This cannot be undone."
        details={
          data ? (
            <span className="font-mono text-[11px]">{data.original_filename}</span>
          ) : undefined
        }
        confirmLabel={remove.isPending ? "Deleting…" : "Delete case"}
        busy={remove.isPending}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              setConfirmOpen(false);
              router.push("/");
            },
          })
        }
      />
    </AppShell>
  );
}

function EvidenceRailCard({
  analysis,
  collapsed,
}: {
  analysis: AnalysisSummary | undefined;
  collapsed: boolean;
}) {
  if (collapsed) {
    return (
      <IconHint
        side="right"
        label={analysis ? analysis.original_filename : "Evidence image loading"}
      >
        <div className="mx-auto flex size-9 items-center justify-center rounded-md border border-rail-line bg-rail-raised text-rail-ink">
          <HardDrive className="size-4" aria-hidden />
        </div>
      </IconHint>
    );
  }
  return (
    <div className="rounded-lg border border-rail-line bg-rail-raised p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-rail-muted">
        Active evidence
      </p>
      <p
        className="mt-1 truncate text-[12.5px] font-medium text-rail-ink"
        title={analysis?.original_filename}
      >
        {analysis ? truncateMiddle(analysis.original_filename, 26) : "Loading…"}
      </p>
      {analysis ? (
        <>
          <p className="mt-0.5 truncate text-[11px] text-rail-muted">
            {[analysis.case_id, formatBytes(analysis.size_bytes)].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <StatusBadge status={analysis.status} />
            {analysis.is_demo ? <Badge tone="accent">Demo</Badge> : null}
          </div>
          {analysis.status === "running" || analysis.status === "queued" ? (
            <div className="mt-2 space-y-1">
              <Progress value={analysis.progress} aria-label="Analysis progress" />
              <p className="truncate text-[10.5px] text-rail-muted">{analysis.stage}</p>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function EvidenceStrip({ analysis }: { analysis: AnalysisSummary }) {
  const expired = useIsExpired(analysis.expires_at);
  return (
    <Surface className="overflow-hidden">
      <div className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted">
            <HardDrive className="size-4 text-ink-muted" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p
                className="truncate text-[15px] font-semibold leading-tight text-ink"
                title={analysis.original_filename}
              >
                {analysis.original_filename}
              </p>
              <StatusBadge status={analysis.status} />
              {analysis.is_demo ? <Badge tone="accent">Demo image</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
              <span>{formatBytes(analysis.size_bytes)}</span>
              {analysis.case_id ? <span>Case {analysis.case_id}</span> : null}
              {analysis.evidence_number ? <span>Exhibit {analysis.evidence_number}</span> : null}
              {analysis.examiner ? <span>Examiner {analysis.examiner}</span> : null}
            </div>
            {analysis.image_sha256 ? (
              <div className="mt-1 flex items-center gap-1">
                <span className="text-[11px] text-ink-soft">SHA-256</span>
                <span
                  className="truncate font-mono text-[11px] text-ink-muted"
                  title={analysis.image_sha256}
                >
                  {shortHash(analysis.image_sha256, 14)}
                </span>
                <CopyButton value={analysis.image_sha256} label="Copy image SHA-256" />
              </div>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 border-t border-line pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.09em] text-ink-soft">
            Retention
          </p>
          <p className={cn("mt-0.5 text-xs", expired ? "text-critical" : "text-ink")}>
            {expired ? "Expired" : <RelativeTime value={analysis.expires_at} prefix="Expires" />}
          </p>
        </div>
      </div>
      {expired ? (
        <div className="border-t border-line px-3.5 py-2.5">
          <Notice tone="critical" icon={AlertTriangle} title="Retention window has passed">
            Stored artefacts for this case may already have been removed by the cleanup task.
            Downloads and hex reads can fail.
          </Notice>
        </div>
      ) : null}
    </Surface>
  );
}

function ProgressPanel({ analysis }: { analysis: AnalysisSummary }) {
  const stages = [
    "Hashing evidence image",
    "Locating FAT32 volume",
    "Reading file allocation tables",
    "Traversing directory tree",
    "Building cluster allocation map",
    "Evaluating findings",
  ];
  const reached = Math.round((analysis.progress / 100) * stages.length);
  return (
    <Surface>
      <SurfaceHeader>
        <SurfaceTitle icon={Loader2}>Parsing the evidence image</SurfaceTitle>
        <Badge tone="accent">{analysis.progress}%</Badge>
      </SurfaceHeader>
      <SurfaceBody className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink">{analysis.stage}</span>
            <span className="tabular-nums text-ink-muted">{analysis.progress}%</span>
          </div>
          <Progress value={analysis.progress} aria-label="Analysis progress" />
        </div>
        <ol className="space-y-1.5">
          {stages.map((stage, index) => {
            const complete = index < reached;
            const active = index === reached;
            return (
              <li key={stage} className="flex items-center gap-2 text-xs">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    complete ? "bg-positive" : active ? "animate-pulse bg-accent" : "bg-line-strong",
                  )}
                  aria-hidden
                />
                <span className={complete || active ? "text-ink" : "text-ink-soft"}>{stage}</span>
              </li>
            );
          })}
        </ol>
        <p className="text-xs leading-relaxed text-ink-soft">
          FATScope reads the image through a bounded read-only memory map. Results appear here
          automatically when the parser finishes; you do not need to refresh.
        </p>
      </SurfaceBody>
    </Surface>
  );
}

function FailurePanel({ message, hint }: { message: string | null; hint: string | null }) {
  return (
    <Surface>
      <SurfaceHeader>
        <SurfaceTitle icon={AlertTriangle}>This image could not be parsed</SurfaceTitle>
        <Badge tone="critical">Failed</Badge>
      </SurfaceHeader>
      <SurfaceBody className="space-y-3">
        <p className="text-[13px] leading-relaxed text-ink">
          {message ?? "The parser could not complete this evidence image."}
        </p>
        <Notice tone="warning" icon={AlertTriangle} title="What FATScope accepts">
          {hint ??
            "Raw FAT32 volume images and MBR disk images containing a FAT32 partition. Other filesystems, GPT disks and compressed containers such as E01 are not supported."}
        </Notice>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="primary" size="sm">
            <Link href="/">Return to the case workbench</Link>
          </Button>
        </div>
      </SurfaceBody>
    </Surface>
  );
}
