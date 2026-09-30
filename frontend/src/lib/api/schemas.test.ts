import { describe, expect, it } from "vitest";

import {
  analysisSummarySchema,
  clusterMapSchema,
  entrySchema,
  evidenceMetadataSchema,
  findingSchema,
} from "./schemas";

const baseAnalysis = {
  id: "0d1a5b1e-2a2f-4c25-9d64-0b86f2b1e0a1",
  original_filename: "case.img",
  size_bytes: 35177472,
  image_sha256: "f".repeat(64),
  is_demo: false,
  status: "completed",
  progress: 100,
  stage: "Analysis complete",
  error_message: null,
  error_hint: null,
  case_id: "CASE-2024-0142",
  examiner: "J. Alvarez",
  evidence_number: "EX-001",
  acquired_at: "2024-03-15T09:12:34",
  notes: null,
  created_at: "2024-03-15T09:20:00",
  updated_at: "2024-03-15T09:20:04",
  started_at: "2024-03-15T09:20:01",
  completed_at: "2024-03-15T09:20:04",
  expires_at: "2024-03-16T09:20:00",
  duration_ms: 412,
  entry_count: 26,
  finding_count: 15,
  severity_counts: { critical: 1, high: 4, medium: 3, low: 6, info: 1 },
};

describe("analysisSummarySchema", () => {
  it("accepts a completed analysis", () => {
    const parsed = analysisSummarySchema.parse(baseAnalysis);
    expect(parsed.severity_counts.critical).toBe(1);
    expect(parsed.status).toBe("completed");
  });

  it("fills missing severity buckets with zero", () => {
    const parsed = analysisSummarySchema.parse({
      ...baseAnalysis,
      severity_counts: { critical: 2 },
    });
    expect(parsed.severity_counts).toEqual({
      critical: 2,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    });
  });

  it("rejects an unknown status", () => {
    expect(() => analysisSummarySchema.parse({ ...baseAnalysis, status: "paused" })).toThrow();
  });
});

describe("entrySchema", () => {
  const entry = {
    entry_id: 14,
    parent_entry_id: null,
    depth: 0,
    path: "/Suspect Interview Transcript.rtf",
    parent_path: "/",
    name: "Suspect Interview Transcript.rtf",
    short_name: "SUSPEC~1.RTF",
    long_name: "Suspect Interview Transcript.rtf",
    long_name_valid: true,
    long_name_entries: 3,
    recovered_first_char: "S",
    extension: "rtf",
    is_directory: false,
    is_deleted: true,
    is_volume_label: false,
    is_residual: false,
    is_hidden: false,
    is_system: false,
    is_read_only: false,
    is_archive: true,
    attributes: 32,
    attribute_list: ["archive"],
    first_cluster: 128,
    size_bytes: 2570,
    allocated_bytes: 0,
    cluster_count: 0,
    fragment_count: 0,
    is_fragmented: false,
    chain_status: "empty",
    cluster_runs: [],
    chain_complete: true,
    slack_bytes: 0,
    slack_nonzero: false,
    slack_preview: null,
    data_offset: 1114112,
    directory_entry_offset: 1113600,
    created_at: "2024-03-17T15:18:06.000",
    modified_at: "2024-03-17T19:55:40.000",
    accessed_at: "2024-03-21T00:00:00.000",
    content_sha256: null,
    child_count: 0,
    recoverable: true,
    recovery_rating: "high",
    recovery_confidence: 0.9,
    recovery_reasons: ["Every cluster in the expected contiguous run is still marked free."],
    recovery_method: "contiguous_run",
    recovery_cluster_runs: [[128, 6]],
    recovery_cluster_count: 6,
    issues: [],
  };

  it("parses a deleted entry with recovery metadata", () => {
    const parsed = entrySchema.parse(entry);
    expect(parsed.recoverable).toBe(true);
    expect(parsed.recovery_cluster_runs[0]).toEqual([128, 6]);
  });

  it("rejects an entry missing required fields", () => {
    const incomplete: Record<string, unknown> = { ...entry };
    delete incomplete.first_cluster;
    expect(() => entrySchema.parse(incomplete)).toThrow();
  });
});

describe("findingSchema", () => {
  it("parses a finding with details", () => {
    const parsed = findingSchema.parse({
      id: 3,
      code: "CROSS_LINKED_CLUSTERS",
      title: "Clusters are claimed by more than one file",
      severity: "critical",
      category: "allocation",
      description: "11 clusters are referenced by multiple cluster chains.",
      recommendation: "Treat every file touching these clusters as unreliable.",
      entry_id: null,
      entry_path: null,
      cluster: 120,
      details: { count: 11 },
    });
    expect(parsed.severity).toBe("critical");
    expect(parsed.details.count).toBe(11);
  });
});

describe("clusterMapSchema", () => {
  it("parses compressed ranges", () => {
    const parsed = clusterMapSchema.parse({
      cluster_count: 65600,
      bytes_per_cluster: 512,
      first_cluster: 2,
      last_cluster: 65601,
      data_start_offset: 1590272,
      state_counts: { free: 65455, allocated: 117, bad: 3 },
      total_ranges: 2,
      offset: 0,
      limit: 6000,
      ranges: [
        { start: 2, end: 5, length: 4, state: "allocated", entry_id: 1 },
        { start: 6, end: 65601, length: 65596, state: "free", entry_id: null },
      ],
    });
    expect(parsed.ranges).toHaveLength(2);
    expect(parsed.ranges[1].state).toBe("free");
  });

  it("rejects an unknown cluster state", () => {
    expect(() =>
      clusterMapSchema.parse({
        cluster_count: 1,
        bytes_per_cluster: 512,
        first_cluster: 2,
        last_cluster: 2,
        data_start_offset: 0,
        state_counts: {},
        total_ranges: 1,
        offset: 0,
        limit: 1,
        ranges: [{ start: 2, end: 2, length: 1, state: "molten", entry_id: null }],
      }),
    ).toThrow();
  });
});

describe("evidenceMetadataSchema", () => {
  it("accepts empty optional metadata", () => {
    expect(evidenceMetadataSchema.parse({})).toEqual({});
  });

  it("rejects an overlong case identifier", () => {
    const result = evidenceMetadataSchema.safeParse({ case_id: "x".repeat(200) });
    expect(result.success).toBe(false);
  });
});
