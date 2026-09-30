"use client";

import {
  ChevronRight,
  Filter,
  FolderTree,
  Home,
  Rows2,
  Rows3,
  X,
} from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import * as React from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { DirectoryTree } from "@/components/views/file-explorer/directory-tree";
import { EntryDetailsDrawer } from "@/components/views/file-explorer/entry-details";
import {
  EntryTable,
  SORT_KEY,
  type Density,
  type TableSort,
} from "@/components/views/file-explorer/entry-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SearchInput } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/primitives";
import { LabelledSelect } from "@/components/ui/select";
import { Surface, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import type { EntryQuery } from "@/lib/api/endpoints";
import { useEntries } from "@/lib/api/queries";
import { formatNumber } from "@/lib/format";
import { usePersistedString } from "@/lib/persisted-store";
import { WIDE_QUERY, useMediaQuery } from "@/lib/use-media-query";

const PAGE_SIZE = 50;

const TYPE_OPTIONS: { value: NonNullable<EntryQuery["entry_type"]>; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "file", label: "Files only" },
  { value: "directory", label: "Folders only" },
];

const STATUS_OPTIONS: { value: NonNullable<EntryQuery["entry_status"]>; label: string }[] = [
  { value: "all", label: "Any state" },
  { value: "allocated", label: "Allocated" },
  { value: "deleted", label: "Deleted" },
  { value: "recoverable", label: "Recoverable" },
  { value: "hidden", label: "Hidden or system" },
  { value: "fragmented", label: "Fragmented" },
  { value: "damaged", label: "Damaged chains" },
  { value: "slack", label: "Non-zero slack" },
];

