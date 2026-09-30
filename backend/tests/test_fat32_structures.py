from __future__ import annotations

import struct

import pytest

from app.fat32.constants import ATTR_ARCHIVE, BYTES_PER_DIR_ENTRY
from app.fat32.demo import _dir_entry, _lfn_entries, _short_raw
from app.fat32.directory import (
    decode_short_name,
    is_plausible_short_name,
    parse_directory_region,
    short_name_checksum,
)
from app.fat32.fat import FatTable, compare_fat_copies
from app.fat32.timestamps import decode_fat_date, decode_fat_time, decode_timestamp


def _fat_bytes(values: list[int]) -> bytes:
    return b"".join(struct.pack("<I", value) for value in values)


def test_short_name_checksum_is_injective_in_first_byte():
    base = b"AMPLE  TXT"
    checksums = {short_name_checksum(bytes([candidate]) + base) for candidate in range(0x20, 0x7F)}
    assert len(checksums) == 0x7F - 0x20


def test_decode_short_name_applies_nt_lowercase_flags():
    assert decode_short_name(b"README  TXT", 0) == "README.TXT"
    assert decode_short_name(b"README  TXT", 0x18) == "readme.txt"
    assert decode_short_name(b"NOEXT      ", 0) == "NOEXT"


def test_is_plausible_short_name_rejects_control_and_reserved_characters():
    assert is_plausible_short_name(b"README  TXT")
    assert not is_plausible_short_name(b"\x01EADME  TXT")
    assert not is_plausible_short_name(b"BAD:NAME   ")
    assert not is_plausible_short_name(b"           ")


def test_decode_fat_date_and_time_round_trip():
    assert decode_fat_date(0) is None
    assert decode_fat_date((44 << 9) | (3 << 5) | 15) == (2024, 3, 15)
    assert decode_fat_time((13 << 11) | (45 << 5) | 15) == (13, 45, 30)
    assert decode_timestamp((44 << 9) | (3 << 5) | 15, (9 << 11) | (12 << 5) | 17, 0).startswith(
        "2024-03-15T09:12:34"
    )
    assert decode_timestamp((44 << 9) | (13 << 5) | 40, 0) is None


def test_fat_table_decodes_28_bit_entries_and_states():
    table = FatTable(
        _fat_bytes([0x0FFFFFF8, 0xFFFFFFFF, 0x00000003, 0x0FFFFFFF, 0x00000000, 0x0FFFFFF7]),
        cluster_count=4,
    )
    assert table.value(1) == 0x0FFFFFFF
    assert table.value(2) == 3
    assert table.state(2) == "allocated"
    assert table.state(4) == "free"
    assert table.state(5) == "bad"
    assert table.is_eoc(3)


def test_fat_walk_detects_ok_loop_and_broken_chains():
    ok = FatTable(_fat_bytes([0, 0, 3, 4, 0x0FFFFFFF]), cluster_count=3)
    result = ok.walk(2)
    assert result.clusters == [2, 3, 4]
    assert result.status == "ok"
    assert result.fragment_count == 1

    looped = FatTable(_fat_bytes([0, 0, 3, 4, 2]), cluster_count=3)
    loop = looped.walk(2)
    assert loop.status == "loop"
    assert loop.loop_cluster == 2

    broken = FatTable(_fat_bytes([0, 0, 3, 0, 0]), cluster_count=3)
    assert broken.walk(2).status == "broken_free"

    out_of_range = FatTable(_fat_bytes([0, 0, 900, 0, 0]), cluster_count=3)
    assert out_of_range.walk(2).status == "out_of_range"

    assert ok.walk(0).status == "empty"
    assert ok.walk(99).status == "invalid_start"


def test_fat_walk_counts_fragments():
    table = FatTable(_fat_bytes([0, 0, 5, 0, 0, 0x0FFFFFFF]), cluster_count=4)
    result = table.walk(2)
    assert result.clusters == [2, 5]
    assert result.fragment_count == 2


