from __future__ import annotations

import csv
import io
from typing import Any

ENTRY_COLUMNS = [
    ("entry_id", "Entry ID"),
    ("path", "Path"),
    ("name", "Name"),
    ("short_name", "Short name"),
    ("long_name", "Long name"),
    ("long_name_valid", "Long name validated"),
    ("extension", "Extension"),
    ("type", "Type"),
    ("status", "Status"),
    ("attributes", "Attributes"),
    ("size_bytes", "Size bytes"),
    ("allocated_bytes", "Allocated bytes"),
    ("first_cluster", "First cluster"),
    ("cluster_count", "Cluster count"),
    ("fragment_count", "Fragment count"),
    ("chain_status", "Chain status"),
    ("slack_bytes", "Slack bytes"),
    ("slack_nonzero", "Slack non-zero"),
    ("data_offset", "Data offset"),
    ("directory_entry_offset", "Directory entry offset"),
    ("created_at", "Created"),
    ("modified_at", "Modified"),
    ("accessed_at", "Accessed"),
    ("content_sha256", "Content SHA-256"),
    ("recoverable", "Recoverable"),
    ("recovery_rating", "Recovery rating"),
    ("recovery_confidence", "Recovery confidence"),
    ("issues", "Issues"),
]

FINDING_COLUMNS = [
    ("severity", "Severity"),
    ("code", "Code"),
    ("category", "Category"),
    ("title", "Title"),
    ("entry_path", "Entry path"),
    ("cluster", "Cluster"),
    ("description", "Description"),
    ("recommendation", "Recommendation"),
]


def _entry_type(entry: dict[str, Any]) -> str:
    if entry.get("is_volume_label"):
        return "volume-label"
    if entry.get("is_directory"):
        return "directory"
    return "file"


def _entry_status(entry: dict[str, Any]) -> str:
    flags = []
    if entry.get("is_deleted"):
        flags.append("deleted")
    else:
        flags.append("allocated")
    if entry.get("is_residual"):
        flags.append("residual")
    if entry.get("is_fragmented"):
        flags.append("fragmented")
    if entry.get("slack_nonzero"):
        flags.append("slack")
    if entry.get("chain_status") not in ("ok", "empty"):
        flags.append(str(entry.get("chain_status")))
    return "|".join(flags)


def build_csv_report(payload: dict[str, Any]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    analysis = payload["analysis"]
    volume = payload.get("volume", {})
    geometry = volume.get("geometry", {})
    writer.writerow(["FATScope forensic analysis report"])
    writer.writerow(["Analysis ID", analysis["id"]])
    writer.writerow(["Evidence file", analysis["original_filename"]])
    writer.writerow(["Image SHA-256", analysis.get("image_sha256") or ""])
    writer.writerow(["Image size bytes", analysis.get("size_bytes") or 0])
    writer.writerow(["Case ID", analysis.get("case_id") or ""])
    writer.writerow(["Examiner", analysis.get("examiner") or ""])
    writer.writerow(["Evidence number", analysis.get("evidence_number") or ""])
    writer.writerow(["Acquired", analysis.get("acquired_at") or ""])
    writer.writerow(["Completed", str(analysis.get("completed_at") or "")])
    writer.writerow(["Bytes per cluster", geometry.get("bytes_per_cluster", "")])
    writer.writerow(["Cluster count", geometry.get("cluster_count", "")])
    writer.writerow([])
    writer.writerow(["FILESYSTEM ENTRIES"])
    writer.writerow([label for _, label in ENTRY_COLUMNS])
    for entry in payload["entries"]:
        row = []
        for key, _ in ENTRY_COLUMNS:
            if key == "type":
                row.append(_entry_type(entry))
            elif key == "status":
                row.append(_entry_status(entry))
            elif key == "attributes":
                row.append("|".join(entry.get("attribute_list") or []))
            elif key == "issues":
                row.append(" ".join(entry.get("issues") or []))
            else:
                value = entry.get(key)
                row.append("" if value is None else value)
        writer.writerow(row)
    writer.writerow([])
    writer.writerow(["FINDINGS"])
    writer.writerow([label for _, label in FINDING_COLUMNS])
    for finding in payload["findings"]:
        writer.writerow(
            ["" if finding.get(key) is None else finding.get(key) for key, _ in FINDING_COLUMNS]
        )
    return buffer.getvalue().encode("utf-8-sig")
