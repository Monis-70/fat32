from __future__ import annotations


class Fat32Error(Exception):
    def __init__(self, message: str, hint: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.hint = hint


class UnsupportedImageError(Fat32Error):
    pass


class CorruptVolumeError(Fat32Error):
    pass


class ImageBoundsError(Fat32Error):
    pass
