import { z } from "zod";

export const severitySchema = z.enum(["critical", "high", "medium", "low", "info"]);
export type Severity = z.infer<typeof severitySchema>;

export const clusterStateSchema = z.enum([
  "free",
  "allocated",
  "reserved",
  "bad",
  "orphaned",
  "crosslinked",
  "looped",
]);
export type ClusterState = z.infer<typeof clusterStateSchema>;

export const analysisStatusSchema = z.enum(["queued", "running", "completed", "failed"]);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

const severityCounts = z.record(z.string(), z.number()).transform((value) => ({
  critical: value.critical ?? 0,
  high: value.high ?? 0,
  medium: value.medium ?? 0,
  low: value.low ?? 0,
  info: value.info ?? 0,
}));

const clusterStateCounts = z.record(z.string(), z.number()).transform((value) => ({
  free: value.free ?? 0,
  allocated: value.allocated ?? 0,
  reserved: value.reserved ?? 0,
  bad: value.bad ?? 0,
  orphaned: value.orphaned ?? 0,
  crosslinked: value.crosslinked ?? 0,
  looped: value.looped ?? 0,
}));

export type ClusterStateCounts = z.infer<typeof clusterStateCounts>;

export const healthSchema = z.object({
  status: z.literal("ok"),
  service: z.string(),
  version: z.string(),
  api_version: z.string(),
  server_time: z.string(),
  uptime_seconds: z.number(),
  database: z.enum(["ok", "unavailable"]),
});
export type Health = z.infer<typeof healthSchema>;

export const metaSchema = z.object({
  name: z.string(),
  description: z.string(),
  version: z.string(),
  api_version: z.string(),
  read_only: z.boolean(),
  supported_extensions: z.array(z.string()),
  supported_containers: z.array(z.string()),
  limits: z.object({
    max_upload_bytes: z.number(),
    max_upload_mb: z.number(),
    analysis_ttl_hours: z.number(),
    max_hex_read_bytes: z.number(),
    max_preview_bytes: z.number(),
    max_entries: z.number(),
    max_clusters: z.number(),
  }),
  demo_image: z.object({
    filename: z.string(),
    container: z.string(),
    bytes_per_sector: z.number(),
    sectors_per_cluster: z.number(),
    cluster_count: z.number(),
    size_bytes: z.number(),
    partition_start_lba: z.number(),
    planted_conditions: z.array(z.string()),
  }),
  severities: z.array(severitySchema),
  cluster_states: z.array(clusterStateSchema),
});
export type Meta = z.infer<typeof metaSchema>;

export const analysisSummarySchema = z.object({
  id: z.string(),
  original_filename: z.string(),
  size_bytes: z.number(),
  image_sha256: z.string().nullable(),
  is_demo: z.boolean(),
  status: analysisStatusSchema,
  progress: z.number(),
  stage: z.string(),
  error_message: z.string().nullable(),
  error_hint: z.string().nullable(),
  case_id: z.string().nullable(),
  examiner: z.string().nullable(),
  evidence_number: z.string().nullable(),
  acquired_at: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  expires_at: z.string(),
  duration_ms: z.number().nullable(),
  entry_count: z.number(),
  finding_count: z.number(),
  severity_counts: severityCounts,
});
export type AnalysisSummary = z.infer<typeof analysisSummarySchema>;

