from __future__ import annotations

import struct
from dataclasses import dataclass, field

from .constants import (
    ATTR_ARCHIVE,
    ATTR_DIRECTORY,
    ATTR_HIDDEN,
    ATTR_LONG_NAME,
    ATTR_LONG_NAME_MASK,
    ATTR_READ_ONLY,
    ATTR_SYSTEM,
    ATTR_VOLUME_ID,
    BYTES_PER_DIR_ENTRY,
    DELETED_MARKER,
    END_OF_DIRECTORY,
    KANJI_ESCAPE,
    MAX_LFN_SEQUENCE,
)
from .timestamps import decode_timestamp

PRINTABLE_FIRST_CHARS = bytes(range(0x20, 0x7F))
INVALID_SFN_CHARS = set(b'"*+,./:;<=>?[\\]|')


def short_name_checksum(name: bytes) -> int:
    checksum = 0
    for byte in name[:11]:
        checksum = (((checksum & 1) << 7) + (checksum >> 1) + byte) & 0xFF
    return checksum


def decode_short_name(raw: bytes, nt_flags: int) -> str:
    base = raw[0:8]
    extension = raw[8:11]
    if base and base[0] == KANJI_ESCAPE:
        base = bytes([DELETED_MARKER]) + base[1:]
    base_text = base.decode("cp437", "replace").rstrip(" ")
    extension_text = extension.decode("cp437", "replace").rstrip(" ")
    if nt_flags & 0x08:
        base_text = base_text.lower()
    if nt_flags & 0x10:
        extension_text = extension_text.lower()
    if extension_text:
        return f"{base_text}.{extension_text}"
    return base_text


def is_plausible_short_name(raw: bytes) -> bool:
    if len(raw) < 11:
        return False
    if raw[0] in (0x00, 0x20):
        return False
    return all(byte >= 0x20 and byte not in INVALID_SFN_CHARS for byte in raw[:11])


def _lfn_fragment(block: bytes) -> str:
    units = bytearray()
    for start, count in ((1, 5), (14, 6), (28, 2)):
        units += block[start : start + count * 2]
    text = []
    for index in range(0, len(units), 2):
        code = units[index] | (units[index + 1] << 8)
        if code in (0x0000, 0xFFFF):
            break
        text.append(chr(code))
    return "".join(text)


@dataclass
class LongNameCandidate:
    text: str
    checksum: int
    sequence_complete: bool
    deleted: bool
    entry_count: int
    slots: list[int] = field(default_factory=list)


@dataclass
class RawDirectoryEntry:
    slot: int
    offset: int
    short_name: str
    short_name_raw: bytes
    long_name: str | None
    long_name_valid: bool
    long_name_entries: int
    recovered_first_char: str | None
    attributes: int
    nt_reserved: int
    first_cluster: int
    size_bytes: int
    created_at: str | None
    modified_at: str | None
    accessed_at: str | None
    is_deleted: bool
    is_directory: bool
    is_volume_label: bool
    is_dot_entry: bool
    is_residual: bool
    raw: bytes

    @property
    def display_name(self) -> str:
        if self.long_name:
            return self.long_name
        return self.short_name

    @property
    def is_read_only(self) -> bool:
        return bool(self.attributes & ATTR_READ_ONLY)

    @property
    def is_hidden(self) -> bool:
        return bool(self.attributes & ATTR_HIDDEN)

    @property
    def is_system(self) -> bool:
        return bool(self.attributes & ATTR_SYSTEM)

    @property
    def is_archive(self) -> bool:
        return bool(self.attributes & ATTR_ARCHIVE)


def attribute_names(attributes: int) -> list[str]:
    names = []
    if attributes & ATTR_READ_ONLY:
        names.append("read_only")
    if attributes & ATTR_HIDDEN:
        names.append("hidden")
    if attributes & ATTR_SYSTEM:
        names.append("system")
    if attributes & ATTR_VOLUME_ID:
        names.append("volume_label")
    if attributes & ATTR_DIRECTORY:
        names.append("directory")
    if attributes & ATTR_ARCHIVE:
        names.append("archive")
    return names


def _restore_deleted_first_char(raw: bytes, expected_checksum: int) -> tuple[bytes, str | None]:
    matches = []
    for candidate in PRINTABLE_FIRST_CHARS:
        if candidate in INVALID_SFN_CHARS or candidate == 0x20:
            continue
        probe = bytes([candidate]) + raw[1:11]
        if short_name_checksum(probe) == expected_checksum:
            matches.append(candidate)
            if len(matches) > 1:
                break
    if len(matches) == 1:
        restored = bytes([matches[0]]) + raw[1:11]
        return restored, chr(matches[0])
    return raw, None


