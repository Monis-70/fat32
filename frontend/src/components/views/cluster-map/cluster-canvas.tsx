"use client";

import { useTheme } from "next-themes";
import * as React from "react";

import type { ClusterRange, ClusterState } from "@/lib/api/schemas";

const STATE_VARS: Record<ClusterState, string> = {
  free: "--color-cluster-free",
  allocated: "--color-cluster-allocated",
  reserved: "--color-cluster-reserved",
  bad: "--color-cluster-bad",
  orphaned: "--color-cluster-orphaned",
  crosslinked: "--color-cluster-crosslinked",
  looped: "--color-cluster-looped",
};

export type HoverInfo = { cluster: number; state: ClusterState; entryId: number | null; x: number; y: number };

export function ClusterCanvas({
  ranges,
  clusterCount,
  firstCluster,
  cellSize,
  activeStates,
  selectedCluster,
  onSelectCluster,
  onHoverChange,
}: {
  ranges: ClusterRange[];
  clusterCount: number;
  firstCluster: number;
  cellSize: number;
  activeStates: ClusterState[];
  selectedCluster: number | null;
  onSelectCluster: (cluster: number) => void;
  onHoverChange: (info: HoverInfo | null) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [width, setWidth] = React.useState(0);
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const columns = width > 0 ? Math.max(8, Math.floor((width - 4) / cellSize)) : 0;
  const rows = columns > 0 ? Math.ceil(clusterCount / columns) : 0;

  const lookup = React.useCallback(
    (cluster: number) => {
      let low = 0;
      let high = ranges.length - 1;
      while (low <= high) {
        const mid = (low + high) >> 1;
        const range = ranges[mid];
        if (cluster < range.start) high = mid - 1;
        else if (cluster > range.end) low = mid + 1;
        else return range;
      }
      return null;
    },
    [ranges],
  );

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || columns === 0 || rows === 0) return;
    const styles = getComputedStyle(canvas);
    const colorFor = (state: ClusterState) => styles.getPropertyValue(STATE_VARS[state]).trim();
    const dimmed = styles.getPropertyValue("--color-line").trim();
    const surface = styles.getPropertyValue("--color-surface").trim();
    const inkColor = styles.getPropertyValue("--color-ink").trim();

    const ratio = window.devicePixelRatio || 1;
    const cssWidth = columns * cellSize;
    const cssHeight = rows * cellSize;
    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    context.fillStyle = surface;
    context.fillRect(0, 0, cssWidth, cssHeight);

    const gap = cellSize >= 5 ? 1 : 0;
    const filtering = activeStates.length > 0;

    for (const range of ranges) {
      const highlighted = !filtering || activeStates.includes(range.state);
      context.fillStyle = highlighted ? colorFor(range.state) : dimmed;
      context.globalAlpha = highlighted ? 1 : 0.35;
      let index = range.start - firstCluster;
      const end = Math.min(range.end - firstCluster, clusterCount - 1);
      while (index <= end) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const take = Math.min(columns - column, end - index + 1);
        context.fillRect(column * cellSize, row * cellSize, take * cellSize - gap, cellSize - gap);
        index += take;
      }
    }
    context.globalAlpha = 1;

    if (selectedCluster !== null) {
      const index = selectedCluster - firstCluster;
      if (index >= 0 && index < clusterCount) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        context.strokeStyle = inkColor;
        context.lineWidth = 1.5;
        context.strokeRect(column * cellSize - 1.5, row * cellSize - 1.5, cellSize + 2, cellSize + 2);
      }
    }
  }, [
    ranges,
    columns,
    rows,
    cellSize,
    activeStates,
    selectedCluster,
    clusterCount,
    firstCluster,
    resolvedTheme,
  ]);

  const clusterAt = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (columns === 0) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const column = Math.floor((event.clientX - rect.left) / cellSize);
    const row = Math.floor((event.clientY - rect.top) / cellSize);
    const index = row * columns + column;
    if (column < 0 || column >= columns || index < 0 || index >= clusterCount) return null;
    return firstCluster + index;
  };

  return (
    <div ref={containerRef} className="scroll-thin max-h-[26rem] overflow-auto p-2 sm:max-h-[32rem]">
      <canvas
        ref={canvasRef}
        onClick={(event) => {
          const cluster = clusterAt(event);
          if (cluster !== null) onSelectCluster(cluster);
        }}
        onMouseMove={(event) => {
          const cluster = clusterAt(event);
          if (cluster === null) {
            onHoverChange(null);
            return;
          }
          const range = lookup(cluster);
          onHoverChange({
            cluster,
            state: range?.state ?? "free",
            entryId: range?.entry_id ?? null,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onMouseLeave={() => onHoverChange(null)}
        role="img"
        aria-label={`Cluster allocation map covering ${clusterCount} clusters`}
        className="cursor-crosshair"
      />
    </div>
  );
}
