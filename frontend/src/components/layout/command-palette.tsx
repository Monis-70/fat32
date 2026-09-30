"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  ArrowRight,
  Binary,
  Copy,
  FileDown,
  FlaskConical,
  Home,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import * as React from "react";

import { analysisNav } from "@/components/layout/nav-config";
import { api } from "@/lib/api/endpoints";
import { useAnalyses, useAnalysis, useCreateDemoAnalysis } from "@/lib/api/queries";
import { formatBytes, truncateMiddle } from "@/lib/format";

export function useCommandPalette() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
  analysisId,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  analysisId: string | null;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = React.useState("");
  const recents = useAnalyses(8, 0);
  const analysis = useAnalysis(analysisId ?? "");
  const demo = useCreateDemoAnalysis();

  const run = React.useCallback(
    (action: () => void) => {
      onOpenChange(false);
      setQuery("");
      action();
    },
    [onOpenChange],
  );

  const offsetCandidate = React.useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const parsed = trimmed.toLowerCase().startsWith("0x")
      ? Number.parseInt(trimmed.slice(2), 16)
      : /^\d+$/.test(trimmed)
        ? Number.parseInt(trimmed, 10)
        : Number.NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }, [query]);

  const navItems = analysisId ? analysisNav(analysisId) : [];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[85] bg-ink/40 backdrop-blur-[1px] animate-fade-in dark:bg-black/60" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-[95] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-raised outline-none animate-fade-rise">
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search sections, cases and actions
          </DialogPrimitive.Description>
          <Command
            loop
            className="flex max-h-[min(30rem,70vh)] flex-col"
            filter={(value, search) =>
              value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
            }
          >
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Search className="size-4 shrink-0 text-ink-soft" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search sections, cases, actions or type an offset"
                className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft"
              />
              <kbd className="kbd hidden sm:inline-flex">ESC</kbd>
            </div>
            <Command.List className="scroll-thin flex-1 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-xs text-ink-muted">
                Nothing matches that search.
              </Command.Empty>

              {offsetCandidate !== null && analysisId ? (
                <Command.Group heading="Jump" className="cmd-group">
                  <Command.Item
                    value={`jump offset ${query}`}
                    onSelect={() =>
                      run(() =>
                        router.push(`/analysis/${analysisId}/hex?offset=${offsetCandidate}`),
                      )
                    }
                    className="cmd-item"
                  >
                    <Binary className="size-4 text-ink-soft" aria-hidden />
                    <span>
                      Open hex viewer at offset{" "}
                      <span className="font-mono">
                        0x{offsetCandidate.toString(16).toUpperCase()}
                      </span>
                    </span>
                  </Command.Item>
                </Command.Group>
              ) : null}

              {navItems.length > 0 ? (
                <Command.Group heading="Investigation" className="cmd-group">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Command.Item
                        key={item.key}
                        value={`${item.label} ${item.blurb}`}
                        onSelect={() => run(() => router.push(item.href))}
                        className="cmd-item"
                      >
                        <Icon className="size-4 text-ink-soft" aria-hidden />
                        <span className="flex-1 truncate">{item.label}</span>
                        <span className="hidden truncate text-[11px] text-ink-soft sm:block">
                          {item.blurb}
                        </span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ) : null}

              <Command.Group heading="Workspace" className="cmd-group">
                <Command.Item
                  value="case workbench home new analysis upload"
                  onSelect={() => run(() => router.push("/"))}
                  className="cmd-item"
                >
                  <Home className="size-4 text-ink-soft" aria-hidden />
                  <span>Case workbench</span>
                </Command.Item>
                <Command.Item
                  value="open demo case sample evidence"
                  onSelect={() =>
                    run(() =>
                      demo.mutate(undefined, {
                        onSuccess: (created) => router.push(`/analysis/${created.id}`),
                      }),
                    )
                  }
                  className="cmd-item"
                >
                  <FlaskConical className="size-4 text-ink-soft" aria-hidden />
                  <span>Open demo case</span>
                </Command.Item>
                <Command.Item
                  value="toggle theme dark light appearance"
                  onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))}
                  className="cmd-item"
                >
                  {resolvedTheme === "dark" ? (
                    <Sun className="size-4 text-ink-soft" aria-hidden />
                  ) : (
                    <Moon className="size-4 text-ink-soft" aria-hidden />
                  )}
                  <span>Switch to {resolvedTheme === "dark" ? "light" : "dark"} theme</span>
                </Command.Item>
              </Command.Group>

              {analysisId && analysis.data ? (
                <Command.Group heading="This case" className="cmd-group">
                  {(["json", "csv", "pdf"] as const).map((format) => (
                    <Command.Item
                      key={format}
                      value={`download ${format} report export`}
                      onSelect={() =>
                        run(() => {
                          window.location.href = api.reportUrl(analysisId, format);
                        })
                      }
                      className="cmd-item"
                    >
                      <FileDown className="size-4 text-ink-soft" aria-hidden />
                      <span>Download {format.toUpperCase()} report</span>
                    </Command.Item>
                  ))}
                  {analysis.data.image_sha256 ? (
                    <Command.Item
                      value="copy image sha256 hash"
                      onSelect={() =>
                        run(() => {
                          void navigator.clipboard?.writeText(analysis.data.image_sha256 ?? "");
                        })
                      }
                      className="cmd-item"
                    >
                      <Copy className="size-4 text-ink-soft" aria-hidden />
                      <span>Copy image SHA-256</span>
                    </Command.Item>
                  ) : null}
                </Command.Group>
              ) : null}

              {recents.data && recents.data.items.length > 0 ? (
                <Command.Group heading="Recent cases" className="cmd-group">
                  {recents.data.items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={`${item.original_filename} ${item.case_id ?? ""} ${item.id}`}
                      onSelect={() => run(() => router.push(`/analysis/${item.id}`))}
                      className="cmd-item"
                    >
                      <ArrowRight className="size-4 text-ink-soft" aria-hidden />
                      <span className="flex-1 truncate">
                        {truncateMiddle(item.original_filename, 38)}
                      </span>
                      <span className="hidden shrink-0 text-[11px] text-ink-soft sm:block">
                        {item.case_id ? `${item.case_id} · ` : ""}
                        {formatBytes(item.size_bytes)}
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
