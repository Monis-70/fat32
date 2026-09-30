"use client";

import {
  flexRender,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import * as React from "react";

import { EmptyState, ErrorState, SkeletonRows } from "@/components/common/states";
import { EntryIcon, entryIconTone } from "@/components/views/file-explorer/entry-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { EntryList, FsEntry } from "@/lib/api/schemas";
import { formatBytes, formatFsTimestamp, formatNumber } from "@/lib/format";
import { DESKTOP_QUERY, useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

export type TableSort = { id: string; desc: boolean };
export type Density = "compact" | "comfortable";

export const SORT_KEY: Record<string, string> = {
  name: "name",
  parent_path: "path",
  size_bytes: "size",
  first_cluster: "cluster",
  cluster_count: "clusters",
  modified_at: "modified",
};

const entryFeatures = tableFeatures({ rowSortingFeature });

const COLUMN_CLASS: Record<string, string> = {
  parent_path: "hidden xl:table-cell",
  cluster_count: "hidden xl:table-cell",
};

export function EntryStateBadges({ entry, compact = false }: { entry: FsEntry; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Badge tone={entry.is_deleted ? "high" : "positive"} size={compact ? "sm" : "md"}>
        {entry.is_deleted ? "deleted" : "allocated"}
      </Badge>
      {entry.is_hidden ? (
        <Badge tone="neutral" size={compact ? "sm" : "md"}>
          hidden
        </Badge>
      ) : null}
      {entry.is_system ? (
        <Badge tone="neutral" size={compact ? "sm" : "md"}>
          system
        </Badge>
      ) : null}
      {entry.is_fragmented ? (
        <Badge tone="medium" size={compact ? "sm" : "md"}>
          fragmented
        </Badge>
      ) : null}
      {entry.slack_nonzero ? (
        <Badge tone="low" size={compact ? "sm" : "md"}>
          slack
        </Badge>
      ) : null}
      {entry.is_residual ? (
        <Badge tone="medium" size={compact ? "sm" : "md"}>
          residual
        </Badge>
      ) : null}
      {entry.chain_status !== "ok" && entry.chain_status !== "empty" ? (
        <Badge tone="critical" size={compact ? "sm" : "md"}>
          {entry.chain_status.replace(/_/g, " ")}
        </Badge>
      ) : null}
      {entry.recoverable ? (
        <Badge tone="accent" size={compact ? "sm" : "md"}>
          recoverable
        </Badge>
      ) : null}
    </div>
  );
}

const columns: ColumnDef<typeof entryFeatures, FsEntry>[] = [
  {
    id: "name",
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const entry = row.original;
      return (
        <div className="flex min-w-0 items-center gap-2">
          <EntryIcon entry={entry} className={cn("size-4 shrink-0", entryIconTone(entry))} />
          <span
            className={cn(
              "block max-w-[15rem] truncate font-medium",
              entry.is_deleted && "text-ink-muted line-through decoration-high/60",
            )}
            title={entry.name}
          >
            {entry.name}
          </span>
        </div>
      );
    },
  },
  {
    id: "parent_path",
    accessorKey: "parent_path",
    header: "Location",
    cell: ({ row }) => (
      <span
        className="block max-w-[14rem] truncate font-mono text-[11.5px] text-ink-muted"
        title={row.original.parent_path}
      >
        {row.original.parent_path}
      </span>
    ),
  },
  {
    id: "status",
    header: "State",
    cell: ({ row }) => <EntryStateBadges entry={row.original} compact />,
  },
  {
    id: "size_bytes",
    accessorKey: "size_bytes",
    header: "Size",
    cell: ({ row }) =>
      row.original.is_directory ? (
        <span className="text-ink-soft">—</span>
      ) : (
        <span className="tabular-nums">{formatBytes(row.original.size_bytes)}</span>
      ),
  },
  {
    id: "first_cluster",
    accessorKey: "first_cluster",
    header: "Cluster",
    cell: ({ row }) => (
      <span className="font-mono text-[11.5px]">{formatNumber(row.original.first_cluster)}</span>
    ),
  },
  {
    id: "cluster_count",
    accessorKey: "cluster_count",
    header: "Clusters",
    cell: ({ row }) => (
      <span className="tabular-nums">{formatNumber(row.original.cluster_count)}</span>
    ),
  },
  {
    id: "modified_at",
    accessorKey: "modified_at",
    header: "Modified",
    cell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-[11.5px]">
        {formatFsTimestamp(row.original.modified_at)}
      </span>
    ),
  },
];

