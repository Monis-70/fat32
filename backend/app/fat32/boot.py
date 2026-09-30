from __future__ import annotations

import struct
from dataclasses import asdict, dataclass, field

from .constants import (
    BOOT_SIGNATURE,
    BOOT_SIGNATURE_OFFSET,
    EXTENDED_BOOT_SIGNATURE,
    FAT32_MIN_CLUSTER_COUNT,
    FSINFO_LEAD_SIGNATURE,
    FSINFO_STRUCT_SIGNATURE,
    FSINFO_TRAIL_SIGNATURE,
    FSINFO_UNKNOWN,
    MAX_CLUSTER_COUNT,
    VALID_SECTOR_SIZES,
    VALID_SECTORS_PER_CLUSTER,
)
from .errors import CorruptVolumeError


def _decode_oem(raw: bytes) -> str:
    return raw.decode("ascii", "replace").rstrip(" \x00")


@dataclass(frozen=True)
class BootSector:
    jump_boot: str
    oem_name: str
    bytes_per_sector: int
    sectors_per_cluster: int
    reserved_sector_count: int
    num_fats: int
    root_entry_count: int
    total_sectors_16: int
    media_descriptor: int
    fat_size_16: int
    sectors_per_track: int
    number_of_heads: int
    hidden_sectors: int
    total_sectors_32: int
    fat_size_32: int
    ext_flags: int
    filesystem_version: str
    root_cluster: int
    fsinfo_sector: int
    backup_boot_sector: int
    drive_number: int
    extended_boot_signature: int
    volume_id: str
    volume_label: str
    filesystem_type: str
    boot_signature: int
    active_fat: int
    fat_mirroring_enabled: bool

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Geometry:
    bytes_per_sector: int
    sectors_per_cluster: int
    bytes_per_cluster: int
    reserved_sector_count: int
    num_fats: int
    fat_size_sectors: int
    fat_size_bytes: int
    fat_start_sector: int
    fat_start_offset: int
    data_start_sector: int
    data_start_offset: int
    total_sectors: int
    total_data_sectors: int
    cluster_count: int
    first_cluster: int
    last_cluster: int
    root_cluster: int
    volume_size_bytes: int
    data_size_bytes: int
    volume_offset: int
    fat_entry_count: int

    def cluster_offset(self, cluster: int) -> int:
        return self.data_start_offset + (cluster - 2) * self.bytes_per_cluster

    def is_valid_cluster(self, cluster: int) -> bool:
        return self.first_cluster <= cluster <= self.last_cluster

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class FsInfoSector:
    present: bool
    sector: int
    offset: int
    lead_signature: int
    struct_signature: int
    trail_signature: int
    free_cluster_count: int | None
    next_free_cluster: int | None
    signatures_valid: bool
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["lead_signature_hex"] = f"0x{self.lead_signature:08X}"
        data["struct_signature_hex"] = f"0x{self.struct_signature:08X}"
        data["trail_signature_hex"] = f"0x{self.trail_signature:08X}"
        return data


@dataclass
class BootSectorComparison:
    backup_sector: int
    backup_present: bool
    identical: bool
    differing_byte_count: int
    first_difference_offsets: list[int]

    def to_dict(self) -> dict:
        return asdict(self)


def parse_boot_sector(block: bytes) -> BootSector:
    if len(block) < 512:
        raise CorruptVolumeError("Boot sector is truncated.", "Fewer than 512 bytes are readable.")
    (
        bytes_per_sector,
        sectors_per_cluster,
        reserved_sector_count,
        num_fats,
        root_entry_count,
        total_sectors_16,
        media_descriptor,
        fat_size_16,
        sectors_per_track,
        number_of_heads,
        hidden_sectors,
        total_sectors_32,
    ) = struct.unpack_from("<HBHBHHBHHHII", block, 11)
    (
        fat_size_32,
        ext_flags,
        fs_version_minor,
        fs_version_major,
        root_cluster,
        fsinfo_sector,
        backup_boot_sector,
    ) = struct.unpack_from("<IHBBIHH", block, 36)
    drive_number = block[64]
    extended_boot_signature = block[66]
    volume_id = struct.unpack_from("<I", block, 67)[0]
    volume_label = block[71:82].decode("ascii", "replace").rstrip(" \x00")
    filesystem_type = block[82:90].decode("ascii", "replace").rstrip(" \x00")
    signature = struct.unpack_from("<H", block, BOOT_SIGNATURE_OFFSET)[0]
    mirroring_disabled = bool(ext_flags & 0x0080)
    return BootSector(
        jump_boot=block[0:3].hex().upper(),
        oem_name=_decode_oem(block[3:11]),
        bytes_per_sector=bytes_per_sector,
        sectors_per_cluster=sectors_per_cluster,
        reserved_sector_count=reserved_sector_count,
        num_fats=num_fats,
        root_entry_count=root_entry_count,
        total_sectors_16=total_sectors_16,
        media_descriptor=media_descriptor,
        fat_size_16=fat_size_16,
        sectors_per_track=sectors_per_track,
        number_of_heads=number_of_heads,
        hidden_sectors=hidden_sectors,
        total_sectors_32=total_sectors_32,
        fat_size_32=fat_size_32,
        ext_flags=ext_flags,
        filesystem_version=f"{fs_version_major}.{fs_version_minor}",
        root_cluster=root_cluster,
        fsinfo_sector=fsinfo_sector,
        backup_boot_sector=backup_boot_sector,
        drive_number=drive_number,
        extended_boot_signature=extended_boot_signature,
        volume_id=f"{volume_id >> 16:04X}-{volume_id & 0xFFFF:04X}",
        volume_label=volume_label,
        filesystem_type=filesystem_type,
        boot_signature=signature,
        active_fat=ext_flags & 0x000F if mirroring_disabled else 0,
        fat_mirroring_enabled=not mirroring_disabled,
    )


