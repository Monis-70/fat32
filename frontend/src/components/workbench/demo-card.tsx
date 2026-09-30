"use client";

import { ArrowUpRight, FlaskConical, Info, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { useCreateDemoAnalysis, useMeta } from "@/lib/api/queries";
import { formatBytes, formatNumber } from "@/lib/format";

export function DemoCaseCard() {
  const router = useRouter();
  const meta = useMeta();
  const demo = useCreateDemoAnalysis();
  const image = meta.data?.demo_image;

  return (
    <Surface>
      <SurfaceHeader>
        <SurfaceTitle icon={FlaskConical}>Demo case</SurfaceTitle>
      </SurfaceHeader>
      <SurfaceBody className="space-y-3">
        <p className="text-xs leading-relaxed text-ink-muted">
          A synthetic FAT32 disk generated on the server and parsed by the same engine as a real
          upload. Use it to learn the workspace before opening live evidence.
        </p>
        {image ? (
          <>
            <dl className="hairline-grid grid-cols-2 overflow-hidden rounded-md border border-line">
              <div className="bg-surface px-2.5 py-2">
                <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-soft">Image size</dt>
                <dd className="mt-0.5 text-[13px] font-medium tabular-nums text-ink">
                  {formatBytes(image.size_bytes)}
                </dd>
              </div>
              <div className="bg-surface px-2.5 py-2">
                <dt className="text-[10px] uppercase tracking-[0.07em] text-ink-soft">Clusters</dt>
                <dd className="mt-0.5 text-[13px] font-medium tabular-nums text-ink">
                  {formatNumber(image.cluster_count)}
                </dd>
              </div>
            </dl>
            <div>
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
                <Info className="size-3.5" aria-hidden />
                Planted conditions
              </p>
              <ul className="mt-1.5 space-y-1">
                {image.planted_conditions.slice(0, 6).map((condition) => (
                  <li key={condition} className="flex items-start gap-1.5 text-xs text-ink-muted">
                    <span
                      className="mt-1.5 size-1 shrink-0 rounded-full bg-accent"
                      aria-hidden
                    />
                    <span className="leading-snug">{condition}</span>
                  </li>
                ))}
                {image.planted_conditions.length > 6 ? (
                  <li className="pl-[0.875rem] text-xs text-ink-soft">
                    and {image.planted_conditions.length - 6} more
                  </li>
                ) : null}
              </ul>
            </div>
          </>
        ) : meta.isError ? (
          <ErrorState error={meta.error} onRetry={() => void meta.refetch()} compact />
        ) : (
          <p className="text-xs text-ink-soft">Demo details load once the service responds.</p>
        )}
        {demo.isError ? <ErrorState error={demo.error} onRetry={() => demo.reset()} compact /> : null}
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={demo.isPending}
          onClick={() =>
            demo.mutate(undefined, {
              onSuccess: (analysis) => router.push(`/analysis/${analysis.id}`),
            })
          }
        >
          {demo.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ArrowUpRight aria-hidden />
          )}
          Open demo case
        </Button>
      </SurfaceBody>
    </Surface>
  );
}

export function SupportedFormatsCard() {
  const meta = useMeta();
  const limits = meta.data?.limits;
  return (
    <Surface>
      <SurfaceHeader>
        <SurfaceTitle>What FATScope accepts</SurfaceTitle>
      </SurfaceHeader>
      <SurfaceBody className="space-y-2.5">
        <ul className="space-y-1.5">
          {(meta.data?.supported_containers ?? [
            "raw FAT32 volume image",
            "MBR disk image with a FAT32 partition",
          ]).map((container) => (
            <li key={container} className="flex items-start gap-1.5 text-xs text-ink">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-positive" aria-hidden />
              <span className="leading-snug">{container}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-1 border-t border-line pt-2.5 text-xs">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">File extensions</dt>
            <dd className="truncate font-mono text-ink">
              {(meta.data?.supported_extensions ?? [".img", ".dd", ".raw"]).join(" ")}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Maximum upload</dt>
            <dd className="font-mono text-ink">
              {limits ? formatBytes(limits.max_upload_bytes, 0) : "512 MB"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-muted">Case retention</dt>
            <dd className="font-mono text-ink">{limits ? `${limits.analysis_ttl_hours} h` : "24 h"}</dd>
          </div>
        </dl>
        <p className="border-t border-line pt-2.5 text-[11px] leading-relaxed text-ink-soft">
          exFAT, NTFS, ext4, APFS, GPT disks and compressed containers such as E01 are rejected with
          an explanation rather than parsed incorrectly.
        </p>
      </SurfaceBody>
    </Surface>
  );
}