export const analysisListSchema = z.object({
  items: z.array(analysisSummarySchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});
export type AnalysisList = z.infer<typeof analysisListSchema>;

export const analysisStatusResponseSchema = z.object({
  id: z.string(),
  status: analysisStatusSchema,
  progress: z.number(),
  stage: z.string(),
  error_message: z.string().nullable(),
  error_hint: z.string().nullable(),
  updated_at: z.string(),
  expires_at: z.string(),
});
export type AnalysisStatusResponse = z.infer<typeof analysisStatusResponseSchema>;

export const bootSectorSchema = z.object({
  jump_boot: z.string(),
  oem_name: z.string(),
  bytes_per_sector: z.number(),
  sectors_per_cluster: z.number(),
  reserved_sector_count: z.number(),
  num_fats: z.number(),
  root_entry_count: z.number(),
  total_sectors_16: z.number(),
  media_descriptor: z.number(),
  fat_size_16: z.number(),
  sectors_per_track: z.number(),
  number_of_heads: z.number(),
  hidden_sectors: z.number(),
  total_sectors_32: z.number(),
  fat_size_32: z.number(),
  ext_flags: z.number(),
  filesystem_version: z.string(),
  root_cluster: z.number(),
  fsinfo_sector: z.number(),
  backup_boot_sector: z.number(),
  drive_number: z.number(),
  extended_boot_signature: z.number(),
  volume_id: z.string(),
  volume_label: z.string(),
  filesystem_type: z.string(),
  boot_signature: z.number(),
  active_fat: z.number(),
  fat_mirroring_enabled: z.boolean(),
});
export type BootSector = z.infer<typeof bootSectorSchema>;

export const geometrySchema = z.object({
  bytes_per_sector: z.number(),
  sectors_per_cluster: z.number(),
  bytes_per_cluster: z.number(),
  reserved_sector_count: z.number(),
  num_fats: z.number(),
  fat_size_sectors: z.number(),
  fat_size_bytes: z.number(),
  fat_start_sector: z.number(),
  fat_start_offset: z.number(),
  data_start_sector: z.number(),
  data_start_offset: z.number(),
  total_sectors: z.number(),
  total_data_sectors: z.number(),
  cluster_count: z.number(),
  first_cluster: z.number(),
  last_cluster: z.number(),
  root_cluster: z.number(),
  volume_size_bytes: z.number(),
  data_size_bytes: z.number(),
  volume_offset: z.number(),
  fat_entry_count: z.number(),
});
export type Geometry = z.infer<typeof geometrySchema>;

export const partitionSchema = z.object({
  index: z.number(),
  bootable: z.boolean(),
  type_code: z.number(),
  type_name: z.string(),
  start_lba: z.number(),
  sector_count: z.number(),
  start_offset: z.number(),
  size_bytes: z.number(),
  is_fat32_candidate: z.boolean(),
  within_image: z.boolean(),
});
export type Partition = z.infer<typeof partitionSchema>;

export const statsSchema = z.object({
  entry_count: z.number(),
  file_count: z.number(),
  live_file_count: z.number(),
  directory_count: z.number(),
  deleted_count: z.number(),
  recoverable_count: z.number(),
  hidden_count: z.number(),
  system_count: z.number(),
  fragmented_count: z.number(),
  slack_entry_count: z.number(),
  slack_bytes_total: z.number(),
  residual_count: z.number(),
  logical_bytes: z.number(),
  allocated_bytes: z.number(),
  free_bytes: z.number(),
  used_percent: z.number(),
  earliest_timestamp: z.string().nullable(),
  latest_timestamp: z.string().nullable(),
  max_depth: z.number(),
  severity_counts: severityCounts,
  finding_count: z.number(),
});
export type Stats = z.infer<typeof statsSchema>;

export const summarySchema = z.object({
  analysis: analysisSummarySchema,
  image: z.object({
    size_bytes: z.number(),
    sha256: z.string(),
    container: z.string(),
    volume_offset: z.number(),
    partition_index: z.number().nullable(),
    partitions: z.array(partitionSchema),
  }),
  boot_sector: bootSectorSchema,
  boot_issues: z.array(z.string()),
  geometry: geometrySchema,
  geometry_issues: z.array(z.string()),
  backup_boot: z.object({
    backup_sector: z.number(),
    backup_present: z.boolean(),
    identical: z.boolean(),
    differing_byte_count: z.number(),
    first_difference_offsets: z.array(z.number()),
  }),
  fsinfo: z.object({
    present: z.boolean(),
    sector: z.number(),
    offset: z.number(),
    free_cluster_count: z.number().nullable(),
    next_free_cluster: z.number().nullable(),
    signatures_valid: z.boolean(),
    issues: z.array(z.string()),
    lead_signature_hex: z.string(),
    struct_signature_hex: z.string(),
    trail_signature_hex: z.string(),
  }),
  fsinfo_free_delta: z.number().nullable(),
  fat: z.object({
    copies: z.number(),
    entries_compared: z.number(),
    identical: z.boolean(),
    mismatched_entry_count: z.number(),
    mismatched_copies: z.array(z.number()),
    sample_differences: z.array(z.object({ cluster: z.number(), values: z.array(z.string()) })),
    media_descriptor: z.string(),
    end_marker: z.string(),
  }),
  cluster_state_counts: clusterStateCounts,
  stats: statsSchema,
  volume_label_root: z.string().nullable(),
  truncated: z.boolean(),
  truncation_reasons: z.array(z.string()),
});
export type Summary = z.infer<typeof summarySchema>;

export const geometryResponseSchema = z.object({
  geometry: geometrySchema,
  geometry_issues: z.array(z.string()),
  boot_sector: bootSectorSchema,
  partitions: z.array(partitionSchema),
  container: z.string(),
  volume_offset: z.number(),
});
export type GeometryResponse = z.infer<typeof geometryResponseSchema>;

export const entrySchema = z.object({
  entry_id: z.number(),
  parent_entry_id: z.number().nullable(),
  depth: z.number(),
  path: z.string(),
  parent_path: z.string(),
  name: z.string(),
  short_name: z.string(),
  long_name: z.string().nullable(),
  long_name_valid: z.boolean(),
  long_name_entries: z.number(),
  recovered_first_char: z.string().nullable(),
  extension: z.string(),
  is_directory: z.boolean(),
  is_deleted: z.boolean(),
  is_volume_label: z.boolean(),
  is_residual: z.boolean(),
  is_hidden: z.boolean(),
  is_system: z.boolean(),
  is_read_only: z.boolean(),
  is_archive: z.boolean(),
  attributes: z.number(),
  attribute_list: z.array(z.string()),
  first_cluster: z.number(),
  size_bytes: z.number(),
  allocated_bytes: z.number(),
  cluster_count: z.number(),
  fragment_count: z.number(),
  is_fragmented: z.boolean(),
  chain_status: z.string(),
  cluster_runs: z.array(z.array(z.number())),
  chain_complete: z.boolean(),
  slack_bytes: z.number(),
  slack_nonzero: z.boolean(),
  slack_preview: z.string().nullable(),
  data_offset: z.number().nullable(),
  directory_entry_offset: z.number(),
  created_at: z.string().nullable(),
  modified_at: z.string().nullable(),
  accessed_at: z.string().nullable(),
  content_sha256: z.string().nullable(),
  child_count: z.number(),
  recoverable: z.boolean(),
  recovery_rating: z.string(),
  recovery_confidence: z.number(),
  recovery_reasons: z.array(z.string()),
  recovery_method: z.string().nullable(),
  recovery_cluster_runs: z.array(z.array(z.number())),
  recovery_cluster_count: z.number(),
  issues: z.array(z.string()),
});
export type FsEntry = z.infer<typeof entrySchema>;

export const entryListSchema = z.object({
  items: z.array(entrySchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  page_count: z.number(),
});
export type EntryList = z.infer<typeof entryListSchema>;

export const treeSchema = z.object({
  parent_entry_id: z.number().nullable(),
  parent_path: z.string(),
  items: z.array(
    z.object({
      entry_id: z.number(),
      name: z.string(),
      path: z.string(),
      is_directory: z.boolean(),
      is_deleted: z.boolean(),
      is_hidden: z.boolean(),
      is_system: z.boolean(),
      size_bytes: z.number(),
      child_count: z.number(),
      has_children: z.boolean(),
      chain_status: z.string(),
    }),
  ),
});
export type TreeResponse = z.infer<typeof treeSchema>;
export type TreeNode = TreeResponse["items"][number];

export const findingSchema = z.object({
  id: z.number(),
  code: z.string(),
  title: z.string(),
  severity: severitySchema,
  category: z.string(),
  description: z.string(),
  recommendation: z.string(),
  entry_id: z.number().nullable(),
  entry_path: z.string().nullable(),
  cluster: z.number().nullable(),
  details: z.record(z.string(), z.unknown()),
});
export type Finding = z.infer<typeof findingSchema>;

export const findingListSchema = z.object({
  items: z.array(findingSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
  page_count: z.number(),
  severity_counts: severityCounts,
  category_counts: z.record(z.string(), z.number()),
});
export type FindingList = z.infer<typeof findingListSchema>;

export const clusterRangeSchema = z.object({
  start: z.number(),
  end: z.number(),
  length: z.number(),
  state: clusterStateSchema,
  entry_id: z.number().nullable(),
});
export type ClusterRange = z.infer<typeof clusterRangeSchema>;

export const clusterMapSchema = z.object({
  cluster_count: z.number(),
  bytes_per_cluster: z.number(),
  first_cluster: z.number(),
  last_cluster: z.number(),
  data_start_offset: z.number(),
  state_counts: clusterStateCounts,
  total_ranges: z.number(),
  offset: z.number(),
  limit: z.number(),
  ranges: z.array(clusterRangeSchema),
});
export type ClusterMap = z.infer<typeof clusterMapSchema>;

export const clusterDetailSchema = z.object({
  cluster: z.number(),
  state: clusterStateSchema,
  offset: z.number(),
  size_bytes: z.number(),
  entry: entrySchema.nullable(),
  range_start: z.number(),
  range_end: z.number(),
});
export type ClusterDetail = z.infer<typeof clusterDetailSchema>;

export const timelineSchema = z.object({
  granularity: z.enum(["hour", "day", "month"]),
  buckets: z.array(
    z.object({
      bucket: z.string(),
      created: z.number(),
      modified: z.number(),
      accessed: z.number(),
      total: z.number(),
    }),
  ),
  events: z.array(
    z.object({
      entry_id: z.number(),
      path: z.string(),
      name: z.string(),
      kind: z.enum(["created", "modified", "accessed"]),
      timestamp: z.string(),
      is_directory: z.boolean(),
      is_deleted: z.boolean(),
      size_bytes: z.number(),
    }),
  ),
  total_events: z.number(),
  page: z.number(),
  page_size: z.number(),
  page_count: z.number(),
  earliest: z.string().nullable(),
  latest: z.string().nullable(),
});
export type Timeline = z.infer<typeof timelineSchema>;
export type TimelineEvent = Timeline["events"][number];

export const hexSchema = z.object({
  offset: z.number(),
  length: z.number(),
  image_size: z.number(),
  bytes_base64: z.string(),
  sha256: z.string(),
  truncated: z.boolean(),
});
export type HexWindow = z.infer<typeof hexSchema>;

export const previewSchema = z.object({
  entry_id: z.number(),
  name: z.string(),
  kind: z.enum(["text", "binary", "empty", "unavailable"]),
  reason: z.string().nullable(),
  encoding: z.string().nullable(),
  bytes_read: z.number(),
  size_bytes: z.number(),
  text: z.string().nullable(),
  bytes_base64: z.string().nullable(),
  data_offset: z.number().nullable(),
});
export type Preview = z.infer<typeof previewSchema>;

export const recoverySchema = z.object({
  id: z.string(),
  entry_id: z.number(),
  entry_path: z.string(),
  filename: z.string(),
  size_bytes: z.number(),
  declared_size_bytes: z.number(),
  confidence: z.number(),
  rating: z.string(),
  method: z.string(),
  sha256: z.string(),
  cluster_runs: z.array(z.array(z.number())),
  truncated: z.boolean(),
  created_at: z.string(),
  download_url: z.string(),
});
export type RecoveryRecord = z.infer<typeof recoverySchema>;

export const recoveryListSchema = z.object({
  items: z.array(recoverySchema),
  total: z.number(),
});
export type RecoveryList = z.infer<typeof recoveryListSchema>;

export const recoveryResultSchema = z.object({
  created: z.array(recoverySchema),
  skipped: z.array(z.record(z.string(), z.unknown())),
});
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;

export const evidenceMetadataSchema = z.object({
  case_id: z
    .string()
    .trim()
    .max(120, "Case identifier must be 120 characters or fewer")
    .optional()
    .or(z.literal("")),
  examiner: z
    .string()
    .trim()
    .max(120, "Examiner must be 120 characters or fewer")
    .optional()
    .or(z.literal("")),
  evidence_number: z
    .string()
    .trim()
    .max(120, "Evidence number must be 120 characters or fewer")
    .optional()
    .or(z.literal("")),
  acquired_at: z
    .string()
    .trim()
    .max(40, "Acquisition timestamp must be 40 characters or fewer")
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .trim()
    .max(2000, "Notes must be 2000 characters or fewer")
    .optional()
    .or(z.literal("")),
});
export type EvidenceMetadata = z.infer<typeof evidenceMetadataSchema>;
