"use client";

import { ChevronRight, HardDrive, Loader2 } from "lucide-react";
import * as React from "react";

import { ErrorState } from "@/components/common/states";
import { NodeIcon } from "@/components/views/file-explorer/entry-icons";
import { Badge } from "@/components/ui/badge";
import { useTree } from "@/lib/api/queries";
import type { TreeNode } from "@/lib/api/schemas";
import { cn } from "@/lib/utils";

type TreeProps = {
  analysisId: string;
  selectedDirectoryId: number | null;
  onSelectDirectory: (entryId: number | null, path: string) => void;
  onSelectFile: (entryId: number) => void;
};

export function DirectoryTree(props: TreeProps) {
  return (
    <div
      className="scroll-thin h-full overflow-auto px-1.5 py-1.5"
      role="tree"
      aria-label="Directory tree"
    >
      <button
        type="button"
        onClick={() => props.onSelectDirectory(null, "/")}
        className={cn(
          "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors",
          props.selectedDirectoryId === null
            ? "bg-accent-soft font-medium text-accent-ink"
            : "text-ink hover:bg-surface-sunken",
        )}
      >
        <HardDrive className="size-4 shrink-0 text-accent" aria-hidden />
        <span className="truncate">Volume root</span>
      </button>
      <TreeBranch parentId={null} depth={1} {...props} />
    </div>
  );
}

function TreeBranch({
  analysisId,
  parentId,
  depth,
  selectedDirectoryId,
  onSelectDirectory,
  onSelectFile,
}: TreeProps & { parentId: number | null; depth: number }) {
  const { data, isPending, isError, error, refetch } = useTree(analysisId, parentId);

  if (isPending) {
    return (
      <p
        className="flex items-center gap-1.5 py-1.5 text-[11px] text-ink-soft"
        style={{ paddingLeft: depth * 14 }}
      >
        <Loader2 className="size-3 animate-spin" aria-hidden />
        Loading
      </p>
    );
  }
  if (isError) {
    return (
      <div className="p-1.5">
        <ErrorState error={error} onRetry={() => void refetch()} compact />
      </div>
    );
  }
  if (!data || data.items.length === 0) {
    return (
      <p className="py-1.5 text-[11px] text-ink-soft" style={{ paddingLeft: depth * 14 }}>
        Empty
      </p>
    );
  }

  return (
    <ul role="group" className="space-y-px">
      {data.items.map((node) => (
        <TreeItem
          key={node.entry_id}
          node={node}
          depth={depth}
          analysisId={analysisId}
          selectedDirectoryId={selectedDirectoryId}
          onSelectDirectory={onSelectDirectory}
          onSelectFile={onSelectFile}
        />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  depth,
  analysisId,
  selectedDirectoryId,
  onSelectDirectory,
  onSelectFile,
}: TreeProps & { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = React.useState(false);
  const selected = node.is_directory && selectedDirectoryId === node.entry_id;

  return (
    <li role="treeitem" aria-expanded={node.is_directory ? expanded : undefined} aria-selected={selected}>
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-md pr-1.5 transition-colors",
          selected ? "bg-accent-soft" : "hover:bg-surface-sunken",
        )}
        style={{ paddingLeft: depth * 10 }}
      >
        {node.is_directory && node.has_children ? (
          <button
            type="button"
            aria-label={expanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-sm p-0.5 text-ink-soft transition-colors hover:text-ink"
          >
            <ChevronRight
              className={cn("size-3.5 transition-transform duration-150", expanded && "rotate-90")}
              aria-hidden
            />
          </button>
        ) : (
          <span className="size-[1.125rem] shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() =>
            node.is_directory
              ? onSelectDirectory(node.entry_id, node.path)
              : onSelectFile(node.entry_id)
          }
          className="flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left"
          title={node.path}
        >
          <NodeIcon
            node={node}
            expanded={expanded}
            className={cn(
              "size-4 shrink-0",
              node.is_deleted ? "text-high" : node.is_directory ? "text-accent" : "text-ink-soft",
            )}
          />
          <span
            className={cn(
              "truncate text-[12.5px]",
              selected ? "font-medium text-accent-ink" : "text-ink",
              node.is_deleted && "text-ink-muted line-through decoration-high/60",
            )}
          >
            {node.name}
          </span>
          {node.is_deleted ? (
            <Badge tone="high" size="sm">
              del
            </Badge>
          ) : null}
          {!node.is_deleted && (node.is_hidden || node.is_system) ? (
            <Badge tone="neutral" size="sm">
              hid
            </Badge>
          ) : null}
        </button>
      </div>
      {node.is_directory && expanded ? (
        <TreeBranch
          analysisId={analysisId}
          parentId={node.entry_id}
          depth={depth + 1}
          selectedDirectoryId={selectedDirectoryId}
          onSelectDirectory={onSelectDirectory}
          onSelectFile={onSelectFile}
        />
      ) : null}
    </li>
  );
}