def validate_boot_sector(boot: BootSector) -> list[str]:
    issues: list[str] = []
    if boot.boot_signature != BOOT_SIGNATURE:
        issues.append(
            f"Boot sector signature is 0x{boot.boot_signature:04X} instead of 0x{BOOT_SIGNATURE:04X}."
        )
    if boot.bytes_per_sector not in VALID_SECTOR_SIZES:
        issues.append(f"Bytes per sector value {boot.bytes_per_sector} is not a valid sector size.")
    if boot.sectors_per_cluster not in VALID_SECTORS_PER_CLUSTER:
        issues.append(
            f"Sectors per cluster value {boot.sectors_per_cluster} is not a power of two in range."
        )
    if boot.num_fats == 0:
        issues.append("Boot sector declares zero file allocation tables.")
    if boot.reserved_sector_count == 0:
        issues.append("Boot sector declares zero reserved sectors.")
    if boot.root_entry_count != 0:
        issues.append("Root entry count must be zero on FAT32 volumes.")
    if boot.fat_size_16 != 0:
        issues.append("16-bit FAT size must be zero on FAT32 volumes.")
    if boot.fat_size_32 == 0:
        issues.append("32-bit FAT size is zero, so the allocation table cannot be located.")
    if boot.root_cluster < 2:
        issues.append(f"Root directory cluster {boot.root_cluster} is below the first data cluster.")
    if boot.extended_boot_signature != EXTENDED_BOOT_SIGNATURE:
        issues.append(
            f"Extended boot signature is 0x{boot.extended_boot_signature:02X} instead of 0x29."
        )
    if not boot.filesystem_type.startswith("FAT32"):
        issues.append(f"Filesystem type string reads '{boot.filesystem_type}' instead of 'FAT32'.")
    if boot.filesystem_version != "0.0":
        issues.append(f"Filesystem version {boot.filesystem_version} is not the defined value 0.0.")
    return issues


def build_geometry(boot: BootSector, volume_offset: int, available_bytes: int) -> Geometry:
    fatal = [
        issue
        for issue in validate_boot_sector(boot)
        if "sector size" in issue or "power of two" in issue or "allocation table" in issue
    ]
    if fatal:
        raise CorruptVolumeError(
            "The FAT32 BIOS Parameter Block is not usable.", " ".join(fatal)
        )
    bytes_per_cluster = boot.bytes_per_sector * boot.sectors_per_cluster
    total_sectors = boot.total_sectors_32 or boot.total_sectors_16
    available_sectors = available_bytes // boot.bytes_per_sector
    if total_sectors == 0 or total_sectors > available_sectors:
        total_sectors = available_sectors
    fat_start_sector = boot.reserved_sector_count
    data_start_sector = boot.reserved_sector_count + boot.num_fats * boot.fat_size_32
    if data_start_sector >= total_sectors:
        raise CorruptVolumeError(
            "The data region starts beyond the end of the volume.",
            f"Data region begins at sector {data_start_sector} of {total_sectors}.",
        )
    total_data_sectors = total_sectors - data_start_sector
    cluster_count = total_data_sectors // boot.sectors_per_cluster
    if cluster_count <= 0:
        raise CorruptVolumeError("The volume contains no addressable data clusters.")
    if cluster_count > MAX_CLUSTER_COUNT:
        raise CorruptVolumeError(
            "The volume exceeds the supported cluster budget.",
            f"{cluster_count} clusters were derived, the limit is {MAX_CLUSTER_COUNT}.",
        )
    return Geometry(
        bytes_per_sector=boot.bytes_per_sector,
        sectors_per_cluster=boot.sectors_per_cluster,
        bytes_per_cluster=bytes_per_cluster,
        reserved_sector_count=boot.reserved_sector_count,
        num_fats=boot.num_fats,
        fat_size_sectors=boot.fat_size_32,
        fat_size_bytes=boot.fat_size_32 * boot.bytes_per_sector,
        fat_start_sector=fat_start_sector,
        fat_start_offset=volume_offset + fat_start_sector * boot.bytes_per_sector,
        data_start_sector=data_start_sector,
        data_start_offset=volume_offset + data_start_sector * boot.bytes_per_sector,
        total_sectors=total_sectors,
        total_data_sectors=total_data_sectors,
        cluster_count=cluster_count,
        first_cluster=2,
        last_cluster=cluster_count + 1,
        root_cluster=boot.root_cluster,
        volume_size_bytes=total_sectors * boot.bytes_per_sector,
        data_size_bytes=cluster_count * bytes_per_cluster,
        volume_offset=volume_offset,
        fat_entry_count=(boot.fat_size_32 * boot.bytes_per_sector) // 4,
    )


