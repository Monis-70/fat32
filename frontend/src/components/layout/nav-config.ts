"use client";

import {
  Activity,
  Binary,
  CircleAlert,
  FileText,
  Grid3x3,
  LayoutDashboard,
  LifeBuoy,
  Table2,
} from "lucide-react";

export type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  blurb: string;
};

export function analysisNav(id: string): NavItem[] {
  return [
    {
      key: "overview",
      label: "Overview",
      href: `/analysis/${id}`,
      icon: LayoutDashboard,
      exact: true,
      blurb: "Evidence identity, volume facts and headline conclusions",
    },
    {
      key: "files",
      label: "File Explorer",
      href: `/analysis/${id}/files`,
      icon: Table2,
      blurb: "Browse every directory entry recovered from the volume",
    },
    {
      key: "findings",
      label: "Findings",
      href: `/analysis/${id}/findings`,
      icon: CircleAlert,
      blurb: "Triage queue of structural and content anomalies",
    },
    {
      key: "clusters",
      label: "Cluster Map",
      href: `/analysis/${id}/clusters`,
      icon: Grid3x3,
      blurb: "Allocation state of every cluster on the volume",
    },
    {
      key: "timeline",
      label: "Timeline",
      href: `/analysis/${id}/timeline`,
      icon: Activity,
      blurb: "Created, modified and accessed filesystem events",
    },
    {
      key: "hex",
      label: "Hex Viewer",
      href: `/analysis/${id}/hex`,
      icon: Binary,
      blurb: "Bounded read-only view of the raw image bytes",
    },
    {
      key: "recovery",
      label: "Recovery",
      href: `/analysis/${id}/recovery`,
      icon: LifeBuoy,
      blurb: "Carve deleted entries with confidence scoring",
    },
    {
      key: "reports",
      label: "Reports",
      href: `/analysis/${id}/reports`,
      icon: FileText,
      blurb: "Export the examination as JSON, CSV or PDF",
    },
  ];
}

export const PAGE_TITLES: Record<string, { title: string; description: string }> = {
  overview: {
    title: "Overview",
    description: "What this evidence image is, and what the parser concluded about it.",
  },
  files: {
    title: "File Explorer",
    description: "Every directory entry recovered from the volume, including deleted records.",
  },
  findings: {
    title: "Findings",
    description: "Anomalies detected while parsing, ordered by how much they affect the evidence.",
  },
  clusters: {
    title: "Cluster Map",
    description: "How the volume's storage is allocated, cluster by cluster.",
  },
  timeline: {
    title: "Timeline",
    description: "Filesystem timestamps decoded from directory entries.",
  },
  hex: {
    title: "Hex Viewer",
    description: "Raw bytes read directly from the evidence image.",
  },
  recovery: {
    title: "Recovery",
    description: "Deleted entries assessed for recoverability, with carved downloads.",
  },
  reports: {
    title: "Reports",
    description: "Export the complete examination for case files and external tooling.",
  },
};

export function routeKeyFromPath(pathname: string, id: string): string {
  const base = `/analysis/${id}`;
  if (pathname === base) return "overview";
  const rest = pathname.slice(base.length + 1).split("/")[0];
  return rest || "overview";
}
