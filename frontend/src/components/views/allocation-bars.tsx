"use client";

import * as React from "react";

import { CLUSTER_STATE_COLOR, CLUSTER_STATE_LABEL, CLUSTER_STATE_MEANING } from "@/components/common/data";
import { IconHint } from "@/components/ui/tooltip";
import type { ClusterState, ClusterStateCounts } from "@/lib/api/schemas";
import { formatBytes, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const ORDER: ClusterState[] = [
  "allocated",
  "orphaned",
  "crosslinked",
  "looped",
  "bad",
  "reserved",
  "free",
];

type Slice = {
  state: ClusterState;
  clusters: number;
  bytes: number;
  share: number;
};

export function AllocationBars({
  counts,
  bytesPerCluster,
  onSelectState,
  activeState,
}: {
  counts: ClusterStateCounts;
  bytesPerCluster: number;
  onSelectState?: (state: ClusterState) => void;
  activeState?: ClusterState | null;
}) {
  const total = ORDER.reduce((sum, state) => sum + (counts[state] ?? 0), 0);
  const nonFree = total - (counts.free ?? 0);

  const slices: Slice[] = ORDER.map((state) => ({
    state,
    clusters: counts[state] ?? 0,
    bytes: (counts[state] ?? 0) * bytesPerCluster,
    share: total > 0 ? ((counts[state] ?? 0) / total) * 100 : 0,
  }));

  const used = slices.filter((slice) => slice.state !== "free" && slice.clusters > 0);
  const present = slices.filter((slice) => slice.clusters > 0);

  if (total === 0) {
    return <p className="text-xs text-ink-muted">No cluster allocation data is available.</p>;
  }

  return (
    <div className="space-y-4">
      <StackBar
        label="Whole volume"
        caption={`${formatNumber(total)} clusters`}
        segments={present.map((slice) => ({
          key: slice.state,
          value: slice.clusters,
          color: CLUSTER_STATE_COLOR[slice.state],
          label: `${CLUSTER_STATE_LABEL[slice.state]} · ${formatNumber(slice.clusters)} clusters (${slice.share.toFixed(2)}%)`,
        }))}
      />
      {nonFree > 0 ? (
        <StackBar
          label="Clusters in use"
          caption={`${formatNumber(nonFree)} clusters · ${formatBytes(nonFree * bytesPerCluster)}`}
          segments={used.map((slice) => ({
            key: slice.state,
            value: slice.clusters,
            color: CLUSTER_STATE_COLOR[slice.state],
            label: `${CLUSTER_STATE_LABEL[slice.state]} · ${formatNumber(slice.clusters)} clusters`,
          }))}
        />
      ) : null}

      <div className="overflow-x-auto">
        <table className="grid-table">
          <thead>
            <tr>
              <th scope="col">State</th>
              <th scope="col" className="text-right">Clusters</th>
              <th scope="col" className="text-right">Share</th>
              <th scope="col" className="text-right">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {present.map((slice) => {
              const interactive = Boolean(onSelectState);
              const Row = interactive ? "button" : "span";
              return (
                <tr
                  key={slice.state}
                  className={cn(
                    "transition-colors",
                    activeState === slice.state && "bg-accent-soft",
                    interactive && "hover:bg-surface-muted",
                  )}
                >
                  <td>
                    <Row
                      {...(interactive
                        ? {
                            type: "button" as const,
                            onClick: () => onSelectState?.(slice.state),
                          }
                        : {})}
                      className="flex items-center gap-2 text-left"
                    >
                      <span
                        className="size-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: CLUSTER_STATE_COLOR[slice.state] }}
                        aria-hidden
                      />
                      <IconHint label={CLUSTER_STATE_MEANING[slice.state]}>
                        <span className="border-b border-dashed border-ink-soft/60">
                          {CLUSTER_STATE_LABEL[slice.state]}
                        </span>
                      </IconHint>
                    </Row>
                  </td>
                  <td className="text-right tabular-nums">{formatNumber(slice.clusters)}</td>
                  <td className="text-right tabular-nums text-ink-muted">
                    {slice.share < 0.01 && slice.share > 0 ? "<0.01" : slice.share.toFixed(2)}%
                  </td>
                  <td className="text-right tabular-nums text-ink-muted">
                    {formatBytes(slice.bytes)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StackBar({
  label,
  caption,
  segments,
}: {
  label: string;
  caption: string;
  segments: { key: string; value: number; color: string; label: string }[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
          {label}
        </p>
        <p className="font-mono text-[11px] text-ink-muted">{caption}</p>
      </div>
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-sm border border-line bg-surface-sunken"
        role="img"
        aria-label={`${label}: ${segments.map((segment) => segment.label).join(", ")}`}
      >
        {segments.map((segment) => (
          <IconHint key={segment.key} label={segment.label}>
            <span
              className="h-full min-w-[2px] transition-[flex-grow] duration-500"
              style={{ flexGrow: segment.value, backgroundColor: segment.color }}
            />
          </IconHint>
        ))}
      </div>
    </div>
  );
}
