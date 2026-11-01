import { logger } from "../lib/logger";

export interface ApiCredentials {
  typ: "api_key" | "bearer" | "oauth2" | "basic";
  apiKey?: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  zugriffsToken?: string;
  refreshToken?: string;
  ablaufZeit?: Date;
}

export interface AuthHeader {
  Authorization?: string;
  "X-API-Key"?: string;
  [key: string]: string | undefined;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

export class AuthHandler {
  private static instanz: AuthHandler;
  private tokenCache: Map<string, ApiCredentials> = new Map();

  static holeInstanz(): AuthHandler {
    if (!AuthHandler.instanz) {
      AuthHandler.instanz = new AuthHandler();
    }
    return AuthHandler.instanz;
  }

  ladeCredentialsAusEnv(service: string): ApiCredentials {
    const prefix = service.toUpperCase().replace(/-/g, "_");

    const apiKey = process.env[`${prefix}_API_KEY`];
    const token = process.env[`${prefix}_TOKEN`] ?? process.env[`${prefix}_ACCESS_TOKEN`];
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    const tokenUrl = process.env[`${prefix}_TOKEN_URL`];

    if (apiKey) {
      return { typ: "api_key", apiKey };
    }
    if (clientId && clientSecret && tokenUrl) {
      return { typ: "oauth2", clientId, clientSecret, tokenUrl };
    }
    if (token) {
      return { typ: "bearer", token };
    }

    logger.warn({ service }, "Keine Credentials für Service gefunden");
    return { typ: "api_key" };
  }

  erstelleAuthHeader(credentials: ApiCredentials): AuthHeader {
    switch (credentials.typ) {
      case "api_key":
        if (credentials.apiKey) {
          return { "X-API-Key": credentials.apiKey };
        }
        return {};

      case "bearer":
        const bearerToken = credentials.zugriffsToken ?? credentials.token;
        if (bearerToken) {
          return { Authorization: `Bearer ${bearerToken}` };
        }
        return {};

      case "oauth2":
        if (credentials.zugriffsToken) {
          return { Authorization: `Bearer ${credentials.zugriffsToken}` };
        }
        return {};

      case "basic":
        if (credentials.clientId && credentials.clientSecret) {
          const encoded = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
          return { Authorization: `Basic ${encoded}` };
        }
        return {};

      default:
        return {};
    }
  }

  istTokenAbgelaufen(credentials: ApiCredentials): boolean {
    if (!credentials.ablaufZeit) return false;
    const puffer = 60 * 1000;
    return credentials.ablaufZeit.getTime() - Date.now() < puffer;
  }

  async erneuereToken(service: string, credentials: ApiCredentials): Promise<ApiCredentials> {
    if (credentials.typ !== "oauth2") return credentials;
    if (!credentials.clientId || !credentials.clientSecret || !credentials.tokenUrl) {
      throw new Error(`OAuth2 Credentials für ${service} unvollständig`);
    }

    logger.info({ service }, "Token wird erneuert");

    const params = new URLSearchParams();

    if (credentials.refreshToken) {
      params.set("grant_type", "refresh_token");
      params.set("refresh_token", credentials.refreshToken);
    } else {
      params.set("grant_type", "client_credentials");
    }
    params.set("client_id", credentials.clientId);
    params.set("client_secret", credentials.clientSecret);

    const antwort = await fetch(credentials.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!antwort.ok) {
      throw new Error(`Token-Erneuerung fehlgeschlagen: HTTP ${antwort.status}`);
    }

    const daten = (await antwort.json()) as OAuthTokenResponse;
    const aktualisiert: ApiCredentials = {
      ...credentials,
      zugriffsToken: daten.access_token,
      refreshToken: daten.refresh_token ?? credentials.refreshToken,
      ablaufZeit: daten.expires_in
        ? new Date(Date.now() + daten.expires_in * 1000)
        : undefined,
    };

    this.tokenCache.set(service, aktualisiert);
    logger.info({ service }, "Token erfolgreich erneuert");
    return aktualisiert;
  }

  async holeGueltigeCredentials(service: string, credentials: ApiCredentials): Promise<ApiCredentials> {
    const gecacht = this.tokenCache.get(service);
    const aktuelleCredentials = gecacht ?? credentials;

    if (aktuelleCredentials.typ === "oauth2" && this.istTokenAbgelaufen(aktuelleCredentials)) {
      return this.erneuereToken(service, aktuelleCredentials);
    }

    return aktuelleCredentials;
  }
}
