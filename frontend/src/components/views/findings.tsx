"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  ListFilter,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";

import {
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  SeverityBadge,
  SeverityRule,
} from "@/components/common/data";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/input";
import { LabelledSelect } from "@/components/ui/select";
import { Surface, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import { useFindings } from "@/lib/api/queries";
import type { Finding, Severity } from "@/lib/api/schemas";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

const FINDING_GUIDE: Record<string, { plain: string; action: string }> = {
  CROSS_LINKED_CLUSTERS: {
    plain:
      "Two or more files claim the same storage. At least one of them contains bytes that belong to another file.",
    action: "Treat every file touching these clusters as unreliable and note it in the report.",
  },
  BACKUP_BOOT_MISMATCH: {
    plain:
      "The spare copy of the boot sector no longer matches the primary one, so the volume was changed after formatting.",
    action: "Compare both sectors in the hex viewer to see which fields were altered.",
  },
  BACKUP_BOOT_MISSING: {
    plain: "The volume has no spare boot sector, so damage to the primary cannot be repaired.",
    action: "Record that recovery options are reduced for this volume.",
  },
  FAT_COPY_MISMATCH: {
    plain:
      "The two allocation tables disagree about which clusters are in use, which happens after an interrupted write or manual editing.",
    action: "Check whether the divergent entries hide or expose file content.",
  },
  FSINFO_FREE_COUNT_MISMATCH: {
    plain:
      "The cached free-space figure does not match what the allocation table actually says, which usually means the volume was not cleanly unmounted.",
    action: "Rely on the FAT totals shown in the overview rather than the cached hint.",
  },
  FSINFO_INVALID: {
    plain: "The free-space cache fails its own signature check and cannot be trusted at all.",
    action: "Ignore the cached hint and use the allocation table totals.",
  },
  FSINFO_UNREADABLE: {
    plain: "The free-space cache sector could not be read from the image.",
    action: "No action needed; free space was computed from the allocation table instead.",
  },
  BAD_CLUSTERS_PRESENT: {
    plain:
      "Some clusters are flagged unusable. Genuine media defects look like this, but so does deliberately hidden data.",
    action: "Open the flagged clusters in the hex viewer to check whether they contain content.",
  },
  ORPHANED_CLUSTERS: {
    plain:
      "Storage is marked in use but no directory entry points at it, which commonly holds deleted or concealed content.",
    action: "Inspect the orphaned ranges on the cluster map and carve anything of interest.",
  },
  CLUSTER_CHAIN_LOOP: {
    plain: "A file's cluster chain points back into itself, so the file can never terminate.",
    action: "Read the file only up to the detected loop point.",
  },
  BROKEN_CLUSTER_CHAIN: {
    plain:
      "The chain of clusters for this file stops unexpectedly, so only part of the content can be read.",
    action: "Only trust the clusters recovered before the break.",
  },
  NON_ZERO_FILE_SLACK: {
    plain:
      "The unused space after this file's last byte still holds data from whatever occupied the cluster previously.",
    action: "Examine the slack bytes; they can contain fragments of deleted files.",
  },
  LFN_CHECKSUM_INVALID: {
    plain:
      "The long filename records do not verify against the short name they belong to, so the displayed name may be wrong.",
    action: "Cite the 8.3 short name for this entry instead of the long name.",
  },
  RESIDUAL_DIRECTORY_ENTRY: {
    plain:
      "A directory record survives past the end-of-directory marker, which is a strong indicator of deleted content.",
    action: "Check the Recovery workspace for a carve of this entry.",
  },
  TIMESTAMP_ANOMALY: {
    plain:
      "This entry was modified before it was created, which cannot happen naturally and suggests metadata manipulation.",
    action: "Record the exact timestamps and compare with other evidence sources.",
  },
  DELETED_ENTRIES_PRESENT: {
    plain: "Deleted directory records remain on the volume and some still point at their data.",
    action: "Review the Recovery workspace before releasing the evidence.",
  },
  HIDDEN_OR_SYSTEM_ENTRIES: {
    plain:
      "Some entries carry hidden or system attributes, so a normal file browser would not display them.",
    action: "Confirm whether these entries are expected for this kind of device.",
  },
  VOLUME_LABEL_MISMATCH: {
    plain:
      "The volume name stored in the boot sector differs from the one in the root directory, which follows an out-of-band rename.",
    action: "Note both labels in the report.",
  },
  VOLUME_GEOMETRY_ANOMALY: {
    plain: "The derived volume layout falls outside the values FAT32 normally uses.",
    action: "Treat cluster accounting for this volume as approximate.",
  },
  BOOT_SECTOR_FIELD_ANOMALY: {
    plain: "Boot sector fields deviate from the FAT32 specification.",
    action: "Confirm the image really came from a FAT32 volume.",
  },
  DIRECTORY_LOOP: {
    plain: "A directory points back at a cluster already visited, so traversal had to stop.",
    action: "Inspect the directory chain for manual tampering.",
  },
  ANALYSIS_TRUNCATED: {
    plain: "Parsing stopped at a safety limit, so the entry list is incomplete.",
    action: "Split the evidence image into smaller volumes and re-run.",
  },
};

export function FindingsView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;

  const initialSeverity = React.useMemo(() => {
    const raw = searchParams.get("severity");
    if (!raw) return [] as Severity[];
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is Severity => SEVERITY_ORDER.includes(item as Severity));
  }, [searchParams]);

  const [selected, setSelected] = React.useState<Severity[]>(initialSeverity);
  const [category, setCategory] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [debounced, setDebounced] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const findings = useFindings(id, {
    page,
    page_size: PAGE_SIZE,
    severity: selected.length > 0 ? selected.join(",") : undefined,
    category: category === "all" ? undefined : category,
    search: debounced || undefined,
  });

  const toggleSeverity = (severity: Severity) => {
    setPage(1);
    setSelected((current) =>
      current.includes(severity)
        ? current.filter((item) => item !== severity)
        : [...current, severity],
    );
  };

  const toggleExpanded = (findingId: number) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(findingId)) next.delete(findingId);
      else next.add(findingId);
      return next;
    });
  };

  const categories = Object.keys(findings.data?.category_counts ?? {}).sort();
  const filterCount = selected.length + (category !== "all" ? 1 : 0) + (debounced ? 1 : 0);
  const clearAll = () => {
    setSelected([]);
    setCategory("all");
    setSearch("");
    setPage(1);
  };

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader>
        <SurfaceTitle
          icon={ListFilter}
          hint="Ordered by how much each item affects the reliability of the evidence."
        >
          Triage queue
        </SurfaceTitle>
        {findings.data ? (
          <Badge tone="neutral">{formatNumber(findings.data.total)} shown</Badge>
        ) : null}
      </SurfaceHeader>

      <Toolbar className="sticky top-14 z-30">
        <div className="flex flex-wrap items-center gap-1">
          {SEVERITY_ORDER.map((severity) => {
            const count = findings.data?.severity_counts[severity] ?? 0;
            const active = selected.includes(severity);
            return (
              <button
                key={severity}
                type="button"
                aria-pressed={active}
                disabled={count === 0 && !active}
                onClick={() => toggleSeverity(severity)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40",
                  active
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    severity === "critical" && "bg-critical",
                    severity === "high" && "bg-high",
                    severity === "medium" && "bg-medium",
                    severity === "low" && "bg-low",
                    severity === "info" && "bg-info",
                  )}
                  aria-hidden
                />
                {SEVERITY_LABEL[severity]}
                <span className="tabular-nums text-ink-soft">{formatNumber(count)}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onValueChange={setSearch}
            label="Search findings"
            placeholder="Search findings"
            className="w-44"
          />
          <LabelledSelect
            label="Filter by category"
            value={category}
            onValueChange={(next) => {
              setCategory(next);
              setPage(1);
            }}
            triggerClassName="w-[140px]"
            options={[
              { value: "all", label: "All categories" },
              ...categories.map((item) => ({ value: item, label: item })),
            ]}
          />
        </div>
      </Toolbar>

      {filterCount > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
            <Filter className="size-3" aria-hidden />
            {filterCount} active {filterCount === 1 ? "filter" : "filters"}
          </span>
          {selected.map((severity) => (
            <Badge key={severity} tone="accent" className="gap-1">
              {SEVERITY_LABEL[severity]}
              <button
                type="button"
                aria-label={`Remove ${SEVERITY_LABEL[severity]} filter`}
                onClick={() => toggleSeverity(severity)}
                className="rounded-xs hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
          {category !== "all" ? (
            <Badge tone="accent" className="gap-1">
              {category}
              <button
                type="button"
                aria-label="Remove category filter"
                onClick={() => setCategory("all")}
                className="rounded-xs hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ) : null}
          {debounced ? (
            <Badge tone="accent" className="gap-1">
              “{debounced}”
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="rounded-xs hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ) : null}
          <Button variant="ghost" size="xs" onClick={clearAll}>
            Clear all
          </Button>
        </div>
      ) : null}

      {findings.isPending ? <SkeletonRows rows={5} height="h-16" /> : null}
      {findings.isError ? (
        <div className="p-3.5">
          <ErrorState error={findings.error} onRetry={() => void findings.refetch()} />
        </div>
      ) : null}

      {findings.data && findings.data.items.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={
            filterCount === 0 ? "No anomalies were detected" : "No findings match these filters"
          }
          description={
            filterCount === 0
              ? "Every structural and content check passed on this volume."
              : "Relax the severity, category or search filters to see more of the queue."
          }
          action={
            filterCount > 0 ? (
              <Button variant="secondary" size="sm" onClick={clearAll}>
                Clear all filters
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {findings.data && findings.data.items.length > 0 ? (
        <>
          <ul className="divide-y divide-line">
            {findings.data.items.map((finding) => (
              <FindingRow
                key={finding.id}
                finding={finding}
                analysisId={id}
                open={expanded.has(finding.id)}
                onToggle={() => toggleExpanded(finding.id)}
              />
            ))}
          </ul>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
            <p className="text-xs text-ink-muted">
              Page {findings.data.page} of {findings.data.page_count} ·{" "}
              {formatNumber(findings.data.total)} findings
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                <ChevronLeft aria-hidden />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= findings.data.page_count}
                onClick={() => setPage(page + 1)}
              >
                Next
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </footer>
        </>
      ) : null}
    </Surface>
  );
}

function FindingRow({
  finding,
  analysisId,
  open,
  onToggle,
}: {
  finding: Finding;
  analysisId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const guide = FINDING_GUIDE[finding.code];
  const detailEntries = Object.entries(finding.details ?? {}).filter(
    ([, value]) => value !== null && value !== undefined,
  );

  return (
    <li>
      <Collapsible.Root open={open} onOpenChange={onToggle}>
        <div className="flex gap-2.5 px-3.5 py-3">
          <SeverityRule severity={finding.severity} />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={finding.severity} withMeaning />
              <h3 className="text-[13px] font-semibold leading-tight text-ink">{finding.title}</h3>
              <Badge tone="outline" size="sm">
                {finding.category}
              </Badge>
            </div>
            <p className="text-xs leading-relaxed text-ink">
              {guide?.plain ?? finding.description}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {finding.entry_path ? (
                <Link
                  href={`/analysis/${analysisId}/files?entry=${finding.entry_id ?? ""}`}
                  className="max-w-full truncate font-mono text-[11px] text-accent hover:underline"
                  title={finding.entry_path}
                >
                  {finding.entry_path}
                </Link>
              ) : null}
              {finding.cluster !== null ? (
                <Link
                  href={`/analysis/${analysisId}/clusters?cluster=${finding.cluster}`}
                  className="text-[11px] text-accent hover:underline"
                >
                  Cluster {formatNumber(finding.cluster)}
                </Link>
              ) : null}
              <Collapsible.Trigger asChild>
                <Button variant="ghost" size="xs" className="ml-auto">
                  {open ? "Hide evidence" : "Technical evidence"}
                  <ChevronDown
                    className={cn("transition-transform duration-200", open && "rotate-180")}
                    aria-hidden
                  />
                </Button>
              </Collapsible.Trigger>
            </div>
          </div>
        </div>
        <Collapsible.Content>
          <div className="space-y-2.5 border-t border-line-faint bg-surface-muted px-3.5 py-3 pl-[1.9rem]">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
                Parser output
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">{finding.description}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
                Recommended action
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                {guide?.action ?? finding.recommendation}
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="font-mono text-[11px] text-ink-soft">code {finding.code}</span>
              {finding.entry_id !== null ? (
                <span className="font-mono text-[11px] text-ink-soft">
                  entry #{finding.entry_id}
                </span>
              ) : null}
            </div>
            {detailEntries.length > 0 ? (
              <div className="overflow-hidden rounded-md border border-line bg-surface">
                <table className="grid-table">
                  <tbody>
                    {detailEntries.slice(0, 8).map(([key, value]) => (
                      <tr key={key}>
                        <td className="w-40 align-top font-mono text-[11px] text-ink-muted">
                          {key}
                        </td>
                        <td className="break-all font-mono text-[11px] text-ink">
                          {typeof value === "object"
                            ? JSON.stringify(value).slice(0, 320)
                            : String(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </Collapsible.Content>
      </Collapsible.Root>
    </li>
  );
}
