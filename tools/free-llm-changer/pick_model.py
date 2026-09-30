#!/usr/bin/env python3
"""Waehlt aus einer Anbieter-Modellliste geeignete Chat-Kandidaten.

Aufruf: pick_model.py <models-json> <prefs|pref2> [max_kandidaten]
Ausgabe: eine Kandidaten-ID pro Zeile (beste zuerst).

Regeln:
- IDs ohne Praefix 'models/' (Geminis OpenAI-Schicht listet mit Praefix)
- Spezial-Modelle raus (Guard/Embed/Whisper/TTS/Bild/Video-Derivate)
- ':free'-Modelle zuerst (OpenRouter), danach bekannte Chat-Familien,
  danach alles uebrige
"""
import json
import re
import sys

JUNK = r'guard|embed|whisper|tts|rerank|moderat|safety|tokeniz|vision|orpheus|playai|aura|sora|flux|image'
GOOD = r'llama|qwen|gpt-oss|gemma|deepseek|kimi|glm|ministral|mistral|phi|falcon|starling'


def main() -> int:
    try:
        if sys.argv[1] == '-':
            raw = json.load(sys.stdin)
        else:
            raw = json.loads(sys.argv[1])
        ids = [m.get('id', '') for m in raw.get('data', [])]
    except Exception:
        ids = []
    ids = [i.removeprefix('models/') for i in ids if i]

    chat_ids = [i for i in ids if not re.search(JUNK, i, re.I)]
    chat_ids = sorted(chat_ids, key=lambda i: (
        0 if i.endswith(':free') else 1,
        0 if re.search(GOOD, i, re.I) else 1))

    prefs = [p for p in (sys.argv[2] if len(sys.argv) > 2 else '').split('|') if p]
    try:
        limit = int(sys.argv[3]) if len(sys.argv) > 3 else 5
    except ValueError:
        limit = 5

    ordered = [p for p in prefs if p in chat_ids] + [i for i in chat_ids if i not in prefs]
    print('\n'.join(ordered[:limit]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
