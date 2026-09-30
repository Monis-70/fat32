"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Info,
  LifeBuoy,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";

import { RelativeTime } from "@/components/common/relative-time";
import { EmptyState, ErrorState, Notice, SkeletonRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/primitives";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import { IconHint } from "@/components/ui/tooltip";
import { api } from "@/lib/api/endpoints";
import { useEntries, useRecoverEntries, useRecoveries } from "@/lib/api/queries";
import type { FsEntry } from "@/lib/api/schemas";
import { formatBytes, formatNumber, shortHash } from "@/lib/format";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

const RATING_TONE: Record<string, "positive" | "medium" | "high" | "critical" | "neutral"> = {
  high: "positive",
  medium: "medium",
  low: "high",
  unlikely: "critical",
  not_recoverable: "neutral",
  not_applicable: "neutral",
};

const RATING_PLAIN: Record<string, string> = {
  high: "Very likely to reproduce the original file",
  medium: "Likely, but verify the carved content",
  low: "Partial or uncertain reconstruction",
  unlikely: "Recovery will probably not be useful",
  not_recoverable: "Nothing can be carved from this record",
  not_applicable: "Not a recovery candidate",
};

export function RecoveryView() {
  const params = useParams<{ id: string }>();
  const analysisId = params.id;
  const deleted = useEntries(analysisId, {
    entry_status: "deleted",
    page: 1,
    page_size: 200,
    sort: "size",
    order: "desc",
  });
  const recoveries = useRecoveries(analysisId);
  const recover = useRecoverEntries(analysisId);
  const [selected, setSelected] = React.useState<number[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const wide = useMediaQuery(DESKTOP_QUERY);

  const entries = deleted.data?.items ?? [];
  const eligible = entries.filter((entry) => entry.recoverable);
  const allSelected = eligible.length > 0 && selected.length === eligible.length;
  const selectedEntries = entries.filter((entry) => selected.includes(entry.entry_id));
  const totalDeclared = selectedEntries.reduce((sum, entry) => sum + entry.size_bytes, 0);

  const toggle = (entryId: number) => {
    setSelected((current) =>
      current.includes(entryId)
        ? current.filter((item) => item !== entryId)
        : [...current, entryId],
    );
  };

  return (
    <div className="space-y-4">
      <Notice tone="accent" icon={Info} title="How recovery works here">
        FAT32 clears the cluster chain when a file is deleted, so FATScope carves forward from the
        recorded start cluster. A high confidence score means the expected clusters are still free —
        it is not a guarantee that the carved bytes are the original file.
      </Notice>

      <Surface className="overflow-hidden">
        <SurfaceHeader className="flex-wrap gap-y-1.5">
          <SurfaceTitle
            icon={LifeBuoy}
            hint={`${formatNumber(entries.length)} deleted records · ${formatNumber(eligible.length)} eligible for carving`}
          >
            Recovery candidates
          </SurfaceTitle>
        </SurfaceHeader>

        <Toolbar>
          <div className="flex items-center gap-2">
            <Checkbox
              id="select-all-recoverable"
              checked={allSelected}
              disabled={eligible.length === 0}
              onCheckedChange={(checked) =>
                setSelected(checked === true ? eligible.map((entry) => entry.entry_id) : [])
              }
              aria-label="Select all recoverable entries"
            />
            <label htmlFor="select-all-recoverable" className="text-xs text-ink-muted">
              Select all eligible
            </label>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {selected.length > 0 ? (
              <span className="text-xs text-ink-muted">
                {selected.length} selected · {formatBytes(totalDeclared)} declared
              </span>
            ) : null}
            <Button
              variant="primary"
              size="sm"
              disabled={selected.length === 0 || recover.isPending}
              onClick={() => setConfirmOpen(true)}
            >
              {recover.isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <LifeBuoy aria-hidden />
              )}
              {selected.length > 0 ? `Recover ${selected.length}` : "Recover selection"}
            </Button>
          </div>
        </Toolbar>

        {recover.isError ? (
          <div className="p-3.5">
            <ErrorState error={recover.error} onRetry={() => recover.reset()} />
          </div>
        ) : null}

        {deleted.isPending ? <SkeletonRows rows={5} height="h-20" /> : null}
        {deleted.isError ? (
          <div className="p-3.5">
            <ErrorState error={deleted.error} onRetry={() => void deleted.refetch()} />
          </div>
        ) : null}
        {deleted.data && entries.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="No deleted entries were recovered"
            description="Every directory record on this volume is still allocated to a live file."
          />
        ) : null}
        {entries.length > 0 ? (
          <ul className="divide-y divide-line">
            {entries.map((entry) => (
              <RecoveryCandidate
                key={entry.entry_id}
                entry={entry}
                checked={selected.includes(entry.entry_id)}
                onToggle={() => toggle(entry.entry_id)}
              />
            ))}
          </ul>
        ) : null}
      </Surface>

      <Surface className="overflow-hidden">
        <SurfaceHeader>
          <SurfaceTitle icon={Download}>Carved files</SurfaceTitle>
          {recoveries.data ? <Badge tone="neutral">{recoveries.data.total} available</Badge> : null}
        </SurfaceHeader>
        {recoveries.isPending ? <SkeletonRows rows={3} /> : null}
        {recoveries.isError ? (
          <SurfaceBody>
            <ErrorState error={recoveries.error} onRetry={() => void recoveries.refetch()} />
          </SurfaceBody>
        ) : null}
        {recoveries.data && recoveries.data.items.length === 0 ? (
          <EmptyState
            compact
            title="Nothing carved yet"
            description="Select an eligible record above and run recovery to produce a downloadable file."
          />
        ) : null}
        {recoveries.data && recoveries.data.items.length > 0 ? (
          wide ? (
            <div className="overflow-x-auto">
              <table className="grid-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col" className="hidden xl:table-cell">Source record</th>
                    <th scope="col" className="text-right">Carved</th>
                    <th scope="col" className="text-right">Declared</th>
                    <th scope="col">Confidence</th>
                    <th scope="col" className="hidden xl:table-cell">SHA-256</th>
                    <th scope="col">Created</th>
                    <th scope="col" className="text-right">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {recoveries.data.items.map((record) => (
                    <tr key={record.id} className="transition-colors hover:bg-surface-muted">
                      <td className="font-medium">
                        <span className="flex items-center gap-1.5">
                          {record.truncated ? (
                            <IconHint label="Carved file is shorter than the declared size">
                              <AlertTriangle className="size-3.5 shrink-0 text-medium" aria-hidden />
                            </IconHint>
                          ) : (
                            <CheckCircle2 className="size-3.5 shrink-0 text-positive" aria-hidden />
                          )}
                          {record.filename}
                        </span>
                      </td>
                      <td className="hidden xl:table-cell">
                        <span
                          className="block max-w-[15rem] truncate font-mono text-[11.5px] text-ink-muted"
                          title={record.entry_path}
                        >
                          {record.entry_path}
                        </span>
                      </td>
                      <td className="text-right tabular-nums">{formatBytes(record.size_bytes)}</td>
                      <td className="text-right tabular-nums text-ink-muted">
                        {formatBytes(record.declared_size_bytes)}
                      </td>
                      <td>
                        <Badge tone={RATING_TONE[record.rating] ?? "neutral"}>
                          {Math.round(record.confidence * 100)}%
                        </Badge>
                      </td>
                      <td className="hidden xl:table-cell">
                        <span className="font-mono text-[11px]" title={record.sha256}>
                          {shortHash(record.sha256, 8)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-ink-muted">
                        <RelativeTime value={record.created_at} />
                      </td>
                      <td className="text-right">
                        <Button asChild variant="secondary" size="xs">
                          <a href={api.downloadUrl(record.download_url)} download={record.filename}>
                            <Download aria-hidden />
                            Download
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {recoveries.data.items.map((record) => (
                <li key={record.id} className="space-y-1.5 p-3">
                  <p className="truncate text-[13px] font-medium text-ink">{record.filename}</p>
                  <p className="truncate font-mono text-[11px] text-ink-muted" title={record.entry_path}>
                    {record.entry_path}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-muted">
                    <Badge tone={RATING_TONE[record.rating] ?? "neutral"} size="sm">
                      {Math.round(record.confidence * 100)}%
                    </Badge>
                    <span>
                      {formatBytes(record.size_bytes)} of {formatBytes(record.declared_size_bytes)}
                    </span>
                    {record.truncated ? (
                      <Badge tone="medium" size="sm">
                        truncated
                      </Badge>
                    ) : null}
                  </div>
                  <Button asChild variant="secondary" size="xs" className="w-full">
                    <a href={api.downloadUrl(record.download_url)} download={record.filename}>
                      <Download aria-hidden />
                      Download carved file
                    </a>
                  </Button>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {recoveries.data && recoveries.data.items.some((item) => item.truncated) ? (
          <SurfaceBody>
            <Notice tone="warning" icon={AlertTriangle} title="Partial carve">
              At least one carved file is shorter than its recorded length because part of the
              original allocation has already been reused by another file.
            </Notice>
          </SurfaceBody>
        ) : null}
      </Surface>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        tone="primary"
        title={`Carve ${selected.length} ${selected.length === 1 ? "file" : "files"}?`}
        description="FATScope reads the clusters from the evidence image and writes carved copies to the service's storage. The evidence image itself is never modified."
        details={
          <ul className="space-y-0.5">
            {selectedEntries.slice(0, 6).map((entry) => (
              <li key={entry.entry_id} className="flex justify-between gap-3">
                <span className="truncate font-mono text-[11px]">{entry.path}</span>
                <span className="shrink-0 tabular-nums">
                  {Math.round(entry.recovery_confidence * 100)}%
                </span>
              </li>
            ))}
            {selectedEntries.length > 6 ? (
              <li className="text-[11px]">and {selectedEntries.length - 6} more</li>
            ) : null}
          </ul>
        }
        confirmLabel={recover.isPending ? "Carving…" : "Carve files"}
        busy={recover.isPending}
        onConfirm={() =>
          recover.mutate(selected, {
            onSuccess: () => {
              setSelected([]);
              setConfirmOpen(false);
            },
            onError: () => setConfirmOpen(false),
          })
        }
      />
    </div>
  );
}

function RecoveryCandidate({
  entry,
  checked,
  onToggle,
}: {
  entry: FsEntry;
  checked: boolean;
  onToggle: () => void;
}) {
  const confidence = Math.round(entry.recovery_confidence * 100);
  const recoverableBytes = Math.min(
    entry.size_bytes,
    entry.recovery_cluster_count > 0 ? entry.size_bytes : 0,
  );
  return (
    <li className={cn("flex gap-3 px-3.5 py-3", !entry.recoverable && "bg-surface-muted/60")}>
      <div className="pt-0.5">
        <Checkbox
          checked={checked}
          disabled={!entry.recoverable}
          onCheckedChange={onToggle}
          aria-label={`Select ${entry.name} for recovery`}
        />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-ink" title={entry.path}>
            {entry.name}
          </span>
          <IconHint label={RATING_PLAIN[entry.recovery_rating] ?? entry.recovery_rating}>
            <Badge tone={RATING_TONE[entry.recovery_rating] ?? "neutral"}>
              {entry.recovery_rating.replace(/_/g, " ")}
            </Badge>
          </IconHint>
          {entry.is_residual ? <Badge tone="medium">residual record</Badge> : null}
          {entry.recovered_first_char ? (
            <Badge tone="accent">first character restored</Badge>
          ) : null}
        </div>
        <p className="truncate font-mono text-[11.5px] text-ink-muted" title={entry.path}>
          {entry.path}
        </p>

        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-muted">
          <div className="flex gap-1">
            <dt>Declared size</dt>
            <dd className="font-mono text-ink">{formatBytes(entry.size_bytes)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Recoverable</dt>
            <dd className="font-mono text-ink">
              {entry.recoverable ? formatBytes(recoverableBytes) : "none"}
            </dd>
          </div>
          <div className="flex gap-1">
            <dt>Start cluster</dt>
            <dd className="font-mono text-ink">{formatNumber(entry.first_cluster)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Free clusters found</dt>
            <dd className="font-mono text-ink">{formatNumber(entry.recovery_cluster_count)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>Method</dt>
            <dd className="text-ink">{entry.recovery_method?.replace(/_/g, " ") ?? "none"}</dd>
          </div>
        </dl>

        {entry.recoverable ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-40 overflow-hidden rounded-sm bg-surface-sunken">
              <div
                className={cn(
                  "h-full rounded-sm",
                  confidence >= 75
                    ? "bg-positive"
                    : confidence >= 50
                      ? "bg-medium"
                      : confidence >= 25
                        ? "bg-high"
                        : "bg-critical",
                )}
                style={{ width: `${Math.max(3, confidence)}%` }}
              />
            </div>
            <span className="text-[11px] tabular-nums text-ink-muted">
              {confidence}% confidence
            </span>
          </div>
        ) : null}

        <ul className="space-y-0.5">
          {entry.recovery_reasons.map((reason) => (
            <li key={reason} className="flex gap-1.5 text-[11px] leading-relaxed text-ink-soft">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-soft" aria-hidden />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      </div>
    </li>
  );
}