export function FileExplorerView() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const analysisId = params.id;

  const deepLinkEntry = React.useMemo(() => {
    const raw = Number(searchParams.get("entry"));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }, [searchParams]);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [entryType, setEntryType] = React.useState<NonNullable<EntryQuery["entry_type"]>>("all");
  const [entryStatus, setEntryStatus] =
    React.useState<NonNullable<EntryQuery["entry_status"]>>("all");
  const [directoryId, setDirectoryId] = React.useState<number | null>(null);
  const [directoryPath, setDirectoryPath] = React.useState("/");
  const [scope, setScope] = React.useState<"volume" | "directory">("volume");
  const [page, setPage] = React.useState(1);
  const [sorting, setSorting] = React.useState<TableSort[]>([{ id: "parent_path", desc: false }]);
  const [selectedEntry, setSelectedEntry] = React.useState<number | null>(deepLinkEntry);
  const [treeOpen, setTreeOpen] = React.useState(false);
  const [density, setDensity] = usePersistedString<Density>("fatscope-density", "compact", [
    "compact",
    "comfortable",
  ]);
  const wide = useMediaQuery(WIDE_QUERY);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const sortColumn = sorting[0]?.id ?? "parent_path";
  const query: EntryQuery = {
    page,
    page_size: PAGE_SIZE,
    search: debouncedSearch || undefined,
    entry_type: entryType,
    entry_status: entryStatus,
    parent_entry_id: scope === "directory" && directoryId !== null ? directoryId : undefined,
    sort: SORT_KEY[sortColumn] ?? "path",
    order: sorting[0]?.desc ? "desc" : "asc",
  };

  const entries = useEntries(analysisId, query);

  const selectDirectory = (entryId: number | null, path: string) => {
    setDirectoryId(entryId);
    setDirectoryPath(path);
    setScope(entryId === null ? "volume" : "directory");
    setPage(1);
    setTreeOpen(false);
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setEntryType("all");
    setEntryStatus("all");
    selectDirectory(null, "/");
  };

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (debouncedSearch) {
    activeFilters.push({
      key: "search",
      label: `“${debouncedSearch}”`,
      clear: () => setSearch(""),
    });
  }
  if (entryType !== "all") {
    activeFilters.push({
      key: "type",
      label: TYPE_OPTIONS.find((option) => option.value === entryType)?.label ?? entryType,
      clear: () => {
        setEntryType("all");
        setPage(1);
      },
    });
  }
  if (entryStatus !== "all") {
    activeFilters.push({
      key: "status",
      label: STATUS_OPTIONS.find((option) => option.value === entryStatus)?.label ?? entryStatus,
      clear: () => {
        setEntryStatus("all");
        setPage(1);
      },
    });
  }
  if (scope === "directory" && directoryId !== null) {
    activeFilters.push({
      key: "folder",
      label: `In ${directoryPath}`,
      clear: () => selectDirectory(null, "/"),
    });
  }

  const crumbs = React.useMemo(() => {
    if (scope !== "directory" || directoryPath === "/") return [];
    return directoryPath.split("/").filter(Boolean);
  }, [scope, directoryPath]);

  const treePanel = (
    <DirectoryTree
      analysisId={analysisId}
      selectedDirectoryId={scope === "directory" ? directoryId : null}
      onSelectDirectory={selectDirectory}
      onSelectFile={setSelectedEntry}
    />
  );

  const tablePanel = (
    <Surface className="flex h-full min-h-0 flex-col overflow-hidden">
      <SurfaceHeader className="flex-wrap gap-y-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="secondary"
            size="xs"
            className={wide ? "hidden" : undefined}
            onClick={() => setTreeOpen(true)}
          >
            <FolderTree aria-hidden />
            Folders
          </Button>
          <nav aria-label="Folder breadcrumb" className="flex min-w-0 items-center gap-0.5 text-xs">
            <button
              type="button"
              onClick={() => selectDirectory(null, "/")}
              className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-ink-muted transition-colors hover:text-ink"
            >
              <Home className="size-3.5" aria-hidden />
              <span className="hidden sm:inline">Volume root</span>
            </button>
            {crumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} className="flex min-w-0 items-center gap-0.5">
                <ChevronRight className="size-3 shrink-0 text-ink-soft" aria-hidden />
                <span
                  className={`truncate px-1 ${index === crumbs.length - 1 ? "font-medium text-ink" : "text-ink-muted"}`}
                >
                  {crumb}
                </span>
              </span>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {entries.data ? (
            <Badge tone="neutral">{formatNumber(entries.data.total)} entries</Badge>
          ) : null}
          <SegmentedControl
            label="Row density"
            value={density}
            onValueChange={(next) => setDensity(next as Density)}
            options={[
              { value: "compact", label: "Compact", icon: Rows3 },
              { value: "comfortable", label: "Roomy", icon: Rows2 },
            ]}
            className="hidden sm:inline-flex"
          />
        </div>
      </SurfaceHeader>

      <Toolbar>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          label="Search names and paths"
          placeholder="Search names and paths"
          className="w-full sm:w-56"
        />
        <LabelledSelect
          label="Filter by entry type"
          value={entryType}
          onValueChange={(next) => {
            setEntryType(next as typeof entryType);
            setPage(1);
          }}
          triggerClassName="w-[124px]"
          options={TYPE_OPTIONS}
        />
        <LabelledSelect
          label="Filter by entry state"
          value={entryStatus}
          onValueChange={(next) => {
            setEntryStatus(next as typeof entryStatus);
            setPage(1);
          }}
          triggerClassName="w-[150px]"
          options={STATUS_OPTIONS}
        />
      </Toolbar>

      {activeFilters.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-surface px-3 py-2">
          <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
            <Filter className="size-3" aria-hidden />
            {activeFilters.length} active {activeFilters.length === 1 ? "filter" : "filters"}
          </span>
          {activeFilters.map((filter) => (
            <Badge key={filter.key} tone="accent" className="gap-1">
              <span className="truncate">{filter.label}</span>
              <button
                type="button"
                aria-label={`Remove filter ${filter.label}`}
                onClick={filter.clear}
                className="rounded-xs hover:text-ink"
              >
                <X className="size-3" aria-hidden />
              </button>
            </Badge>
          ))}
          <Button variant="ghost" size="xs" onClick={clearFilters}>
            Clear all
          </Button>
        </div>
      ) : null}

      <EntryTable
        data={entries.data}
        isPending={entries.isPending}
        isError={entries.isError}
        error={entries.error}
        onRetry={() => void entries.refetch()}
        sorting={sorting}
        onSortingChange={(next) => {
          setSorting(next);
          setPage(1);
        }}
        onSelect={setSelectedEntry}
        selectedId={selectedEntry}
        page={page}
        onPageChange={setPage}
        density={density}
        emptyMessage={
          activeFilters.length > 0
            ? {
                title: "No entries match these filters",
                description:
                  "Relax the search term, entry state or folder scope to see more of the filesystem.",
              }
            : {
                title: "This folder is empty",
                description: "No directory entries were recovered inside this folder.",
              }
        }
        onClearFilters={activeFilters.length > 0 ? clearFilters : undefined}
      />
    </Surface>
  );

  return (
    <>
      {wide ? (
        <Group orientation="horizontal" className="min-h-[38rem]" id="fatscope-explorer">
          <Panel defaultSize="22" minSize="14" maxSize="40">
            <Surface className="flex h-full min-h-0 flex-col overflow-hidden">
              <SurfaceHeader>
                <SurfaceTitle icon={FolderTree}>Folders</SurfaceTitle>
              </SurfaceHeader>
              <div className="min-h-0 flex-1">{treePanel}</div>
            </Surface>
          </Panel>
          <Separator className="group mx-1.5 flex w-1.5 items-center justify-center rounded-full">
            <span className="h-10 w-0.5 rounded-full bg-line-strong transition-colors group-hover:bg-accent" />
          </Separator>
          <Panel minSize="40">{tablePanel}</Panel>
        </Group>
      ) : (
        tablePanel
      )}

      <Drawer open={treeOpen} onOpenChange={setTreeOpen}>
        <DrawerContent side="right" title="Folders" description="Browse the directory tree">
          <div className="h-full bg-surface">{treePanel}</div>
        </DrawerContent>
      </Drawer>

      <EntryDetailsDrawer
        analysisId={analysisId}
        entryId={selectedEntry}
        onClose={() => setSelectedEntry(null)}
      />
    </>
  );
}
