from __future__ import annotations

import hashlib
import mmap
import struct
from dataclasses import dataclass
from pathlib import Path
from types import TracebackType

from .constants import (
    BOOT_SIGNATURE,
    BOOT_SIGNATURE_OFFSET,
    EXTENDED_PARTITION_TYPES,
    FAT32_PARTITION_TYPES,
    GPT_PROTECTIVE_TYPE,
    MBR_PARTITION_COUNT,
    MBR_PARTITION_ENTRY_SIZE,
    MBR_PARTITION_TABLE_OFFSET,
    PARTITION_TYPE_NAMES,
    VALID_SECTOR_SIZES,
    VALID_SECTORS_PER_CLUSTER,
)
from .errors import ImageBoundsError, UnsupportedImageError

SECTOR_UNIT = 512
HASH_CHUNK = 1024 * 1024


@dataclass(frozen=True)
class PartitionEntry:
    index: int
    bootable: bool
    type_code: int
    type_name: str
    start_lba: int
    sector_count: int
    start_offset: int
    size_bytes: int
    is_fat32_candidate: bool
    within_image: bool


@dataclass(frozen=True)
class VolumeLocation:
    container: str
    offset: int
    length: int
    partition_index: int | None


class ImageReader:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        if not self.path.is_file():
            raise UnsupportedImageError(
                "Evidence image file was not found on disk.",
                "The stored image may have been removed by retention cleanup.",
            )
        self.size = self.path.stat().st_size
        if self.size < SECTOR_UNIT:
            raise UnsupportedImageError(
                "Image is smaller than a single 512-byte sector.",
                "Upload a complete FAT32 volume or disk image.",
            )
        self._handle = self.path.open("rb")
        try:
            self._map = mmap.mmap(self._handle.fileno(), 0, access=mmap.ACCESS_READ)
        except (ValueError, OSError) as exc:
            self._handle.close()
            raise UnsupportedImageError(
                "Image could not be opened for read-only mapping.",
                str(exc),
            ) from exc

    def __enter__(self) -> ImageReader:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        self.close()

    def close(self) -> None:
        if getattr(self, "_map", None) is not None:
            self._map.close()
            self._map = None
        if getattr(self, "_handle", None) is not None:
            self._handle.close()
            self._handle = None

    def read(self, offset: int, length: int) -> bytes:
        if offset < 0 or length < 0:
            raise ImageBoundsError("Negative offsets and lengths are not permitted.")
        if offset >= self.size or length == 0:
            return b""
        end = min(self.size, offset + length)
        return self._map[offset:end]

    def read_exact(self, offset: int, length: int) -> bytes:
        data = self.read(offset, length)
        if len(data) != length:
            raise ImageBoundsError(
                f"Requested {length} bytes at offset {offset} but the image ends at {self.size}."
            )
        return data

    def sha256(self) -> str:
        digest = hashlib.sha256()
        with self.path.open("rb") as handle:
            while True:
                chunk = handle.read(HASH_CHUNK)
                if not chunk:
                    break
                digest.update(chunk)
        return digest.hexdigest()


def looks_like_fat32_boot(block: bytes) -> bool:
    if len(block) < 512:
        return False
    bytes_per_sector = struct.unpack_from("<H", block, 11)[0]
    sectors_per_cluster = block[13]
    reserved_sectors = struct.unpack_from("<H", block, 14)[0]
    num_fats = block[16]
    root_entries = struct.unpack_from("<H", block, 17)[0]
    fat_size_16 = struct.unpack_from("<H", block, 22)[0]
    fat_size_32 = struct.unpack_from("<I", block, 36)[0]
    fs_type = block[82:90]
    if bytes_per_sector not in VALID_SECTOR_SIZES:
        return False
    if sectors_per_cluster not in VALID_SECTORS_PER_CLUSTER:
        return False
    if reserved_sectors == 0 or num_fats == 0 or num_fats > 4:
        return False
    if root_entries != 0 or fat_size_16 != 0:
        return False
    if fat_size_32 == 0:
        return False
    if fs_type.startswith(b"FAT32"):
        return True
    root_cluster = struct.unpack_from("<I", block, 44)[0]
    return root_cluster >= 2


