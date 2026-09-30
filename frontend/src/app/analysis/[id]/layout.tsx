"use client";

import { useParams } from "next/navigation";

import { AnalysisShell } from "@/components/layout/analysis-shell";

export default function AnalysisLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ id: string }>();
  return <AnalysisShell id={params.id}>{children}</AnalysisShell>;
}
