const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (value < 1024) return `${value} B`;
  let size = value;
  let index = 0;
  while (size >= 1024 && index < BYTE_UNITS.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(fractionDigits)} ${BYTE_UNITS[index]}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US");
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatHex(value: number | null | undefined, width = 8): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

export function formatOffset(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `${formatHex(value)} (${formatNumber(value)})`;
}

export function formatFsTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(
    parsed.getHours(),
  )}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

export function formatAbsoluteTime(value: string | null | undefined): string {
  if (!value) return "-";
  const normalised = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const parsed = new Date(normalised);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value: string | null | undefined, now = Date.now()): string {
  if (!value) return "-";
  const normalised = value.endsWith("Z") || value.includes("+") ? value : `${value}Z`;
  const parsed = new Date(normalised).getTime();
  if (Number.isNaN(parsed)) return "-";
  const deltaSeconds = Math.round((parsed - now) / 1000);
  const absolute = Math.abs(deltaSeconds);
  if (absolute < 45) return "just now";
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (absolute < 3600) return formatter.format(Math.round(deltaSeconds / 60), "minute");
  if (absolute < 86400) return formatter.format(Math.round(deltaSeconds / 3600), "hour");
  return formatter.format(Math.round(deltaSeconds / 86400), "day");
}

export function formatDuration(milliseconds: number | null | undefined): string {
  if (milliseconds === null || milliseconds === undefined) return "-";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  const seconds = milliseconds / 1000;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}

export function truncateMiddle(value: string, max = 42): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(value.length - tail)}`;
}

export function shortHash(value: string | null | undefined, size = 12): string {
  if (!value) return "-";
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}

export function expandClusterRuns(runs: number[][], limit = 4096): number[] {
  const clusters: number[] = [];
  for (const run of runs) {
    if (run.length !== 2) continue;
    const [start, length] = run;
    for (let index = 0; index < length; index += 1) {
      if (clusters.length >= limit) return clusters;
      clusters.push(start + index);
    }
  }
  return clusters;
}

export function totalClusters(runs: number[][]): number {
  return runs.reduce((accumulator, run) => accumulator + (run[1] ?? 0), 0);
}

export function decodeBase64(value: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }
  return Uint8Array.from(Buffer.from(value, "base64"));
}

export function toAsciiGlyph(byte: number): string {
  return byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : ".";
}
