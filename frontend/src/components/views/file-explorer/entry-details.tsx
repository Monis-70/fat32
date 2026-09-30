"use client";

import {
  Binary,
  Clock,
  FileWarning,
  Fingerprint,
  Grid3x3,
  Layers,
  LifeBuoy,
  ScrollText,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { CopyButton, DataList, MonoValue } from "@/components/common/data";
import { ErrorState, Notice, SkeletonRows } from "@/components/common/states";
import { EntryIcon, entryIconTone } from "@/components/views/file-explorer/entry-icons";
import { EntryStateBadges } from "@/components/views/file-explorer/entry-table";
import { HexPreview } from "@/components/views/hex-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Surface } from "@/components/ui/surface";
import { useEntry, usePreview } from "@/lib/api/queries";
import type { FsEntry } from "@/lib/api/schemas";
import {
  formatBytes,
  formatFsTimestamp,
  formatHex,
  formatNumber,
  shortHash,
  totalClusters,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const CHAIN_STATUS_PLAIN: Record<string, string> = {
  ok: "Complete — every cluster links to the next and the chain ends properly.",
  empty: "No chain recorded. FAT32 clears chain links when an entry is deleted.",
  loop: "The chain points back into itself, so the file can never terminate.",
  broken_free: "The chain runs into a cluster marked free, so the file is cut short.",
  out_of_range: "The chain points outside the volume's valid cluster range.",
  bad_cluster: "The chain runs into a cluster flagged unusable.",
  truncated: "The chain was longer than the safety limit and was cut off.",
  invalid_start: "The starting cluster is not a valid data cluster.",
};

export function EntryDetailsDrawer({
  analysisId,
  entryId,
  onClose,
}: {
  analysisId: string;
  entryId: number | null;
  onClose: () => void;
}) {
  const entry = useEntry(analysisId, entryId);
  return (
    <Drawer open={entryId !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DrawerContent
        title={entry.data?.name ?? "Entry details"}
        description={entry.data?.path ?? ""}
        headerAccessory={
          entry.data ? <CopyButton value={entry.data.path} label="Copy full path" size="iconSm" /> : null
        }
      >
        {entry.isPending && entryId !== null ? <SkeletonRows rows={8} /> : null}
        {entry.isError ? (
          <div className="p-4">
            <ErrorState error={entry.error} onRetry={() => void entry.refetch()} />
          </div>
        ) : null}
        {entry.data ? (
          <EntryDetailsBody analysisId={analysisId} entry={entry.data} onClose={onClose} />
        ) : null}
      </DrawerContent>
    </Drawer>
  );
}

function EntryDetailsBody({
  analysisId,
  entry,
  onClose,
}: {
  analysisId: string;
  entry: FsEntry;
  onClose: () => void;
}) {
  const router = useRouter();
  const preview = usePreview(analysisId, entry.entry_id);
  const chainRuns = entry.cluster_runs.length > 0 ? entry.cluster_runs : entry.recovery_cluster_runs;
  const chainTotal = totalClusters(chainRuns);

  const openHex = (offset: number | null) => {
    if (offset === null) return;
    onClose();
    router.push(`/analysis/${analysisId}/hex?offset=${offset}`);
  };

  return (
    <div className="space-y-3 p-3.5">
      <div className="flex items-start gap-2.5 rounded-lg border border-line bg-surface-muted p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface">
          <EntryIcon entry={entry} className={cn("size-4", entryIconTone(entry))} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold text-ink" title={entry.name}>
            {entry.name}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-muted">
            <span className="truncate font-mono" title={entry.path}>
              {entry.path}
            </span>
          </p>
          <div className="mt-2">
            <EntryStateBadges entry={entry} />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="secondary" onClick={() => openHex(entry.directory_entry_offset)}>
          <Binary aria-hidden />
          Directory record in hex
        </Button>
        <Button
          size="xs"
          variant="secondary"
          disabled={entry.data_offset === null}
          onClick={() => openHex(entry.data_offset)}
        >
          <Binary aria-hidden />
          File data in hex
        </Button>
        {entry.first_cluster > 0 ? (
          <Button asChild size="xs" variant="secondary">
            <Link href={`/analysis/${analysisId}/clusters?cluster=${entry.first_cluster}`}>
              <Grid3x3 aria-hidden />
              Show on cluster map
            </Link>
          </Button>
        ) : null}
        {entry.recoverable ? (
          <Button asChild size="xs" variant="primary">
            <Link href={`/analysis/${analysisId}/recovery`}>
              <LifeBuoy aria-hidden />
              Recover this file
            </Link>
          </Button>
        ) : null}
      </div>

      <Section title="Naming" icon={Tags}>
        <DataList
          items={[
            { label: "Display name", value: entry.name, copyValue: entry.name },
            {
              label: "Short name (8.3)",
              value: entry.short_name,
              mono: true,
              copyValue: entry.short_name,
              definition:
                "The original DOS-era 8.3 filename. Deleted entries lose their first character permanently.",
            },
            {
              label: "Long filename",
              value: entry.long_name ?? "Not present",
              copyValue: entry.long_name ?? undefined,
            },
            {
              label: "Name verified",
              value: entry.long_name
                ? entry.long_name_valid
                  ? `Yes — checksum matched across ${entry.long_name_entries} records`
                  : "No — checksum did not match the short name"
                : "Not applicable",
              definition:
                "Long filenames are stored separately and checksummed against the 8.3 name. A mismatch means the displayed name may belong to a different file.",
            },
            {
              label: "Recovered first character",
              value: entry.recovered_first_char
                ? `'${entry.recovered_first_char}' restored from the checksum`
                : entry.is_deleted
                  ? "Lost when the entry was deleted"
                  : "Not applicable",
            },
            { label: "Parent folder", value: entry.parent_path, mono: true, copyValue: entry.parent_path },
            { label: "Depth", value: formatNumber(entry.depth) },
            {
              label: "Attributes",
              value: entry.attribute_list.length
                ? entry.attribute_list.map((item) => item.replace(/_/g, " ")).join(", ")
                : "None",
            },
          ]}
        />
      </Section>

      <Section title="Size and allocation" icon={Layers}>
        <DataList
          items={[
            {
              label: "Recorded size",
              value: formatBytes(entry.size_bytes),
              definition: "The file length stored in the directory record.",
            },
            {
              label: "Allocated size",
              value: formatBytes(entry.allocated_bytes),
              definition: "Total space the assigned clusters occupy, always a multiple of the cluster size.",
            },
            {
              label: "First cluster",
              value: formatNumber(entry.first_cluster),
              copyValue: String(entry.first_cluster),
            },
            { label: "Clusters in chain", value: formatNumber(entry.cluster_count) },
            {
              label: "Fragments",
              value: formatNumber(entry.fragment_count),
              definition: "Number of separate runs of consecutive clusters this file occupies.",
            },
            {
              label: "Slack space",
              value: formatBytes(entry.slack_bytes),
              definition:
                "Unused bytes between the end of the file and the end of its last cluster.",
            },
            {
              label: "Slack content",
              value: entry.slack_nonzero ? "Contains residual data" : "Zeroed",
            },
          ]}
        />
        <div className="mt-2 rounded-md border border-line bg-surface-muted p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Cluster chain status
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            {CHAIN_STATUS_PLAIN[entry.chain_status] ?? entry.chain_status}
          </p>
        </div>
        {entry.slack_preview ? (
          <Notice tone="warning" icon={FileWarning} className="mt-2 font-mono break-all">
            {entry.slack_preview}
          </Notice>
        ) : null}
      </Section>

      <Section title="Cluster chain" icon={Grid3x3}>
        {chainRuns.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-muted">
            No cluster chain is recorded for this entry. FAT32 clears chain links on deletion, so
            only the starting cluster survives in the directory record.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-ink-muted">
              {formatNumber(chainTotal)} {chainTotal === 1 ? "cluster" : "clusters"} across{" "}
              {chainRuns.length} {chainRuns.length === 1 ? "run" : "runs"}.
            </p>
            <div className="flex flex-wrap gap-1">
              {chainRuns.slice(0, 64).map((run, index) => (
                <Link
                  key={`${run[0]}-${index}`}
                  href={`/analysis/${analysisId}/clusters?cluster=${run[0]}`}
                  className="rounded-sm border border-line bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] text-ink transition-colors hover:border-accent-line hover:bg-accent-soft"
                >
                  {run[1] === 1 ? run[0] : `${run[0]}–${run[0] + run[1] - 1}`}
                </Link>
              ))}
              {chainRuns.length > 64 ? (
                <span className="self-center text-[11px] text-ink-soft">
                  + {chainRuns.length - 64} further runs
                </span>
              ) : null}
            </div>
          </>
        )}
      </Section>

      <Section title="Byte offsets" icon={Binary}>
        <DataList
          items={[
            {
              label: "Directory record",
              value: formatHex(entry.directory_entry_offset),
              mono: true,
              copyValue: String(entry.directory_entry_offset),
              definition: "Where the 32-byte directory entry sits inside the image file.",
            },
            {
              label: "First data byte",
              value: entry.data_offset === null ? "Not addressable" : formatHex(entry.data_offset),
              mono: true,
              copyValue: entry.data_offset === null ? undefined : String(entry.data_offset),
            },
          ]}
        />
      </Section>

      <Section title="Timestamps" icon={Clock}>
        <DataList
          items={[
            { label: "Created", value: formatFsTimestamp(entry.created_at), mono: true },
            { label: "Modified", value: formatFsTimestamp(entry.modified_at), mono: true },
            { label: "Accessed", value: formatFsTimestamp(entry.accessed_at), mono: true },
          ]}
        />
        <p className="mt-2 text-[11px] leading-relaxed text-ink-soft">
          FAT32 stores timestamps without a timezone. Values are shown exactly as recorded on the
          volume.
        </p>
      </Section>

      {entry.content_sha256 ? (
        <Section title="Content hash" icon={Fingerprint}>
          <MonoValue
            value={shortHash(entry.content_sha256, 20)}
            title={entry.content_sha256}
            copyLabel="Copy content SHA-256"
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
            SHA-256 of the bytes read from the cluster chain belonging to this file.
          </p>
        </Section>
      ) : null}

      {entry.is_deleted ? (
        <Section title="Recovery assessment" icon={LifeBuoy}>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={entry.recoverable ? "positive" : "neutral"}>
              {entry.recoverable ? "Recovery possible" : "Not recoverable"}
            </Badge>
            <span className="text-xs tabular-nums text-ink-muted">
              {Math.round(entry.recovery_confidence * 100)}% confidence
            </span>
          </div>
          <ul className="space-y-1">
            {entry.recovery_reasons.map((reason) => (
              <li key={reason} className="flex gap-1.5 text-xs leading-relaxed text-ink-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-ink-soft" aria-hidden />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {entry.issues.length > 0 ? (
        <Section title="Parser observations" icon={FileWarning}>
          <ul className="space-y-1">
            {entry.issues.map((issue) => (
              <li key={issue} className="text-xs leading-relaxed text-medium">
                {issue}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Content preview" icon={ScrollText}>
        {preview.isPending ? <div className="shimmer h-24 rounded-md" aria-hidden /> : null}
        {preview.isError ? <ErrorState error={preview.error} compact /> : null}
        {preview.data ? (
          preview.data.kind === "text" && preview.data.text ? (
            <pre className="scroll-thin max-h-64 overflow-auto rounded-md border border-line bg-surface-muted p-2.5 font-mono text-[11px] leading-5 text-ink whitespace-pre-wrap break-words">
              {preview.data.text}
            </pre>
          ) : preview.data.kind === "binary" && preview.data.bytes_base64 ? (
            <HexPreview
              base64={preview.data.bytes_base64}
              baseOffset={preview.data.data_offset ?? 0}
              maxRows={20}
              className="max-h-64"
            />
          ) : (
            <p className="text-xs text-ink-muted">
              {preview.data.reason ?? "No preview is available for this entry."}
            </p>
          )
        ) : null}
        {preview.data && preview.data.bytes_read > 0 ? (
          <p className="mt-1.5 text-[11px] text-ink-soft">
            Showing {formatBytes(preview.data.bytes_read)} of {formatBytes(preview.data.size_bytes)}.
          </p>
        ) : null}
      </Section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Surface as="section" className="p-3">
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
        {title}
      </h3>
      {children}
    </Surface>
  );
}
