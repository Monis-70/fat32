from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_VERSION = "v1"
APP_NAME = "FATScope"
APP_VERSION = "1.0.0"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore", case_sensitive=False
    )

    allowed_origins: str = Field(default="http://localhost:3000")
    max_upload_mb: int = Field(default=512, ge=1, le=8192)
    data_dir: str = Field(default="./data")
    analysis_ttl_hours: int = Field(default=24, ge=1, le=8760)

    @field_validator("data_dir")
    @classmethod
    def _normalise_data_dir(cls, value: str) -> str:
        return value or "./data"

    @property
    def origin_list(self) -> list[str]:
        raw = [item.strip() for item in self.allowed_origins.split(",")]
        return [item for item in raw if item]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def data_path(self) -> Path:
        return Path(self.data_dir).expanduser().resolve()

    @property
    def uploads_path(self) -> Path:
        return self.data_path / "uploads"

    @property
    def demo_path(self) -> Path:
        return self.data_path / "demo"

    @property
    def recovered_path(self) -> Path:
        return self.data_path / "recovered"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_path / 'fatscope.db').as_posix()}"

    def ensure_directories(self) -> None:
        for path in (self.data_path, self.uploads_path, self.demo_path, self.recovered_path):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_directories()
    return settings
