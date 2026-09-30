"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  FileWarning,
  Files,
  HardDrive,
  Layers,
  ShieldAlert,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import {
  DataList,
  Metric,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SectionHeading,
  SeverityBadge,
  SeverityRule,
} from "@/components/common/data";
import {
  EmptyState,
  ErrorState,
  Notice,
  SkeletonMetrics,
  SkeletonSurface,
} from "@/components/common/states";
import { AllocationBars } from "@/components/views/allocation-bars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { Term } from "@/components/ui/tooltip";
import { useEntries, useFindings, useSummary } from "@/lib/api/queries";
import {
  formatBytes,
  formatDuration,
  formatFsTimestamp,
  formatHex,
  formatNumber,
  formatPercent,
  shortHash,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export function OverviewView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const summary = useSummary(id);
  const topFindings = useFindings(id, { page: 1, page_size: 5 });
  const recent = useEntries(id, { page: 1, page_size: 6, sort: "modified", order: "desc" });

  if (summary.isPending) {
    return (
      <div className="space-y-4">
        <SkeletonMetrics />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SkeletonSurface rows={8} />
          <SkeletonSurface rows={8} />
        </div>
      </div>
    );
  }
  if (summary.isError || !summary.data) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const { analysis, image, boot_sector, geometry, stats, fat, fsinfo, backup_boot } = summary.data;
  const healthIssues = [
    !backup_boot.backup_present || !backup_boot.identical,
    !fsinfo.signatures_valid,
    (summary.data.fsinfo_free_delta ?? 0) !== 0,
    !fat.identical,
  ].filter(Boolean).length;

  return (
    <div className="space-y-5">
      <Surface className="overflow-hidden">
        <div className="hairline-grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
          <Metric
            icon={HardDrive}
            label="Volume size"
            value={formatBytes(geometry.volume_size_bytes)}
            hint={`${formatNumber(geometry.total_sectors)} sectors`}
          />
          <Metric
            icon={Layers}
            label="Clusters"
            value={formatNumber(geometry.cluster_count)}
            hint={`${formatBytes(geometry.bytes_per_cluster, 0)} each`}
            definition="A cluster is the smallest block of disk space FAT32 can allocate to a file."
          />
          <Metric
            icon={Database}
            label="In use"
            value={formatPercent(stats.used_percent, 2)}
            hint={formatBytes(stats.allocated_bytes)}
            tone="accent"
          />
          <Metric
            icon={Files}
            label="Entries"
            value={formatNumber(stats.entry_count)}
            hint={`${formatNumber(stats.live_file_count)} files · ${formatNumber(stats.directory_count)} folders`}
          />
          <Metric
            icon={Trash2}
            label="Deleted"
            value={formatNumber(stats.deleted_count)}
            hint={`${formatNumber(stats.recoverable_count)} recoverable`}
            tone={stats.deleted_count > 0 ? "warning" : "neutral"}
          />
          <Metric
            icon={ShieldAlert}
            label="Findings"
            value={formatNumber(stats.finding_count)}
            hint={
              stats.severity_counts.critical > 0
                ? `${stats.severity_counts.critical} critical`
                : "no critical issues"
            }
            tone={stats.severity_counts.critical > 0 ? "critical" : "neutral"}
          />
        </div>
      </Surface>

      {summary.data.truncated ? (
        <Notice tone="warning" icon={TriangleAlert} title="Analysis stopped at a safety limit">
          Traversal hit {summary.data.truncation_reasons.join(", ")}, so the entry list below is
          incomplete. Split the evidence image and re-run to see everything.
        </Notice>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-3">
          <SectionHeading>Evidence facts</SectionHeading>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={HardDrive}>Evidence identity</SurfaceTitle>
              {analysis.is_demo ? <Badge tone="accent">Synthetic demo</Badge> : null}
            </SurfaceHeader>
            <SurfaceBody className="pt-1">
              <DataList
                items={[
                  { label: "Evidence file", value: analysis.original_filename },
                  { label: "Case identifier", value: analysis.case_id ?? "Not recorded" },
                  { label: "Evidence number", value: analysis.evidence_number ?? "Not recorded" },
                  { label: "Examiner", value: analysis.examiner ?? "Not recorded" },
                  { label: "Acquired at", value: analysis.acquired_at ?? "Not recorded" },
                  { label: "Image size", value: formatBytes(image.size_bytes), mono: true },
                  {
                    label: "Image SHA-256",
                    value: shortHash(image.sha256, 14),
                    mono: true,
                    title: image.sha256,
                    copyValue: image.sha256,
                    definition:
                      "Cryptographic fingerprint of the uploaded file. Re-hash your source copy to prove the evidence has not changed.",
                  },
                  {
                    label: "Container",
                    value: image.container === "mbr_disk" ? "MBR disk image" : "Raw FAT32 volume",
                    definition:
                      "Whether the file is a whole disk with a partition table, or a single volume.",
                  },
                  {
                    label: "Volume offset",
                    value: formatHex(image.volume_offset),
                    mono: true,
                    copyValue: String(image.volume_offset),
                    definition: "Byte position in the image where the FAT32 volume begins.",
                  },
                  { label: "Parse duration", value: formatDuration(analysis.duration_ms) },
                ]}
              />
              {analysis.notes ? (
                <p className="mt-3 rounded-md border border-line bg-surface-muted p-2.5 text-xs leading-relaxed text-ink-muted">
                  {analysis.notes}
                </p>
              ) : null}
            </SurfaceBody>
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={SlidersHorizontal}>Volume geometry</SurfaceTitle>
              <Badge tone="neutral">{boot_sector.filesystem_type || "FAT32"}</Badge>
            </SurfaceHeader>
            <SurfaceBody className="pt-1">
              <DataList
                items={[
                  { label: "OEM name", value: boot_sector.oem_name || "—", mono: true },
                  { label: "Volume label (boot sector)", value: boot_sector.volume_label || "—" },
                  {
                    label: "Volume label (root directory)",
                    value: summary.data.volume_label_root ?? "Not present",
                  },
                  { label: "Volume serial", value: boot_sector.volume_id, mono: true },
                  { label: "Bytes per sector", value: formatNumber(geometry.bytes_per_sector) },
                  {
                    label: "Sectors per cluster",
                    value: formatNumber(geometry.sectors_per_cluster),
                  },
                  { label: "Bytes per cluster", value: formatNumber(geometry.bytes_per_cluster) },
                  { label: "Reserved sectors", value: formatNumber(geometry.reserved_sector_count) },
                  {
                    label: "FAT copies",
                    value: formatNumber(geometry.num_fats),
                    definition:
                      "FAT32 normally keeps two identical allocation tables so one can repair the other.",
                  },
                  {
                    label: "FAT size",
                    value: `${formatNumber(geometry.fat_size_sectors)} sectors`,
                  },
                  { label: "Total sectors", value: formatNumber(geometry.total_sectors) },
                  { label: "Root directory cluster", value: formatNumber(geometry.root_cluster) },
                  {
                    label: "FAT region offset",
                    value: formatHex(geometry.fat_start_offset),
                    mono: true,
                    copyValue: String(geometry.fat_start_offset),
                  },
                  {
                    label: "Data region offset",
                    value: formatHex(geometry.data_start_offset),
                    mono: true,
                    copyValue: String(geometry.data_start_offset),
                  },
                ]}
              />
              {summary.data.geometry_issues.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {summary.data.geometry_issues.map((issue) => (
                    <li key={issue} className="text-xs leading-relaxed text-medium">
                      {issue}
                    </li>
                  ))}
                </ul>
              ) : null}
            </SurfaceBody>
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={Layers} hint="How the volume's clusters are currently assigned.">
                Storage allocation
              </SurfaceTitle>
              <Button asChild variant="ghost" size="xs">
                <Link href={`/analysis/${id}/clusters`}>
                  Cluster map
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </SurfaceHeader>
            <SurfaceBody>
              <AllocationBars
                counts={summary.data.cluster_state_counts}
                bytesPerCluster={geometry.bytes_per_cluster}
              />
            </SurfaceBody>
          </Surface>
        </section>

        <section className="space-y-3">
          <SectionHeading>Forensic conclusions</SectionHeading>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={ShieldAlert}>Severity distribution</SurfaceTitle>
              <Button asChild variant="ghost" size="xs">
                <Link href={`/analysis/${id}/findings`}>
                  Triage queue
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </SurfaceHeader>
            <div className="hairline-grid grid-cols-5">
              {SEVERITY_ORDER.map((severity) => {
                const count = stats.severity_counts[severity];
                return (
                  <Link
                    key={severity}
                    href={`/analysis/${id}/findings?severity=${severity}`}
                    className="flex flex-col items-center gap-1.5 bg-surface px-1 py-3 transition-colors hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "text-xl font-semibold tabular-nums",
                        count === 0 ? "text-ink-soft" : "text-ink",
                      )}
                    >
                      {formatNumber(count)}
                    </span>
                    <SeverityBadge severity={severity} withMeaning />
                  </Link>
                );
              })}
            </div>
            <SurfaceBody className="border-t border-line py-2.5">
              <p className="text-xs leading-relaxed text-ink-muted">
                {stats.severity_counts.critical > 0
                  ? "Critical findings mean at least one file cannot be trusted. Review those first."
                  : stats.finding_count > 0
                    ? "No critical findings. Remaining items are context worth recording in the notes."
                    : "Every structural check passed on this volume."}
              </p>
            </SurfaceBody>
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={FileWarning}>Most important findings</SurfaceTitle>
              {topFindings.data ? (
                <Badge tone="neutral">{formatNumber(topFindings.data.total)} total</Badge>
              ) : null}
            </SurfaceHeader>
            {topFindings.isPending ? (
              <div className="p-3.5">
                <div className="shimmer h-24 rounded-md" aria-hidden />
              </div>
            ) : topFindings.isError ? (
              <SurfaceBody>
                <ErrorState error={topFindings.error} onRetry={() => void topFindings.refetch()} compact />
              </SurfaceBody>
            ) : topFindings.data && topFindings.data.items.length > 0 ? (
              <ul className="divide-y divide-line-faint">
                {topFindings.data.items.map((finding) => (
                  <li key={finding.id} className="flex gap-2.5 px-3.5 py-2.5">
                    <SeverityRule severity={finding.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge severity={finding.severity} />
                        <p className="text-[13px] font-medium leading-tight text-ink">
                          {finding.title}
                        </p>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-muted">
                        {finding.description}
                      </p>
                      {finding.entry_path ? (
                        <p
                          className="mt-1 truncate font-mono text-[11px] text-ink-soft"
                          title={finding.entry_path}
                        >
                          {finding.entry_path}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                compact
                icon={CheckCircle2}
                title="No anomalies detected"
                description="The parser completed every structural check without raising a finding."
              />
            )}
            {topFindings.data && topFindings.data.total > topFindings.data.items.length ? (
              <footer className="border-t border-line px-3.5 py-2">
                <Button asChild variant="ghost" size="xs">
                  <Link href={`/analysis/${id}/findings`}>
                    View all {formatNumber(topFindings.data.total)} findings
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              </footer>
            ) : null}
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={CheckCircle2}>Filesystem health</SurfaceTitle>
              <Badge tone={healthIssues === 0 ? "positive" : "high"}>
                {healthIssues === 0 ? "Consistent" : `${healthIssues} checks failed`}
              </Badge>
            </SurfaceHeader>
            <SurfaceBody className="pt-1">
              <DataList
                items={[
                  {
                    label: "Backup boot sector",
                    value: backup_boot.backup_present
                      ? backup_boot.identical
                        ? "Identical to primary"
                        : `${formatNumber(backup_boot.differing_byte_count)} of 512 bytes differ`
                      : "Not present",
                    definition:
                      "FAT32 keeps a spare copy of the boot sector. A mismatch suggests tampering or damage.",
                  },
                  {
                    label: "Backup located at",
                    value: `Sector ${backup_boot.backup_sector}`,
                  },
                  {
                    label: "FSInfo signatures",
                    value: fsinfo.signatures_valid ? "Valid" : "Invalid",
                    definition:
                      "FSInfo caches free-space information. Invalid signatures mean the cache cannot be trusted.",
                  },
                  {
                    label: "FSInfo free clusters",
                    value:
                      fsinfo.free_cluster_count === null
                        ? "Not recorded"
                        : formatNumber(fsinfo.free_cluster_count),
                  },
                  {
                    label: "FSInfo variance vs FAT",
                    value:
                      summary.data.fsinfo_free_delta === null
                        ? "Not comparable"
                        : formatNumber(summary.data.fsinfo_free_delta),
                  },
                  {
                    label: "FAT copy comparison",
                    value: fat.identical
                      ? "All copies identical"
                      : `${formatNumber(fat.mismatched_entry_count)} entries differ`,
                  },
                  { label: "FAT entries compared", value: formatNumber(fat.entries_compared) },
                  { label: "Media descriptor", value: fat.media_descriptor, mono: true },
                  { label: "End-of-chain marker", value: fat.end_marker, mono: true },
                ]}
              />
              {fat.sample_differences.length > 0 ? (
                <div className="mt-3 overflow-hidden rounded-md border border-line">
                  <div className="border-b border-line bg-surface-muted px-2.5 py-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                      Divergent FAT entries
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="grid-table">
                      <thead>
                        <tr>
                          <th scope="col">Cluster</th>
                          {fat.sample_differences[0].values.map((_, index) => (
                            <th key={index} scope="col">
                              FAT {index + 1}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {fat.sample_differences.slice(0, 6).map((difference) => (
                          <tr key={difference.cluster}>
                            <td className="font-mono text-xs">{difference.cluster}</td>
                            {difference.values.map((value, index) => (
                              <td
                                key={index}
                                className={cn(
                                  "font-mono text-xs",
                                  index > 0 && value !== difference.values[0] && "text-high",
                                )}
                              >
                                {value}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </SurfaceBody>
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle icon={Clock}>Recent filesystem activity</SurfaceTitle>
              <Button asChild variant="ghost" size="xs">
                <Link href={`/analysis/${id}/timeline`}>
                  Timeline
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            </SurfaceHeader>
            {recent.isPending ? (
              <div className="p-3.5">
                <div className="shimmer h-20 rounded-md" aria-hidden />
              </div>
            ) : recent.data && recent.data.items.length > 0 ? (
              <ul className="divide-y divide-line-faint">
                {recent.data.items.map((entry) => (
                  <li key={entry.entry_id} className="flex items-center gap-2.5 px-3.5 py-2">
                    <span className="font-mono text-[11px] tabular-nums text-ink-muted">
                      {formatFsTimestamp(entry.modified_at)}
                    </span>
                    <Link
                      href={`/analysis/${id}/files?entry=${entry.entry_id}`}
                      className="min-w-0 flex-1 truncate text-xs text-ink hover:text-accent"
                      title={entry.path}
                    >
                      {entry.path}
                    </Link>
                    {entry.is_deleted ? <Badge tone="high" size="sm">deleted</Badge> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact title="No timestamps decoded" />
            )}
          </Surface>

          <Surface>
            <SurfaceHeader>
              <SurfaceTitle>Content summary</SurfaceTitle>
            </SurfaceHeader>
            <SurfaceBody className="pt-1">
              <DataList
                items={[
                  { label: "Live files", value: formatNumber(stats.live_file_count) },
                  { label: "Directories", value: formatNumber(stats.directory_count) },
                  { label: "Hidden entries", value: formatNumber(stats.hidden_count) },
                  { label: "System entries", value: formatNumber(stats.system_count) },
                  {
                    label: "Fragmented files",
                    value: formatNumber(stats.fragmented_count),
                    definition:
                      "Files whose clusters are not stored one after another on the volume.",
                  },
                  {
                    label: "Entries with non-zero slack",
                    value: formatNumber(stats.slack_entry_count),
                    definition:
                      "Slack is the unused space after a file's last byte. Non-zero slack can hold data from a previous file.",
                  },
                  { label: "Total slack", value: formatBytes(stats.slack_bytes_total) },
                  {
                    label: "Residual entries",
                    value: formatNumber(stats.residual_count),
                    definition:
                      "Directory records found after the end-of-directory marker. Strong evidence of deleted content.",
                  },
                  { label: "Logical bytes in live files", value: formatBytes(stats.logical_bytes) },
                  { label: "Maximum directory depth", value: formatNumber(stats.max_depth) },
                  {
                    label: "Earliest timestamp",
                    value: formatFsTimestamp(stats.earliest_timestamp),
                    mono: true,
                  },
                  {
                    label: "Latest timestamp",
                    value: formatFsTimestamp(stats.latest_timestamp),
                    mono: true,
                  },
                ]}
              />
            </SurfaceBody>
          </Surface>
        </section>
      </div>

      <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-ink-soft">
        <span>Severity labels:</span>
        {SEVERITY_ORDER.map((severity) => (
          <Term key={severity} definition={SEVERITY_LABEL[severity]} className="border-none">
            <SeverityBadge severity={severity} withMeaning />
          </Term>
        ))}
      </p>
    </div>
  );
}
