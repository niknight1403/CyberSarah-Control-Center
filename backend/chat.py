from __future__ import annotations

import re
from collections.abc import Iterable

MAX_PROMPT_CHARS = 12000
SYSTEM_PROMPT = "System: Du bist CyberSarah. Antworte kurz, hilfreich und sauber. Offline-Modus aktiv."


def prune_messages(messages: list[dict[str, str]], max_history: int = 10) -> list[dict[str, str]]:
    safe: list[dict[str, str]] = []
    for message in messages or []:
        if not isinstance(message, dict):
            continue
        if message.get("role") == "system":
            continue
        role = str(message.get("role", "user")).lower()
        content = str(message.get("content", ""))
        if role not in {"user", "assistant"}:
            continue
        safe.append({"role": role, "content": content})

    if not safe:
        return [{"role": "system", "content": SYSTEM_PROMPT}]

    recent = safe[-max_history:] if max_history > 0 else []
    pruned = [{"role": "system", "content": SYSTEM_PROMPT}, *recent]

    total = 0
    keep: list[dict[str, str]] = []
    for message in reversed(pruned):
        message_len = len(message["content"])
        if message["role"] == "system":
            if total + message_len <= MAX_PROMPT_CHARS:
                keep.insert(0, message)
                total += message_len
            continue
        if total + message_len <= MAX_PROMPT_CHARS:
            keep.insert(0, message)
            total += message_len
    if not keep:
        return [{"role": "system", "content": SYSTEM_PROMPT}]
    if keep[0]["role"] != "system":
        keep.insert(0, {"role": "system", "content": SYSTEM_PROMPT})
        total += len(SYSTEM_PROMPT)
    while total > MAX_PROMPT_CHARS and len(keep) > 1:
        last_non_system = None
        for index in range(len(keep) - 1, 0, -1):
            if keep[index]["role"] != "system":
                last_non_system = index
                break
        if last_non_system is None:
            break
        total -= len(keep[last_non_system]["content"])
        keep.pop(last_non_system)
    return keep


def _offline_text(messages: list[dict[str, str]]) -> str:
    last_user = ""
    for message in reversed(messages):
        if message.get("role") == "user":
            last_user = str(message.get("content", ""))
            break
    if not last_user:
        return "Offline-Modus aktiv: Ich kann keine externe LLM-Verbindung nutzen, aber ich antworte lokal und kurz."
    return f"Offline-Modus aktiv: Die letzte Anfrage war '{last_user[:80]}'. Ich antworte lokal und kurz."


def stream_chat_chunks(messages: list[dict[str, str]], *, max_history: int = 10) -> list[str]:
    content = _offline_text(prune_messages(messages, max_history=max_history))
    chunks: list[str] = []
    for part in re.findall(r".{1,18}", content):
        chunks.append(part)
    return chunks


async def cached_agent_status(cache, agent_id: str):
    status = {"agent_id": agent_id, "cached": True, "cache_keys": [f"agent:{agent_id}:status"]}
    await cache.set(f"agent:{agent_id}:status", status)
    return status
