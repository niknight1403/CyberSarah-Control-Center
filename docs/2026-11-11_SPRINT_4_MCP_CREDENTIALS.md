# Sprint 4 — Credential Vault und OAuth2-Client-Credentials

**Datum:** 11.11.2026
**Mission:** Autonomes MCP-Orchestrierungs- und Governance-System, Modul 2 (Credential Vault + OAuth2)
**Status:** Implementiert, getestet, dokumentiert. Der Connection Supervisor (Modul 4) folgt in Sprint 5.

## 1. Ausgangslage

Bis Sprint 3 konnte ein Server nur über `credential_env_var` authentifiziert werden: der
Name einer Umgebungsvariablen in der Datenbank, der Wert im Prozess. Das ist sicher, aber
nicht verwaltbar: Rotation erfordert einen Deploy, OAuth2 gar nicht möglich, und ein
Server ohne ENV-Eintrag konnte nie Zugangsdaten bekommen.

Sprint 4 ergänzt einen verschlüsselten Vault — **ohne** die ENV-Referenz abzuschaffen.

## 2. Datenmodell (Migration `0031_mcp_credentials.sql`)

`mcp_credentials` — genau ein Eintrag je Server:

| Spalte | Zweck |
|---|---|
| `server_key` | Unique, verweist auf `mcp_servers.server_key` |
| `kind` | `bearer` / `api_key` / `oauth2_client_credentials` |
| `encrypted_payload` | AES-256-GCM (`iv:tag:ciphertext`), JSON je nach Art |
| `masked_preview` | erste 3 + letzte 2 Zeichen, nie Klartext |
| `token_url`, `scopes` | nur für OAuth2 |
| `last_used_at`, `last_error` | Betriebszustand, 300 Zeichen begrenzt |

Der Schlüssel kommt aus derselben Ableitung wie die Secret-Ablage aus Sprint 167
(`PROVIDER_KEY_ENCRYPTION_SECRET` bzw. `JWT_SECRET`). Fehlt er, wirft der Service —
es wird nicht mit einem Default verschlüsselt.

## 3. Reine Logik — `lib/mcp-credential-logic.ts`

- **Quellenauflösung**: Vault vor ENV. Ist beides leer, nennt die Meldung die konkrete
  ENV-Variable. Eine leere ENV-Variable gilt als fehlend, nicht als vorhanden.
- **Maskierung**: `sk-live-…op`, kurze Werte vollständig maskiert.
- **Token-URL-Prüfung**: nur HTTPS, keine Zugangsdaten in der URL, keine privaten
  Adressen (SSRF-Schutz).
- **OAuth2-Request**: `grant_type=client_credentials`, Basic-Auth **und** Client-Daten
  im Body (manche Anbieter akzeptieren nur eines), Geheimnis nie in der URL.
- **Antwort-Parsing**: `access_token`, `token_type`, `expires_in` → Ablaufzeit; Fehler
  werden auf 200 Zeichen gekürzt und ohne Geheimnisse gemeldet.
- **Frische**: 60 Sekunden Sicherheitsabstand, damit ein Token nicht mitten im Aufruf
  abläuft.
- **Status**: `missing` / `static` / `fresh` / `expiring` / `expired` für Healthchecks.

## 4. Service — `server/mcp-credential-service.ts`

| Methode | Verhalten |
|---|---|
| `setStatic()` | Bearer/API-Key verschlüsseln, Vorschau speichern |
| `setOAuthClient()` | Client-ID/Secret verschlüsseln, Token-URL und Scopes speichern |
| `resolve()` | Vault → ENV; statische Werte direkt, OAuth2 mit Cache und Erneuerung |
| `list()` | nur Metadaten, Status und Vorschau |
| `remove()` | Eintrag löschen, ehrliche Rückmeldung ob es einen gab |

OAuth2-Tokens werden **nach** dem Abruf erneut verschlüsselt gespeichert (Client-Daten
plus `accessToken`/`expiresAt`), sodass der nächste Aufruf ohne Netzzugriff auskommt.
Ein Fehlschlag landet in `last_error` und wird zurückgegeben — nie stillschweigend
als Erfolg behandelt.

## 5. Integration in den Aufrufpfad

`mcp.servers.callTool` löst Zugangsdaten so auf:

1. ENV-Variable, falls gesetzt (bestehendes Verhalten, unverändert).
2. Sonst Vault über `resolveCredential` — inklusive OAuth2-Erneuerung.
3. Beides leer: konkreter Grund aus dem Vault statt einer pauschalen Meldung.

Der Token verlässt den Service ausschließlich Richtung MCP-Kanal; Router und UI sehen
nur Metadaten.

## 6. API (alle `adminProcedure`)

```
mcp.credentials.list      {}
mcp.credentials.setBearer { serverKey, kind: bearer|api_key, secret }
mcp.credentials.setOAuth  { serverKey, tokenUrl, clientId, clientSecret, scopes? }
mcp.credentials.remove    { serverKey }
```

## 7. Tests

| Datei | Tests | Inhalt |
|---|---|---|
| `tests/mcp-credential-logic.test.ts` | 17 | Quellenauflösung (Vault/ENV/leer), Maskierung, URL-/SSRF-Prüfung, OAuth-Request und -Parsing, Frische mit Abstand, Status, Listen ohne Klartext |
| `tests/mcp-credential-service.test.ts` | 14 | verschlüsselte Ablage, Validierung, Metadaten ohne Geheimnis, Vault-vor-ENV, ENV-Fallback, fehlende Daten, genau ein Tokenabruf, Erneuerung nach Ablauf, Fehler- und Netzwerkfall, Löschen, echter AES-256-GCM-Rundlauf |

Gesamtsuite: **480 Dateien / 3.944 Tests grün** (vorher 478 / 3.913).

## 8. Ehrliche Grenzen

1. **Kein Authorization-Code-Flow.** Nur Client-Credentials; nutzerbezogene OAuth-Flows
   (Consent-Weiterleitung) brauchen UI und Redirect-Whitelist und sind nicht Teil dieses
   Sprints.
2. **Kein Schlüsselwechsel-Werkzeug.** Wird `JWT_SECRET` rotiert, sind bestehende
   Vault-Einträge nicht mehr lesbar; der Service meldet das, repariert es aber nicht.
3. **Token-URL-Prüfung ist statisch.** DNS-Rebinding wird nicht abgefangen; der
   Aufrufpfad läuft zusätzlich durch die bestehende Tool-Proxy-Queue.
4. **Kein Live-OAuth-Test.** Es fehlt weiterhin ein echter Server mit Token-Endpunkt.
5. **Vorschau ist gespeichert.** Sie ist bewusst nicht verschlüsselt (nur 3+2 Zeichen),
   damit Listen ohne Entschlüsselung funktionieren.

## 9. Abnahme

- `npx tsc --noEmit`: sauber.
- `npx vitest run`: 480 Dateien / 3.944 Tests grün.
- `npm run build`: erfolgreich.
- ESLint auf den neuen Dateien: 0 Fehler / 0 Warnungen.
- Migration `0031` inkl. Journal-Eintrag.
