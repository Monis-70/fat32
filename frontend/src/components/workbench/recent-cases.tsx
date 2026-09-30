"use client";

import { ArrowRight, FolderOpen, HardDrive, Loader2, Trash2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { StatusBadge } from "@/components/common/data";
import { RelativeTime } from "@/components/common/relative-time";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Progress } from "@/components/ui/primitives";
import { Surface, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { IconHint } from "@/components/ui/tooltip";
import { useAnalyses, useDeleteAnalysis } from "@/lib/api/queries";
import type { AnalysisSummary } from "@/lib/api/schemas";
import { formatBytes, truncateMiddle } from "@/lib/format";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";

export function RecentCases() {
  const { data, isPending, isError, error, refetch } = useAnalyses(15, 0);
  const remove = useDeleteAnalysis();
  const [target, setTarget] = React.useState<AnalysisSummary | null>(null);
  const wide = useMediaQuery(DESKTOP_QUERY);

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle icon={FolderOpen} hint="Cases remain available until their retention window expires.">
          Recent cases
        </SurfaceTitle>
        {data ? <Badge tone="neutral">{data.total} stored</Badge> : null}
      </SurfaceHeader>

      {isPending ? <SkeletonRows rows={4} height="h-10" /> : null}
      {isError ? (
        <div className="p-3.5">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      ) : null}
      {data && data.items.length === 0 ? (
        <EmptyState
          icon={HardDrive}
          title="No cases yet"
          description="Upload an evidence image or open the demo case to begin an examination."
        />
      ) : null}

      {data && data.items.length > 0 ? (
        wide ? (
          <div className="overflow-x-auto">
            <table className="grid-table">
              <thead>
                <tr>
                  <th scope="col">Evidence</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="hidden xl:table-cell">Case</th>
                  <th scope="col" className="text-right">Size</th>
                  <th scope="col" className="text-right">Findings</th>
                  <th scope="col" className="hidden xl:table-cell">Opened</th>
                  <th scope="col" className="w-20 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => (
                  <tr key={item.id} className="transition-colors hover:bg-surface-muted">
                    <td>
                      <Link
                        href={`/analysis/${item.id}`}
                        className="flex min-w-0 items-center gap-2 font-medium text-ink hover:text-accent"
                        title={item.original_filename}
                      >
                        <HardDrive className="size-3.5 shrink-0 text-ink-soft" aria-hidden />
                        <span className="truncate">{truncateMiddle(item.original_filename, 40)}</span>
                        {item.is_demo ? <Badge tone="accent" size="sm">Demo</Badge> : null}
                      </Link>
                      {item.status === "failed" && item.error_message ? (
                        <p className="mt-0.5 max-w-md truncate pl-5 text-[11px] text-critical">
                          {item.error_message}
                        </p>
                      ) : null}
                      {item.status === "running" || item.status === "queued" ? (
                        <div className="mt-1 max-w-[220px] pl-5">
                          <Progress value={item.progress} aria-label="Analysis progress" />
                          <p className="mt-0.5 truncate text-[10.5px] text-ink-soft">{item.stage}</p>
                        </div>
                      ) : null}
                    </td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="hidden max-w-[160px] truncate text-ink-muted xl:table-cell">
                      {item.case_id ?? "—"}
                    </td>
                    <td className="text-right tabular-nums text-ink-muted">
                      {formatBytes(item.size_bytes)}
                    </td>
                    <td className="text-right">
                      {item.status === "completed" ? (
                        <span className="inline-flex items-center gap-1.5">
                          {item.severity_counts.critical > 0 ? (
                            <Badge tone="critical" size="sm">
                              {item.severity_counts.critical} critical
                            </Badge>
                          ) : null}
                          <span className="tabular-nums text-ink-muted">{item.finding_count}</span>
                        </span>
                      ) : (
                        <span className="text-ink-soft">—</span>
                      )}
                    </td>
                    <td className="hidden whitespace-nowrap text-ink-muted xl:table-cell">
                      <RelativeTime value={item.created_at} />
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <IconHint label="Delete case and stored artefacts">
                          <Button
                            variant="ghost"
                            size="iconXs"
                            aria-label={`Delete ${item.original_filename}`}
                            onClick={() => setTarget(item)}
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        </IconHint>
                        <IconHint label="Open case">
                          <Button asChild variant="ghost" size="iconXs">
                            <Link href={`/analysis/${item.id}`} aria-label={`Open ${item.original_filename}`}>
                              <ArrowRight aria-hidden />
                            </Link>
                          </Button>
                        </IconHint>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((item) => (
              <li key={item.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/analysis/${item.id}`}
                    className="min-w-0 flex-1"
                    title={item.original_filename}
                  >
                    <p className="truncate text-[13px] font-medium text-ink">
                      {truncateMiddle(item.original_filename, 34)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                      {[item.case_id, formatBytes(item.size_bytes)].filter(Boolean).join(" · ")}
                    </p>
                  </Link>
                  <Button
                    variant="ghost"
                    size="iconXs"
                    aria-label={`Delete ${item.original_filename}`}
                    onClick={() => setTarget(item)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={item.status} />
                  {item.is_demo ? <Badge tone="accent" size="sm">Demo</Badge> : null}
                  {item.status === "completed" && item.severity_counts.critical > 0 ? (
                    <Badge tone="critical" size="sm">
                      {item.severity_counts.critical} critical
                    </Badge>
                  ) : null}
                  <span className="ml-auto text-[11px] text-ink-soft">
                    <RelativeTime value={item.created_at} />
                  </span>
                </div>
                {item.status === "running" || item.status === "queued" ? (
                  <div className="mt-2">
                    <Progress value={item.progress} aria-label="Analysis progress" />
                    <p className="mt-0.5 truncate text-[10.5px] text-ink-soft">{item.stage}</p>
                  </div>
                ) : null}
                {item.status === "failed" && item.error_message ? (
                  <p className="mt-1.5 text-[11px] text-critical">{item.error_message}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : null}

      {remove.isError ? (
        <div className="p-3.5">
          <ErrorState error={remove.error} compact />
        </div>
      ) : null}

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(next) => {
          if (!next) setTarget(null);
        }}
        title="Delete this case?"
        description="The stored evidence image, recovered files and analysis records are removed immediately. This cannot be undone."
        details={
          target ? <span className="font-mono text-[11px]">{target.original_filename}</span> : undefined
        }
        confirmLabel={remove.isPending ? "Deleting…" : "Delete case"}
        busy={remove.isPending}
        onConfirm={() => {
          if (!target) return;
          remove.mutate(target.id, { onSettled: () => setTarget(null) });
        }}
      />
      {remove.isPending ? (
        <p className="sr-only" role="status">
          <Loader2 aria-hidden /> Deleting case
        </p>
      ) : null}
    </Surface>
  );
}
