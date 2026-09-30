from __future__ import annotations

import struct
from datetime import datetime
from pathlib import Path

from .constants import (
    ATTR_ARCHIVE,
    ATTR_DIRECTORY,
    ATTR_HIDDEN,
    ATTR_LONG_NAME,
    ATTR_READ_ONLY,
    ATTR_SYSTEM,
    ATTR_VOLUME_ID,
    BYTES_PER_DIR_ENTRY,
    DELETED_MARKER,
    FAT_BAD,
    FSINFO_LEAD_SIGNATURE,
    FSINFO_STRUCT_SIGNATURE,
    FSINFO_TRAIL_SIGNATURE,
)
from .directory import short_name_checksum
from .timestamps import encode_fat_date, encode_fat_time, encode_tenths

SECTOR_SIZE = 512
SECTORS_PER_CLUSTER = 1
RESERVED_SECTORS = 32
NUM_FATS = 2
CLUSTER_COUNT = 65600
PARTITION_START_LBA = 2048
PARTITION_TYPE_FAT32_LBA = 0x0C
BACKUP_BOOT_SECTOR = 6
FSINFO_SECTOR = 1
MEDIA_DESCRIPTOR = 0xF8
VOLUME_SERIAL = 0x4F423244
BOOT_VOLUME_LABEL = "FATSCOPE   "
ROOT_VOLUME_LABEL = "CASE2024DEM"
OEM_NAME = b"FATSCOPE"

CLUSTER_SIZE = SECTOR_SIZE * SECTORS_PER_CLUSTER
FAT_ENTRY_TOTAL = CLUSTER_COUNT + 2
FAT_SIZE_SECTORS = (FAT_ENTRY_TOTAL * 4 + SECTOR_SIZE - 1) // SECTOR_SIZE
FAT_ENTRY_CAPACITY = FAT_SIZE_SECTORS * SECTOR_SIZE // 4
DATA_START_SECTOR = RESERVED_SECTORS + NUM_FATS * FAT_SIZE_SECTORS
VOLUME_SECTORS = DATA_START_SECTOR + CLUSTER_COUNT * SECTORS_PER_CLUSTER
IMAGE_SECTORS = PARTITION_START_LBA + VOLUME_SECTORS
VOLUME_OFFSET = PARTITION_START_LBA * SECTOR_SIZE
IMAGE_BYTES = IMAGE_SECTORS * SECTOR_SIZE

EOC = 0x0FFFFFFF


def _filler(seed: int, length: int) -> bytes:
    state = seed & 0xFFFFFFFF or 0x2BAD1DEA
    out = bytearray()
    while len(out) < length:
        state ^= (state << 13) & 0xFFFFFFFF
        state ^= state >> 17
        state ^= (state << 5) & 0xFFFFFFFF
        out += state.to_bytes(4, "little")
    return bytes(out[:length])


def _text_block(header: str, lines: list[str], repeat: int) -> bytes:
    body = [header, "=" * len(header), ""]
    for index in range(repeat):
        for line in lines:
            body.append(line.format(index=index, offset=index * 17 + 3))
    return ("\r\n".join(body) + "\r\n").encode("ascii")


def _jpeg_like(seed: int, length: int) -> bytes:
    header = bytes.fromhex("ffd8ffe000104a46494600010100000100010000")
    payload = _filler(seed, max(0, length - len(header) - 2))
    return header + payload + bytes.fromhex("ffd9")


class _Allocator:
    def __init__(self, fat: list[int]) -> None:
        self.fat = fat
        self.cursor = 2

    def take(self, count: int, stride: int = 1) -> list[int]:
        clusters: list[int] = []
        while len(clusters) < count:
            candidate = self.cursor
            self.cursor += stride
            if candidate > CLUSTER_COUNT + 1:
                raise RuntimeError("Demo image allocator exhausted the data region.")
            if self.fat[candidate] == 0:
                clusters.append(candidate)
        return clusters

    def link(self, clusters: list[int], terminator: int = EOC) -> None:
        for index, cluster in enumerate(clusters):
            if index + 1 < len(clusters):
                self.fat[cluster] = clusters[index + 1]
            else:
                self.fat[cluster] = terminator


def _short_raw(name: str) -> bytes:
    if len(name) != 11:
        raise ValueError("Short names must be exactly 11 bytes")
    return name.encode("ascii")


