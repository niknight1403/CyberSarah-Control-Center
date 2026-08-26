# Provider-Integration – verifizierte API-Hinweise

Diese Notiz hält die extern verifizierten API-Grundlagen für Gemini und OpenRouter fest. Sie enthält keine Zugangsdaten.

## Google Gemini

Die offizielle Gemini-API-Dokumentation beschreibt den REST-Aufruf `generateContent` und verlangt den API-Key im Header `x-goog-api-key`. Der für das Workspace-Service-Routing verwendete Endpoint ist modellbezogen unter `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`.

Quellen:

- [Gemini API – Generate content](https://ai.google.dev/api/generate-content)
- [Gemini API reference](https://ai.google.dev/api)
- [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key)

## OpenRouter

Die offizielle OpenRouter-Dokumentation beschreibt den OpenAI-kompatiblen Chat-Completions-Endpoint unter `https://openrouter.ai/api/v1/chat/completions`. Die Authentifizierung erfolgt über den Bearer-Authorization-Header; Request- und Response-Strukturen orientieren sich am Chat-Completions-Format.

Quellen:

- [OpenRouter API reference overview](https://openrouter.ai/docs/api_reference/overview)
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart)
- [Create a chat completion](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion)

## Sicherheitsnotiz

Provider-Keys werden nicht in diese Datei, in Git, in UI-Texte oder in Audit-Logs geschrieben. Der mobile Client übermittelt sie ausschließlich über den geschützten Workspace-Service-Request; die native App verwendet SecureStore für die lokale Ablage.
