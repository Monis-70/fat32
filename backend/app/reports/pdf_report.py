from __future__ import annotations

import io
from datetime import UTC, datetime
from typing import Any

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

INK = colors.HexColor("#1F2933")
MUTED = colors.HexColor("#5C6B77")
RULE = colors.HexColor("#D5DBE1")
SURFACE = colors.HexColor("#F4F2EE")
TEAL = colors.HexColor("#0F6E6E")

SEVERITY_COLORS = {
    "critical": colors.HexColor("#B4232B"),
    "high": colors.HexColor("#C2410C"),
    "medium": colors.HexColor("#B45309"),
    "low": colors.HexColor("#1D4ED8"),
    "info": colors.HexColor("#0F6E6E"),
}

PAGE_MARGIN = 18 * mm
CONTENT_WIDTH = A4[0] - 2 * PAGE_MARGIN


def _styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "FsTitle",
            parent=base["Title"],
            fontName="Helvetica-Bold",
            fontSize=22,
            leading=26,
            alignment=TA_LEFT,
            textColor=INK,
            spaceAfter=2,
        ),
        "subtitle": ParagraphStyle(
            "FsSubtitle",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14,
            textColor=MUTED,
            spaceAfter=10,
        ),
        "section": ParagraphStyle(
            "FsSection",
            parent=base["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=16,
            textColor=INK,
            spaceBefore=14,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "FsBody",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=9.5,
            leading=13,
            textColor=INK,
        ),
        "cell": ParagraphStyle(
            "FsCell",
            parent=base["Normal"],
            fontName="Helvetica",
            fontSize=8.2,
            leading=10.5,
            textColor=INK,
        ),
        "cellMono": ParagraphStyle(
            "FsCellMono",
            parent=base["Normal"],
            fontName="Courier",
            fontSize=7.6,
            leading=10,
            textColor=INK,
        ),
        "label": ParagraphStyle(
            "FsLabel",
            parent=base["Normal"],
            fontName="Helvetica-Bold",
            fontSize=8.2,
            leading=10.5,
            textColor=MUTED,
        ),
    }


def _format_bytes(value: Any) -> str:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return "-"
    units = ["B", "KB", "MB", "GB", "TB"]
    size = float(number)
    index = 0
    while size >= 1024 and index < len(units) - 1:
        size /= 1024
        index += 1
    if index == 0:
        return f"{number} B"
    return f"{size:.2f} {units[index]} ({number:,} bytes)"


def _text(value: Any, fallback: str = "-") -> str:
    if value is None or value == "":
        return fallback
    if isinstance(value, bool):
        return "Yes" if value else "No"
    return str(value)


def _wrap(value: Any, style: ParagraphStyle) -> Paragraph:
    content = _text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(content, style)


def _kv_table(rows: list[tuple[str, str]], styles: dict[str, ParagraphStyle]) -> Table:
    data = [[_wrap(label, styles["label"]), _wrap(value, styles["cell"])] for label, value in rows]
    table = Table(data, colWidths=[CONTENT_WIDTH * 0.32, CONTENT_WIDTH * 0.68], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, RULE),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
                ("BACKGROUND", (0, 0), (0, -1), SURFACE),
            ]
        )
    )
    return table


def _data_table(
    header: list[str], rows: list[list[Any]], widths: list[float], styles: dict[str, ParagraphStyle]
) -> Table:
    body = [[_wrap(label, styles["label"]) for label in header]]
    for row in rows:
        body.append([_wrap(cell, styles["cell"]) for cell in row])
    table = Table(body, colWidths=widths, hAlign="LEFT", repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
                ("LINEBELOW", (0, 0), (-1, 0), 0.6, RULE),
                ("LINEBELOW", (0, 1), (-1, -2), 0.3, RULE),
                ("BOX", (0, 0), (-1, -1), 0.6, RULE),
            ]
        )
    )
    return table


