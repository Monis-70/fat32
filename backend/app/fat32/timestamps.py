from __future__ import annotations

from datetime import datetime

MIN_FAT_YEAR = 1980
MAX_FAT_YEAR = 2107


def decode_fat_date(value: int) -> tuple[int, int, int] | None:
    if value == 0:
        return None
    year = MIN_FAT_YEAR + ((value >> 9) & 0x7F)
    month = (value >> 5) & 0x0F
    day = value & 0x1F
    if not 1 <= month <= 12 or not 1 <= day <= 31:
        return None
    if not MIN_FAT_YEAR <= year <= MAX_FAT_YEAR:
        return None
    return year, month, day


def decode_fat_time(value: int) -> tuple[int, int, int]:
    hour = (value >> 11) & 0x1F
    minute = (value >> 5) & 0x3F
    second = (value & 0x1F) * 2
    return hour, minute, second


def decode_timestamp(date_value: int, time_value: int, tenths: int = 0) -> str | None:
    parts = decode_fat_date(date_value)
    if parts is None:
        return None
    year, month, day = parts
    hour, minute, second = decode_fat_time(time_value)
    if hour > 23 or minute > 59 or second > 59:
        hour, minute, second = 0, 0, 0
    microsecond = 0
    if 0 <= tenths <= 199:
        second += tenths // 100
        microsecond = (tenths % 100) * 10000
        if second > 59:
            second = 59
            microsecond = 990000
    try:
        moment = datetime(year, month, day, hour, minute, second, microsecond)
    except ValueError:
        return None
    return moment.isoformat(timespec="milliseconds")


def encode_fat_date(moment: datetime) -> int:
    return ((moment.year - MIN_FAT_YEAR) << 9) | (moment.month << 5) | moment.day


def encode_fat_time(moment: datetime) -> int:
    return (moment.hour << 11) | (moment.minute << 5) | (moment.second // 2)


def encode_tenths(moment: datetime) -> int:
    return (moment.second % 2) * 100 + moment.microsecond // 10000