def test_compare_fat_copies_reports_entry_level_differences():
    first = _fat_bytes([0x0FFFFFF8, 0x0FFFFFFF, 3, 0x0FFFFFFF])
    second = _fat_bytes([0x0FFFFFF8, 0x0FFFFFFF, 9, 0x0FFFFFFF])
    identical = compare_fat_copies([first, first], 4)
    assert identical.identical
    assert identical.mismatched_entry_count == 0
    divergent = compare_fat_copies([first, second], 4)
    assert not divergent.identical
    assert divergent.mismatched_entry_count == 1
    assert divergent.sample_differences[0].cluster == 2


def test_long_filename_reconstruction_validates_checksum():
    short = _short_raw("QUARTE~1PDF")
    blob = _lfn_entries("Quarterly Financial Report.pdf", short, deleted=False) + _dir_entry(
        short, ATTR_ARCHIVE, 9, 4096, *[__import__("datetime").datetime(2024, 3, 15, 9, 0, 0)] * 3
    )
    entries = parse_directory_region(blob, lambda slot: slot * BYTES_PER_DIR_ENTRY)
    assert len(entries) == 1
    entry = entries[0]
    assert entry.long_name == "Quarterly Financial Report.pdf"
    assert entry.long_name_valid
    assert entry.short_name == "QUARTE~1.PDF"
    assert entry.first_cluster == 9
    assert entry.size_bytes == 4096


def test_deleted_entry_first_character_is_restored_from_lfn_checksum():
    import datetime

    short = _short_raw("SUSPEC~1RTF")
    moment = datetime.datetime(2024, 3, 17, 15, 18, 6)
    blob = _lfn_entries("Suspect Interview.rtf", short, deleted=True) + _dir_entry(
        short, ATTR_ARCHIVE, 40, 2048, moment, moment, moment, deleted=True
    )
    entries = parse_directory_region(blob, lambda slot: slot * BYTES_PER_DIR_ENTRY)
    entry = entries[0]
    assert entry.is_deleted
    assert entry.recovered_first_char == "S"
    assert entry.short_name == "SUSPEC~1.RTF"
    assert entry.long_name == "Suspect Interview.rtf"


def test_residual_entries_after_terminator_are_reported():
    import datetime

    moment = datetime.datetime(2024, 3, 13, 6, 15, 44)
    live = _dir_entry(_short_raw("LIVE    TXT"), ATTR_ARCHIVE, 5, 100, moment, moment, moment)
    residual = _dir_entry(
        _short_raw("GHOST   TMP"), ATTR_ARCHIVE, 11, 512, moment, moment, moment
    )
    blob = live + bytes(BYTES_PER_DIR_ENTRY) + residual + bytes(BYTES_PER_DIR_ENTRY * 4)
    entries = parse_directory_region(blob, lambda slot: slot * BYTES_PER_DIR_ENTRY)
    assert [entry.short_name for entry in entries] == ["LIVE.TXT", "GHOST.TMP"]
    assert entries[1].is_residual
    assert entries[1].is_deleted


def test_directory_offsets_follow_the_supplied_mapping():
    import datetime

    moment = datetime.datetime(2024, 3, 15, 9, 12, 34)
    blob = b"".join(
        _dir_entry(_short_raw(f"FILE{index:04d}TXT"), ATTR_ARCHIVE, 2, 1, moment, moment, moment)
        for index in range(3)
    )
    entries = parse_directory_region(blob, lambda slot: 4096 + slot * BYTES_PER_DIR_ENTRY)
    assert [entry.offset for entry in entries] == [4096, 4128, 4160]


@pytest.mark.parametrize("value", [0, 1, 2, 3])
def test_fat_table_handles_short_tables(value):
    table = FatTable(_fat_bytes([0x0FFFFFF8, 0x0FFFFFFF]), cluster_count=value)
    assert table.value(9) == 0
