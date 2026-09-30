import { absoluteUrl, http, normaliseError, request } from "./client";
import {
  analysisListSchema,
  analysisStatusResponseSchema,
  analysisSummarySchema,
  clusterDetailSchema,
  clusterMapSchema,
  entryListSchema,
  entrySchema,
  findingListSchema,
  geometryResponseSchema,
  healthSchema,
  hexSchema,
  metaSchema,
  previewSchema,
  recoveryListSchema,
  recoveryResultSchema,
  summarySchema,
  timelineSchema,
  type AnalysisList,
  type AnalysisStatusResponse,
  type AnalysisSummary,
  type ClusterDetail,
  type ClusterMap,
  type EntryList,
  type EvidenceMetadata,
  type FindingList,
  type FsEntry,
  type GeometryResponse,
  type Health,
  type HexWindow,
  type Meta,
  type Preview,
  type RecoveryList,
  type RecoveryResult,
  type Summary,
  type Timeline,
} from "./schemas";
import { treeSchema, type TreeResponse } from "./schemas";

export type EntryQuery = {
  page?: number;
  page_size?: number;
  search?: string;
  entry_type?: "all" | "file" | "directory";
  entry_status?:
    | "all"
    | "allocated"
    | "deleted"
    | "hidden"
    | "fragmented"
    | "damaged"
    | "slack"
    | "recoverable";
  parent_entry_id?: number;
  extension?: string;
  min_size?: number;
  max_size?: number;
  sort?: string;
  order?: "asc" | "desc";
};

export type FindingQuery = {
  page?: number;
  page_size?: number;
  severity?: string;
  category?: string;
  search?: string;
};

export type ClusterQuery = {
  offset?: number;
  limit?: number;
  state?: string;
};

export type TimelineQuery = {
  granularity?: "hour" | "day" | "month";
  kinds?: string;
  page?: number;
  page_size?: number;
};

function clean<T extends Record<string, unknown>>(params: T): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== "" && value !== null),
  );
}

export const api = {
  health: () => request<Health>(healthSchema, { url: "/health" }),
  meta: () => request<Meta>(metaSchema, { url: "/meta" }),

  listAnalyses: (limit = 20, offset = 0) =>
    request<AnalysisList>(analysisListSchema, {
      url: "/analyses",
      params: { limit, offset },
    }),

  getAnalysis: (id: string) =>
    request<AnalysisSummary>(analysisSummarySchema, { url: `/analyses/${id}` }),

  getStatus: (id: string) =>
    request<AnalysisStatusResponse>(analysisStatusResponseSchema, {
      url: `/analyses/${id}/status`,
    }),

  deleteAnalysis: async (id: string) => {
    try {
      await http.delete(`/analyses/${id}`);
    } catch (error) {
      throw normaliseError(error);
    }
  },

  createDemoAnalysis: (metadata?: EvidenceMetadata) =>
    request<AnalysisSummary>(analysisSummarySchema, {
      url: "/analyses/demo",
      method: "POST",
      data: metadata ? clean(metadata as Record<string, unknown>) : {},
    }),

  uploadAnalysis: (
    file: File,
    metadata: EvidenceMetadata,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append("file", file);
    for (const [key, value] of Object.entries(metadata)) {
      if (typeof value === "string" && value.trim().length > 0) {
        form.append(key, value.trim());
      }
    }
    return request<AnalysisSummary>(analysisSummarySchema, {
      url: "/analyses",
      method: "POST",
      data: form,
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (event) => {
        if (!onProgress) return;
        const total = event.total ?? file.size;
        if (!total) return;
        onProgress(Math.min(100, Math.round((event.loaded / total) * 100)));
      },
    });
  },

  getSummary: (id: string) => request<Summary>(summarySchema, { url: `/analyses/${id}/summary` }),

  getGeometry: (id: string) =>
    request<GeometryResponse>(geometryResponseSchema, { url: `/analyses/${id}/geometry` }),

  listEntries: (id: string, query: EntryQuery = {}) =>
    request<EntryList>(entryListSchema, {
      url: `/analyses/${id}/entries`,
      params: clean(query as Record<string, unknown>),
    }),

  getEntry: (id: string, entryId: number) =>
    request<FsEntry>(entrySchema, { url: `/analyses/${id}/entries/${entryId}` }),

  getTree: (id: string, parentEntryId?: number) =>
    request<TreeResponse>(treeSchema, {
      url: `/analyses/${id}/tree`,
      params: clean({ parent_entry_id: parentEntryId }),
    }),

  listFindings: (id: string, query: FindingQuery = {}) =>
    request<FindingList>(findingListSchema, {
      url: `/analyses/${id}/findings`,
      params: clean(query as Record<string, unknown>),
    }),

  getClusterMap: (id: string, query: ClusterQuery = {}) =>
    request<ClusterMap>(clusterMapSchema, {
      url: `/analyses/${id}/clusters`,
      params: clean(query as Record<string, unknown>),
    }),

  getFullClusterMap: async (id: string, maxPages = 8): Promise<ClusterMap> => {
    const pageSize = 20_000;
    const first = await api.getClusterMap(id, { offset: 0, limit: pageSize });
    const ranges = [...first.ranges];
    let pages = 1;
    while (ranges.length < first.total_ranges && pages < maxPages) {
      const next = await api.getClusterMap(id, { offset: ranges.length, limit: pageSize });
      if (next.ranges.length === 0) break;
      ranges.push(...next.ranges);
      pages += 1;
    }
    return { ...first, ranges, offset: 0, limit: ranges.length };
  },

  getCluster: (id: string, cluster: number) =>
    request<ClusterDetail>(clusterDetailSchema, { url: `/analyses/${id}/clusters/${cluster}` }),

  getTimeline: (id: string, query: TimelineQuery = {}) =>
    request<Timeline>(timelineSchema, {
      url: `/analyses/${id}/timeline`,
      params: clean(query as Record<string, unknown>),
    }),

  getHex: (id: string, offset: number, length: number) =>
    request<HexWindow>(hexSchema, {
      url: `/analyses/${id}/hex`,
      params: { offset, length },
    }),

  getPreview: (id: string, entryId: number) =>
    request<Preview>(previewSchema, { url: `/analyses/${id}/entries/${entryId}/preview` }),

  listRecoveries: (id: string) =>
    request<RecoveryList>(recoveryListSchema, { url: `/analyses/${id}/recoveries` }),

  recoverEntries: (id: string, entryIds: number[]) =>
    request<RecoveryResult>(recoveryResultSchema, {
      url: `/analyses/${id}/recover`,
      method: "POST",
      data: { entry_ids: entryIds },
    }),

  reportUrl: (id: string, format: "json" | "csv" | "pdf") =>
    absoluteUrl(`/analyses/${id}/reports/${format}`),

  downloadUrl: (path: string) => absoluteUrl(path),
};
