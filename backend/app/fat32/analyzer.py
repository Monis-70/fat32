from __future__ import annotations

import hashlib
from collections.abc import Callable
from dataclasses import asdict, dataclass, field

from .boot import (
    BootSector,
    BootSectorComparison,
    FsInfoSector,
    Geometry,
    build_geometry,
    compare_boot_sectors,
    geometry_warnings,
    parse_boot_sector,
    parse_fsinfo,
    validate_boot_sector,
)
from .constants import (
    BYTES_PER_DIR_ENTRY,
    CHAIN_EMPTY,
    CHAIN_LOOP,
    CHAIN_OK,
    MAX_DIRECTORY_DEPTH,
    MAX_DIRECTORY_ENTRIES,
    MAX_HASHED_FILE_BYTES,
    MAX_SLACK_SCAN_BYTES,
    SEVERITIES,
    SEVERITY_CRITICAL,
    SEVERITY_HIGH,
    SEVERITY_INFO,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
    STATE_ALLOCATED,
    STATE_BAD,
    STATE_CROSSLINKED,
    STATE_FREE,
    STATE_LOOPED,
    STATE_ORPHANED,
    STATE_RESERVED,
)
from .directory import RawDirectoryEntry, attribute_names, parse_directory_region
from .fat import ChainResult, FatComparison, FatTable, compare_fat_copies
from .image import ImageReader, PartitionEntry, locate_volume
from .recovery import RecoveryAssessment, assess_deleted_entry

MAX_DIRECTORY_CLUSTERS = 8192
CHAIN_RUN_LIMIT = 8192
SLACK_PREVIEW_LIMIT = 96

ProgressCallback = Callable[[int, str], None]


def _runs_from_clusters(clusters: list[int]) -> list[list[int]]:
    runs: list[list[int]] = []
    for cluster in clusters:
        if runs and cluster == runs[-1][0] + runs[-1][1]:
            runs[-1][1] += 1
        else:
            if len(runs) >= CHAIN_RUN_LIMIT:
                break
            runs.append([cluster, 1])
    return runs


def _printable_preview(data: bytes, limit: int = SLACK_PREVIEW_LIMIT) -> str | None:
    text = "".join(chr(byte) if 0x20 <= byte < 0x7F else "." for byte in data[: limit * 4])
    stripped = text.strip(".")
    if not stripped:
        return None
    return stripped[:limit]


@dataclass
class EntryRecord:
    entry_id: int
    parent_entry_id: int | None
    depth: int
    path: str
    parent_path: str
    name: str
    short_name: str
    long_name: str | None
    long_name_valid: bool
    long_name_entries: int
    recovered_first_char: str | None
    extension: str
    is_directory: bool
    is_deleted: bool
    is_volume_label: bool
    is_residual: bool
    is_hidden: bool
    is_system: bool
    is_read_only: bool
    is_archive: bool
    attributes: int
    attribute_list: list[str]
    first_cluster: int
    size_bytes: int
    allocated_bytes: int
    cluster_count: int
    fragment_count: int
    is_fragmented: bool
    chain_status: str
    cluster_runs: list[list[int]]
    chain_complete: bool
    slack_bytes: int
    slack_nonzero: bool
    slack_preview: str | None
    data_offset: int | None
    directory_entry_offset: int
    created_at: str | None
    modified_at: str | None
    accessed_at: str | None
    content_sha256: str | None
    child_count: int
    recoverable: bool
    recovery_rating: str
    recovery_confidence: float
    recovery_reasons: list[str]
    recovery_method: str | None
    recovery_cluster_runs: list[list[int]]
    recovery_cluster_count: int
    issues: list[str]

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Finding:
    code: str
    title: str
    severity: str
    category: str
    description: str
    recommendation: str
    entry_id: int | None = None
    entry_path: str | None = None
    cluster: int | None = None
    details: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ClusterRange:
    start: int
    end: int
    state: str
    entry_id: int | None

    @property
    def length(self) -> int:
        return self.end - self.start + 1

    def to_dict(self) -> dict:
        return {
            "start": self.start,
            "end": self.end,
            "length": self.length,
            "state": self.state,
            "entry_id": self.entry_id,
        }


