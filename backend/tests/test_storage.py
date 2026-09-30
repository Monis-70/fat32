from __future__ import annotations

import pytest

from app.storage import has_supported_extension, sanitize_filename, sanitize_metadata


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("evidence.img", "evidence.img"),
        ("../../etc/passwd", "passwd"),
        ("C:\\cases\\disk 01.dd", "disk_01.dd"),
        ("  ..\\..\\image.raw  ", "image.raw"),
        ("weird***name???.img", "weird_name_.img"),
        ("", "evidence.img"),
        (None, "evidence.img"),
    ],
)
def test_sanitize_filename_strips_paths_and_unsafe_characters(raw, expected):
    assert sanitize_filename(raw) == expected


def test_sanitize_filename_truncates_long_names():
    result = sanitize_filename("a" * 400 + ".img")
    assert len(result) <= 120
    assert result.endswith(".img")


@pytest.mark.parametrize(
    ("filename", "supported"),
    [
        ("case.img", True),
        ("case.DD", True),
        ("case.raw", True),
        ("case.bin", True),
        ("case.zip", False),
        ("case", False),
    ],
)
def test_supported_extensions(filename, supported):
    assert has_supported_extension(filename) is supported


def test_sanitize_metadata_removes_control_characters_and_limits_length():
    assert sanitize_metadata("  CASE\x00-01\n ") == "CASE-01"
    assert sanitize_metadata("") is None
    assert sanitize_metadata(None) is None
    assert len(sanitize_metadata("x" * 500)) == 120
