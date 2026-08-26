import type { ProviderId } from "@/lib/studio-settings-logic";

export type ProviderKeyStatus = Partial<Record<ProviderId, boolean>>;

export function providerKeyStorageKey(provider: ProviderId) {
  return `custom-ai-studio.provider-key.${provider}.v1`;
}

export function updateProviderKeyStatus(status: ProviderKeyStatus, provider: ProviderId, configured: boolean): ProviderKeyStatus {
  return { ...status, [provider]: configured };
}

export function hasProviderKey(status: ProviderKeyStatus, provider: ProviderId) {
  return Boolean(status[provider]);
}

export function getProviderKeyStatusLabel(provider: ProviderId, configured: boolean) {
  if (provider === "managed") return "Serverseitig verwaltet";
  return configured ? "API-Key sicher hinterlegt" : "Kein API-Key hinterlegt";
}
