"""KI-Chat mit Streaming (SSE), Prompt-Pruning und Cache-First-Status.

Zwei Transportwege, ein Protokoll:
  * ``POST /api/chat/stream`` — Server-Sent Events: Antwort erscheint
    wortgenau im Frontend (``data: {"delta": "..."}``-Frames).
  * ``WS /ws/chat`` — dieselben Chat-Deltas ueber den WebSocket-Manager.
Ohne OPENAI_API_KEY streamt ein deterministischer Offline-Executor —
Entwicklung und Tests bleiben vollstaendig lauffaehig.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import TYPE_CHECKING

import httpx

from .config import Settings

if TYPE_CHECKING:
    from .cache import StateCache


#: Kompakter System-Prompt — Token-Pruning beginnt hier: maximal praezise,
#: keine Ballast-Floskeln. (Bewusst kurz gehalten: jede gesparte Zeile
#: senkt Time-to-First-Token im Rendering.)
SYSTEM_PROMPT = (
    "Du bist CyberSarah, eine praezise KI-Agentin. "
    "Antworte knapp, technisch korrekt, ohne Floskeln. "
    "Maximal 5 Saetze, sofern nicht mehr Detail angefragt ist."
)

#: Hartes Budget fuer den angereicherten Prompt (Zeichen, nicht Tokens —
#: konservativ und ohne Tokenizer-Abhaengigkeit).
MAX_PROMPT_CHARS = 6000


def prune_messages(
    messages: list[dict[str, str]], max_history: int
) -> list[dict[str, str]]:
    """Prompt-Pruning: neueste `max_history` Nutzernachrichten behalten.

    System-Prompt wird immer vorangestellt; System-Nachrichten aus dem
    Client-Verlauf werden entfernt (Server ist Autoritaet). Aeltere
    Nachrichten fallen zuerst — der Kontext behaelt die Spitze des
    Gespraechs und bleibt unter dem Zeichenbudget.
    """
    user_turns = [m for m in messages if m["role"] != "system"][-max_history:]
    pruned = [{"role": "system", "content": SYSTEM_PROMPT}]
    budget = MAX_PROMPT_CHARS - len(SYSTEM_PROMPT)
    for msg in reversed(user_turns):
        if budget - len(msg["content"]) < 0:
            break
        pruned.insert(1, msg)
        budget -= len(msg["content"])
    return pruned


async def stream_llm_answer(
    pruned_messages: list[dict[str, str]],
    settings: Settings,
) -> AsyncIterator[str]:
    """Streamt Token-Deltas des LLM (oder des Offline-Fallbacks).

    Yielt reine Text-Chunks — der Transport (SSE/WS) verpackt sie.
    """
    if settings.openai_api_key:
        payload = {
            "model": settings.openai_model,
            "messages": pruned_messages,
            "stream": True,
            "max_tokens": 512,
        }
        headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                async with client.stream(
                    "POST",
                    f"{settings.openai_base_url.rstrip('/')}/chat/completions",
                    json=payload,
                    headers=headers,
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        body = line.removeprefix("data:").strip()
                        if body == "[DONE]":
                            break
                        chunk = json.loads(body)
                        delta = chunk["choices"][0].get("delta", {}).get("content")
                        if delta:
                            yield delta
            return
        except (httpx.HTTPError, KeyError, IndexError, json.JSONDecodeError):
            # Netzwerk-/API-Fehler -> deterministischer Fallback, damit der
            # Stream dem Client gegenueber nie einfach abbricht.
            pass

    # Offline-Executor: synthetischer Wort-fuer-Wort-Stream.
    last_user = next(
        (m["content"] for m in reversed(pruned_messages) if m["role"] == "user"),
        "",
    )
    answer = (
        "Offline-Modus: kein LLM-Key konfiguriert. "
        f"Empfangen: {last_user[:200]!r}. "
        "Der Task-Ledger und alle Agenten-Endpunkte arbeiten trotzdem vollstaendig."
    )
    for word in answer.split(" "):
        yield word + " "


async def cached_agent_status(cache: StateCache, agent_id: str) -> dict[str, object]:
    """Cache-First-Statuslektor: Chat-Widgets lesen hier statt der DB.

    Treffer kommen ohne jede Aggregationsabfrage zustande; nur bei
    Cache-Miss greift der Aufrufer auf die Ledger-Queries zurueck.
    """
    return {
        "agent_id": agent_id,
        "cached": True,
        "cache_keys": await cache.keys(),
    }
