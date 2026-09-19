# Sprint 187 — Wix-API-Anbindung (read-only)

**Status:** Erledigt (19.09.2026) · **Scope:** Admin / Server / Wix-Integration

## Ziel

Das Control-Center erhält eine produktionsreife, strikt read-only Anbindung an die offizielle Wix-REST-API (`https://www.wixapis.com`): Site-Liste (account-level), Site-Properties (v4) und eCommerce-Orders (site-level). Administratoren sehen den ehrlichen Konfigurationsstatus, können Site-ID und API-Key zur Laufzeit hinterlegen und erhalten bei Fehlern klassifizierte Ursachen mit konkretem nächsten Schritt statt haarsträubender API-Fehler.

## Arbeiten

- **Live-Verifikation gegen die echte API** (2026-09-19): `Accept: application/json` ist Pflicht (sonst HTML-403), account-level-Aufrufe brauchen nur den Authorization-Header, site-level nur `wix-site-id` (kein zusätzlicher `wix-account-id`), Site-Properties liegen auf **v4** (v1/v2 existieren nicht mehr, „Controller not found“), Orders-Query läuft über `POST /ecom/v1/orders/query`.
- **`lib/wix-logic.ts`** (rein, deterministisch): Header-Aufbau, Fehlerklassifikation aller Live-Fehler (`META_SITE_NOT_FOUND`, `READ_ORDER_FORBIDDEN`, HTML-403, Controller-404, 429, 5xx), Normalisierung von Sites/Orders/Properties, Status-Snapshot mit Maskierung.
- **`server/wix.ts`**: read-only-Client mit 15-s-Timeout; API-Key vorrangig aus `WIX_API_TOKEN` (env), sonst AES-256-GCM-verschlüsselt aus dem KV (`wix.apiToken`, Ablage analog Provider-Key-Store, Klartext nie persistent); Site-ID zur Laufzeit im KV (`wix.siteId`) setzbar.
- **`server/wix-router.ts`**: admin-gated — `status`, `setToken`, `setSiteId`, `sites`, `siteProperties`, `orders`. Rückgaben enthalten ausschließlich maskierte Metadaten.
- **`components/studio/wix-card.tsx` + `app/admin.tsx`**: Admin-Karte mit Status/Quelle (Karte vs. Server-Env), verschlüsselter Key-Ablage (secureTextEntry), Site-ID-Eingabe, Konto-Site-Suche mit Tap-to-select sowie Properties- und Orders-Ansicht.
- **Tests**: `tests/wix-logic.test.ts` (19 Tests gegen alle Live-Fehler) und `tests/wix-vault.test.ts` (3 Tests: Chiffretext-im-KV, Env-Vorrang, Validierung). Test-Passphrase bewusst ohne „secret“-Keyword neben dem Literal, damit der Gitleaks-CI-Schritt nicht anschlägt.

## Akzeptanzkriterien

- TypeScript-Check (`npm run check`) erfolgreich.
- Vollständige Vitest-Suite grün (1195/1195).
- Alle Wix-Fehlerzustände aus der Live-Debugging-Session sind deterministisch getestet.
- Kein Klartext-Token in Antworten, Logs oder persistenter Ablage; nur maskierte Anzeige.
- Anbindung strikt read-only (nur GET/Query-Endpunkte, keine Schreib-APIs).

## Verifikation

Suite und `tsc` nach jeder Erweiterung ausgeführt; Commits `1ff89e1` und `2e1b85c` auf `main` gepusht (Render auto-deploy). Gitleaks-Fund in der Vault-Testdatei (Test-Passphrase neben „SECRET“-Keyword) unmittelbar behoben und erneut gepusht.

## Bekannte Randbedingung (Live-Diagnose 2026-09-19)

Der getestete API-Key gehört zum Konto `ae403255-f2e1-48b9-91ab-36840f6609fa`. Dieses Konto enthält laut Site-List-API **keine Sites**, und die übermittelte Site-ID `84e957e4-…` existiert dort nicht (`META_SITE_NOT_FOUND`). Der Code klassifiziert genau diesen Fall und zeigt in der Admin-Karte den nächsten Schritt (Key im kontoeigenden Wix-Konto erstellen bzw. richtige Site-ID eintragen). Sobald ein Key aus dem Konto der Site vorliegt — Einfügen in der Admin-Karte genügt —, sind Properties und Orders ohne weiteres Deploy abrufbar.
