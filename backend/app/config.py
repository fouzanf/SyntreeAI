import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    gemini_api_key: str = Field(..., validation_alias="GEMINI_API_KEY")
    database_url: str = Field(..., validation_alias="DATABASE_URL")
    cors_origins: str = Field("http://localhost:3000,http://localhost:3001", validation_alias="CORS_ORIGINS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

# Instantiate settings to validate configuration immediately on startup
settings = Settings()
