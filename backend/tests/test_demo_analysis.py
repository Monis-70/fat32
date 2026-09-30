from __future__ import annotations

import pytest

from app.fat32.analyzer import Fat32Analyzer
from app.fat32.demo import CLUSTER_COUNT, CLUSTER_SIZE, PARTITION_START_LBA, build_demo_image
from app.fat32.errors import UnsupportedImageError
from app.fat32.image import ImageReader, locate_volume


def _by_name(result, name: str):
    for entry in result.entries:
        if entry.name == name:
            return entry
    raise AssertionError(f"Entry '{name}' was not found in the demo analysis")


def _codes(result) -> set[str]:
    return {finding.code for finding in result.findings}


def test_demo_image_is_deterministic(tmp_path):
    first = build_demo_image(tmp_path / "a.img").read_bytes()
    second = build_demo_image(tmp_path / "b.img").read_bytes()
    assert first == second


def test_mbr_container_is_detected(demo_image):
    with ImageReader(demo_image) as reader:
        location, partitions = locate_volume(reader)
    assert location.container == "mbr_disk"
    assert location.offset == PARTITION_START_LBA * 512
    assert partitions[0].is_fat32_candidate


def test_raw_volume_container_is_detected(raw_volume_image):
    with ImageReader(raw_volume_image) as reader:
        location, _ = locate_volume(reader)
    assert location.container == "raw_volume"
    assert location.offset == 0


def test_raw_volume_and_mbr_produce_matching_geometry(demo_result, raw_volume_image):
    raw = Fat32Analyzer(str(raw_volume_image)).run()
    assert raw.geometry.cluster_count == demo_result.geometry.cluster_count
    assert raw.geometry.bytes_per_cluster == demo_result.geometry.bytes_per_cluster
    assert len(raw.entries) == len(demo_result.entries)


def test_unsupported_image_raises_a_descriptive_error(tmp_path):
    target = tmp_path / "noise.img"
    target.write_bytes(bytes(range(256)) * 16)
    with pytest.raises(UnsupportedImageError) as excinfo:
        Fat32Analyzer(str(target)).run()
    assert "FAT32" in excinfo.value.message


def test_geometry_matches_the_generated_layout(demo_result):
    geometry = demo_result.geometry
    assert geometry.bytes_per_sector == 512
    assert geometry.bytes_per_cluster == CLUSTER_SIZE
    assert geometry.cluster_count == CLUSTER_COUNT
    assert geometry.root_cluster == 2
    assert demo_result.boot_sector.filesystem_type == "FAT32"
    assert demo_result.geometry_issues == []


def test_directory_tree_is_traversed_with_nesting(demo_result):
    paths = {entry.path for entry in demo_result.entries}
    assert "/LOGS/ARCHIVE/2023/JAN.LOG" in paths
    assert "/IMAGES/Vacation Photo 2024-06-11.jpg" in paths
    assert _by_name(demo_result, "2023").depth == 2
    assert demo_result.stats["max_depth"] == 3


def test_long_filenames_are_reconstructed_and_validated(demo_result):
    entry = _by_name(demo_result, "Evidence Intake Notes.txt")
    assert entry.long_name_valid
    assert entry.short_name == "EVIDEN~1.TXT"
    assert entry.long_name_entries == 2


def test_attributes_and_volume_label_are_decoded(demo_result):
    config = _by_name(demo_result, "CONFIG.SYS")
    assert config.is_system and config.is_hidden and config.is_read_only
    label = next(entry for entry in demo_result.entries if entry.is_volume_label)
    assert label.short_name == "CASE2024DEM"
    assert demo_result.volume_label_root == "CASE2024DEM"
    assert demo_result.boot_sector.volume_label == "FATSCOPE"


def test_timestamps_are_decoded_for_all_three_fields(demo_result):
    entry = _by_name(demo_result, "README.TXT")
    assert entry.created_at.startswith("2024-03-15T09:12:34")
    assert entry.modified_at.startswith("2024-03-15T09:40:12")
    assert entry.accessed_at.startswith("2024-03-18T00:00:00")


def test_fragmented_file_is_reported(demo_result):
    entry = _by_name(demo_result, "fragmented-capture.bin")
    assert entry.is_fragmented
    assert entry.fragment_count == entry.cluster_count
    assert entry.cluster_count == 29


