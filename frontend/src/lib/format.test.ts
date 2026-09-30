import { describe, expect, it } from "vitest";

import {
  decodeBase64,
  expandClusterRuns,
  formatBytes,
  formatDuration,
  formatFsTimestamp,
  formatHex,
  formatNumber,
  formatOffset,
  formatPercent,
  formatRelativeTime,
  shortHash,
  toAsciiGlyph,
  totalClusters,
  truncateMiddle,
} from "./format";

describe("formatBytes", () => {
  it("keeps byte precision below one kibibyte", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(511)).toBe("511 B");
  });

  it("scales to larger units", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(35_177_472)).toBe("33.5 MB");
  });

  it("returns a dash for missing values", () => {
    expect(formatBytes(null)).toBe("-");
    expect(formatBytes(undefined)).toBe("-");
  });
});

describe("numeric formatters", () => {
  it("groups thousands", () => {
    expect(formatNumber(65600)).toBe("65,600");
    expect(formatNumber(null)).toBe("-");
  });

  it("renders percentages and hexadecimal offsets", () => {
    expect(formatPercent(0.1825, 2)).toBe("0.18%");
    expect(formatHex(1048576)).toBe("0x00100000");
    expect(formatHex(255, 2)).toBe("0xFF");
    expect(formatOffset(1048576)).toBe("0x00100000 (1,048,576)");
  });

  it("formats durations", () => {
    expect(formatDuration(120)).toBe("120 ms");
    expect(formatDuration(1500)).toBe("1.50 s");
    expect(formatDuration(95_000)).toBe("1m 35s");
    expect(formatDuration(null)).toBe("-");
  });
});

describe("timestamp formatters", () => {
  it("renders FAT timestamps without a timezone shift", () => {
    expect(formatFsTimestamp("2024-03-15T09:12:34.000")).toBe("2024-03-15 09:12:34");
    expect(formatFsTimestamp(null)).toBe("-");
  });

  it("renders relative times against a fixed clock", () => {
    const now = Date.parse("2024-03-15T12:00:00Z");
    expect(formatRelativeTime("2024-03-15T11:30:00Z", now)).toBe("30 minutes ago");
    expect(formatRelativeTime("2024-03-15T14:00:00Z", now)).toBe("in 2 hours");
  });
});

describe("string helpers", () => {
  it("truncates long paths in the middle", () => {
    expect(truncateMiddle("short.txt", 20)).toBe("short.txt");
    const result = truncateMiddle("/EVIDENCE/CASE-2024/interview-transcript.rtf", 21);
    expect(result).toHaveLength(21);
    expect(result).toContain("…");
  });

  it("shortens hashes for display", () => {
    expect(shortHash("a".repeat(64), 8)).toBe(`${"a".repeat(8)}…${"a".repeat(8)}`);
    expect(shortHash(null)).toBe("-");
  });
});

describe("cluster helpers", () => {
  it("expands run-length encoded chains", () => {
    expect(expandClusterRuns([[10, 3], [20, 1]])).toEqual([10, 11, 12, 20]);
  });

  it("respects the expansion limit", () => {
    expect(expandClusterRuns([[2, 5000]], 10)).toHaveLength(10);
  });

  it("totals clusters without expanding", () => {
    expect(totalClusters([[10, 3], [20, 1], [40, 26]])).toBe(30);
  });
});

describe("binary helpers", () => {
  it("decodes base64 payloads to bytes", () => {
    expect(Array.from(decodeBase64("SEVMTE8="))).toEqual([72, 69, 76, 76, 79]);
  });

  it("maps non printable bytes to a placeholder", () => {
    expect(toAsciiGlyph(0x41)).toBe("A");
    expect(toAsciiGlyph(0x00)).toBe(".");
    expect(toAsciiGlyph(0xff)).toBe(".");
  });
});
