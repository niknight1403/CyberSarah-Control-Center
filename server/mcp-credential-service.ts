/**
 * Sprint 4 — Credential-Service: Vault, Rotation und OAuth2-Tokenbeschaffung.
 *
 * Sicherheitsregeln, die dieser Service durchsetzt:
 *
 *   - Geheimnisse verlassen den Service nur als Bearer-Token an den MCP-Kanal,
 *     nie an Router oder UI (dort ausschliesslich Metadaten + Vorschau).
 *   - Verschlüsselung erfolgt über die bestehende AES-256-GCM-Infrastruktur
 *     (lib/provider-admin-logic), damit es keinen zweiten Crypto-Pfad gibt.
 *   - OAuth2-Tokens werden mit 60 s Sicherheitsabstand erneuert; ein Fehler
 *     wird gespeichert und ehrlich gemeldet, nie stillschweigend ignoriert.
 *   - Token-URLs müssen HTTPS sein und dürfen weder Zugangsdaten noch private
 *     Adressen enthalten (SSRF-Schutz).
 *
 * Alles IO ist injiziert (Store, Crypto, fetch), damit Tests ohne Netz laufen.
 */
import {
  buildOAuthTokenRequest,
  describeCredentialForList,
  isValidCredentialValue,
  isValidTokenUrl,
  isTokenFresh,
  maskCredential,
  parseOAuthTokenResponse,
  resolveCredentialSource,
  type CredentialKind,
} from "../lib/mcp-credential-logic";
import type { CredentialStore } from "./mcp-credential-store";

type VaultPayload =
  | { value: string }
  | { clientId: string; clientSecret: string; accessToken?: string; expiresAt?: string };

export type CredentialMeta = {
  serverKey: string;
  kind: CredentialKind;
  preview: string;
  status: string;
  expiresAt: string | null;
  updatedAt: string;
  lastUsedAt: string | null;
  lastError: string | null;
  scopes: string[];
  tokenUrl: string | null;
};

export type ResolvedCredential =
  | { ok: true; token: string; source: "vault" | "env" }
  | { ok: false; reason: string };

export type McpCredentialServiceDeps = {
  store: CredentialStore;
  encrypt: (plaintext: string) => string;
  decrypt: (payload: string) => string;
  /** fetch-Ersatz: liefert Status und geparsten JSON-Body. */
  requestToken: (input: {
    url: string;
    headers: Record<string, string>;
    body: string;
  }) => Promise<{ status: number; payload: unknown }>;
  now?: () => number;
  env?: Record<string, string | undefined>;
};

export type McpCredentialService = {
  list(): Promise<{ ok: true; credentials: CredentialMeta[] } | { ok: false; reason: string }>;
  setStatic(input: {
    serverKey: string;
    kind: "bearer" | "api_key";
    secret: string;
    actor?: string | null;
  }): Promise<{ ok: true; credential: CredentialMeta } | { ok: false; reason: string }>;
  setOAuthClient(input: {
    serverKey: string;
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scopes?: string[];
    actor?: string | null;
  }): Promise<{ ok: true; credential: CredentialMeta } | { ok: false; reason: string }>;
  remove(serverKey: string): Promise<{ ok: true; removed: boolean } | { ok: false; reason: string }>;
  /** Löst das Token für einen Server auf (Vault vor ENV). */
  resolve(input: { serverKey: string; envVarName?: string | null }): Promise<ResolvedCredential>;
};

