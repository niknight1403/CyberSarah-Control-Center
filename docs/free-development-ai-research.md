# Kostenlose Entwicklungs-KI – Recherchebasis

Stand der Recherche: 26. August 2026. Diese Notiz enthält keine Zugangsdaten.

| Angebot | Verifizierter Status | Integrationsform | Einschränkung |
|---|---|---|---|
| Google Gemini API | Offizielle Dokumentation beschreibt einen Free-Tier mit kostenlosem Input und Output sowie begrenztem Modellzugang. | REST `generateContent`, API-Key als `x-goog-api-key` | Limits, Regionen und verfügbare Modelle können sich ändern; kostenlose Inhalte können zur Produktverbesserung verwendet werden. |
| OpenRouter Free Models Router | Offizielle Dokumentation beschreibt `openrouter/free` als Router, der verfügbare kostenlose Modellvarianten auswählt. | OpenAI-kompatibler POST auf `/api/v1/chat/completions`, Bearer-Key | Verfügbarkeit, Modellwahl und Rate-Limits sind dynamisch; ein API-Key ist weiterhin erforderlich. |
| Ollama | Offizielle Dokumentation beschreibt eine OpenAI-kompatible lokale API. | Selbst gehosteter lokaler OpenAI-kompatibler Endpoint | Kostenlos, aber ein eigener Rechner oder Server muss laufen und vom Mobilgerät erreichbar sein. |
| LM Studio | Offizielle Dokumentation beschreibt einen lokalen OpenAI-kompatiblen Server. | Selbst gehosteter lokaler OpenAI-kompatibler Endpoint | Kostenlos nutzbar, aber abhängig von lokalem Rechner, Modell-Download und Netzwerkzugriff. |
| Hugging Face Inference Providers | Offizielle Dokumentation weist kostenlose monatliche Experimentierguthaben aus. | Provider-API über Hugging Face | Das kostenlose Guthaben ist begrenzt und kann sich ändern; kein unbegrenzter Gratisbetrieb. |

## Architekturentscheidung

CyberSarah Control Center unterstützt bereits OpenAI-kompatible Provider, Google Gemini und OpenRouter. Für weitere kostenlose Optionen ist ein generischer „OpenAI-kompatibler Endpoint“-Eintrag sinnvoller als viele fest verdrahtete Anbieter. Damit können Ollama, LM Studio und kompatible selbst gehostete Server über eine vom Nutzer kontrollierte HTTPS- oder VPN-Adresse eingebunden werden.

## Quellen

- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API reference](https://ai.google.dev/api)
- [OpenRouter Free Models Router](https://openrouter.ai/openrouter/free)
- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI-compatible endpoints](https://lmstudio.ai/docs/developer/openai-compat)
- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/index)
- [Hugging Face pricing](https://huggingface.co/docs/inference-providers/en/pricing)

## Ergänzende Primärquellenbefunde

Ollama dokumentiert `http://localhost:11434/v1/` als OpenAI-kompatible Basis-URL. Für Chat Completions wird ein API-Key im Client zwar benötigt, von Ollama aber ignoriert. Für CyberSarah muss die Adresse auf dem eigenen Rechner oder im VPN erreichbar sein; `localhost` des Mobilgeräts ist nicht automatisch der Entwicklungsrechner.

LM Studio dokumentiert die OpenAI-kompatiblen Endpoints `/v1/models`, `/v1/responses`, `/v1/chat/completions`, `/v1/embeddings` und `/v1/completions`. Die dokumentierte Standardadresse ist `http://localhost:1234/v1`; Modell-IDs müssen aus dem lokalen LM-Studio-Modellkatalog übernommen werden.

Zusätzliche Quellen:

- [Ollama OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility)
- [LM Studio OpenAI Compatibility Endpoints](https://lmstudio.ai/docs/developer/openai-compat)

## Hugging Face

Hugging Face dokumentiert einen OpenAI-kompatiblen Router unter `https://router.huggingface.co/v1/chat/completions`. Für Requests ist ein Hugging-Face-Token mit der Berechtigung „Make calls to Inference Providers“ erforderlich. Die offizielle Preisdokumentation weist monatliche kostenlose Credits für Free-Nutzer aus; das ist ein begrenztes Guthaben und kein unbegrenzter Gratisdienst.

Quellen:

- [Hugging Face Inference Providers](https://huggingface.co/docs/inference-providers/en/index)
- [Hugging Face Pricing and Billing](https://huggingface.co/docs/inference-providers/en/pricing)