def read_partition_table(reader: ImageReader) -> list[PartitionEntry]:
    block = reader.read(0, SECTOR_UNIT)
    if len(block) < SECTOR_UNIT:
        return []
    signature = struct.unpack_from("<H", block, BOOT_SIGNATURE_OFFSET)[0]
    if signature != BOOT_SIGNATURE:
        return []
    partitions: list[PartitionEntry] = []
    for index in range(MBR_PARTITION_COUNT):
        base = MBR_PARTITION_TABLE_OFFSET + index * MBR_PARTITION_ENTRY_SIZE
        entry = block[base : base + MBR_PARTITION_ENTRY_SIZE]
        boot_flag = entry[0]
        type_code = entry[4]
        start_lba, sector_count = struct.unpack_from("<II", entry, 8)
        if type_code == 0 and start_lba == 0 and sector_count == 0:
            continue
        start_offset = start_lba * SECTOR_UNIT
        size_bytes = sector_count * SECTOR_UNIT
        partitions.append(
            PartitionEntry(
                index=index,
                bootable=boot_flag == 0x80,
                type_code=type_code,
                type_name=PARTITION_TYPE_NAMES.get(type_code, f"Unknown (0x{type_code:02X})"),
                start_lba=start_lba,
                sector_count=sector_count,
                start_offset=start_offset,
                size_bytes=size_bytes,
                is_fat32_candidate=type_code in FAT32_PARTITION_TYPES,
                within_image=start_offset + SECTOR_UNIT <= reader.size,
            )
        )
    return partitions


def _extended_partitions(
    reader: ImageReader, parent: PartitionEntry, start_index: int
) -> list[PartitionEntry]:
    found: list[PartitionEntry] = []
    current = parent.start_offset
    seen: set[int] = set()
    index = start_index
    while current not in seen and len(found) < MBR_PARTITION_COUNT:
        seen.add(current)
        block = reader.read(current, SECTOR_UNIT)
        if len(block) < SECTOR_UNIT:
            break
        if struct.unpack_from("<H", block, BOOT_SIGNATURE_OFFSET)[0] != BOOT_SIGNATURE:
            break
        first = block[MBR_PARTITION_TABLE_OFFSET : MBR_PARTITION_TABLE_OFFSET + 16]
        second = block[MBR_PARTITION_TABLE_OFFSET + 16 : MBR_PARTITION_TABLE_OFFSET + 32]
        type_code = first[4]
        start_lba, sector_count = struct.unpack_from("<II", first, 8)
        if sector_count:
            start_offset = current + start_lba * SECTOR_UNIT
            found.append(
                PartitionEntry(
                    index=index,
                    bootable=first[0] == 0x80,
                    type_code=type_code,
                    type_name=PARTITION_TYPE_NAMES.get(type_code, f"Unknown (0x{type_code:02X})"),
                    start_lba=start_offset // SECTOR_UNIT,
                    sector_count=sector_count,
                    start_offset=start_offset,
                    size_bytes=sector_count * SECTOR_UNIT,
                    is_fat32_candidate=type_code in FAT32_PARTITION_TYPES,
                    within_image=start_offset + SECTOR_UNIT <= reader.size,
                )
            )
            index += 1
        next_lba = struct.unpack_from("<I", second, 8)[0]
        if next_lba == 0:
            break
        current = parent.start_offset + next_lba * SECTOR_UNIT
    return found


def enumerate_partitions(reader: ImageReader) -> list[PartitionEntry]:
    primary = read_partition_table(reader)
    result = list(primary)
    for entry in primary:
        if entry.type_code in EXTENDED_PARTITION_TYPES:
            result.extend(_extended_partitions(reader, entry, len(result)))
    return result


def locate_volume(reader: ImageReader) -> tuple[VolumeLocation, list[PartitionEntry]]:
    head = reader.read(0, SECTOR_UNIT)
    partitions = enumerate_partitions(reader)
    if looks_like_fat32_boot(head):
        return (
            VolumeLocation(
                container="raw_volume", offset=0, length=reader.size, partition_index=None
            ),
            partitions,
        )
    if not partitions:
        raise UnsupportedImageError(
            "No FAT32 boot sector and no MBR partition table were found.",
            "FATScope reads raw FAT32 volume images and MBR disks that contain a FAT32 partition.",
        )
    if any(item.type_code == GPT_PROTECTIVE_TYPE for item in partitions):
        raise UnsupportedImageError(
            "The image uses a GPT partition scheme, which is not supported.",
            "Extract the FAT32 partition to a raw volume image before uploading.",
        )
    ordered = sorted(partitions, key=lambda item: (not item.is_fat32_candidate, item.index))
    for entry in ordered:
        if not entry.within_image or entry.start_offset <= 0:
            continue
        block = reader.read(entry.start_offset, SECTOR_UNIT)
        if looks_like_fat32_boot(block):
            length = entry.size_bytes or (reader.size - entry.start_offset)
            length = min(length, reader.size - entry.start_offset)
            return (
                VolumeLocation(
                    container="mbr_disk",
                    offset=entry.start_offset,
                    length=length,
                    partition_index=entry.index,
                ),
                partitions,
            )
    described = ", ".join(f"#{item.index} {item.type_name}" for item in partitions) or "none"
    raise UnsupportedImageError(
        "The MBR partition table contains no readable FAT32 partition.",
        f"Detected partitions: {described}.",
    )
