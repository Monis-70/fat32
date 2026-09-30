"use client";

import { CalendarClock, ChevronLeft, ChevronRight, Filter, Info, X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, ErrorState, Notice, SkeletonRows } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, SearchInput } from "@/components/ui/input";
import { LabelledSelect } from "@/components/ui/select";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle, Toolbar } from "@/components/ui/surface";
import { useTimeline } from "@/lib/api/queries";
import type { TimelineEvent } from "@/lib/api/schemas";
import { formatBytes, formatFsTimestamp, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 200;
const KINDS = ["created", "modified", "accessed"] as const;
type Kind = (typeof KINDS)[number];

const KIND_VAR: Record<Kind, string> = {
  created: "var(--color-info)",
  modified: "var(--color-medium)",
  accessed: "var(--color-low)",
};

const KIND_PLAIN: Record<Kind, string> = {
  created: "File or folder was created",
  modified: "Contents were last written",
  accessed: "Entry was last opened (date only on FAT32)",
};

export function TimelineView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [granularity, setGranularity] = React.useState<"hour" | "day" | "month">("day");
  const [selectedKinds, setSelectedKinds] = React.useState<Kind[]>([...KINDS]);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const kinds = selectedKinds.length > 0 ? selectedKinds : [...KINDS];
  const timeline = useTimeline(id, {
    granularity,
    kinds: kinds.join(","),
    page,
    page_size: PAGE_SIZE,
  });

  const toggleKind = (kind: Kind) => {
    setPage(1);
    setSelectedKinds((current) =>
      current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind],
    );
  };

  const events = React.useMemo(() => timeline.data?.events ?? [], [timeline.data]);
  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return events.filter((event) => {
      if (needle && !event.path.toLowerCase().includes(needle)) return false;
      if (statusFilter === "deleted" && !event.is_deleted) return false;
      if (statusFilter === "allocated" && event.is_deleted) return false;
      if (from && event.timestamp.slice(0, 10) < from) return false;
      if (to && event.timestamp.slice(0, 10) > to) return false;
      return true;
    });
  }, [events, search, statusFilter, from, to]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of filtered) {
      const day = event.timestamp.slice(0, 10);
      const bucket = map.get(day);
      if (bucket) bucket.push(event);
      else map.set(day, [event]);
    }
    return [...map.entries()];
  }, [filtered]);

  const clientFilters =
    (search.trim() ? 1 : 0) + (statusFilter !== "all" ? 1 : 0) + (from ? 1 : 0) + (to ? 1 : 0);

  const clearClientFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setFrom("");
    setTo("");
  };

  return (
    <div className="space-y-4">
      <Surface className="overflow-hidden">
        <SurfaceHeader className="flex-wrap gap-y-1.5">
          <SurfaceTitle
            icon={CalendarClock}
            hint="Timestamps come from directory records and are shown exactly as stored on the volume."
          >
            Activity distribution
          </SurfaceTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={selectedKinds.includes(kind)}
                onClick={() => toggleKind(kind)}
                title={KIND_PLAIN[kind]}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] capitalize transition-colors",
                  selectedKinds.includes(kind)
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                <span
                  className="size-2.5 rounded-xs"
                  style={{ backgroundColor: KIND_VAR[kind] }}
                  aria-hidden
                />
                {kind}
              </button>
            ))}
            <LabelledSelect
              label="Chart grouping"
              value={granularity}
              onValueChange={(next) => {
                setGranularity(next as typeof granularity);
                setPage(1);
              }}
              triggerClassName="w-[112px]"
              options={[
                { value: "hour", label: "By hour" },
                { value: "day", label: "By day" },
                { value: "month", label: "By month" },
              ]}
            />
          </div>
        </SurfaceHeader>
        <SurfaceBody>
          {timeline.isPending ? <div className="shimmer h-56 rounded-md" aria-hidden /> : null}
          {timeline.isError ? (
            <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} />
          ) : null}
          {timeline.data && timeline.data.buckets.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No timestamps were decoded"
              description="Directory records on this volume carry no valid FAT date fields."
            />
          ) : null}
          {timeline.data && timeline.data.buckets.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Badge tone="neutral">{formatNumber(timeline.data.total_events)} events</Badge>
                <span className="font-mono">
                  {formatFsTimestamp(timeline.data.earliest)} → {formatFsTimestamp(timeline.data.latest)}
                </span>
              </div>
              <div className="h-52 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={timeline.data.buckets}
                    margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                  >
                    <CartesianGrid stroke="var(--color-line)" vertical={false} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fontSize: 10.5, fill: "var(--color-ink-muted)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--color-line-strong)" }}
                      minTickGap={18}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10.5, fill: "var(--color-ink-muted)" }}
                      tickLine={false}
                      axisLine={false}
                      width={36}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--color-surface-sunken)" }}
                      contentStyle={{
                        borderRadius: 6,
                        border: "1px solid var(--color-line)",
                        backgroundColor: "var(--color-surface)",
                        color: "var(--color-ink)",
                        fontSize: 12,
                      }}
                      labelStyle={{ color: "var(--color-ink-muted)" }}
                    />
                    {kinds.map((kind) => (
                      <Bar
                        key={kind}
                        dataKey={kind}
                        stackId="events"
                        fill={KIND_VAR[kind]}
                        isAnimationActive={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : null}
        </SurfaceBody>
      </Surface>

      <Surface className="overflow-hidden">
        <SurfaceHeader className="flex-wrap gap-y-1.5">
          <SurfaceTitle icon={Filter}>Event stream</SurfaceTitle>
          {timeline.data ? (
            <p className="text-xs text-ink-muted">
              Page {timeline.data.page} of {timeline.data.page_count}
            </p>
          ) : null}
        </SurfaceHeader>

        <Toolbar>
          <SearchInput
            value={search}
            onValueChange={setSearch}
            label="Filter by path"
            placeholder="Filter by path"
            className="w-full sm:w-52"
          />
          <LabelledSelect
            label="Filter by entry state"
            value={statusFilter}
            onValueChange={setStatusFilter}
            triggerClassName="w-[132px]"
            options={[
              { value: "all", label: "Any state" },
              { value: "allocated", label: "Allocated" },
              { value: "deleted", label: "Deleted" },
            ]}
          />
          <div className="flex items-center gap-1.5">
            <label htmlFor="timeline-from" className="text-[11px] text-ink-muted">
              From
            </label>
            <Input
              id="timeline-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-8 w-[9.5rem] text-xs"
            />
            <label htmlFor="timeline-to" className="text-[11px] text-ink-muted">
              To
            </label>
            <Input
              id="timeline-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-8 w-[9.5rem] text-xs"
            />
          </div>
          {clientFilters > 0 ? (
            <Button variant="ghost" size="xs" onClick={clearClientFilters}>
              <X aria-hidden />
              Clear
            </Button>
          ) : null}
        </Toolbar>

        {clientFilters > 0 && timeline.data ? (
          <div className="border-b border-line bg-surface px-3 py-2">
            <Notice tone="accent" icon={Info}>
              Showing {formatNumber(filtered.length)} of {formatNumber(events.length)} events loaded
              on this page. Change page to filter further into the timeline.
            </Notice>
          </div>
        ) : null}

        {timeline.isPending ? <SkeletonRows rows={8} /> : null}

        {timeline.data && grouped.length > 0 ? (
          <>
            <div className="scroll-thin max-h-[32rem] overflow-auto">
              {grouped.map(([day, dayEvents]) => (
                <section key={day}>
                  <h3 className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-y border-line bg-surface-muted px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                    <span>{day}</span>
                    <span className="tabular-nums text-ink-soft">{dayEvents.length} events</span>
                  </h3>
                  <ul className="divide-y divide-line-faint">
                    {dayEvents.map((event) => (
                      <li
                        key={`${event.entry_id}-${event.kind}-${event.timestamp}`}
                        className="flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-surface-muted"
                      >
                        <span className="w-16 shrink-0 font-mono text-[11px] tabular-nums text-ink-muted">
                          {event.timestamp.slice(11, 19) || "00:00:00"}
                        </span>
                        <span
                          className="size-2 shrink-0 rounded-xs"
                          style={{ backgroundColor: KIND_VAR[event.kind] }}
                          aria-hidden
                        />
                        <span className="w-16 shrink-0 text-[11px] capitalize text-ink-muted">
                          {event.kind}
                        </span>
                        <Link
                          href={`/analysis/${id}/files?entry=${event.entry_id}`}
                          className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-ink transition-colors hover:text-accent"
                          title={event.path}
                        >
                          {event.path}
                        </Link>
                        <span className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-ink-muted sm:block">
                          {event.is_directory ? "folder" : formatBytes(event.size_bytes)}
                        </span>
                        {event.is_deleted ? (
                          <Badge tone="high" size="sm">
                            deleted
                          </Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3.5 py-2.5">
              <p className="text-xs text-ink-muted">
                {formatNumber(timeline.data.total_events)} events recorded · times are shown exactly
                as stored, without timezone conversion
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
                  disabled={page >= timeline.data.page_count}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            </footer>
          </>
        ) : null}

        {timeline.data && grouped.length === 0 && !timeline.isPending ? (
          <EmptyState
            title={clientFilters > 0 ? "No events match these filters" : "No events on this page"}
            description={
              clientFilters > 0
                ? "Clear the path, state or date filters to see the loaded events."
                : "Move back to an earlier page of the timeline."
            }
            action={
              clientFilters > 0 ? (
                <Button variant="secondary" size="sm" onClick={clearClientFilters}>
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Surface>
    </div>
  );
}