def _severity_table(counts: dict[str, int], styles: dict[str, ParagraphStyle]) -> Table:
    order = ["critical", "high", "medium", "low", "info"]
    header = [_wrap(name.title(), styles["label"]) for name in order]
    values = [_wrap(counts.get(name, 0), styles["cell"]) for name in order]
    table = Table([header, values], colWidths=[CONTENT_WIDTH / 5] * 5, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("INNERGRID", (0, 0), (-1, -1), 0.4, RULE),
        ("BACKGROUND", (0, 0), (-1, 0), SURFACE),
    ]
    for index, name in enumerate(order):
        commands.append(("TEXTCOLOR", (index, 1), (index, 1), SEVERITY_COLORS[name]))
        commands.append(("FONTNAME", (index, 1), (index, 1), "Helvetica-Bold"))
        commands.append(("FONTSIZE", (index, 1), (index, 1), 13))
    table.setStyle(TableStyle(commands))
    return table


class _ReportDocument(BaseDocTemplate):
    def __init__(self, buffer: io.BytesIO, header_text: str, footer_text: str) -> None:
        super().__init__(
            buffer,
            pagesize=A4,
            leftMargin=PAGE_MARGIN,
            rightMargin=PAGE_MARGIN,
            topMargin=PAGE_MARGIN + 8 * mm,
            bottomMargin=PAGE_MARGIN + 6 * mm,
            title="FATScope forensic analysis report",
            author="FATScope",
            subject="FAT32 read-only forensic analysis",
        )
        self.header_text = header_text
        self.footer_text = footer_text
        frame = Frame(
            self.leftMargin,
            self.bottomMargin,
            self.width,
            self.height,
            id="content",
            showBoundary=0,
        )
        self.addPageTemplates([PageTemplate(id="report", frames=[frame], onPage=self._decorate)])

    def _decorate(self, canvas, document) -> None:
        canvas.saveState()
        canvas.setFont("Helvetica-Bold", 8)
        canvas.setFillColor(TEAL)
        canvas.drawString(PAGE_MARGIN, A4[1] - PAGE_MARGIN - 2 * mm, "FATSCOPE")
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawRightString(
            A4[0] - PAGE_MARGIN, A4[1] - PAGE_MARGIN - 2 * mm, self.header_text
        )
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.6)
        canvas.line(
            PAGE_MARGIN,
            A4[1] - PAGE_MARGIN - 4 * mm,
            A4[0] - PAGE_MARGIN,
            A4[1] - PAGE_MARGIN - 4 * mm,
        )
        canvas.line(PAGE_MARGIN, PAGE_MARGIN + 2 * mm, A4[0] - PAGE_MARGIN, PAGE_MARGIN + 2 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.drawString(PAGE_MARGIN, PAGE_MARGIN - 2 * mm, self.footer_text)
        canvas.drawRightString(
            A4[0] - PAGE_MARGIN, PAGE_MARGIN - 2 * mm, f"Page {document.page}"
        )
        canvas.restoreState()


def build_pdf_report(payload: dict[str, Any]) -> bytes:
    styles = _styles()
    analysis = payload["analysis"]
    volume = payload.get("volume", {})
    geometry = volume.get("geometry", {})
    boot = volume.get("boot_sector", {})
    fsinfo = volume.get("fsinfo", {})
    fat = volume.get("fat", {})
    backup = volume.get("backup_boot", {})
    stats = volume.get("stats", {})
    cluster_counts = volume.get("cluster_state_counts", {})
    image = volume.get("image", {})
    entries = payload["entries"]
    findings = payload["findings"]

    generated = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC")
    header_text = f"Analysis {analysis['id'][:8]} - generated {generated}"
    footer_text = "Read-only analysis. No evidence image was mounted or modified."

    buffer = io.BytesIO()
    document = _ReportDocument(buffer, header_text, footer_text)
    story: list[Any] = []

    story.append(Paragraph("FAT32 forensic analysis report", styles["title"]))
    story.append(
        Paragraph(
            f"Evidence file {_text(analysis['original_filename'])} analysed on "
            f"{_text(analysis.get('completed_at'))}.",
            styles["subtitle"],
        )
    )
    story.append(Paragraph("Evidence identity", styles["section"]))
    story.append(
        _kv_table(
            [
                ("Analysis identifier", _text(analysis["id"])),
                ("Evidence file", _text(analysis["original_filename"])),
                ("Case identifier", _text(analysis.get("case_id"))),
                ("Examiner", _text(analysis.get("examiner"))),
                ("Evidence number", _text(analysis.get("evidence_number"))),
                ("Acquisition timestamp", _text(analysis.get("acquired_at"))),
                ("Image size", _format_bytes(analysis.get("size_bytes"))),
                ("Image SHA-256", _text(analysis.get("image_sha256"))),
                ("Container", _text(image.get("container"))),
                ("Volume offset", f"{_text(image.get('volume_offset', 0))} bytes"),
                ("Analysis duration", f"{_text(analysis.get('duration_ms'))} ms"),
                ("Examiner notes", _text(analysis.get("notes"))),
            ],
            styles,
        )
    )

    story.append(Paragraph("Severity overview", styles["section"]))
    story.append(_severity_table(analysis.get("severity_counts", {}), styles))

    story.append(Paragraph("Volume geometry", styles["section"]))
    story.append(
        _kv_table(
            [
                ("Filesystem type", _text(boot.get("filesystem_type"))),
                ("OEM name", _text(boot.get("oem_name"))),
                ("Volume label (boot sector)", _text(boot.get("volume_label"))),
                ("Volume label (root directory)", _text(volume.get("volume_label_root"))),
                ("Volume serial", _text(boot.get("volume_id"))),
                ("Bytes per sector", _text(geometry.get("bytes_per_sector"))),
                ("Sectors per cluster", _text(geometry.get("sectors_per_cluster"))),
                ("Bytes per cluster", _text(geometry.get("bytes_per_cluster"))),
                ("Reserved sectors", _text(geometry.get("reserved_sector_count"))),
                ("Number of FATs", _text(geometry.get("num_fats"))),
                ("FAT size (sectors)", _text(geometry.get("fat_size_sectors"))),
                ("Total sectors", _text(geometry.get("total_sectors"))),
                ("Cluster count", _text(geometry.get("cluster_count"))),
                ("Root directory cluster", _text(geometry.get("root_cluster"))),
                ("Data region offset", _text(geometry.get("data_start_offset"))),
                ("Volume size", _format_bytes(geometry.get("volume_size_bytes"))),
            ],
            styles,
        )
    )

    story.append(Paragraph("Structural integrity", styles["section"]))
    story.append(
        _kv_table(
            [
                (
                    "Backup boot sector",
                    "Present and identical"
                    if backup.get("identical")
                    else (
                        f"Present with {backup.get('differing_byte_count', 0)} differing bytes"
                        if backup.get("backup_present")
                        else "Not present"
                    ),
                ),
                (
                    "FSInfo signatures",
                    "Valid" if fsinfo.get("signatures_valid") else "Invalid or unreadable",
                ),
                ("FSInfo free clusters", _text(fsinfo.get("free_cluster_count"))),
                ("FSInfo variance", _text(volume.get("fsinfo_free_delta"))),
                ("FAT copies", _text(fat.get("copies"))),
                (
                    "FAT copy comparison",
                    "Identical"
                    if fat.get("identical")
                    else f"{fat.get('mismatched_entry_count', 0)} entries differ",
                ),
                ("FAT media descriptor", _text(fat.get("media_descriptor"))),
                ("FAT end-of-chain marker", _text(fat.get("end_marker"))),
            ],
            styles,
        )
    )

    story.append(Paragraph("Allocation summary", styles["section"]))
    story.append(
        _data_table(
            ["Cluster state", "Clusters", "Bytes"],
            [
                [
                    state.replace("_", " ").title(),
                    f"{count:,}",
                    _format_bytes(count * int(geometry.get("bytes_per_cluster") or 0)),
                ]
                for state, count in cluster_counts.items()
            ],
            [CONTENT_WIDTH * 0.32, CONTENT_WIDTH * 0.2, CONTENT_WIDTH * 0.48],
            styles,
        )
    )
    story.append(Spacer(1, 8))
    story.append(
        _kv_table(
            [
                ("Directory entries recovered", _text(stats.get("entry_count"))),
                ("Live files", _text(stats.get("live_file_count"))),
                ("Directories", _text(stats.get("directory_count"))),
                ("Deleted entries", _text(stats.get("deleted_count"))),
                ("Recoverable deleted entries", _text(stats.get("recoverable_count"))),
                ("Fragmented files", _text(stats.get("fragmented_count"))),
                ("Entries with non-zero slack", _text(stats.get("slack_entry_count"))),
                ("Total slack bytes", _format_bytes(stats.get("slack_bytes_total"))),
                ("Logical bytes in live files", _format_bytes(stats.get("logical_bytes"))),
                ("Earliest filesystem timestamp", _text(stats.get("earliest_timestamp"))),
                ("Latest filesystem timestamp", _text(stats.get("latest_timestamp"))),
            ],
            styles,
        )
    )

    story.append(PageBreak())
    story.append(Paragraph("Findings", styles["section"]))
    if findings:
        rows = [
            [
                finding["severity"].title(),
                finding["code"],
                finding["title"],
                finding.get("entry_path") or "-",
                finding["description"],
            ]
            for finding in findings
        ]
        story.append(
            _data_table(
                ["Severity", "Code", "Title", "Path", "Description"],
                rows,
                [
                    CONTENT_WIDTH * 0.09,
                    CONTENT_WIDTH * 0.17,
                    CONTENT_WIDTH * 0.2,
                    CONTENT_WIDTH * 0.19,
                    CONTENT_WIDTH * 0.35,
                ],
                styles,
            )
        )
    else:
        story.append(
            Paragraph("No structural or content anomalies were detected.", styles["body"])
        )

    deleted = [entry for entry in entries if entry.get("is_deleted")]
    story.append(Paragraph("Deleted entries and recovery assessment", styles["section"]))
    if deleted:
        rows = [
            [
                entry["path"],
                _format_bytes(entry["size_bytes"]),
                entry["recovery_rating"].replace("_", " "),
                f"{round(entry['recovery_confidence'] * 100)}%",
                str(entry.get("first_cluster") or "-"),
                " ".join(entry.get("recovery_reasons") or [])[:280],
            ]
            for entry in deleted
        ]
        story.append(
            _data_table(
                ["Path", "Size", "Rating", "Confidence", "Start cluster", "Assessment"],
                rows,
                [
                    CONTENT_WIDTH * 0.22,
                    CONTENT_WIDTH * 0.13,
                    CONTENT_WIDTH * 0.1,
                    CONTENT_WIDTH * 0.1,
                    CONTENT_WIDTH * 0.1,
                    CONTENT_WIDTH * 0.35,
                ],
                styles,
            )
        )
    else:
        story.append(Paragraph("No deleted directory entries were recovered.", styles["body"]))

    story.append(PageBreak())
    story.append(Paragraph("Filesystem entries", styles["section"]))
    listed = entries[:400]
    rows = [
        [
            entry["path"],
            "Directory" if entry["is_directory"] else "File",
            "Deleted" if entry["is_deleted"] else "Allocated",
            f"{entry['size_bytes']:,}",
            str(entry["first_cluster"]),
            str(entry["cluster_count"]),
            entry["chain_status"],
            _text(entry.get("modified_at")),
        ]
        for entry in listed
    ]
    story.append(
        _data_table(
            ["Path", "Type", "State", "Size", "Cluster", "Clusters", "Chain", "Modified"],
            rows,
            [
                CONTENT_WIDTH * 0.26,
                CONTENT_WIDTH * 0.09,
                CONTENT_WIDTH * 0.09,
                CONTENT_WIDTH * 0.09,
                CONTENT_WIDTH * 0.08,
                CONTENT_WIDTH * 0.08,
                CONTENT_WIDTH * 0.1,
                CONTENT_WIDTH * 0.21,
            ],
            styles,
        )
    )
    if len(entries) > len(listed):
        story.append(Spacer(1, 6))
        story.append(
            Paragraph(
                f"{len(entries) - len(listed):,} further entries are included in the JSON and CSV "
                "exports.",
                styles["body"],
            )
        )

    story.append(
        KeepTogether(
            [
                Paragraph("Method statement", styles["section"]),
                Paragraph(
                    "FATScope parsed the evidence image through a read-only memory mapping. The "
                    "BIOS Parameter Block, backup boot sector, FSInfo sector, every file "
                    "allocation table copy, directory regions and cluster chains were decoded "
                    "directly from the image bytes. The image was never mounted, no extracted "
                    "content was executed, and no byte of the source image was modified.",
                    styles["body"],
                ),
            ]
        )
    )

    document.build(story)
    return buffer.getvalue()
