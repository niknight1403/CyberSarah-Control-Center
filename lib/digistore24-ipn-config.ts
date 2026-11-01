export function resolveDigistore24IpnSecret(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const canonical = env.DIGISTORE24_IPN_SECRET?.trim();
  if (canonical) return canonical;
  const legacy = env.DIGISTORE24_IPN_PASSPHRASE?.trim();
  return legacy || undefined;
}