@dataclass
class AnalysisResult:
    image_path: str
    image_size_bytes: int
    image_sha256: str
    container: str
    volume_offset: int
    partition_index: int | None
    partitions: list[PartitionEntry]
    boot_sector: BootSector
    boot_issues: list[str]
    geometry: Geometry
    geometry_issues: list[str]
    backup_boot: BootSectorComparison
    fsinfo: FsInfoSector
    fsinfo_free_delta: int | None
    fat_comparison: FatComparison
    fat_media_descriptor: str
    fat_end_marker: str
    entries: list[EntryRecord]
    findings: list[Finding]
    cluster_ranges: list[ClusterRange]
    cluster_state_counts: dict[str, int]
    stats: dict
    volume_label_root: str | None
    truncated: bool
    truncation_reasons: list[str]

    def summary(self) -> dict:
        return {
            "image": {
                "size_bytes": self.image_size_bytes,
                "sha256": self.image_sha256,
                "container": self.container,
                "volume_offset": self.volume_offset,
                "partition_index": self.partition_index,
                "partitions": [asdict(item) for item in self.partitions],
            },
            "boot_sector": self.boot_sector.to_dict(),
            "boot_issues": self.boot_issues,
            "geometry": self.geometry.to_dict(),
            "geometry_issues": self.geometry_issues,
            "backup_boot": self.backup_boot.to_dict(),
            "fsinfo": self.fsinfo.to_dict(),
            "fsinfo_free_delta": self.fsinfo_free_delta,
            "fat": {
                **self.fat_comparison.to_dict(),
                "media_descriptor": self.fat_media_descriptor,
                "end_marker": self.fat_end_marker,
            },
            "cluster_state_counts": self.cluster_state_counts,
            "stats": self.stats,
            "volume_label_root": self.volume_label_root,
            "truncated": self.truncated,
            "truncation_reasons": self.truncation_reasons,
        }


