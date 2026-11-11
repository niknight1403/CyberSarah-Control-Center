-- Sprint 4: Credential Vault fuer MCP-Server.
-- Geheimnisse liegen ausschliesslich AES-256-GCM-verschluesselt in
-- encrypted_payload (iv:tag:ciphertext). Maskierte Vorschau und Metadaten
-- sind sichtbar; ENV-Referenzen bleiben als Fallback erhalten.
CREATE TABLE IF NOT EXISTS "mcp_credentials" (
  "id" serial PRIMARY KEY,
  "server_key" varchar(64) NOT NULL,
  "kind" varchar(32) NOT NULL DEFAULT 'bearer',
  "encrypted_payload" text NOT NULL,
  "masked_preview" varchar(48) NOT NULL DEFAULT '',
  "token_url" text,
  "scopes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "last_used_at" timestamp with time zone,
  "last_error" varchar(300),
  "created_by" varchar(255),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "mcp_credentials_server_idx" ON "mcp_credentials" ("server_key");