def _lfn_entries(long_name: str, short_raw: bytes, deleted: bool) -> bytes:
    checksum = short_name_checksum(short_raw)
    units = [ord(char) for char in long_name]
    units.append(0x0000)
    while len(units) % 13:
        units.append(0xFFFF)
    chunk_count = len(units) // 13
    blocks: list[bytes] = []
    for index in range(chunk_count):
        chunk = units[index * 13 : (index + 1) * 13]
        sequence = index + 1
        if index == chunk_count - 1:
            sequence |= 0x40
        if deleted:
            sequence = DELETED_MARKER
        block = bytearray(BYTES_PER_DIR_ENTRY)
        block[0] = sequence
        block[11] = ATTR_LONG_NAME
        block[12] = 0
        block[13] = checksum
        struct.pack_into("<H", block, 26, 0)
        positions = [(1, 5), (14, 6), (28, 2)]
        cursor = 0
        for start, count in positions:
            for slot in range(count):
                struct.pack_into("<H", block, start + slot * 2, chunk[cursor])
                cursor += 1
        blocks.append(bytes(block))
    return b"".join(reversed(blocks))


def _dir_entry(
    short_raw: bytes,
    attributes: int,
    first_cluster: int,
    size: int,
    created: datetime,
    modified: datetime,
    accessed: datetime,
    deleted: bool = False,
    nt_flags: int = 0,
) -> bytes:
    block = bytearray(BYTES_PER_DIR_ENTRY)
    name = bytearray(short_raw)
    if deleted:
        name[0] = DELETED_MARKER
    block[0:11] = name
    block[11] = attributes
    block[12] = nt_flags
    block[13] = encode_tenths(created)
    struct.pack_into("<H", block, 14, encode_fat_time(created))
    struct.pack_into("<H", block, 16, encode_fat_date(created))
    struct.pack_into("<H", block, 18, encode_fat_date(accessed))
    struct.pack_into("<H", block, 20, (first_cluster >> 16) & 0xFFFF)
    struct.pack_into("<H", block, 22, encode_fat_time(modified))
    struct.pack_into("<H", block, 24, encode_fat_date(modified))
    struct.pack_into("<H", block, 26, first_cluster & 0xFFFF)
    struct.pack_into("<I", block, 28, size)
    return bytes(block)


def _named_entry(
    long_name: str | None,
    short_name: str,
    attributes: int,
    first_cluster: int,
    size: int,
    created: datetime,
    modified: datetime,
    accessed: datetime,
    deleted: bool = False,
) -> bytes:
    short_raw = _short_raw(short_name)
    prefix = b""
    if long_name:
        prefix = _lfn_entries(long_name, short_raw, deleted)
    return prefix + _dir_entry(
        short_raw,
        attributes,
        first_cluster,
        size,
        created,
        modified,
        accessed,
        deleted=deleted,
    )


def _dot_entries(self_cluster: int, parent_cluster: int, moment: datetime) -> bytes:
    return _dir_entry(
        b".          ", ATTR_DIRECTORY, self_cluster, 0, moment, moment, moment
    ) + _dir_entry(b"..         ", ATTR_DIRECTORY, parent_cluster, 0, moment, moment, moment)


def _timestamp(day: int, hour: int, minute: int, second: int) -> datetime:
    return datetime(2024, 3, day, hour, minute, second)


