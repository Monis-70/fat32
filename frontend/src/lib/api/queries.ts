"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  api,
  type ClusterQuery,
  type EntryQuery,
  type FindingQuery,
  type TimelineQuery,
} from "./endpoints";
import type { EvidenceMetadata } from "./schemas";

export const queryKeys = {
  health: ["health"] as const,
  meta: ["meta"] as const,
  analyses: (limit: number, offset: number) => ["analyses", limit, offset] as const,
  analysis: (id: string) => ["analysis", id] as const,
  status: (id: string) => ["analysis", id, "status"] as const,
  summary: (id: string) => ["analysis", id, "summary"] as const,
  geometry: (id: string) => ["analysis", id, "geometry"] as const,
  entries: (id: string, query: EntryQuery) => ["analysis", id, "entries", query] as const,
  entry: (id: string, entryId: number) => ["analysis", id, "entry", entryId] as const,
  tree: (id: string, parentId: number | null) => ["analysis", id, "tree", parentId] as const,
  findings: (id: string, query: FindingQuery) => ["analysis", id, "findings", query] as const,
  clusters: (id: string, query: ClusterQuery) => ["analysis", id, "clusters", query] as const,
  cluster: (id: string, cluster: number) => ["analysis", id, "cluster", cluster] as const,
  timeline: (id: string, query: TimelineQuery) => ["analysis", id, "timeline", query] as const,
  hex: (id: string, offset: number, length: number) =>
    ["analysis", id, "hex", offset, length] as const,
  preview: (id: string, entryId: number) => ["analysis", id, "preview", entryId] as const,
  recoveries: (id: string) => ["analysis", id, "recoveries"] as const,
};

const RETRY_LIMIT = 1;

export const OFFLINE_RETRY_MS = 5_000;

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health,
    queryFn: api.health,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    retry: RETRY_LIMIT,
    staleTime: 10_000,
  });
}

export function useMeta() {
  return useQuery({
    queryKey: queryKeys.meta,
    queryFn: api.meta,
    staleTime: 5 * 60_000,
    retry: RETRY_LIMIT,
  });
}

export function useAnalyses(limit = 12, offset = 0) {
  return useQuery({
    queryKey: queryKeys.analyses(limit, offset),
    queryFn: () => api.listAnalyses(limit, offset),
    refetchInterval: 8_000,
    refetchIntervalInBackground: true,
    retry: RETRY_LIMIT,
  });
}

export function useAnalysis(id: string) {
  return useQuery({
    queryKey: queryKeys.analysis(id),
    queryFn: () => api.getAnalysis(id),
    retry: RETRY_LIMIT,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      if (query.state.status === "error") return OFFLINE_RETRY_MS;
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 1_200 : false;
    },
  });
}

export function useAnalysisStatus(id: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.status(id),
    queryFn: () => api.getStatus(id),
    enabled,
    retry: RETRY_LIMIT,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      if (query.state.status === "error") return OFFLINE_RETRY_MS;
      const status = query.state.data?.status;
      return status === "queued" || status === "running" ? 900 : false;
    },
  });
}

export function useSummary(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.summary(id),
    queryFn: () => api.getSummary(id),
    enabled,
    retry: RETRY_LIMIT,
    staleTime: 60_000,
  });
}

export function useGeometry(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.geometry(id),
    queryFn: () => api.getGeometry(id),
    enabled,
    retry: RETRY_LIMIT,
    staleTime: 60_000,
  });
}

export function useEntries(id: string, query: EntryQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.entries(id, query),
    queryFn: () => api.listEntries(id, query),
    enabled,
    retry: RETRY_LIMIT,
    placeholderData: (previous) => previous,
  });
}

export function useEntry(id: string, entryId: number | null) {
  return useQuery({
    queryKey: queryKeys.entry(id, entryId ?? 0),
    queryFn: () => api.getEntry(id, entryId as number),
    enabled: entryId !== null,
    retry: RETRY_LIMIT,
  });
}

export function useTree(id: string, parentId: number | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.tree(id, parentId),
    queryFn: () => api.getTree(id, parentId ?? undefined),
    enabled,
    retry: RETRY_LIMIT,
    staleTime: 60_000,
  });
}

export function useFindings(id: string, query: FindingQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.findings(id, query),
    queryFn: () => api.listFindings(id, query),
    enabled,
    retry: RETRY_LIMIT,
    placeholderData: (previous) => previous,
  });
}

export function useClusterMap(id: string, query: ClusterQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clusters(id, query),
    queryFn: () => api.getClusterMap(id, query),
    enabled,
    retry: RETRY_LIMIT,
    staleTime: 60_000,
  });
}

export function useFullClusterMap(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.clusters(id, { limit: 0, offset: 0 }),
    queryFn: () => api.getFullClusterMap(id),
    enabled,
    retry: RETRY_LIMIT,
    staleTime: 5 * 60_000,
  });
}

export function useCluster(id: string, cluster: number | null) {
  return useQuery({
    queryKey: queryKeys.cluster(id, cluster ?? 0),
    queryFn: () => api.getCluster(id, cluster as number),
    enabled: cluster !== null,
    retry: RETRY_LIMIT,
  });
}

export function useTimeline(id: string, query: TimelineQuery, enabled = true) {
  return useQuery({
    queryKey: queryKeys.timeline(id, query),
    queryFn: () => api.getTimeline(id, query),
    enabled,
    retry: RETRY_LIMIT,
    placeholderData: (previous) => previous,
  });
}

export function useHexWindow(id: string, offset: number, length: number, enabled = true) {
  return useQuery({
    queryKey: queryKeys.hex(id, offset, length),
    queryFn: () => api.getHex(id, offset, length),
    enabled,
    retry: RETRY_LIMIT,
    placeholderData: (previous) => previous,
  });
}

export function usePreview(id: string, entryId: number | null) {
  return useQuery({
    queryKey: queryKeys.preview(id, entryId ?? 0),
    queryFn: () => api.getPreview(id, entryId as number),
    enabled: entryId !== null,
    retry: RETRY_LIMIT,
  });
}

export function useRecoveries(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.recoveries(id),
    queryFn: () => api.listRecoveries(id),
    enabled,
    retry: RETRY_LIMIT,
  });
}

export function useRecoverEntries(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (entryIds: number[]) => api.recoverEntries(id, entryIds),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.recoveries(id) });
    },
  });
}

export function useCreateDemoAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (metadata?: EvidenceMetadata) => api.createDemoAnalysis(metadata),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["analyses"] });
    },
  });
}

export function useUploadAnalysis(onProgress?: (percent: number) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: EvidenceMetadata }) =>
      api.uploadAnalysis(file, metadata, onProgress),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["analyses"] });
    },
  });
}

export function useDeleteAnalysis() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteAnalysis(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["analyses"] });
    },
  });
}
