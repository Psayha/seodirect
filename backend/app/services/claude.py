"""Claude API client — supports direct Anthropic API and OpenRouter proxy."""
import asyncio
import json
from typing import AsyncGenerator

import httpx

from app.config import get_settings


class ClaudeClient:
    ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
    OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
    API_VERSION = "2023-06-01"

    def __init__(
        self,
        api_key: str,
        model: str = "claude-sonnet-4-20250514",
        max_tokens: int = 4000,
        temperature: float = 0.7,
        use_openrouter: bool = False,
    ):
        self.api_key = api_key
        self.model = model
        self.max_tokens = max_tokens
        self.temperature = temperature
        self.use_openrouter = use_openrouter
        self.base_url = self.OPENROUTER_URL if use_openrouter else self.ANTHROPIC_URL

    def _headers(self) -> dict:
        if self.use_openrouter:
            return {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://seodirect.tool",
                "X-Title": "SEODirect",
            }
        return {
            "x-api-key": self.api_key,
            "anthropic-version": self.API_VERSION,
            "content-type": "application/json",
        }

    def _payload(self, system_prompt: str, user_message: str) -> dict:
        if self.use_openrouter:
            return {
                "model": self.model,
                "max_tokens": self.max_tokens,
                "temperature": self.temperature,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_message},
                ],
            }
        return {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_message}],
        }

    def _parse_response(self, data: dict) -> str:
        if self.use_openrouter:
            choices = data.get("choices", [])
            if not choices:
                raise ValueError("Empty choices in OpenRouter response")
            return choices[0].get("message", {}).get("content", "")
        content = data.get("content", [])
        if not content:
            raise ValueError("Empty content in Claude response")
        return content[0].get("text", "")

    async def generate(self, system_prompt: str, user_message: str) -> str:
        """Generate a completion and return full text."""
        payload = self._payload(system_prompt, user_message)
        last_error: Exception | None = None
        async with httpx.AsyncClient(timeout=120) as client:
            for attempt in range(3):
                try:
                    resp = await client.post(self.base_url, headers=self._headers(), json=payload)
                    if resp.status_code in (429, 529):
                        await asyncio.sleep(2 ** attempt * 2)
                        continue
                    resp.raise_for_status()
                    return self._parse_response(resp.json())
                except (httpx.TimeoutException, httpx.ConnectError, httpx.RemoteProtocolError) as e:
                    last_error = e
                    if attempt < 2:
                        await asyncio.sleep(2 ** attempt)
                        continue
                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (429, 529):
                        await asyncio.sleep(2 ** attempt * 2)
                        continue
                    raise
        raise RuntimeError(f"Claude API unavailable after 3 attempts: {last_error}")

    async def generate_stream(self, system_prompt: str, user_message: str) -> AsyncGenerator[str, None]:
        """Generate with streaming, yield text chunks."""
        payload = {**self._payload(system_prompt, user_message), "stream": True}
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", self.base_url, headers=self._headers(), json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        data_str = line[6:]
                        if data_str == "[DONE]":
                            break
                        try:
                            data = json.loads(data_str)
                            if self.use_openrouter:
                                choices = data.get("choices", [])
                                if choices:
                                    text = choices[0].get("delta", {}).get("content", "")
                                    if text:
                                        yield text
                            else:
                                if data.get("type") == "content_block_delta":
                                    yield data["delta"].get("text", "")
                        except json.JSONDecodeError:
                            continue


def get_claude_client(db) -> ClaudeClient:
    """Get configured ClaudeClient using DB settings.

    Priority: OpenRouter (if openrouter_api_key is set) → direct Anthropic.
    Reads all settings from the main settings_service (flat key format).
    """
    from app.services.settings_service import get_setting

    model = get_setting("ai_model", db) or "claude-sonnet-4-20250514"
    max_tokens = int(get_setting("ai_max_tokens", db) or 4000)
    temperature = float(get_setting("ai_temperature", db) or 0.7)

    # OpenRouter takes priority when configured
    openrouter_key = get_setting("openrouter_api_key", db)
    if openrouter_key:
        # OpenRouter model IDs require provider prefix, e.g. "anthropic/claude-sonnet-4-20250514"
        or_model = model if "/" in model else f"anthropic/{model}"
        return ClaudeClient(
            api_key=openrouter_key,
            model=or_model,
            max_tokens=max_tokens,
            temperature=temperature,
            use_openrouter=True,
        )

    # Fall back to direct Anthropic API
    api_key = get_setting("anthropic_api_key", db)
    if not api_key:
        raise RuntimeError("Anthropic API key not configured. Set it in Settings → API ключи.")
    return ClaudeClient(api_key=api_key, model=model, max_tokens=max_tokens, temperature=temperature)
