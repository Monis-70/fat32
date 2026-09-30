from __future__ import annotations

import array
import sys
from dataclasses import asdict, dataclass, field

from .constants import (
    CHAIN_BAD_CLUSTER,
    CHAIN_EMPTY,
    CHAIN_FREE_ENTRY,
    CHAIN_INVALID_START,
    CHAIN_LOOP,
    CHAIN_OK,
    CHAIN_OUT_OF_RANGE,
    CHAIN_TRUNCATED,
    FAT_BAD,
    FAT_ENTRY_MASK,
    FAT_EOC_MIN,
    FAT_FREE,
    FAT_RESERVED_ENTRY,
    FAT_RESERVED_MIN,
    MAX_CHAIN_LENGTH,
    STATE_ALLOCATED,
    STATE_BAD,
    STATE_FREE,
    STATE_RESERVED,
)


@dataclass
class FatEntryDifference:
    cluster: int
    values: list[str]


@dataclass
class FatComparison:
    copies: int
    entries_compared: int
    identical: bool
    mismatched_entry_count: int
    mismatched_copies: list[int]
    sample_differences: list[FatEntryDifference] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "copies": self.copies,
            "entries_compared": self.entries_compared,
            "identical": self.identical,
            "mismatched_entry_count": self.mismatched_entry_count,
            "mismatched_copies": self.mismatched_copies,
            "sample_differences": [asdict(item) for item in self.sample_differences],
        }


@dataclass
class ChainResult:
    clusters: list[int]
    status: str
    terminal_value: int | None
    loop_cluster: int | None
    invalid_cluster: int | None
    fragment_count: int

    @property
    def length(self) -> int:
        return len(self.clusters)

    def to_dict(self) -> dict:
        return asdict(self)


class FatTable:
    def __init__(self, raw: bytes, cluster_count: int) -> None:
        usable = (len(raw) // 4) * 4
        values = array.array("I")
        values.frombytes(raw[:usable])
        if sys.byteorder != "little":
            values.byteswap()
        self._values = values
        self.entry_count = len(values)
        self.cluster_count = cluster_count
        self.last_cluster = cluster_count + 1

    def __len__(self) -> int:
        return self.entry_count

    def raw(self, cluster: int) -> int:
        if cluster < 0 or cluster >= self.entry_count:
            return 0
        return self._values[cluster]

    def value(self, cluster: int) -> int:
        return self.raw(cluster) & FAT_ENTRY_MASK

    def media_descriptor_entry(self) -> int:
        return self.raw(0)

    def end_of_chain_marker(self) -> int:
        return self.raw(1)

    def is_free(self, cluster: int) -> bool:
        return self.value(cluster) == FAT_FREE

    def is_bad(self, cluster: int) -> bool:
        return self.value(cluster) == FAT_BAD

    def is_eoc(self, cluster: int) -> bool:
        return self.value(cluster) >= FAT_EOC_MIN

    def state(self, cluster: int) -> str:
        if cluster < 2:
            return STATE_RESERVED
        if cluster >= self.entry_count:
            return STATE_RESERVED
        value = self.value(cluster)
        if value == FAT_FREE:
            return STATE_FREE
        if value == FAT_BAD:
            return STATE_BAD
        if value == FAT_RESERVED_ENTRY:
            return STATE_RESERVED
        if FAT_RESERVED_MIN <= value < FAT_BAD:
            return STATE_RESERVED
        return STATE_ALLOCATED

    def state_counts(self) -> dict[str, int]:
        counts = {STATE_FREE: 0, STATE_ALLOCATED: 0, STATE_BAD: 0, STATE_RESERVED: 0}
        limit = min(self.entry_count, self.last_cluster + 1)
        for cluster in range(2, limit):
            counts[self.state(cluster)] += 1
        return counts

    def walk(self, start: int, max_clusters: int = MAX_CHAIN_LENGTH) -> ChainResult:
        if start == 0:
            return ChainResult([], CHAIN_EMPTY, None, None, None, 0)
        if start < 2 or start > self.last_cluster or start >= self.entry_count:
            return ChainResult([], CHAIN_INVALID_START, None, None, start, 0)
        clusters: list[int] = []
        seen: set[int] = set()
        current = start
        status = CHAIN_OK
        terminal: int | None = None
        loop_cluster: int | None = None
        invalid_cluster: int | None = None
        while True:
            if current in seen:
                status = CHAIN_LOOP
                loop_cluster = current
                break
            seen.add(current)
            clusters.append(current)
            if len(clusters) >= max_clusters:
                status = CHAIN_TRUNCATED
                break
            value = self.value(current)
            if value >= FAT_EOC_MIN:
                terminal = value
                break
            if value == FAT_BAD:
                status = CHAIN_BAD_CLUSTER
                invalid_cluster = current
                break
            if value == FAT_FREE:
                status = CHAIN_FREE_ENTRY
                invalid_cluster = current
                break
            if value < 2 or value > self.last_cluster or value >= self.entry_count:
                status = CHAIN_OUT_OF_RANGE
                invalid_cluster = value
                break
            current = value
        fragments = 1 if clusters else 0
        for index in range(1, len(clusters)):
            if clusters[index] != clusters[index - 1] + 1:
                fragments += 1
        return ChainResult(clusters, status, terminal, loop_cluster, invalid_cluster, fragments)


def compare_fat_copies(
    copies: list[bytes], entries_to_compare: int, sample_limit: int = 24
) -> FatComparison:
    if len(copies) < 2:
        return FatComparison(
            copies=len(copies),
            entries_compared=0,
            identical=True,
            mismatched_entry_count=0,
            mismatched_copies=[],
        )
    if all(raw == copies[0] for raw in copies[1:]):
        return FatComparison(
            copies=len(copies),
            entries_compared=entries_to_compare,
            identical=True,
            mismatched_entry_count=0,
            mismatched_copies=[],
        )
    tables = [FatTable(raw, entries_to_compare) for raw in copies]
    limit = min([entries_to_compare] + [table.entry_count for table in tables])
    mismatched_entries = 0
    mismatched_copies: set[int] = set()
    samples: list[FatEntryDifference] = []
    reference = tables[0]
    for cluster in range(limit):
        base = reference.value(cluster)
        differing = [
            index for index, table in enumerate(tables[1:], start=1) if table.value(cluster) != base
        ]
        if not differing:
            continue
        mismatched_entries += 1
        mismatched_copies.update(differing)
        if len(samples) < sample_limit:
            samples.append(
                FatEntryDifference(
                    cluster=cluster,
                    values=[f"0x{table.value(cluster):08X}" for table in tables],
                )
            )
    return FatComparison(
        copies=len(copies),
        entries_compared=limit,
        identical=mismatched_entries == 0,
        mismatched_entry_count=mismatched_entries,
        mismatched_copies=sorted(mismatched_copies),
        sample_differences=samples,
    )