def _assemble_long_name(pending: list[tuple[int, bytes]]) -> LongNameCandidate | None:
    if not pending:
        return None
    ordered = list(reversed(pending))
    checksum = ordered[0][1][13]
    text_parts: list[str] = []
    expected = 1
    complete = True
    deleted = False
    slots: list[int] = []
    for slot, block in ordered:
        slots.append(slot)
        sequence = block[0]
        if sequence == DELETED_MARKER:
            deleted = True
        else:
            order = sequence & 0x1F
            if order != expected:
                complete = False
            expected = order + 1
        if block[13] != checksum:
            complete = False
        text_parts.append(_lfn_fragment(block))
    last_sequence = pending[0][1][0]
    if last_sequence != DELETED_MARKER and not last_sequence & 0x40:
        complete = False
    text = "".join(text_parts)
    if not text:
        return None
    return LongNameCandidate(
        text=text,
        checksum=checksum,
        sequence_complete=complete,
        deleted=deleted,
        entry_count=len(ordered),
        slots=slots,
    )


def parse_directory_region(
    data: bytes, offset_for_slot, scan_residual: bool = True
) -> list[RawDirectoryEntry]:
    entries: list[RawDirectoryEntry] = []
    pending: list[tuple[int, bytes]] = []
    slot_count = len(data) // BYTES_PER_DIR_ENTRY
    terminator_reached = False
    for slot in range(slot_count):
        start = slot * BYTES_PER_DIR_ENTRY
        block = data[start : start + BYTES_PER_DIR_ENTRY]
        first = block[0]
        if first == END_OF_DIRECTORY:
            terminator_reached = True
            pending.clear()
            if not scan_residual:
                break
            continue
        attributes = block[11]
        if attributes & ATTR_LONG_NAME_MASK == ATTR_LONG_NAME:
            if len(pending) < MAX_LFN_SEQUENCE:
                pending.append((slot, block))
            continue
        is_deleted = first == DELETED_MARKER or terminator_reached
        raw_name = block[0:11]
        if terminator_reached and (
            not is_plausible_short_name(raw_name) or attributes & ~ATTR_LONG_NAME_MASK
        ):
            pending.clear()
            continue
        candidate = _assemble_long_name(pending)
        pending = []
        recovered_char: str | None = None
        effective_name_raw = raw_name
        long_name_valid = False
        long_name: str | None = None
        if candidate is not None:
            if first == DELETED_MARKER:
                effective_name_raw, recovered_char = _restore_deleted_first_char(
                    raw_name, candidate.checksum
                )
                long_name_valid = recovered_char is not None and candidate.sequence_complete
            else:
                long_name_valid = (
                    short_name_checksum(raw_name) == candidate.checksum
                    and candidate.sequence_complete
                )
            long_name = candidate.text
        nt_flags = block[12]
        created_tenths = block[13]
        created_time, created_date, accessed_date = struct.unpack_from("<HHH", block, 14)
        first_cluster_high = struct.unpack_from("<H", block, 20)[0]
        modified_time, modified_date = struct.unpack_from("<HH", block, 22)
        first_cluster_low = struct.unpack_from("<H", block, 26)[0]
        size_bytes = struct.unpack_from("<I", block, 28)[0]
        first_cluster = (first_cluster_high << 16) | first_cluster_low
        short_name = decode_short_name(effective_name_raw, nt_flags)
        if first == DELETED_MARKER and recovered_char is None:
            short_name = "?" + short_name[1:] if short_name else "?"
        is_volume_label = bool(attributes & ATTR_VOLUME_ID) and not (attributes & ATTR_DIRECTORY)
        is_directory = bool(attributes & ATTR_DIRECTORY)
        if is_volume_label:
            short_name = effective_name_raw.decode("cp437", "replace").rstrip(" \x00")
            if first == DELETED_MARKER and recovered_char is None:
                short_name = "?" + short_name[1:]
        stripped = effective_name_raw.rstrip(b" ")
        is_dot_entry = stripped in (b".", b"..")
        entries.append(
            RawDirectoryEntry(
                slot=slot,
                offset=offset_for_slot(slot),
                short_name=short_name,
                short_name_raw=effective_name_raw,
                long_name=long_name,
                long_name_valid=long_name_valid,
                long_name_entries=candidate.entry_count if candidate else 0,
                recovered_first_char=recovered_char,
                attributes=attributes,
                nt_reserved=nt_flags,
                first_cluster=first_cluster,
                size_bytes=size_bytes,
                created_at=decode_timestamp(created_date, created_time, created_tenths),
                modified_at=decode_timestamp(modified_date, modified_time),
                accessed_at=decode_timestamp(accessed_date, 0),
                is_deleted=is_deleted,
                is_directory=is_directory,
                is_volume_label=is_volume_label,
                is_dot_entry=is_dot_entry,
                is_residual=terminator_reached,
                raw=block,
            )
        )
    return entries