export function EntryTable({
  data,
  isPending,
  isError,
  error,
  onRetry,
  sorting,
  onSortingChange,
  onSelect,
  selectedId,
  page,
  onPageChange,
  density,
  emptyMessage,
  onClearFilters,
}: {
  data: EntryList | undefined;
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  sorting: TableSort[];
  onSortingChange: (next: TableSort[]) => void;
  onSelect: (entryId: number) => void;
  selectedId: number | null;
  page: number;
  onPageChange: (next: number) => void;
  density: Density;
  emptyMessage: { title: string; description: string };
  onClearFilters?: () => void;
}) {
  const rows = React.useMemo(() => data?.items ?? [], [data]);
  const bodyRef = React.useRef<HTMLTableSectionElement | null>(null);
  const [focusIndex, setFocusIndex] = React.useState(0);
  const wide = useMediaQuery(DESKTOP_QUERY);

  const table = useTable<typeof entryFeatures, FsEntry>({
    features: entryFeatures,
    columns,
    data: rows,
    state: { sorting },
    manualSorting: true,
    enableSortingRemoval: false,
    getRowId: (row) => String(row.entry_id),
  });

  const focusRow = (index: number) => {
    const clamped = Math.max(0, Math.min(rows.length - 1, index));
    setFocusIndex(clamped);
    const node = bodyRef.current?.querySelectorAll("tr")[clamped] as HTMLElement | undefined;
    node?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTableRowElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusRow(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusRow(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusRow(rows.length - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(rows[index].entry_id);
    }
  };

  if (isError) {
    return (
      <div className="p-3.5">
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    );
  }
  if (isPending) return <SkeletonRows rows={9} />;
  if (!data || data.items.length === 0) {
    return (
      <EmptyState
        title={emptyMessage.title}
        description={emptyMessage.description}
        action={
          onClearFilters ? (
            <Button variant="secondary" size="sm" onClick={onClearFilters}>
              Clear all filters
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {wide ? (
          <table className="grid-table" data-density={density}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const sortable = SORT_KEY[header.column.id] !== undefined;
                  const active = sorting.find((item) => item.id === header.column.id);
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      className={COLUMN_CLASS[header.column.id]}
                      aria-sort={
                        active ? (active.desc ? "descending" : "ascending") : sortable ? "none" : undefined
                      }
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSortingChange([
                              { id: header.column.id, desc: active ? !active.desc : false },
                            ])
                          }
                          className={cn(
                            "inline-flex items-center gap-1 uppercase transition-colors hover:text-ink",
                            active && "text-ink",
                          )}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {active === undefined ? (
                            <ArrowUpDown className="size-3 opacity-35" aria-hidden />
                          ) : active.desc ? (
                            <ArrowDown className="size-3 text-accent" aria-hidden />
                          ) : (
                            <ArrowUp className="size-3 text-accent" aria-hidden />
                          )}
                        </button>
                      ) : (
                        flexRender(header.column.columnDef.header, header.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody ref={bodyRef}>
            {table.getRowModel().rows.map((row, index) => (
              <tr
                key={row.id}
                tabIndex={index === focusIndex ? 0 : -1}
                onFocus={() => setFocusIndex(index)}
                onClick={() => onSelect(row.original.entry_id)}
                onKeyDown={(event) => handleKeyDown(event, index)}
                aria-selected={selectedId === row.original.entry_id}
                aria-label={`${row.original.name}, ${row.original.is_deleted ? "deleted" : "allocated"}`}
                className={cn(
                  "cursor-pointer outline-none transition-colors",
                  selectedId === row.original.entry_id
                    ? "bg-accent-soft"
                    : "hover:bg-surface-muted focus-visible:bg-surface-muted",
                )}
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={COLUMN_CLASS[cell.column.id]}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          </table>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((entry) => (
              <li key={entry.entry_id}>
                <button
                  type="button"
                  onClick={() => onSelect(entry.entry_id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                    selectedId === entry.entry_id ? "bg-accent-soft" : "hover:bg-surface-muted",
                  )}
                >
                  <EntryIcon
                    entry={entry}
                    className={cn("mt-0.5 size-4 shrink-0", entryIconTone(entry))}
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[13px] font-medium text-ink",
                        entry.is_deleted && "text-ink-muted line-through decoration-high/60",
                      )}
                    >
                      {entry.name}
                    </span>
                    <span
                      className="mt-0.5 block truncate font-mono text-[11px] text-ink-muted"
                      title={entry.parent_path}
                    >
                      {entry.parent_path}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1">
                      <EntryStateBadges entry={entry} compact />
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-ink-soft">
                      <span>{entry.is_directory ? "Folder" : formatBytes(entry.size_bytes)}</span>
                      <span className="font-mono">cluster {formatNumber(entry.first_cluster)}</span>
                      <span className="font-mono">{formatFsTimestamp(entry.modified_at)}</span>
                    </span>
                  </span>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-ink-soft" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
        <p className="text-xs text-ink-muted">
          {formatNumber(data.total)} entries · page {data.page} of {data.page_count}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft aria-hidden />
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= data.page_count}
            onClick={() => onPageChange(page + 1)}
          >
            Next
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </footer>
    </div>
  );
}