class DemoImageBuilder:
    def __init__(self) -> None:
        self.image = bytearray(IMAGE_BYTES)
        self.fat = [0] * FAT_ENTRY_CAPACITY
        self.fat[0] = 0x0FFFFF00 | MEDIA_DESCRIPTOR
        self.fat[1] = EOC
        self.allocator = _Allocator(self.fat)

    def cluster_offset(self, cluster: int) -> int:
        return (
            VOLUME_OFFSET
            + (DATA_START_SECTOR + (cluster - 2) * SECTORS_PER_CLUSTER) * SECTOR_SIZE
        )

    def write_bytes(self, offset: int, payload: bytes) -> None:
        self.image[offset : offset + len(payload)] = payload

    def write_clusters(self, clusters: list[int], payload: bytes) -> None:
        cursor = 0
        for cluster in clusters:
            chunk = payload[cursor : cursor + CLUSTER_SIZE]
            if not chunk:
                break
            self.write_bytes(self.cluster_offset(cluster), chunk)
            cursor += CLUSTER_SIZE

    def store_file(self, payload: bytes, stride: int = 1) -> list[int]:
        count = max(1, -(-len(payload) // CLUSTER_SIZE))
        clusters = self.allocator.take(count, stride=stride)
        self.allocator.link(clusters)
        self.write_clusters(clusters, payload)
        return clusters

    def build(self) -> bytes:
        root_clusters = self.allocator.take(4)
        images_clusters = self.allocator.take(2)
        logs_clusters = self.allocator.take(2)
        archive_clusters = self.allocator.take(1)
        year_clusters = self.allocator.take(1)
        recycled_clusters = self.allocator.take(2)
        for chain in (
            root_clusters,
            images_clusters,
            logs_clusters,
            archive_clusters,
            year_clusters,
            recycled_clusters,
        ):
            self.allocator.link(chain)

        readme = _text_block(
            "FATScope demo evidence volume",
            [
                "Line {index:04d}: acquisition checksum segment {offset:05d}",
                "Line {index:04d}: chain-of-custody note retained for review",
            ],
            18,
        )
        readme_clusters = self.store_file(readme)

        intake = _text_block(
            "Evidence intake notes for case CASE-2024-0142",
            [
                "Entry {index:03d}: exhibit handled under read-only write blocker",
                "Entry {index:03d}: hash verified before and after imaging",
                "Entry {index:03d}: storage seal reference {offset:06d}",
            ],
            40,
        )
        intake_clusters = self.store_file(intake)

        config = _text_block(
            "SYSTEM CONFIGURATION",
            ["DEVICE={index:03d}", "BUFFERS={offset:03d}"],
            6,
        )
        config_clusters = self.store_file(config)

        manifest = (
            b'{"case":"CASE-2024-0142","custodian":"J. Alvarez",'
            b'"acquired":"2024-03-15T09:12:34","notes":"hidden manifest retained by tooling"}'
        )
        manifest_clusters = self.store_file(manifest)

        photo_one = _jpeg_like(0x51A7, 9_400)
        photo_one_clusters = self.store_file(photo_one)

        photo_two = _jpeg_like(0x77C3, 6_100)
        photo_two_clusters = self.store_file(photo_two)

        photo_three = _jpeg_like(0x1BE2, 12_800)
        photo_three_clusters = self.store_file(photo_three)

        system_log = _text_block(
            "SYSTEM EVENT LOG",
            [
                "2024-03-1{index} 08:1{index}:05 kernel: device enumerated at port {offset:03d}",
                "2024-03-1{index} 08:1{index}:09 usbstor: removable volume mounted read-write",
            ],
            30,
        )
        system_log_clusters = self.store_file(system_log)
        slack_used = len(system_log) - (len(system_log_clusters) - 1) * CLUSTER_SIZE
        slack_start = self.cluster_offset(system_log_clusters[-1]) + slack_used
        residual = (
            b"RESIDUAL SLACK: previous tenant record 'payroll-export-2023.csv' "
            b"account=8841-22 amount=19450.00;"
        )
        self.write_bytes(slack_start, residual[: CLUSTER_SIZE - slack_used])

        access_log = _text_block(
            "ACCESS LOG",
            ["user{index:02d} opened share //depot/evidence at offset {offset:05d}"],
            12,
        )
        access_log_clusters = self.store_file(access_log)

        backdated = _text_block(
            "DEVICE PROVISIONING LOG",
            ["step {index:02d} completed with status code {offset:04d}"],
            9,
        )
        backdated_clusters = self.store_file(backdated)

        january_log = _text_block(
            "ARCHIVED JANUARY LOG",
            ["2023-01-{index:02d} archive rotation completed, sequence {offset:05d}"],
            8,
        )
        january_clusters = self.store_file(january_log)

        fragmented = _filler(0x30FA, 14_500)
        fragmented_clusters = self.store_file(fragmented, stride=3)

        crosslink_head = self.allocator.take(1)
        shared_cluster = photo_two_clusters[1]
        self.fat[crosslink_head[0]] = shared_cluster
        self.write_bytes(
            self.cluster_offset(crosslink_head[0]),
            b"CROSSLINKED PAYLOAD HEADER; continues into a cluster owned by another file. "
            + _filler(0x9911, CLUSTER_SIZE - 78),
        )
        crosslink_size = CLUSTER_SIZE + 240

        orphan_clusters = self.allocator.take(6)
        self.allocator.link(orphan_clusters)
        self.write_clusters(
            orphan_clusters,
            b"ORPHANED CHAIN: allocated in the FAT with no directory entry referencing it. "
            + _filler(0x4242, 6 * CLUSTER_SIZE),
        )

        bad_clusters = self.allocator.take(3)
        for cluster in bad_clusters:
            self.fat[cluster] = FAT_BAD
            self.write_bytes(
                self.cluster_offset(cluster),
                b"BAD CLUSTER MARKER REGION " + _filler(0x7777, CLUSTER_SIZE - 26),
            )

        broken_clusters = self.allocator.take(3)
        self.allocator.link(broken_clusters)
        self.write_clusters(broken_clusters, _filler(0x5150, 3 * CLUSTER_SIZE))
        self.fat[broken_clusters[2]] = 0

        looped_clusters = self.allocator.take(4)
        self.allocator.link(looped_clusters, terminator=looped_clusters[0])
        self.write_clusters(looped_clusters, _filler(0x6161, 4 * CLUSTER_SIZE))

        deleted_note = _text_block(
            "CONFIDENTIAL DRAFT",
            ["Paragraph {index:02d}: retained draft text pending legal review"],
            5,
        )
        deleted_note_clusters = self.store_file(deleted_note)

        deleted_transcript = _text_block(
            "SUSPECT INTERVIEW TRANSCRIPT",
            [
                "Q{index:02d}: interviewer question recorded at marker {offset:05d}",
                "A{index:02d}: response recorded verbatim by the transcription service",
            ],
            22,
        )
        deleted_transcript_clusters = self.store_file(deleted_transcript)

        overwritten_clusters = self.store_file(_filler(0x1357, 3 * CLUSTER_SIZE))
        for cluster in deleted_note_clusters + deleted_transcript_clusters + overwritten_clusters:
            self.fat[cluster] = 0
        replacement = _text_block(
            "REPLACEMENT PAYLOAD",
            ["Block {index:03d}: written after the previous file was deleted"],
            14,
        )
        reused = overwritten_clusters[: max(1, -(-len(replacement) // CLUSTER_SIZE))]
        self.allocator.link(reused)
        self.write_clusters(reused, replacement)

        base = _timestamp(15, 9, 12, 34)
        root_entries = [
            _dir_entry(
                _short_raw(ROOT_VOLUME_LABEL),
                ATTR_VOLUME_ID,
                0,
                0,
                base,
                base,
                base,
            ),
            _named_entry(
                None,
                "README  TXT",
                ATTR_ARCHIVE,
                readme_clusters[0],
                len(readme),
                _timestamp(15, 9, 12, 34),
                _timestamp(15, 9, 40, 12),
                _timestamp(18, 0, 0, 0),
            ),
            _named_entry(
                "Evidence Intake Notes.txt",
                "EVIDEN~1TXT",
                ATTR_ARCHIVE,
                intake_clusters[0],
                len(intake),
                _timestamp(15, 10, 2, 8),
                _timestamp(16, 14, 22, 46),
                _timestamp(19, 0, 0, 0),
            ),
            _named_entry(
                None,
                "CONFIG  SYS",
                ATTR_SYSTEM | ATTR_HIDDEN | ATTR_READ_ONLY,
                config_clusters[0],
                len(config),
                _timestamp(15, 8, 0, 2),
                _timestamp(15, 8, 0, 2),
                _timestamp(15, 8, 0, 2),
            ),
            _named_entry(
                ".hidden-manifest.json",
                "HIDDEN~1JSO",
                ATTR_HIDDEN | ATTR_ARCHIVE,
                manifest_clusters[0],
                len(manifest),
                _timestamp(15, 11, 5, 30),
                _timestamp(15, 11, 5, 30),
                _timestamp(20, 0, 0, 0),
            ),
            _named_entry(
                None,
                "IMAGES     ",
                ATTR_DIRECTORY,
                images_clusters[0],
                0,
                _timestamp(15, 9, 14, 0),
                _timestamp(17, 12, 1, 22),
                _timestamp(20, 0, 0, 0),
            ),
            _named_entry(
                None,
                "LOGS       ",
                ATTR_DIRECTORY,
                logs_clusters[0],
                0,
                _timestamp(15, 9, 14, 10),
                _timestamp(21, 6, 45, 8),
                _timestamp(21, 0, 0, 0),
            ),
            _named_entry(
                None,
                "RECYCLED   ",
                ATTR_DIRECTORY | ATTR_HIDDEN | ATTR_SYSTEM,
                recycled_clusters[0],
                0,
                _timestamp(15, 9, 14, 20),
                _timestamp(22, 19, 3, 44),
                _timestamp(22, 0, 0, 0),
            ),
            _named_entry(
                "fragmented-capture.bin",
                "FRAGME~1BIN",
                ATTR_ARCHIVE,
                fragmented_clusters[0],
                len(fragmented),
                _timestamp(18, 13, 30, 0),
                _timestamp(18, 16, 48, 36),
                _timestamp(22, 0, 0, 0),
            ),
            _named_entry(
                None,
                "CROSSLNKDAT",
                ATTR_ARCHIVE,
                crosslink_head[0],
                crosslink_size,
                _timestamp(19, 7, 25, 14),
                _timestamp(19, 7, 25, 14),
                _timestamp(22, 0, 0, 0),
            ),
            _named_entry(
                None,
                "REPLACE BIN",
                ATTR_ARCHIVE,
                overwritten_clusters[0],
                len(replacement),
                _timestamp(23, 11, 11, 2),
                _timestamp(23, 11, 11, 2),
                _timestamp(23, 0, 0, 0),
            ),
            _named_entry(
                None,
                "BACKDATELOG",
                ATTR_ARCHIVE,
                backdated_clusters[0],
                len(backdated),
                _timestamp(21, 18, 0, 0),
                _timestamp(16, 4, 30, 0),
                _timestamp(23, 0, 0, 0),
            ),
            _named_entry(
                None,
                "SECRET  TXT",
                ATTR_ARCHIVE,
                deleted_note_clusters[0],
                len(deleted_note),
                _timestamp(16, 21, 40, 12),
                _timestamp(16, 22, 2, 58),
                _timestamp(20, 0, 0, 0),
                deleted=True,
            ),
            _named_entry(
                "Suspect Interview Transcript.rtf",
                "SUSPEC~1RTF",
                ATTR_ARCHIVE,
                deleted_transcript_clusters[0],
                len(deleted_transcript),
                _timestamp(17, 15, 18, 6),
                _timestamp(17, 19, 55, 40),
                _timestamp(21, 0, 0, 0),
                deleted=True,
            ),
            _named_entry(
                None,
                "OVERWRITDAT",
                ATTR_ARCHIVE,
                overwritten_clusters[0],
                3 * CLUSTER_SIZE,
                _timestamp(14, 9, 1, 12),
                _timestamp(14, 9, 40, 30),
                _timestamp(19, 0, 0, 0),
                deleted=True,
            ),
        ]

        images_entries = [
            _dot_entries(images_clusters[0], 0, _timestamp(15, 9, 14, 0)),
            _named_entry(
                None,
                "DSC_0001JPG",
                ATTR_ARCHIVE,
                photo_one_clusters[0],
                len(photo_one),
                _timestamp(16, 11, 2, 40),
                _timestamp(16, 11, 2, 40),
                _timestamp(20, 0, 0, 0),
            ),
            _named_entry(
                None,
                "DSC_0002JPG",
                ATTR_ARCHIVE,
                photo_two_clusters[0],
                len(photo_two),
                _timestamp(16, 11, 4, 12),
                _timestamp(16, 11, 4, 12),
                _timestamp(20, 0, 0, 0),
            ),
            _named_entry(
                "Vacation Photo 2024-06-11.jpg",
                "VACATI~1JPG",
                ATTR_ARCHIVE,
                photo_three_clusters[0],
                len(photo_three),
                _timestamp(17, 9, 30, 18),
                _timestamp(17, 9, 30, 18),
                _timestamp(21, 0, 0, 0),
            ),
        ]

        logs_entries = [
            _dot_entries(logs_clusters[0], 0, _timestamp(15, 9, 14, 10)),
            _named_entry(
                None,
                "SYSTEM  LOG",
                ATTR_ARCHIVE,
                system_log_clusters[0],
                len(system_log),
                _timestamp(15, 9, 20, 0),
                _timestamp(21, 6, 45, 8),
                _timestamp(21, 0, 0, 0),
            ),
            _named_entry(
                None,
                "ACCESS  LOG",
                ATTR_ARCHIVE,
                access_log_clusters[0],
                len(access_log),
                _timestamp(15, 9, 21, 0),
                _timestamp(20, 17, 12, 30),
                _timestamp(21, 0, 0, 0),
            ),
            _named_entry(
                None,
                "ARCHIVE    ",
                ATTR_DIRECTORY,
                archive_clusters[0],
                0,
                _timestamp(15, 9, 22, 0),
                _timestamp(20, 17, 14, 0),
                _timestamp(21, 0, 0, 0),
            ),
        ]

        archive_entries = [
            _dot_entries(archive_clusters[0], logs_clusters[0], _timestamp(15, 9, 22, 0)),
            _named_entry(
                None,
                "2023       ",
                ATTR_DIRECTORY,
                year_clusters[0],
                0,
                _timestamp(15, 9, 23, 0),
                _timestamp(20, 17, 15, 0),
                _timestamp(21, 0, 0, 0),
            ),
        ]

        year_entries = [
            _dot_entries(year_clusters[0], archive_clusters[0], _timestamp(15, 9, 23, 0)),
            _named_entry(
                None,
                "JAN     LOG",
                ATTR_ARCHIVE,
                january_clusters[0],
                len(january_log),
                _timestamp(15, 9, 24, 0),
                _timestamp(15, 9, 24, 0),
                _timestamp(21, 0, 0, 0),
            ),
        ]

        recycled_entries = [
            _dot_entries(recycled_clusters[0], 0, _timestamp(15, 9, 14, 20)),
            _named_entry(
                None,
                "INDEX   DAT",
                ATTR_ARCHIVE | ATTR_HIDDEN,
                broken_clusters[0],
                3 * CLUSTER_SIZE,
                _timestamp(15, 9, 30, 0),
                _timestamp(22, 19, 3, 44),
                _timestamp(22, 0, 0, 0),
            ),
            _named_entry(
                None,
                "LOOPED  DAT",
                ATTR_ARCHIVE | ATTR_SYSTEM,
                looped_clusters[0],
                4 * CLUSTER_SIZE,
                _timestamp(15, 9, 31, 0),
                _timestamp(22, 19, 5, 10),
                _timestamp(22, 0, 0, 0),
            ),
            bytes(BYTES_PER_DIR_ENTRY),
            _named_entry(
                None,
                "PURGED  TMP",
                ATTR_ARCHIVE,
                january_clusters[0],
                len(january_log),
                _timestamp(13, 6, 15, 44),
                _timestamp(13, 6, 40, 12),
                _timestamp(18, 0, 0, 0),
                deleted=True,
            ),
        ]

        self._write_directory(root_clusters, root_entries)
        self._write_directory(images_clusters, images_entries)
        self._write_directory(logs_clusters, logs_entries)
        self._write_directory(archive_clusters, archive_entries)
        self._write_directory(year_clusters, year_entries)
        self._write_directory(recycled_clusters, recycled_entries)

        free_clusters = sum(1 for cluster in range(2, CLUSTER_COUNT + 2) if self.fat[cluster] == 0)
        self._write_mbr()
        self._write_boot_sectors()
        self._write_fsinfo(free_clusters + 137)
        self._write_fat_copies()
        return bytes(self.image)

    def _write_directory(self, clusters: list[int], entries: list[bytes]) -> None:
        blob = b"".join(entries)
        capacity = len(clusters) * CLUSTER_SIZE
        if len(blob) > capacity:
            raise RuntimeError("Directory content exceeds its allocated clusters.")
        self.write_clusters(clusters, blob + bytes(capacity - len(blob)))

    def _write_mbr(self) -> None:
        block = bytearray(SECTOR_SIZE)
        block[0:11] = b"\x33\xc0\x8e\xd0\xbc\x00\x7c\x8e\xc0\x8e\xd8"
        entry = bytearray(16)
        entry[0] = 0x80
        entry[1:4] = b"\x20\x21\x00"
        entry[4] = PARTITION_TYPE_FAT32_LBA
        entry[5:8] = b"\xfe\xff\xff"
        struct.pack_into("<II", entry, 8, PARTITION_START_LBA, VOLUME_SECTORS)
        block[0x1BE : 0x1BE + 16] = entry
        struct.pack_into("<H", block, 510, 0xAA55)
        self.write_bytes(0, bytes(block))

    def _boot_block(self, label: str, oem: bytes) -> bytes:
        block = bytearray(SECTOR_SIZE)
        block[0:3] = b"\xeb\x58\x90"
        block[3:11] = oem.ljust(8, b" ")[:8]
        struct.pack_into("<H", block, 11, SECTOR_SIZE)
        block[13] = SECTORS_PER_CLUSTER
        struct.pack_into("<H", block, 14, RESERVED_SECTORS)
        block[16] = NUM_FATS
        struct.pack_into("<H", block, 17, 0)
        struct.pack_into("<H", block, 19, 0)
        block[21] = MEDIA_DESCRIPTOR
        struct.pack_into("<H", block, 22, 0)
        struct.pack_into("<H", block, 24, 63)
        struct.pack_into("<H", block, 26, 255)
        struct.pack_into("<I", block, 28, PARTITION_START_LBA)
        struct.pack_into("<I", block, 32, VOLUME_SECTORS)
        struct.pack_into("<I", block, 36, FAT_SIZE_SECTORS)
        struct.pack_into("<H", block, 40, 0)
        struct.pack_into("<H", block, 42, 0)
        struct.pack_into("<I", block, 44, 2)
        struct.pack_into("<H", block, 48, FSINFO_SECTOR)
        struct.pack_into("<H", block, 50, BACKUP_BOOT_SECTOR)
        block[64] = 0x80
        block[66] = 0x29
        struct.pack_into("<I", block, 67, VOLUME_SERIAL)
        block[71:82] = label.encode("ascii")[:11].ljust(11, b" ")
        block[82:90] = b"FAT32   "
        struct.pack_into("<H", block, 510, 0xAA55)
        return bytes(block)

    def _write_boot_sectors(self) -> None:
        self.write_bytes(VOLUME_OFFSET, self._boot_block(BOOT_VOLUME_LABEL, OEM_NAME))
        self.write_bytes(
            VOLUME_OFFSET + BACKUP_BOOT_SECTOR * SECTOR_SIZE,
            self._boot_block("STALECOPY  ", b"MSWIN4.1"),
        )

    def _write_fsinfo(self, free_count: int) -> None:
        block = bytearray(SECTOR_SIZE)
        struct.pack_into("<I", block, 0, FSINFO_LEAD_SIGNATURE)
        struct.pack_into("<I", block, 484, FSINFO_STRUCT_SIGNATURE)
        struct.pack_into("<I", block, 488, free_count)
        struct.pack_into("<I", block, 492, 4096)
        struct.pack_into("<I", block, 508, FSINFO_TRAIL_SIGNATURE)
        self.write_bytes(VOLUME_OFFSET + FSINFO_SECTOR * SECTOR_SIZE, bytes(block))
        self.write_bytes(
            VOLUME_OFFSET + (BACKUP_BOOT_SECTOR + FSINFO_SECTOR) * SECTOR_SIZE, bytes(block)
        )

    def _write_fat_copies(self) -> None:
        primary = bytearray()
        for value in self.fat:
            primary += struct.pack("<I", value)
        self.write_bytes(VOLUME_OFFSET + RESERVED_SECTORS * SECTOR_SIZE, bytes(primary))
        secondary = bytearray(primary)
        for cluster in (900, 901, 902, 1500):
            struct.pack_into("<I", secondary, cluster * 4, 0x0FFFFFF0)
        self.write_bytes(
            VOLUME_OFFSET + (RESERVED_SECTORS + FAT_SIZE_SECTORS) * SECTOR_SIZE, bytes(secondary)
        )


def build_demo_image(destination: str | Path) -> Path:
    path = Path(destination)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = DemoImageBuilder().build()
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_bytes(payload)
    temporary.replace(path)
    return path


def demo_image_filename() -> str:
    return "fatscope-demo-case.img"


def demo_image_description() -> dict:
    return {
        "filename": demo_image_filename(),
        "container": "MBR disk image with one FAT32 partition",
        "bytes_per_sector": SECTOR_SIZE,
        "sectors_per_cluster": SECTORS_PER_CLUSTER,
        "cluster_count": CLUSTER_COUNT,
        "size_bytes": IMAGE_BYTES,
        "partition_start_lba": PARTITION_START_LBA,
        "planted_conditions": [
            "cross-linked clusters shared by two files",
            "orphaned allocated cluster chain",
            "bad-cluster markers",
            "broken cluster chain ending in a free entry",
            "self-referencing cluster chain loop",
            "divergent second file allocation table",
            "stale FSInfo free-cluster count",
            "mismatched backup boot sector",
            "non-zero file slack after a log file",
            "deleted files with recoverable and overwritten content",
            "residual directory entry beyond the directory terminator",
            "timestamp inversion between creation and modification",
        ],
    }