class Fat32Analyzer:
    def __init__(self, path: str, progress: ProgressCallback | None = None) -> None:
        self.path = path
        self._progress = progress or (lambda *_: None)
        self._entries: list[EntryRecord] = []
        self._findings: list[Finding] = []
        self._truncation_reasons: list[str] = []
        self._next_entry_id = 1

    def _report(self, value: int, stage: str) -> None:
        self._progress(value, stage)

    def run(self) -> AnalysisResult:
        with ImageReader(self.path) as reader:
            return self._analyze(reader)

    def _analyze(self, reader: ImageReader) -> AnalysisResult:
        self._report(3, "Hashing evidence image")
        image_hash = reader.sha256()

        self._report(10, "Locating FAT32 volume")
        location, partitions = locate_volume(reader)
        boot_block = reader.read_exact(location.offset, 512)
        boot = parse_boot_sector(boot_block)
        boot_issues = validate_boot_sector(boot)
        geometry = build_geometry(boot, location.offset, location.length)
        geometry_issues = geometry_warnings(geometry)

        self._report(18, "Comparing boot sector copies")
        backup_sector = boot.backup_boot_sector
        if 0 < backup_sector < boot.reserved_sector_count:
            backup_block = reader.read(
                location.offset + backup_sector * boot.bytes_per_sector, 512
            )
        else:
            backup_block = b""
        backup = compare_boot_sectors(boot_block, backup_block, backup_sector)

        self._report(24, "Validating FSInfo sector")
        fsinfo_sector = boot.fsinfo_sector
        fsinfo_offset = location.offset + fsinfo_sector * boot.bytes_per_sector
        if 0 < fsinfo_sector < boot.reserved_sector_count:
            fsinfo_block = reader.read(fsinfo_offset, 512)
        else:
            fsinfo_block = b""
        fsinfo = parse_fsinfo(fsinfo_block, fsinfo_sector, fsinfo_offset, geometry.cluster_count)

        self._report(32, "Reading file allocation tables")
        fat_copies: list[bytes] = []
        for index in range(boot.num_fats):
            start = geometry.fat_start_offset + index * geometry.fat_size_bytes
            fat_copies.append(reader.read(start, geometry.fat_size_bytes))
        primary = fat_copies[0] if fat_copies else b""
        fat = FatTable(primary, geometry.cluster_count)
        fat_comparison = compare_fat_copies(fat_copies, min(len(fat), geometry.cluster_count + 2))

        self._report(42, "Traversing directory tree")
        volume_label_root = self._traverse(reader, fat, geometry)

        self._report(64, "Resolving cluster chains")
        owner = [0] * (geometry.cluster_count + 2)
        crosslinks: dict[int, list[int]] = {}
        looped: set[int] = set()
        for record in self._entries:
            if record.is_deleted or record.is_volume_label or record.cluster_count == 0:
                continue
            if record.chain_status == CHAIN_LOOP:
                looped.update(self._expand_runs(record.cluster_runs))
            for cluster in self._expand_runs(record.cluster_runs):
                if cluster < 2 or cluster > geometry.last_cluster:
                    continue
                if owner[cluster] == 0:
                    owner[cluster] = record.entry_id
                else:
                    crosslinks.setdefault(cluster, [owner[cluster]]).append(record.entry_id)

        self._report(74, "Building cluster allocation map")
        ranges, state_counts = self._build_cluster_map(fat, geometry, owner, crosslinks, looped)

        self._report(84, "Measuring file slack")
        self._measure_slack(reader, geometry)

        self._report(90, "Evaluating findings")
        stats = self._build_stats(geometry, state_counts)
        fsinfo_delta = None
        if fsinfo.free_cluster_count is not None:
            fsinfo_delta = fsinfo.free_cluster_count - state_counts.get(STATE_FREE, 0)
        self._build_findings(
            boot=boot,
            boot_issues=boot_issues,
            geometry_issues=geometry_issues,
            backup=backup,
            fsinfo=fsinfo,
            fsinfo_delta=fsinfo_delta,
            fat_comparison=fat_comparison,
            state_counts=state_counts,
            crosslinks=crosslinks,
            volume_label_root=volume_label_root,
        )
        severity_counts = {name: 0 for name in SEVERITIES}
        for finding in self._findings:
            severity_counts[finding.severity] += 1
        stats["severity_counts"] = severity_counts
        stats["finding_count"] = len(self._findings)

        self._report(98, "Finalising report data")
        return AnalysisResult(
            image_path=self.path,
            image_size_bytes=reader.size,
            image_sha256=image_hash,
            container=location.container,
            volume_offset=location.offset,
            partition_index=location.partition_index,
            partitions=partitions,
            boot_sector=boot,
            boot_issues=boot_issues,
            geometry=geometry,
            geometry_issues=geometry_issues,
            backup_boot=backup,
            fsinfo=fsinfo,
            fsinfo_free_delta=fsinfo_delta,
            fat_comparison=fat_comparison,
            fat_media_descriptor=f"0x{fat.media_descriptor_entry():08X}",
            fat_end_marker=f"0x{fat.end_of_chain_marker():08X}",
            entries=self._entries,
            findings=self._findings,
            cluster_ranges=ranges,
            cluster_state_counts=state_counts,
            stats=stats,
            volume_label_root=volume_label_root,
            truncated=bool(self._truncation_reasons),
            truncation_reasons=self._truncation_reasons,
        )

    @staticmethod
    def _expand_runs(runs: list[list[int]]) -> list[int]:
        clusters: list[int] = []
        for start, length in runs:
            clusters.extend(range(start, start + length))
        return clusters

    def _read_directory(
        self, reader: ImageReader, geometry: Geometry, chain: ChainResult
    ) -> tuple[bytes, Callable[[int], int]]:
        clusters = chain.clusters[:MAX_DIRECTORY_CLUSTERS]
        buffer = bytearray()
        for cluster in clusters:
            buffer += reader.read(geometry.cluster_offset(cluster), geometry.bytes_per_cluster)
        slots_per_cluster = geometry.bytes_per_cluster // BYTES_PER_DIR_ENTRY

        def offset_for_slot(slot: int) -> int:
            index = slot // slots_per_cluster
            if index >= len(clusters):
                return 0
            within = (slot % slots_per_cluster) * BYTES_PER_DIR_ENTRY
            return geometry.cluster_offset(clusters[index]) + within

        return bytes(buffer), offset_for_slot

    def _traverse(self, reader: ImageReader, fat: FatTable, geometry: Geometry) -> str | None:
        volume_label: str | None = None
        visited: set[int] = set()
        pending: list[tuple[int | None, str, int, int]] = [
            (None, "", geometry.root_cluster, 0)
        ]
        while pending:
            parent_id, parent_path, start_cluster, depth = pending.pop(0)
            if start_cluster in visited:
                self._findings.append(
                    Finding(
                        code="DIRECTORY_LOOP",
                        title="Directory tree references a cluster already traversed",
                        severity=SEVERITY_HIGH,
                        category="structure",
                        description=(
                            f"Directory '{parent_path or '/'}' starts at cluster {start_cluster}, "
                            "which was already visited. Traversal stopped to avoid an infinite loop."
                        ),
                        recommendation="Inspect the directory cluster chain for manual tampering.",
                        entry_id=parent_id,
                        entry_path=parent_path or "/",
                        cluster=start_cluster,
                    )
                )
                continue
            visited.add(start_cluster)
            chain = fat.walk(start_cluster)
            if not chain.clusters:
                continue
            data, offset_for_slot = self._read_directory(reader, geometry, chain)
            raw_entries = parse_directory_region(data, offset_for_slot)
            child_count = 0
            for raw in raw_entries:
                if raw.is_dot_entry:
                    continue
                if len(self._entries) >= MAX_DIRECTORY_ENTRIES:
                    if "entry_budget" not in self._truncation_reasons:
                        self._truncation_reasons.append("entry_budget")
                    break
                record = self._build_entry(
                    reader, fat, geometry, raw, parent_id, parent_path, depth
                )
                self._entries.append(record)
                child_count += 1
                if record.is_volume_label and volume_label is None and not record.is_deleted:
                    volume_label = record.short_name.replace(".", "").strip() or None
                if (
                    record.is_directory
                    and not record.is_deleted
                    and record.first_cluster >= 2
                    and record.first_cluster <= geometry.last_cluster
                ):
                    if depth + 1 > MAX_DIRECTORY_DEPTH:
                        if "max_depth" not in self._truncation_reasons:
                            self._truncation_reasons.append("max_depth")
                        continue
                    pending.append(
                        (record.entry_id, record.path, record.first_cluster, depth + 1)
                    )
            if parent_id is not None:
                for record in self._entries:
                    if record.entry_id == parent_id:
                        record.child_count = child_count
                        break
        return volume_label

    def _build_entry(
        self,
        reader: ImageReader,
        fat: FatTable,
        geometry: Geometry,
        raw: RawDirectoryEntry,
        parent_id: int | None,
        parent_path: str,
        depth: int,
    ) -> EntryRecord:
        entry_id = self._next_entry_id
        self._next_entry_id += 1
        name = raw.display_name or raw.short_name or f"entry-{entry_id}"
        path = f"{parent_path}/{name}" if parent_path else f"/{name}"
        extension = ""
        if not raw.is_directory and "." in name:
            extension = name.rsplit(".", 1)[1].lower()[:16]
        issues: list[str] = []
        chain = ChainResult([], CHAIN_EMPTY, None, None, None, 0)
        if not raw.is_deleted and raw.first_cluster:
            chain = fat.walk(raw.first_cluster)
        runs = _runs_from_clusters(chain.clusters)
        chain_complete = len(self._expand_runs(runs)) == len(chain.clusters)
        allocated = len(chain.clusters) * geometry.bytes_per_cluster
        expected_clusters = 0
        if raw.size_bytes:
            expected_clusters = -(-raw.size_bytes // geometry.bytes_per_cluster)
        if not raw.is_deleted and not raw.is_directory and not raw.is_volume_label:
            if raw.first_cluster == 0 and raw.size_bytes > 0:
                issues.append("Directory entry declares a size but no starting cluster.")
            if chain.status not in (CHAIN_OK, CHAIN_EMPTY):
                issues.append(f"Cluster chain terminated abnormally ({chain.status}).")
            if chain.status == CHAIN_OK and expected_clusters and len(
                chain.clusters
            ) != expected_clusters:
                issues.append(
                    f"Chain holds {len(chain.clusters)} clusters but the recorded size needs "
                    f"{expected_clusters}."
                )
        if raw.long_name and not raw.long_name_valid:
            issues.append("Long filename checksum could not be validated against the short name.")
        if raw.created_at and raw.modified_at and raw.modified_at < raw.created_at:
            issues.append("Modified timestamp precedes the creation timestamp.")
        content_hash = None
        if (
            not raw.is_deleted
            and not raw.is_directory
            and not raw.is_volume_label
            and chain.clusters
            and raw.size_bytes
        ):
            content_hash = self._hash_content(reader, geometry, chain, raw.size_bytes)
        assessment: RecoveryAssessment | None = None
        if raw.is_deleted and not raw.is_volume_label:
            assessment = assess_deleted_entry(
                fat=fat,
                geometry=geometry,
                first_cluster=raw.first_cluster,
                size_bytes=raw.size_bytes,
                is_directory=raw.is_directory,
                long_name_valid=raw.long_name_valid,
                has_long_name=bool(raw.long_name),
                is_residual=raw.is_residual,
            )
        return EntryRecord(
            entry_id=entry_id,
            parent_entry_id=parent_id,
            depth=depth,
            path=path,
            parent_path=parent_path or "/",
            name=name,
            short_name=raw.short_name,
            long_name=raw.long_name,
            long_name_valid=raw.long_name_valid,
            long_name_entries=raw.long_name_entries,
            recovered_first_char=raw.recovered_first_char,
            extension=extension,
            is_directory=raw.is_directory,
            is_deleted=raw.is_deleted,
            is_volume_label=raw.is_volume_label,
            is_residual=raw.is_residual,
            is_hidden=raw.is_hidden,
            is_system=raw.is_system,
            is_read_only=raw.is_read_only,
            is_archive=raw.is_archive,
            attributes=raw.attributes,
            attribute_list=attribute_names(raw.attributes),
            first_cluster=raw.first_cluster,
            size_bytes=raw.size_bytes,
            allocated_bytes=allocated,
            cluster_count=len(chain.clusters),
            fragment_count=chain.fragment_count,
            is_fragmented=chain.fragment_count > 1,
            chain_status=chain.status,
            cluster_runs=runs,
            chain_complete=chain_complete,
            slack_bytes=0,
            slack_nonzero=False,
            slack_preview=None,
            data_offset=(
                geometry.cluster_offset(raw.first_cluster)
                if geometry.is_valid_cluster(raw.first_cluster)
                else None
            ),
            directory_entry_offset=raw.offset,
            created_at=raw.created_at,
            modified_at=raw.modified_at,
            accessed_at=raw.accessed_at,
            content_sha256=content_hash,
            child_count=0,
            recoverable=assessment.recoverable if assessment else False,
            recovery_rating=assessment.rating if assessment else "not_applicable",
            recovery_confidence=assessment.confidence if assessment else 0.0,
            recovery_reasons=assessment.reasons if assessment else [],
            recovery_method=assessment.method if assessment else None,
            recovery_cluster_runs=_runs_from_clusters(assessment.clusters) if assessment else [],
            recovery_cluster_count=len(assessment.clusters) if assessment else 0,
            issues=issues,
        )

    def _hash_content(
        self, reader: ImageReader, geometry: Geometry, chain: ChainResult, size: int
    ) -> str | None:
        limit = min(size, MAX_HASHED_FILE_BYTES)
        if limit <= 0:
            return None
        digest = hashlib.sha256()
        remaining = limit
        for cluster in chain.clusters:
            if remaining <= 0:
                break
            take = min(remaining, geometry.bytes_per_cluster)
            digest.update(reader.read(geometry.cluster_offset(cluster), take))
            remaining -= take
        if remaining > 0:
            return None
        return digest.hexdigest()

    def _measure_slack(self, reader: ImageReader, geometry: Geometry) -> None:
        for record in self._entries:
            if record.is_directory or record.is_volume_label or record.is_deleted:
                continue
            if record.cluster_count == 0 or record.size_bytes <= 0:
                continue
            used_in_last = record.size_bytes - (record.cluster_count - 1) * geometry.bytes_per_cluster
            if used_in_last <= 0 or used_in_last > geometry.bytes_per_cluster:
                continue
            slack = geometry.bytes_per_cluster - used_in_last
            record.slack_bytes = slack
            if slack <= 0:
                continue
            clusters = self._expand_runs(record.cluster_runs)
            if not clusters:
                continue
            last_cluster = clusters[-1]
            read_size = min(slack, MAX_SLACK_SCAN_BYTES)
            data = reader.read(geometry.cluster_offset(last_cluster) + used_in_last, read_size)
            if any(data):
                record.slack_nonzero = True
                record.slack_preview = _printable_preview(data)

    def _build_cluster_map(
        self,
        fat: FatTable,
        geometry: Geometry,
        owner: list[int],
        crosslinks: dict[int, list[int]],
        looped: set[int],
    ) -> tuple[list[ClusterRange], dict[str, int]]:
        counts = {
            STATE_FREE: 0,
            STATE_ALLOCATED: 0,
            STATE_RESERVED: 0,
            STATE_BAD: 0,
            STATE_ORPHANED: 0,
            STATE_CROSSLINKED: 0,
            STATE_LOOPED: 0,
        }
        ranges: list[ClusterRange] = []
        current: ClusterRange | None = None
        for cluster in range(2, geometry.last_cluster + 1):
            base = fat.state(cluster)
            entry_id: int | None = owner[cluster] or None
            if base == STATE_ALLOCATED:
                if cluster in crosslinks:
                    state = STATE_CROSSLINKED
                elif cluster in looped:
                    state = STATE_LOOPED
                elif entry_id is None:
                    state = STATE_ORPHANED
                else:
                    state = STATE_ALLOCATED
            else:
                state = base
                if base != STATE_BAD:
                    entry_id = None
            counts[state] += 1
            if current is not None and current.state == state and current.entry_id == entry_id:
                current.end = cluster
            else:
                current = ClusterRange(start=cluster, end=cluster, state=state, entry_id=entry_id)
                ranges.append(current)
        return ranges, counts

    def _build_stats(self, geometry: Geometry, state_counts: dict[str, int]) -> dict:
        files = [item for item in self._entries if not item.is_directory and not item.is_volume_label]
        directories = [item for item in self._entries if item.is_directory]
        deleted = [item for item in self._entries if item.is_deleted]
        live_files = [item for item in files if not item.is_deleted]
        recoverable = [item for item in deleted if item.recoverable]
        total_bytes = sum(item.size_bytes for item in live_files)
        allocated_clusters = state_counts.get(STATE_ALLOCATED, 0)
        timestamps = [
            value
            for item in self._entries
            for value in (item.created_at, item.modified_at, item.accessed_at)
            if value
        ]
        return {
            "entry_count": len(self._entries),
            "file_count": len(files),
            "live_file_count": len(live_files),
            "directory_count": len(directories),
            "deleted_count": len(deleted),
            "recoverable_count": len(recoverable),
            "hidden_count": sum(1 for item in self._entries if item.is_hidden),
            "system_count": sum(1 for item in self._entries if item.is_system),
            "fragmented_count": sum(1 for item in self._entries if item.is_fragmented),
            "slack_entry_count": sum(1 for item in self._entries if item.slack_nonzero),
            "slack_bytes_total": sum(item.slack_bytes for item in self._entries),
            "residual_count": sum(1 for item in self._entries if item.is_residual),
            "logical_bytes": total_bytes,
            "allocated_bytes": allocated_clusters * geometry.bytes_per_cluster,
            "free_bytes": state_counts.get(STATE_FREE, 0) * geometry.bytes_per_cluster,
            "used_percent": (
                round(allocated_clusters * 100.0 / geometry.cluster_count, 2)
                if geometry.cluster_count
                else 0.0
            ),
            "earliest_timestamp": min(timestamps) if timestamps else None,
            "latest_timestamp": max(timestamps) if timestamps else None,
            "max_depth": max((item.depth for item in self._entries), default=0),
        }

    def _build_findings(
        self,
        boot: BootSector,
        boot_issues: list[str],
        geometry_issues: list[str],
        backup: BootSectorComparison,
        fsinfo: FsInfoSector,
        fsinfo_delta: int | None,
        fat_comparison: FatComparison,
        state_counts: dict[str, int],
        crosslinks: dict[int, list[int]],
        volume_label_root: str | None,
    ) -> None:
        add = self._findings.append
        if boot_issues:
            add(
                Finding(
                    code="BOOT_SECTOR_FIELD_ANOMALY",
                    title="Boot sector fields deviate from the FAT32 specification",
                    severity=SEVERITY_MEDIUM,
                    category="boot",
                    description=" ".join(boot_issues),
                    recommendation="Confirm the image was acquired from a genuine FAT32 volume.",
                    details={"issues": boot_issues},
                )
            )
        if geometry_issues:
            add(
                Finding(
                    code="VOLUME_GEOMETRY_ANOMALY",
                    title="Derived volume geometry is outside expected FAT32 limits",
                    severity=SEVERITY_MEDIUM,
                    category="boot",
                    description=" ".join(geometry_issues),
                    recommendation="Treat cluster accounting as approximate for this volume.",
                    details={"issues": geometry_issues},
                )
            )
        if not backup.backup_present:
            add(
                Finding(
                    code="BACKUP_BOOT_MISSING",
                    title="Backup boot sector is absent",
                    severity=SEVERITY_MEDIUM,
                    category="boot",
                    description=(
                        f"No readable backup boot sector was found at sector {backup.backup_sector}."
                    ),
                    recommendation="Volume repair options are limited without a backup boot sector.",
                    details=backup.to_dict(),
                )
            )
        elif not backup.identical:
            add(
                Finding(
                    code="BACKUP_BOOT_MISMATCH",
                    title="Backup boot sector does not match the primary boot sector",
                    severity=SEVERITY_HIGH,
                    category="boot",
                    description=(
                        f"{backup.differing_byte_count} of 512 bytes differ between the primary "
                        f"boot sector and the backup at sector {backup.backup_sector}."
                    ),
                    recommendation="Compare both sectors byte by byte in the hex viewer.",
                    details=backup.to_dict(),
                )
            )
        if not fsinfo.present:
            add(
                Finding(
                    code="FSINFO_UNREADABLE",
                    title="FSInfo sector could not be read",
                    severity=SEVERITY_LOW,
                    category="fsinfo",
                    description="The FSInfo sector referenced by the boot sector is not readable.",
                    recommendation="Free-space accounting relies on the FAT instead.",
                    details=fsinfo.to_dict(),
                )
            )
        elif not fsinfo.signatures_valid:
            add(
                Finding(
                    code="FSINFO_INVALID",
                    title="FSInfo sector fails signature validation",
                    severity=SEVERITY_MEDIUM,
                    category="fsinfo",
                    description=" ".join(fsinfo.issues),
                    recommendation="Ignore the cached free-cluster hint for this volume.",
                    details=fsinfo.to_dict(),
                )
            )
        if fsinfo_delta not in (None, 0):
            add(
                Finding(
                    code="FSINFO_FREE_COUNT_MISMATCH",
                    title="FSInfo free-cluster count disagrees with the FAT",
                    severity=SEVERITY_MEDIUM,
                    category="fsinfo",
                    description=(
                        f"FSInfo records {fsinfo.free_cluster_count} free clusters while the FAT "
                        f"contains {state_counts.get(STATE_FREE, 0)}, a difference of "
                        f"{fsinfo_delta}."
                    ),
                    recommendation="A stale FSInfo sector suggests the volume was not cleanly unmounted.",
                    details={
                        "fsinfo_free": fsinfo.free_cluster_count,
                        "fat_free": state_counts.get(STATE_FREE, 0),
                        "delta": fsinfo_delta,
                    },
                )
            )
        if fat_comparison.copies > 1 and not fat_comparison.identical:
            add(
                Finding(
                    code="FAT_COPY_MISMATCH",
                    title="File allocation table copies are not identical",
                    severity=SEVERITY_HIGH,
                    category="fat",
                    description=(
                        f"{fat_comparison.mismatched_entry_count} FAT entries differ across "
                        f"{fat_comparison.copies} allocation table copies."
                    ),
                    recommendation="Divergent FAT copies often indicate interrupted writes or tampering.",
                    details=fat_comparison.to_dict(),
                )
            )
        if state_counts.get(STATE_BAD):
            add(
                Finding(
                    code="BAD_CLUSTERS_PRESENT",
                    title="Clusters are marked bad in the allocation table",
                    severity=SEVERITY_MEDIUM,
                    category="allocation",
                    description=(
                        f"{state_counts[STATE_BAD]} clusters carry the 0x0FFFFFF7 bad-cluster marker."
                    ),
                    recommendation="Bad markers can hide data; review those clusters in the hex viewer.",
                    details={"count": state_counts[STATE_BAD]},
                )
            )
        if state_counts.get(STATE_ORPHANED):
            add(
                Finding(
                    code="ORPHANED_CLUSTERS",
                    title="Allocated clusters are not referenced by any directory entry",
                    severity=SEVERITY_MEDIUM,
                    category="allocation",
                    description=(
                        f"{state_counts[STATE_ORPHANED]} clusters are marked allocated but no live "
                        "directory entry claims them."
                    ),
                    recommendation="Orphaned chains frequently hold deleted or hidden content.",
                    details={"count": state_counts[STATE_ORPHANED]},
                )
            )
        if crosslinks:
            sample = sorted(crosslinks)[:16]
            add(
                Finding(
                    code="CROSS_LINKED_CLUSTERS",
                    title="Clusters are claimed by more than one file",
                    severity=SEVERITY_CRITICAL,
                    category="allocation",
                    description=(
                        f"{len(crosslinks)} clusters are referenced by multiple cluster chains, so "
                        "at least one file holds incorrect data."
                    ),
                    recommendation="Treat every file touching these clusters as unreliable.",
                    cluster=sample[0] if sample else None,
                    details={
                        "count": len(crosslinks),
                        "sample": [
                            {"cluster": cluster, "entry_ids": crosslinks[cluster]}
                            for cluster in sample
                        ],
                    },
                )
            )
        for record in self._entries:
            if record.chain_status == CHAIN_LOOP:
                add(
                    Finding(
                        code="CLUSTER_CHAIN_LOOP",
                        title=f"Cluster chain for {record.name} loops back on itself",
                        severity=SEVERITY_HIGH,
                        category="allocation",
                        description=(
                            f"The chain starting at cluster {record.first_cluster} revisits a "
                            "cluster it already used, so the file cannot terminate."
                        ),
                        recommendation="Read the file only up to the detected loop point.",
                        entry_id=record.entry_id,
                        entry_path=record.path,
                        cluster=record.first_cluster,
                        details={"cluster_count": record.cluster_count},
                    )
                )
            elif record.chain_status in ("broken_free", "out_of_range", "bad_cluster", "invalid_start"):
                add(
                    Finding(
                        code="BROKEN_CLUSTER_CHAIN",
                        title=f"Cluster chain for {record.name} is broken",
                        severity=SEVERITY_HIGH,
                        category="allocation",
                        description=(
                            f"Chain traversal ended with status '{record.chain_status}' after "
                            f"{record.cluster_count} clusters."
                        ),
                        recommendation="Only the clusters recovered before the break are trustworthy.",
                        entry_id=record.entry_id,
                        entry_path=record.path,
                        cluster=record.first_cluster,
                        details={"status": record.chain_status},
                    )
                )
            if record.slack_nonzero:
                add(
                    Finding(
                        code="NON_ZERO_FILE_SLACK",
                        title=f"Non-zero slack space follows {record.name}",
                        severity=SEVERITY_LOW,
                        category="slack",
                        description=(
                            f"{record.slack_bytes} bytes of slack after the logical end of the file "
                            "contain non-zero data left by a previous allocation."
                        ),
                        recommendation="Examine the slack bytes for residual content.",
                        entry_id=record.entry_id,
                        entry_path=record.path,
                        details={
                            "slack_bytes": record.slack_bytes,
                            "preview": record.slack_preview,
                        },
                    )
                )
            if record.long_name and not record.long_name_valid and not record.is_deleted:
                add(
                    Finding(
                        code="LFN_CHECKSUM_INVALID",
                        title=f"Long filename for {record.short_name} failed checksum validation",
                        severity=SEVERITY_LOW,
                        category="naming",
                        description=(
                            "The long filename entries do not checksum to the short name they "
                            "precede, so the displayed name may be incorrect."
                        ),
                        recommendation="Prefer the 8.3 short name when citing this entry.",
                        entry_id=record.entry_id,
                        entry_path=record.path,
                    )
                )
            if record.is_residual:
                add(
                    Finding(
                        code="RESIDUAL_DIRECTORY_ENTRY",
                        title=f"Residual directory entry recovered for {record.name}",
                        severity=SEVERITY_LOW,
                        category="deleted",
                        description=(
                            "This entry was found after the directory terminator, which means it "
                            "survived deletion in unused directory space."
                        ),
                        recommendation="Residual entries are strong indicators of deleted content.",
                        entry_id=record.entry_id,
                        entry_path=record.path,
                    )
                )
            if record.issues and not record.is_deleted:
                for issue in record.issues:
                    if "Modified timestamp precedes" in issue:
                        add(
                            Finding(
                                code="TIMESTAMP_ANOMALY",
                                title=f"Timestamp ordering anomaly on {record.name}",
                                severity=SEVERITY_LOW,
                                category="timeline",
                                description=issue,
                                recommendation="Timestamp inversion can indicate metadata manipulation.",
                                entry_id=record.entry_id,
                                entry_path=record.path,
                                details={
                                    "created_at": record.created_at,
                                    "modified_at": record.modified_at,
                                },
                            )
                        )
        deleted = [item for item in self._entries if item.is_deleted]
        if deleted:
            add(
                Finding(
                    code="DELETED_ENTRIES_PRESENT",
                    title="Deleted directory entries remain on the volume",
                    severity=SEVERITY_INFO,
                    category="deleted",
                    description=(
                        f"{len(deleted)} deleted directory entries were recovered, "
                        f"{sum(1 for item in deleted if item.recoverable)} of which have a viable "
                        "recovery path."
                    ),
                    recommendation="Review the Recovery workspace before releasing the evidence.",
                    details={"count": len(deleted)},
                )
            )
        hidden = [item for item in self._entries if item.is_hidden or item.is_system]
        if hidden:
            add(
                Finding(
                    code="HIDDEN_OR_SYSTEM_ENTRIES",
                    title="Hidden or system entries are present",
                    severity=SEVERITY_LOW,
                    category="attributes",
                    description=(
                        f"{len(hidden)} entries carry the hidden or system attribute and are not "
                        "shown by default in a normal file browser."
                    ),
                    recommendation="Confirm whether these entries are expected for this device.",
                    details={"count": len(hidden)},
                )
            )
        if volume_label_root and boot.volume_label and volume_label_root != boot.volume_label:
            add(
                Finding(
                    code="VOLUME_LABEL_MISMATCH",
                    title="Boot sector volume label differs from the root directory label",
                    severity=SEVERITY_LOW,
                    category="boot",
                    description=(
                        f"The boot sector reports '{boot.volume_label}' while the root directory "
                        f"label entry reads '{volume_label_root}'."
                    ),
                    recommendation="Label mismatches often follow an out-of-band volume rename.",
                    details={"boot": boot.volume_label, "root": volume_label_root},
                )
            )
        if self._truncation_reasons:
            add(
                Finding(
                    code="ANALYSIS_TRUNCATED",
                    title="Analysis stopped at a safety limit",
                    severity=SEVERITY_MEDIUM,
                    category="analysis",
                    description=(
                        "Traversal reached a bounded safety limit, so the reported entry list is "
                        "incomplete."
                    ),
                    recommendation="Split the evidence image before re-running the analysis.",
                    details={"reasons": self._truncation_reasons},
                )
            )
        self._findings.sort(
            key=lambda item: (SEVERITIES.index(item.severity), item.code, item.entry_id or 0)
        )