def test_chain_anomalies_are_classified(demo_result):
    assert _by_name(demo_result, "INDEX.DAT").chain_status == "broken_free"
    assert _by_name(demo_result, "LOOPED.DAT").chain_status == "loop"


def test_cluster_states_cover_every_planted_condition(demo_result):
    counts = demo_result.cluster_state_counts
    assert counts["bad"] == 3
    assert counts["orphaned"] > 0
    assert counts["crosslinked"] > 0
    assert counts["looped"] == 4
    assert counts["free"] + sum(
        value for key, value in counts.items() if key != "free"
    ) == demo_result.geometry.cluster_count


def test_cluster_ranges_are_compressed_and_contiguous(demo_result):
    ranges = demo_result.cluster_ranges
    assert ranges[0].start == 2
    assert ranges[-1].end == demo_result.geometry.last_cluster
    assert len(ranges) < demo_result.geometry.cluster_count
    for previous, following in zip(ranges, ranges[1:], strict=False):
        assert following.start == previous.end + 1


def test_non_zero_slack_is_detected_with_a_preview(demo_result):
    entry = _by_name(demo_result, "SYSTEM.LOG")
    assert entry.slack_nonzero
    assert entry.slack_bytes > 0
    assert "payroll-export-2023.csv" in entry.slack_preview


def test_deleted_entries_are_recovered_with_scoring(demo_result):
    deleted = {entry.name: entry for entry in demo_result.entries if entry.is_deleted}
    assert "Suspect Interview Transcript.rtf" in deleted
    transcript = deleted["Suspect Interview Transcript.rtf"]
    assert transcript.recoverable
    assert transcript.recovery_rating in ("high", "medium")
    assert transcript.recovery_confidence > 0.5
    assert transcript.recovery_reasons
    assert transcript.recovered_first_char == "S"
    overwritten = next(entry for entry in deleted.values() if entry.short_name.endswith("WRIT.DAT"))
    assert not overwritten.recoverable
    assert overwritten.recovery_rating == "not_recoverable"


def test_residual_entry_is_flagged(demo_result):
    residual = [entry for entry in demo_result.entries if entry.is_residual]
    assert len(residual) == 1
    assert residual[0].short_name.endswith("URGED.TMP")


def test_boot_fsinfo_and_fat_health_are_reported(demo_result):
    assert demo_result.backup_boot.backup_present
    assert not demo_result.backup_boot.identical
    assert demo_result.backup_boot.differing_byte_count > 0
    assert demo_result.fsinfo.present
    assert demo_result.fsinfo.signatures_valid
    assert demo_result.fsinfo_free_delta == 137
    assert demo_result.fat_comparison.copies == 2
    assert not demo_result.fat_comparison.identical
    assert demo_result.fat_comparison.mismatched_entry_count == 4


def test_findings_cover_every_planted_anomaly(demo_result):
    codes = _codes(demo_result)
    expected = {
        "CROSS_LINKED_CLUSTERS",
        "BACKUP_BOOT_MISMATCH",
        "FAT_COPY_MISMATCH",
        "FSINFO_FREE_COUNT_MISMATCH",
        "BAD_CLUSTERS_PRESENT",
        "ORPHANED_CLUSTERS",
        "CLUSTER_CHAIN_LOOP",
        "BROKEN_CLUSTER_CHAIN",
        "NON_ZERO_FILE_SLACK",
        "RESIDUAL_DIRECTORY_ENTRY",
        "TIMESTAMP_ANOMALY",
        "VOLUME_LABEL_MISMATCH",
        "DELETED_ENTRIES_PRESENT",
        "HIDDEN_OR_SYSTEM_ENTRIES",
    }
    assert expected <= codes
    assert "ANALYSIS_TRUNCATED" not in codes
    severities = demo_result.stats["severity_counts"]
    assert severities["critical"] >= 1
    assert severities["high"] >= 3


def test_content_hashes_are_computed_for_live_files(demo_result):
    entry = _by_name(demo_result, "README.TXT")
    assert entry.content_sha256 is not None
    assert len(entry.content_sha256) == 64
    assert _by_name(demo_result, "LOGS").content_sha256 is None


def test_image_hash_is_stable(demo_image, demo_result):
    with ImageReader(demo_image) as reader:
        assert reader.sha256() == demo_result.image_sha256
    assert len(demo_result.image_sha256) == 64
