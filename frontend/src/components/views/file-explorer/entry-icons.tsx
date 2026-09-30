"use client";

import {
  File,
  FileArchive,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  Tag,
  Terminal,
} from "lucide-react";
import { createElement, type ComponentType } from "react";

import type { FsEntry, TreeNode } from "@/lib/api/schemas";

type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

const EXTENSION_ICONS: Record<string, IconComponent> = {
  txt: FileText,
  log: FileText,
  rtf: FileText,
  md: FileText,
  json: FileJson,
  xml: FileCode2,
  html: FileCode2,
  htm: FileCode2,
  csv: FileSpreadsheet,
  xls: FileSpreadsheet,
  jpg: FileImage,
  jpeg: FileImage,
  png: FileImage,
  gif: FileImage,
  bmp: FileImage,
  zip: FileArchive,
  rar: FileArchive,
  gz: FileArchive,
  sys: Terminal,
  bat: Terminal,
  cfg: Terminal,
  ini: Terminal,
};

export function entryIcon(
  entry: Pick<FsEntry, "is_directory" | "is_volume_label" | "extension">,
): IconComponent {
  if (entry.is_volume_label) return Tag;
  if (entry.is_directory) return Folder;
  return EXTENSION_ICONS[entry.extension] ?? File;
}

export function nodeIcon(node: Pick<TreeNode, "is_directory">, expanded: boolean): IconComponent {
  if (node.is_directory) return expanded ? FolderOpen : Folder;
  return File;
}

export function entryIconTone(entry: Pick<FsEntry, "is_deleted" | "is_directory">): string {
  if (entry.is_deleted) return "text-high";
  if (entry.is_directory) return "text-accent";
  return "text-ink-soft";
}

export function EntryIcon({
  entry,
  className,
}: {
  entry: Pick<FsEntry, "is_directory" | "is_volume_label" | "extension">;
  className?: string;
}) {
  return createElement(entryIcon(entry), { className, "aria-hidden": true });
}

export function NodeIcon({
  node,
  expanded,
  className,
}: {
  node: Pick<TreeNode, "is_directory">;
  expanded: boolean;
  className?: string;
}) {
  return createElement(nodeIcon(node, expanded), { className, "aria-hidden": true });
}
