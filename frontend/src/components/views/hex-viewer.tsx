"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowRight,
  Binary,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crosshair,
} from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";

import { CopyButton } from "@/components/common/data";
import { ErrorState, Notice, SkeletonRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Surface, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import { IconHint } from "@/components/ui/tooltip";
import { useHexWindow, useSummary } from "@/lib/api/queries";
import { decodeBase64, formatBytes, formatHex, formatNumber, toAsciiGlyph } from "@/lib/format";
import { cn } from "@/lib/utils";

const ROW_HEIGHT = 20;
const WINDOW_BYTES = 32_768;
const PRELOAD_ROWS = 24;

function parseOffset(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = trimmed.toLowerCase().startsWith("0x")
    ? Number.parseInt(trimmed.slice(2), 16)
    : Number.parseInt(trimmed, 10);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function subscribeViewport(listener: () => void) {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

function viewportSnapshot() {
  return window.innerWidth;
}

function serverViewportSnapshot() {
  return 0;
}

export function HexViewerView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const analysisId = params.id;
  const requestedOffset = parseOffset(searchParams.get("offset") ?? "");

  const summary = useSummary(analysisId);
  const imageSize = summary.data?.image.size_bytes ?? 0;

  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const viewportWidth = React.useSyncExternalStore(
    subscribeViewport,
    viewportSnapshot,
    serverViewportSnapshot,
  );
  const [windowStart, setWindowStart] = React.useState(0);
  const [target, setTarget] = React.useState<number | null>(requestedOffset);
  const [jumpValue, setJumpValue] = React.useState(
    requestedOffset === null ? "" : `0x${requestedOffset.toString(16).toUpperCase()}`,
  );
  const [jumpError, setJumpError] = React.useState<string | null>(null);

  const compact = viewportWidth > 0 && viewportWidth < 780;
  const bytesPerRow = compact ? 8 : 16;
  const offsetWidth = compact ? 78 : 92;
  const byteWidth = compact ? 19 : 22;
  const hexWidth = bytesPerRow * byteWidth + 26;
  const asciiWidth = bytesPerRow * 7 + 18;
  const totalRows = imageSize > 0 ? Math.ceil(imageSize / bytesPerRow) : 0;

  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 16,
  });

  const hex = useHexWindow(analysisId, windowStart, WINDOW_BYTES, imageSize > 0);
  const bytes = React.useMemo(
    () => (hex.data ? decodeBase64(hex.data.bytes_base64) : new Uint8Array()),
    [hex.data],
  );

  const syncWindow = React.useCallback(
    (scrollTop: number) => {
      const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - PRELOAD_ROWS);
      const firstByte = firstRow * bytesPerRow;
      const nextStart = Math.max(0, Math.floor(firstByte / (WINDOW_BYTES / 2)) * (WINDOW_BYTES / 2));
      setWindowStart((current) => (current === nextStart ? current : nextStart));
    },
    [bytesPerRow],
  );

  const jumpTo = React.useCallback(
    (offset: number) => {
      if (imageSize > 0 && offset >= imageSize) {
        setJumpError(
          `That offset is past the end of the image, which holds ${formatNumber(imageSize)} bytes.`,
        );
        return;
      }
      setJumpError(null);
      setTarget(offset);
      setJumpValue(`0x${offset.toString(16).toUpperCase()}`);
      const row = Math.floor(offset / bytesPerRow);
      const nextStart = Math.max(
        0,
        Math.floor(offset / (WINDOW_BYTES / 2)) * (WINDOW_BYTES / 2) - WINDOW_BYTES / 2,
      );
      setWindowStart(nextStart);
      virtualizer.scrollToIndex(row, { align: "center" });
    },
    [bytesPerRow, imageSize, virtualizer],
  );

  const appliedDeepLink = React.useRef(false);
  React.useEffect(() => {
    if (appliedDeepLink.current || requestedOffset === null || totalRows === 0) return;
    appliedDeepLink.current = true;
    jumpTo(requestedOffset);
  }, [requestedOffset, totalRows, jumpTo]);

  if (summary.isPending) {
    return (
      <Surface className="overflow-hidden">
        <SkeletonRows rows={14} height="h-5" />
      </Surface>
    );
  }
  if (summary.isError || !summary.data) {
    return <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  const geometry = summary.data.geometry;
  const clusterSize = geometry.bytes_per_cluster;
  const dataStart = geometry.data_start_offset;
  const currentCluster =
    target !== null && target >= dataStart
      ? Math.floor((target - dataStart) / clusterSize) + 2
      : null;

  const shortcuts = [
    { label: "Boot sector", offset: geometry.volume_offset },
    { label: "FSInfo", offset: summary.data.fsinfo.offset },
    { label: "FAT region", offset: geometry.fat_start_offset },
    { label: "Data region", offset: dataStart },
  ];

  const virtualRows = virtualizer.getVirtualItems();
  const selectedByte =
    target !== null && target >= windowStart && target < windowStart + bytes.length
      ? bytes[target - windowStart]
      : null;

  return (
    <Surface className="overflow-hidden">
      <SurfaceHeader className="flex-wrap gap-y-1.5">
        <SurfaceTitle
          icon={Binary}
          hint={`Reads ${formatBytes(WINDOW_BYTES, 0)} windows on demand across ${formatBytes(imageSize)}.`}
        >
          Raw bytes
        </SurfaceTitle>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <label htmlFor="hex-offset" className="text-[11px] text-ink-muted">
            Offset
          </label>
          <Input
            id="hex-offset"
            value={jumpValue}
            onChange={(event) => setJumpValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const parsed = parseOffset(jumpValue);
              if (parsed === null) {
                setJumpError("Enter a decimal offset or a 0x-prefixed hexadecimal offset.");
                return;
              }
              jumpTo(parsed);
            }}
            placeholder="0x100000"
            className="h-8 w-36 font-mono text-xs"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const parsed = parseOffset(jumpValue);
              if (parsed === null) {
                setJumpError("Enter a decimal offset or a 0x-prefixed hexadecimal offset.");
                return;
              }
              jumpTo(parsed);
            }}
          >
            <ArrowRight aria-hidden />
            Go
          </Button>
        </div>
      </SurfaceHeader>

      <Toolbar className="gap-1.5">
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut.label}
            variant="secondary"
            size="xs"
            onClick={() => jumpTo(shortcut.offset)}
          >
            {shortcut.label}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <IconHint label="Previous cluster">
            <Button
              variant="secondary"
              size="iconXs"
              aria-label="Previous cluster"
              disabled={target === null || target - clusterSize < 0}
              onClick={() => target !== null && jumpTo(Math.max(0, target - clusterSize))}
            >
              <ChevronLeft aria-hidden />
            </Button>
          </IconHint>
          <span className="min-w-[7.5rem] text-center font-mono text-[11px] text-ink-muted">
            {currentCluster !== null && currentCluster >= 2
              ? `cluster ${formatNumber(currentCluster)}`
              : "outside data region"}
          </span>
          <IconHint label="Next cluster">
            <Button
              variant="secondary"
              size="iconXs"
              aria-label="Next cluster"
              disabled={target === null || target + clusterSize >= imageSize}
              onClick={() => target !== null && jumpTo(target + clusterSize)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </IconHint>
        </div>
      </Toolbar>

      {jumpError ? (
        <div className="px-3.5 pt-3">
          <Notice tone="critical">{jumpError}</Notice>
        </div>
      ) : null}
      {hex.isError ? (
        <div className="p-3.5">
          <ErrorState error={hex.error} onRetry={() => void hex.refetch()} />
        </div>
      ) : null}

      {target !== null ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-accent-soft px-3.5 py-2 text-[11px]">
          <span className="flex items-center gap-1 text-accent-ink">
            <Crosshair className="size-3.5" aria-hidden />
            Selected byte
          </span>
          <span className="font-mono text-ink">offset {formatHex(target)}</span>
          <span className="font-mono text-ink">decimal {formatNumber(target)}</span>
          {selectedByte !== null ? (
            <>
              <span className="font-mono text-ink">
                value 0x{selectedByte.toString(16).padStart(2, "0").toUpperCase()}
              </span>
              <span className="font-mono text-ink">dec {selectedByte}</span>
              <span className="font-mono text-ink">char {toAsciiGlyph(selectedByte)}</span>
            </>
          ) : null}
          <CopyButton value={String(target)} label="Copy selected offset" />
        </div>
      ) : null}

      <div className="overflow-hidden border-b border-line bg-surface-muted px-3.5 py-1.5">
        <div className="flex font-mono text-[10px] uppercase tracking-[0.06em] text-ink-soft">
          <span className="shrink-0" style={{ width: offsetWidth }}>
            Offset
          </span>
          <span className="shrink-0" style={{ width: hexWidth }}>
            Hexadecimal
          </span>
          <span className="shrink-0" style={{ width: asciiWidth }}>
            ASCII
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={(event) => syncWindow(event.currentTarget.scrollTop)}
        className="scroll-thin h-[26rem] overflow-y-auto overflow-x-hidden sm:h-[32rem]"
      >
        {totalRows === 0 ? (
          <SkeletonRows rows={8} height="h-5" />
        ) : (
          <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualRows.map((virtualRow) => {
              const rowOffset = virtualRow.index * bytesPerRow;
              const withinWindow =
                rowOffset >= windowStart && rowOffset + bytesPerRow <= windowStart + bytes.length;
              const slice = withinWindow
                ? bytes.subarray(rowOffset - windowStart, rowOffset - windowStart + bytesPerRow)
                : null;
              const isTargetRow =
                target !== null && target >= rowOffset && target < rowOffset + bytesPerRow;
              return (
                <div
                  key={virtualRow.key}
                  className={cn(
                    "absolute left-0 top-0 flex w-full items-center font-mono text-[11px] leading-5",
                    isTargetRow && "bg-accent-soft",
                  )}
                  style={{
                    height: `${ROW_HEIGHT}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <span className="shrink-0 px-3 text-ink-soft" style={{ width: offsetWidth }}>
                    {rowOffset.toString(16).padStart(8, "0").toUpperCase()}
                  </span>
                  <span
                    className="shrink-0 whitespace-nowrap px-2 text-ink"
                    style={{ width: hexWidth }}
                  >
                    {Array.from({ length: bytesPerRow }).map((_, index) => {
                      const value = slice && index < slice.length ? slice[index] : null;
                      const absolute = rowOffset + index;
                      return (
                        <button
                          key={index}
                          type="button"
                          tabIndex={-1}
                          onClick={() => setTarget(absolute)}
                          className={cn(
                            "inline-block rounded-xs text-center transition-colors",
                            index === bytesPerRow / 2 - 1 && "mr-2.5",
                            target === absolute
                              ? "bg-accent text-white"
                              : "hover:bg-line-strong/60",
                            value === 0 && target !== absolute && "text-ink-soft",
                          )}
                          style={{ width: byteWidth }}
                        >
                          {value === null ? "··" : value.toString(16).padStart(2, "0").toUpperCase()}
                        </button>
                      );
                    })}
                  </span>
                  <span
                    className="shrink-0 whitespace-pre px-2 text-ink-muted"
                    style={{ width: asciiWidth }}
                  >
                    {slice
                      ? Array.from(slice)
                          .map((value) => toAsciiGlyph(value))
                          .join("")
                          .padEnd(bytesPerRow, " ")
                      : "".padEnd(bytesPerRow, "·")}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3.5 py-2.5 text-[11px] text-ink-muted">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge tone="neutral" className="font-mono">
            {formatHex(windowStart)} – {formatHex(windowStart + bytes.length)}
          </Badge>
          <span>{formatNumber(bytes.length)} bytes loaded</span>
          <span className="hidden sm:inline">
            image {formatNumber(imageSize)} bytes · {formatNumber(totalRows)} rows
          </span>
        </div>
        {hex.data ? (
          <span className="flex items-center gap-1 font-mono">
            <Copy className="size-3" aria-hidden />
            window SHA-256 {hex.data.sha256.slice(0, 12)}…
            <CopyButton value={hex.data.sha256} label="Copy window SHA-256" />
          </span>
        ) : null}
      </footer>
    </Surface>
  );
}
