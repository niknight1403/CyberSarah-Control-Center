export type SecureSessionStore = {
  set: (key: string, value: string, options?: { requireAuthentication?: boolean; authenticationPrompt?: string }) => Promise<void>;
  get: (key: string, options?: { requireAuthentication?: boolean; authenticationPrompt?: string }) => Promise<string | null>;
  remove: (key: string, options?: { requireAuthentication?: boolean; authenticationPrompt?: string }) => Promise<void>;
};

export const SECURE_SESSION_KEYS = {
  accessToken: "cybersarah.session.access-token.v1",
  refreshToken: "cybersarah.session.refresh-token.v1",
  sessionId: "cybersarah.session.id.v1",
} as const;

export async function saveSessionTokens(input: { accessToken: string; refreshToken?: string; sessionId?: string; biometricProtection?: boolean }, store: SecureSessionStore): Promise<void> {
  const options = input.biometricProtection ? { requireAuthentication: true } : undefined;
  await store.set(SECURE_SESSION_KEYS.accessToken, input.accessToken, options);
  if (input.refreshToken?.trim()) await store.set(SECURE_SESSION_KEYS.refreshToken, input.refreshToken, options);
  if (input.sessionId?.trim()) await store.set(SECURE_SESSION_KEYS.sessionId, input.sessionId, options);
}

export async function loadSessionTokens(store: SecureSessionStore): Promise<{ accessToken: string | null; refreshToken: string | null; sessionId: string | null }> {
  const [accessToken, refreshToken, sessionId] = await Promise.all([
    store.get(SECURE_SESSION_KEYS.accessToken),
    store.get(SECURE_SESSION_KEYS.refreshToken),
    store.get(SECURE_SESSION_KEYS.sessionId),
  ]);
  return { accessToken, refreshToken, sessionId };
}

export async function clearSessionTokens(store: SecureSessionStore): Promise<void> {
  await Promise.all(Object.values(SECURE_SESSION_KEYS).map((key) => store.remove(key)));
}
