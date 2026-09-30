"use client";

import {
  FileUp,
  FlaskConical,
  HardDriveUpload,
  Loader2,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ErrorState, Notice } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/primitives";
import { Surface, SurfaceBody, SurfaceHeader, SurfaceTitle } from "@/components/ui/surface";
import { useCreateDemoAnalysis, useMeta, useUploadAnalysis } from "@/lib/api/queries";
import { evidenceMetadataSchema, type EvidenceMetadata } from "@/lib/api/schemas";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const EMPTY_METADATA: EvidenceMetadata = {
  case_id: "",
  examiner: "",
  evidence_number: "",
  acquired_at: "",
  notes: "",
};

export function UploadPanel() {
  const router = useRouter();
  const meta = useMeta();
  const [file, setFile] = React.useState<File | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [metadata, setMetadata] = React.useState<EvidenceMetadata>(EMPTY_METADATA);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const inputRef = React.useRef<HTMLInputElement>(null);

  const upload = useUploadAnalysis(setProgress);
  const demo = useCreateDemoAnalysis();

  const extensions = React.useMemo(
    () => meta.data?.supported_extensions ?? [".img", ".dd", ".raw"],
    [meta.data],
  );
  const maxBytes = meta.data?.limits.max_upload_bytes ?? 512 * 1024 * 1024;

  const validateFile = React.useCallback(
    (candidate: File): string | null => {
      const lower = candidate.name.toLowerCase();
      if (!extensions.some((extension) => lower.endsWith(extension))) {
        return `That file type is not accepted. Use a raw image with one of these extensions: ${extensions.join(", ")}.`;
      }
      if (candidate.size > maxBytes) {
        return `This image is ${formatBytes(candidate.size)}. The service accepts up to ${formatBytes(maxBytes, 0)}.`;
      }
      if (candidate.size < 512) {
        return "This file is smaller than a single 512-byte sector, so it cannot contain a volume.";
      }
      return null;
    },
    [extensions, maxBytes],
  );

  const acceptFile = React.useCallback(
    (candidate: File | undefined) => {
      if (!candidate) return;
      const problem = validateFile(candidate);
      setFileError(problem);
      setFile(problem ? null : candidate);
      setProgress(0);
      upload.reset();
    },
    [upload, validateFile],
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) {
      setFileError("Choose an evidence image before starting the examination.");
      return;
    }
    const parsed = evidenceMetadataSchema.safeParse(metadata);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    upload.mutate(
      { file, metadata: parsed.data },
      { onSuccess: (analysis) => router.push(`/analysis/${analysis.id}`) },
    );
  };

  const busy = upload.isPending || demo.isPending;

  return (
    <Surface>
      <SurfaceHeader>
        <SurfaceTitle
          icon={HardDriveUpload}
          hint="Images are opened read-only. Nothing is mounted, written or executed."
        >
          Start a new examination
        </SurfaceTitle>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0"
          disabled={busy}
          onClick={() =>
            demo.mutate(undefined, {
              onSuccess: (analysis) => router.push(`/analysis/${analysis.id}`),
            })
          }
        >
          {demo.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <FlaskConical aria-hidden />
          )}
          Open demo case
        </Button>
      </SurfaceHeader>

      <form onSubmit={handleSubmit}>
        <SurfaceBody className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              acceptFile(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "rounded-lg border border-dashed px-4 py-7 text-center transition-colors duration-150",
              dragging
                ? "border-accent bg-accent-soft"
                : file
                  ? "border-accent-line bg-surface-muted"
                  : "border-line-strong bg-surface-muted hover:border-ink-soft",
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept={extensions.join(",")}
              className="sr-only"
              onChange={(event) => acceptFile(event.target.files?.[0])}
            />
            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex size-9 items-center justify-center rounded-md border border-accent-line bg-accent-soft">
                  <FileUp className="size-4 text-accent" aria-hidden />
                </span>
                <p className="max-w-full truncate text-sm font-medium text-ink" title={file.name}>
                  {file.name}
                </p>
                <p className="font-mono text-xs text-ink-muted">{formatBytes(file.size)}</p>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-0.5"
                  onClick={() => {
                    setFile(null);
                    setProgress(0);
                    setFileError(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                  disabled={busy}
                >
                  <X aria-hidden />
                  Choose a different image
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex size-9 items-center justify-center rounded-md border border-line bg-surface">
                  <Upload className="size-4 text-ink-soft" aria-hidden />
                </span>
                <p className="text-sm font-medium text-ink">Drop an evidence image here</p>
                <p className="text-xs text-ink-muted">
                  {extensions.join(" · ")} up to {formatBytes(maxBytes, 0)}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-1"
                  onClick={() => inputRef.current?.click()}
                >
                  Browse files
                </Button>
              </div>
            )}
          </div>
          <FieldError>{fileError}</FieldError>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2" disabled={busy}>
            <legend className="mb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-soft">
              Evidence record
            </legend>
            <div className="space-y-1">
              <Label htmlFor="case_id">Case identifier</Label>
              <Input
                id="case_id"
                value={metadata.case_id ?? ""}
                placeholder="CASE-2024-0142"
                onChange={(event) => setMetadata({ ...metadata, case_id: event.target.value })}
              />
              <FieldError>{fieldErrors.case_id}</FieldError>
            </div>
            <div className="space-y-1">
              <Label htmlFor="examiner">Examiner</Label>
              <Input
                id="examiner"
                value={metadata.examiner ?? ""}
                placeholder="J. Alvarez"
                onChange={(event) => setMetadata({ ...metadata, examiner: event.target.value })}
              />
              <FieldError>{fieldErrors.examiner}</FieldError>
            </div>
            <div className="space-y-1">
              <Label htmlFor="evidence_number">Evidence number</Label>
              <Input
                id="evidence_number"
                value={metadata.evidence_number ?? ""}
                placeholder="EX-001"
                onChange={(event) =>
                  setMetadata({ ...metadata, evidence_number: event.target.value })
                }
              />
              <FieldError>{fieldErrors.evidence_number}</FieldError>
            </div>
            <div className="space-y-1">
              <Label htmlFor="acquired_at">Acquired at</Label>
              <Input
                id="acquired_at"
                type="datetime-local"
                value={metadata.acquired_at ?? ""}
                onChange={(event) => setMetadata({ ...metadata, acquired_at: event.target.value })}
              />
              <FieldError>{fieldErrors.acquired_at}</FieldError>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="notes">Examiner notes</Label>
              <Textarea
                id="notes"
                value={metadata.notes ?? ""}
                placeholder="Chain-of-custody context, acquisition tool, write-blocker reference."
                onChange={(event) => setMetadata({ ...metadata, notes: event.target.value })}
              />
              <FieldError>{fieldErrors.notes}</FieldError>
            </div>
          </fieldset>

          {upload.isPending ? (
            <div className="space-y-1.5 rounded-md border border-accent-line bg-accent-soft p-3">
              <div className="flex items-center justify-between text-xs text-accent-ink">
                <span className="font-medium">
                  {progress < 100 ? "Transferring evidence image" : "Queued for parsing"}
                </span>
                <span className="tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} aria-label="Upload progress" />
              <p className="text-[11px] text-accent-ink/80">
                Parsing starts automatically once the transfer completes.
              </p>
            </div>
          ) : null}

          {upload.isError ? <ErrorState error={upload.error} onRetry={() => upload.reset()} /> : null}
          {demo.isError ? <ErrorState error={demo.error} onRetry={() => demo.reset()} /> : null}
          {meta.isError ? (
            <Notice tone="warning" icon={ShieldCheck}>
              Service limits could not be loaded, so the checks above use default values.
            </Notice>
          ) : null}
        </SurfaceBody>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="flex items-center gap-1.5 text-xs text-ink-soft">
            <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
            Read-only analysis. The source image is never modified.
          </p>
          <Button type="submit" variant="primary" size="sm" disabled={busy || !file}>
            {upload.isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Upload aria-hidden />
            )}
            Start examination
          </Button>
        </footer>
      </form>
    </Surface>
  );
}
