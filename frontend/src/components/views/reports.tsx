"use client";

import { Download, FileJson, FileSpreadsheet, FileText, Loader2, ShieldCheck } from "lucide-react";
import { useParams } from "next/navigation";
import * as React from "react";

import { DataList } from "@/components/common/data";
import { ErrorState, Notice, SkeletonSurface } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { api } from "@/lib/api/endpoints";
import { useSummary } from "@/lib/api/queries";
import { formatBytes, formatFsTimestamp, formatNumber } from "@/lib/format";

type ReportFormat = "json" | "csv" | "pdf";

const FORMATS: {
  format: ReportFormat;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  audience: string;
  description: string;
}[] = [
  {
    format: "json",
    icon: FileJson,
    title: "JSON evidence export",
    audience: "For scripting and external tooling",
    description:
      "Complete machine-readable export with volume geometry, every directory record, cluster chains, findings and recovery assessments.",
  },
  {
    format: "csv",
    icon: FileSpreadsheet,
    title: "CSV entry and finding tables",
    audience: "For spreadsheets and triage sheets",
    description:
      "Two tables in one file: all filesystem entries followed by every finding, with a header block identifying the evidence.",
  },
  {
    format: "pdf",
    icon: FileText,
    title: "PDF examination report",
    audience: "For the case file",
    description:
      "Formatted report with evidence identity, severity overview, volume geometry, structural integrity, findings and a method statement.",
  },
];

export function ReportsView() {
  const params = useParams<{ id: string }>();
  const summary = useSummary(params.id);
  const [pending, setPending] = React.useState<ReportFormat | null>(null);

  React.useEffect(() => {
    if (pending === null) return;
    const timer = window.setTimeout(() => setPending(null), 2500);
    return () => window.clearTimeout(timer);
  }, [pending]);

  if (summary.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <SkeletonSurface rows={6} />
        <SkeletonSurface rows={8} />
      </div>
    );
  }
  if (summary.isError || !summary.data) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const { analysis, stats, geometry, image } = summary.data;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Surface className="overflow-hidden">
        <SurfaceHeader>
          <SurfaceTitle
            icon={Download}
            hint="Every value in these exports is produced by the parser for this image."
          >
            Export this examination
          </SurfaceTitle>
        </SurfaceHeader>
        <ul className="divide-y divide-line">
          {FORMATS.map((item) => {
            const Icon = item.icon;
            const busy = pending === item.format;
            return (
              <li key={item.format} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-line bg-surface-muted">
                  <Icon className="size-4 text-accent" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                    <Badge tone="outline" size="sm">
                      {item.format.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-soft">
                    {item.audience}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{item.description}</p>
                </div>
                <Button
                  asChild
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setPending(item.format)}
                >
                  <a
                    href={api.reportUrl(params.id, item.format)}
                    download
                    data-testid={`download-${item.format}`}
                  >
                    {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                    Download
                  </a>
                </Button>
              </li>
            );
          })}
        </ul>
        <SurfaceBody className="border-t border-line">
          <Notice tone="neutral" icon={ShieldCheck}>
            Reports are generated on demand from the stored analysis. If a download fails, the case
            may have passed its retention window — check the retention badge above.
          </Notice>
        </SurfaceBody>
      </Surface>

      <Surface className="h-fit">
        <SurfaceHeader>
          <SurfaceTitle>What the exports contain</SurfaceTitle>
        </SurfaceHeader>
        <SurfaceBody className="pt-1">
          <DataList
            items={[
              { label: "Evidence file", value: analysis.original_filename },
              { label: "Analysis identifier", value: analysis.id.slice(0, 8), mono: true, copyValue: analysis.id },
              { label: "Case identifier", value: analysis.case_id ?? "Not recorded" },
              { label: "Examiner", value: analysis.examiner ?? "Not recorded" },
              { label: "Image size", value: formatBytes(image.size_bytes) },
              { label: "Entries exported", value: formatNumber(stats.entry_count) },
              { label: "Findings exported", value: formatNumber(stats.finding_count) },
              { label: "Deleted records", value: formatNumber(stats.deleted_count) },
              { label: "Cluster count", value: formatNumber(geometry.cluster_count) },
              {
                label: "Completed at",
                value: formatFsTimestamp(analysis.completed_at),
                mono: true,
              },
            ]}
          />
          <p className="mt-3 rounded-md border border-line bg-surface-muted p-2.5 text-[11px] leading-relaxed text-ink-muted">
            The PDF lists the first 400 filesystem entries so it stays readable. JSON and CSV always
            contain every entry recovered by the parser.
          </p>
        </SurfaceBody>
      </Surface>
    </div>
  );
}
