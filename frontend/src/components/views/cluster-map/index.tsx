"use client";

import { Binary, Crosshair, Grid3x3, Info, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";

import {
  CLUSTER_STATE_COLOR,
  CLUSTER_STATE_LABEL,
  CLUSTER_STATE_MEANING,
  DataList,
} from "@/components/common/data";
import { ErrorState, Notice, SkeletonRows } from "@/components/common/states";
import {
  ClusterCanvas,
  type HoverInfo,
} from "@/components/views/cluster-map/cluster-canvas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import { IconHint } from "@/components/ui/tooltip";
import { useCluster, useFullClusterMap } from "@/lib/api/queries";
import type { ClusterState } from "@/lib/api/schemas";
import { formatBytes, formatHex, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ZOOM_LEVELS = [2, 3, 4, 6, 9, 14];
const STATES: ClusterState[] = [
  "free",
  "allocated",
  "reserved",
  "bad",
  "orphaned",
  "crosslinked",
  "looped",
];

export function ClusterMapView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const analysisId = params.id;
  const requested = Number(searchParams.get("cluster"));

  const map = useFullClusterMap(analysisId);
  const [zoomIndex, setZoomIndex] = React.useState(2);
  const [activeStates, setActiveStates] = React.useState<ClusterState[]>([]);
  const [selected, setSelected] = React.useState<number | null>(
    Number.isFinite(requested) && requested > 0 ? requested : null,
  );
  const [jumpValue, setJumpValue] = React.useState("");
  const [hover, setHover] = React.useState<HoverInfo | null>(null);

  const detail = useCluster(analysisId, selected);

  const toggleState = (state: ClusterState) => {
    setActiveStates((current) =>
      current.includes(state) ? current.filter((item) => item !== state) : [...current, state],
    );
  };

  if (map.isPending) {
    return (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Surface className="overflow-hidden">
          <SkeletonRows rows={10} height="h-6" />
        </Surface>
        <Surface className="overflow-hidden">
          <SkeletonRows rows={5} />
        </Surface>
      </div>
    );
  }
  if (map.isError || !map.data) {
    return <ErrorState error={map.error} onRetry={() => void map.refetch()} />;
  }

  const incomplete = map.data.ranges.length < map.data.total_ranges;
  const cellSize = ZOOM_LEVELS[zoomIndex];
  const jump = () => {
    const value = Number(jumpValue);
    if (Number.isFinite(value) && value >= map.data.first_cluster && value <= map.data.last_cluster) {
      setSelected(value);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <Surface className="overflow-hidden">
        <SurfaceHeader className="flex-wrap gap-y-1.5">
          <SurfaceTitle
            icon={Grid3x3}
            hint={`${formatNumber(map.data.cluster_count)} clusters of ${formatBytes(map.data.bytes_per_cluster, 0)} · range ${formatNumber(map.data.first_cluster)}–${formatNumber(map.data.last_cluster)}`}
          >
            Allocation map
          </SurfaceTitle>
          <div className="flex shrink-0 items-center gap-1">
            <IconHint label="Zoom out">
              <Button
                variant="secondary"
                size="iconXs"
                aria-label="Zoom out"
                disabled={zoomIndex === 0}
                onClick={() => setZoomIndex((value) => Math.max(0, value - 1))}
              >
                <ZoomOut aria-hidden />
              </Button>
            </IconHint>
            <span className="w-12 text-center font-mono text-[11px] tabular-nums text-ink-muted">
              {cellSize}px
            </span>
            <IconHint label="Zoom in">
              <Button
                variant="secondary"
                size="iconXs"
                aria-label="Zoom in"
                disabled={zoomIndex === ZOOM_LEVELS.length - 1}
                onClick={() => setZoomIndex((value) => Math.min(ZOOM_LEVELS.length - 1, value + 1))}
              >
                <ZoomIn aria-hidden />
              </Button>
            </IconHint>
          </div>
        </SurfaceHeader>

        <Toolbar className="gap-1.5">
          {STATES.map((state) => {
            const count = map.data.state_counts[state] ?? 0;
            const active = activeStates.includes(state);
            return (
              <IconHint key={state} label={CLUSTER_STATE_MEANING[state]}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={count === 0}
                  onClick={() => toggleState(state)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors disabled:opacity-35",
                    active
                      ? "border-accent bg-accent-soft text-accent-ink"
                      : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-xs"
                    style={{ backgroundColor: CLUSTER_STATE_COLOR[state] }}
                    aria-hidden
                  />
                  {CLUSTER_STATE_LABEL[state]}
                  <span className="tabular-nums text-ink-soft">{formatNumber(count)}</span>
                </button>
              </IconHint>
            );
          })}
          {activeStates.length > 0 ? (
            <Button variant="ghost" size="xs" onClick={() => setActiveStates([])}>
              Show all
            </Button>
          ) : null}
        </Toolbar>

        {incomplete ? (
          <div className="px-3.5 pt-3">
            <Notice tone="warning" icon={Info}>
              Rendering the first {formatNumber(map.data.ranges.length)} of{" "}
              {formatNumber(map.data.total_ranges)} compressed ranges.
            </Notice>
          </div>
        ) : null}

        <div className="relative">
          <ClusterCanvas
            ranges={map.data.ranges}
            clusterCount={map.data.cluster_count}
            firstCluster={map.data.first_cluster}
            cellSize={cellSize}
            activeStates={activeStates}
            selectedCluster={selected}
            onSelectCluster={setSelected}
            onHoverChange={setHover}
          />
          {hover ? (
            <div
              className="pointer-events-none fixed z-50 rounded-md border border-line bg-surface px-2 py-1 text-[11px] shadow-raised"
              style={{ left: hover.x + 14, top: hover.y + 14 }}
            >
              <span className="font-mono text-ink">cluster {formatNumber(hover.cluster)}</span>
              <span className="mx-1.5 text-ink-soft">·</span>
              <span className="text-ink-muted">{CLUSTER_STATE_LABEL[hover.state]}</span>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-line px-3.5 py-2.5">
          <label htmlFor="cluster-jump" className="text-xs text-ink-muted">
            Go to cluster
          </label>
          <Input
            id="cluster-jump"
            inputMode="numeric"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value.replace(/[^0-9]/g, ""))}
            onKeyDown={(event) => {
              if (event.key === "Enter") jump();
            }}
            placeholder={`${map.data.first_cluster}–${map.data.last_cluster}`}
            className="h-8 w-36 font-mono text-xs"
          />
          <Button variant="secondary" size="sm" onClick={jump}>
            <Crosshair aria-hidden />
            Select
          </Button>
          <p className="ml-auto hidden text-[11px] text-ink-soft sm:block">
            Click any cell to inspect it. Each cell is one cluster.
          </p>
        </footer>
      </Surface>

      <Surface className="h-fit overflow-hidden">
        <SurfaceHeader>
          <SurfaceTitle icon={Crosshair}>Cluster inspector</SurfaceTitle>
          {selected !== null ? (
            <Badge tone="neutral" className="font-mono">
              {formatNumber(selected)}
            </Badge>
          ) : null}
        </SurfaceHeader>
        <SurfaceBody>
          {selected === null ? (
            <p className="text-xs leading-relaxed text-ink-muted">
              Select a cluster on the map to see its allocation state, byte offset in the image and
              the directory entry that claims it.
            </p>
          ) : detail.isPending ? (
            <div className="shimmer h-32 rounded-md" aria-hidden />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => void detail.refetch()} compact />
          ) : detail.data ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border border-line bg-surface-muted px-2.5 py-2">
                <span
                  className="size-3 shrink-0 rounded-xs"
                  style={{ backgroundColor: CLUSTER_STATE_COLOR[detail.data.state] }}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-ink">
                    {CLUSTER_STATE_LABEL[detail.data.state]}
                  </p>
                  <p className="text-[11px] leading-snug text-ink-muted">
                    {CLUSTER_STATE_MEANING[detail.data.state]}
                  </p>
                </div>
              </div>
              <DataList
                items={[
                  {
                    label: "Cluster",
                    value: formatNumber(detail.data.cluster),
                    copyValue: String(detail.data.cluster),
                  },
                  {
                    label: "Byte offset",
                    value: formatHex(detail.data.offset),
                    mono: true,
                    copyValue: String(detail.data.offset),
                  },
                  { label: "Cluster size", value: formatBytes(detail.data.size_bytes, 0) },
                  {
                    label: "Contiguous run",
                    value: `${formatNumber(detail.data.range_start)} – ${formatNumber(detail.data.range_end)}`,
                  },
                ]}
              />
              {detail.data.entry ? (
                <div className="rounded-md border border-line bg-surface-muted p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
                    Claimed by
                  </p>
                  <Link
                    href={`/analysis/${analysisId}/files?entry=${detail.data.entry.entry_id}`}
                    className="mt-1 block break-all font-mono text-[11.5px] text-accent hover:underline"
                  >
                    {detail.data.entry.path}
                  </Link>
                  <DataList
                    className="mt-1.5"
                    items={[
                      { label: "Size", value: formatBytes(detail.data.entry.size_bytes) },
                      { label: "Clusters", value: formatNumber(detail.data.entry.cluster_count) },
                      { label: "Chain", value: detail.data.entry.chain_status.replace(/_/g, " ") },
                      {
                        label: "State",
                        value: detail.data.entry.is_deleted ? "Deleted" : "Allocated",
                      },
                    ]}
                  />
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-ink-muted">
                  No live directory entry references this cluster.
                </p>
              )}
              <Button asChild variant="secondary" size="sm" className="w-full">
                <Link href={`/analysis/${analysisId}/hex?offset=${detail.data.offset}`}>
                  <Binary aria-hidden />
                  Open this cluster in the hex viewer
                </Link>
              </Button>
            </div>
          ) : null}
        </SurfaceBody>
      </Surface>
    </div>
  );
}