def geometry_warnings(geometry: Geometry) -> list[str]:
    warnings: list[str] = []
    if geometry.cluster_count < FAT32_MIN_CLUSTER_COUNT:
        warnings.append(
            f"The volume exposes {geometry.cluster_count} clusters, below the FAT32 minimum of "
            f"{FAT32_MIN_CLUSTER_COUNT}."
        )
    if geometry.fat_entry_count < geometry.cluster_count + 2:
        warnings.append(
            f"Each FAT holds {geometry.fat_entry_count} entries but the volume needs "
            f"{geometry.cluster_count + 2}."
        )
    if geometry.num_fats == 1:
        warnings.append("The volume carries a single FAT, so no redundant allocation copy exists.")
    return warnings


def parse_fsinfo(block: bytes, sector: int, offset: int, cluster_count: int) -> FsInfoSector:
    if len(block) < 512:
        return FsInfoSector(
            present=False,
            sector=sector,
            offset=offset,
            lead_signature=0,
            struct_signature=0,
            trail_signature=0,
            free_cluster_count=None,
            next_free_cluster=None,
            signatures_valid=False,
            issues=["FSInfo sector could not be read from the image."],
        )
    lead = struct.unpack_from("<I", block, 0)[0]
    struct_sig = struct.unpack_from("<I", block, 484)[0]
    free_count, next_free = struct.unpack_from("<II", block, 488)
    trail = struct.unpack_from("<I", block, 508)[0]
    issues: list[str] = []
    if lead != FSINFO_LEAD_SIGNATURE:
        issues.append(f"Lead signature is 0x{lead:08X} instead of 0x{FSINFO_LEAD_SIGNATURE:08X}.")
    if struct_sig != FSINFO_STRUCT_SIGNATURE:
        issues.append(
            f"Structure signature is 0x{struct_sig:08X} instead of 0x{FSINFO_STRUCT_SIGNATURE:08X}."
        )
    if trail != FSINFO_TRAIL_SIGNATURE:
        issues.append(f"Trail signature is 0x{trail:08X} instead of 0x{FSINFO_TRAIL_SIGNATURE:08X}.")
    resolved_free = None if free_count == FSINFO_UNKNOWN else free_count
    resolved_next = None if next_free == FSINFO_UNKNOWN else next_free
    if resolved_free is not None and resolved_free > cluster_count:
        issues.append(
            f"Recorded free cluster count {resolved_free} exceeds the volume cluster count "
            f"{cluster_count}."
        )
    if resolved_next is not None and (resolved_next < 2 or resolved_next > cluster_count + 1):
        issues.append(f"Next free cluster hint {resolved_next} is outside the data cluster range.")
    return FsInfoSector(
        present=True,
        sector=sector,
        offset=offset,
        lead_signature=lead,
        struct_signature=struct_sig,
        trail_signature=trail,
        free_cluster_count=resolved_free,
        next_free_cluster=resolved_next,
        signatures_valid=not issues,
        issues=issues,
    )


def compare_boot_sectors(primary: bytes, backup: bytes, backup_sector: int) -> BootSectorComparison:
    if len(backup) < 512 or backup[:512] == b"\x00" * 512:
        return BootSectorComparison(
            backup_sector=backup_sector,
            backup_present=False,
            identical=False,
            differing_byte_count=512,
            first_difference_offsets=[],
        )
    left = primary[:512]
    right = backup[:512]
    differences = [index for index in range(512) if left[index] != right[index]]
    return BootSectorComparison(
        backup_sector=backup_sector,
        backup_present=True,
        identical=not differences,
        differing_byte_count=len(differences),
        first_difference_offsets=differences[:32],
    )