export function createMcpCredentialService(deps: McpCredentialServiceDeps): McpCredentialService {
  const now = deps.now ?? (() => Date.now());
  const env = deps.env ?? process.env;

  function toMeta(row: {
    serverKey: string;
    kind: string;
    maskedPreview: string;
    scopes: string[];
    tokenUrl: string | null;
    lastUsedAt: Date | null;
    lastError: string | null;
    updatedAt: Date;
    encryptedPayload: string;
  }): CredentialMeta {
    let expiresAt: string | null = null;
    if (row.kind === "oauth2_client_credentials") {
      try {
        const payload = JSON.parse(deps.decrypt(row.encryptedPayload)) as VaultPayload;
        if ("expiresAt" in payload && typeof payload.expiresAt === "string") expiresAt = payload.expiresAt;
      } catch {
        expiresAt = null;
      }
    }
    const listing = describeCredentialForList(
      {
        serverKey: row.serverKey,
        kind: row.kind as CredentialKind,
        maskedPreview: row.maskedPreview,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        updatedAt: row.updatedAt,
      },
      now(),
    );
    return {
      serverKey: row.serverKey,
      kind: row.kind as CredentialKind,
      preview: row.maskedPreview,
      status: String(listing.status),
      expiresAt,
      updatedAt: row.updatedAt.toISOString(),
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      lastError: row.lastError,
      scopes: row.scopes ?? [],
      tokenUrl: row.tokenUrl,
    };
  }

  async function save(row: {
    serverKey: string;
    kind: CredentialKind;
    payload: VaultPayload;
    preview: string;
    tokenUrl?: string | null;
    scopes?: string[];
    actor?: string | null;
  }) {
    const saved = await deps.store.upsert({
      serverKey: row.serverKey,
      kind: row.kind,
      encryptedPayload: deps.encrypt(JSON.stringify(row.payload)),
      maskedPreview: row.preview,
      tokenUrl: row.tokenUrl ?? null,
      scopes: row.scopes ?? [],
      createdBy: row.actor ?? null,
    });
    return toMeta(saved);
  }

  return {
    async list() {
      try {
        const rows = await deps.store.list();
        return { ok: true, credentials: rows.map(toMeta) };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "Credential Vault nicht lesbar." };
      }
    },

    async setStatic({ serverKey, kind, secret, actor }) {
      if (!isValidCredentialValue(secret)) {
        return { ok: false, reason: "Wert ist ungültig (8..8192 Zeichen)." };
      }
      const credential = await save({
        serverKey,
        kind,
        payload: { value: secret.trim() },
        preview: maskCredential(secret),
        actor,
      });
      return { ok: true, credential };
    },

    async setOAuthClient({ serverKey, tokenUrl, clientId, clientSecret, scopes, actor }) {
      const urlCheck = isValidTokenUrl(tokenUrl);
      if (!urlCheck.ok) return { ok: false, reason: urlCheck.reason ?? "Token-URL ungültig." };
      if (!clientId.trim()) return { ok: false, reason: "client_id fehlt." };
      if (!isValidCredentialValue(clientSecret)) return { ok: false, reason: "client_secret ist ungültig." };
      const credential = await save({
        serverKey,
        kind: "oauth2_client_credentials",
        payload: { clientId: clientId.trim(), clientSecret: clientSecret.trim() },
        preview: maskCredential(clientSecret),
        tokenUrl,
        scopes: scopes ?? [],
        actor,
      });
      return { ok: true, credential };
    },

    async remove(serverKey) {
      const removed = await deps.store.remove(serverKey);
      return { ok: true, removed };
    },

    async resolve({ serverKey, envVarName }) {
      let row: Awaited<ReturnType<CredentialStore["findByServer"]>>;
      try {
        row = await deps.store.findByServer(serverKey);
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : "Credential Vault nicht lesbar." };
      }

      const resolution = resolveCredentialSource({
        envVarName: row ? null : envVarName,
        env,
        hasVaultEntry: Boolean(row),
      });
      if (resolution.source === "env" && resolution.value) {
        return { ok: true, token: resolution.value, source: "env" };
      }
      if (!row) {
        return { ok: false, reason: resolution.reason ?? "Zugangsdaten fehlen." };
      }

      let payload: VaultPayload;
      try {
        payload = JSON.parse(deps.decrypt(row.encryptedPayload)) as VaultPayload;
      } catch {
        return { ok: false, reason: "Vault-Eintrag ist nicht lesbar (Schlüssel geändert?)." };
      }

      if (row.kind !== "oauth2_client_credentials") {
        if (!("value" in payload) || !payload.value) {
          return { ok: false, reason: "Vault-Eintrag enthält keinen Wert." };
        }
        await deps.store.recordUse(serverKey, new Date(now()), null);
        return { ok: true, token: payload.value, source: "vault" };
      }

      const oauth = payload as Extract<VaultPayload, { clientId: string }>;
      const expiresAt = oauth.expiresAt ? new Date(oauth.expiresAt) : null;
      if (oauth.accessToken && isTokenFresh(expiresAt, now())) {
        await deps.store.recordUse(serverKey, new Date(now()), null);
        return { ok: true, token: oauth.accessToken, source: "vault" };
      }
      if (!row.tokenUrl) {
        return { ok: false, reason: "OAuth-Eintrag ohne Token-URL." };
      }

      const request = buildOAuthTokenRequest({
        tokenUrl: row.tokenUrl,
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        scopes: row.scopes ?? [],
      });
      if (!request.ok) return { ok: false, reason: request.reason };

      try {
        const response = await deps.requestToken({
          url: request.request.url,
          headers: request.request.headers,
          body: request.request.body,
        });
        const parsed = parseOAuthTokenResponse(response.status, response.payload, now());
        if (!parsed.ok || !parsed.accessToken) {
          const reason = parsed.reason ?? "Token-Anfrage fehlgeschlagen.";
          await deps.store.recordUse(serverKey, new Date(now()), reason);
          return { ok: false, reason };
        }
        await save({
          serverKey,
          kind: "oauth2_client_credentials",
          payload: {
            clientId: oauth.clientId,
            clientSecret: oauth.clientSecret,
            accessToken: parsed.accessToken,
            expiresAt: parsed.expiresAt ? parsed.expiresAt.toISOString() : undefined,
          },
          preview: row.maskedPreview,
          tokenUrl: row.tokenUrl,
          scopes: parsed.scopes.length > 0 ? parsed.scopes : row.scopes ?? [],
        });
        await deps.store.recordUse(serverKey, new Date(now()), null);
        return { ok: true, token: parsed.accessToken, source: "vault" };
      } catch (error) {
        const reason = `Token-Anfrage nicht erreichbar: ${error instanceof Error ? error.message : "unbekannt"}`.slice(0, 200);
        await deps.store.recordUse(serverKey, new Date(now()), reason);
        return { ok: false, reason };
      }
    },
  };
}
