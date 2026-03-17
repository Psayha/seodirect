"""Claude API client."""
import json
from typing import AsyncGenerator

import httpx

from app.config import get_settings


class ClaudeClient:
    BASE_URL = "https://api.anthropic.com/v1/messages"
    API_VERSION = "2023-06-01"

    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514", max_tokens: int = 4000, temperature: float = 0.7):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature

    def _headers(self) -> dict:
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.API_VERSION,
            "content-type": "application/json",
        }

    def _payload(self, system_prompt: str, user_message: str) -> dict:
        return {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }

    async def generate(self, system_prompt: str, user_message: str) -> str:
        """Generate a completion and return full text."""
        payload = self._payload(system_prompt, user_message)
        async with httpx.AsyncClient(timeout=120) as client:
            for attempt in range(3):
                resp = await client.post(self.BASE_URL, headers=self._headers(), json=payload)
                if resp.status_code == 429 or resp.status_code == 529:
                    import asyncio
                    await asyncio.sleep(2 ** attempt * 2)
                    continue
                resp.raise_for_status()
                data = resp.json()
                return data["content"][0]["text"]
        raise RuntimeError("Claude API unavailable after retries")

    async def generate_stream(self, system_prompt: str, user_message: str) -> AsyncGenerator[str, None]:
        """Generate with streaming, yield text chunks."""
        payload = {**self._payload(system_prompt, user_message), "stream": True}
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", self.BASE_URL, headers=self._headers(), json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if data.get("type") == "content_block_delta":
                                yield data["delta"].get("text", "")
                        except json.JSONDecodeError:
                            continue


def get_claude_client(db) -> ClaudeClient:
    """Get configured ClaudeClient using DB settings."""
    from app.settings.service import get_api_key, get_raw_value
    api_key = get_api_key(db, "anthropic", "api_key")
    model = get_raw_value(db, "ai.model") or "claude-sonnet-4-20250514"
    max_tokens = int(get_raw_value(db, "ai.max_tokens") or 4000)
    temperature = float(get_raw_value(db, "ai.temperature") or 0.7)
    if not api_key:
        raise RuntimeError("Anthropic API key not configured. Set it in /settings/api-keys.")
    return ClaudeClient(api_key=api_key, model=model, max_tokens=max_tokens, temperature=temperature)
