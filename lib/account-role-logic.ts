export type AccountRole = "user" | "admin";

/** Öffentliche Selbstregistrierung darf niemals allein durch eine E-Mail Adminrechte vergeben. */
export function roleForPublicRegistration(): "user" {
  return "user";
}

/**
 * Ein Upsert darf nur eine ausdrücklich konfigurierte Owner-ID zu admin
 * erheben. Externe Identitätsprovider können keine Adminrolle anfordern.
 */
export function roleForUserUpsert(args: {
  openId: string;
  ownerOpenId: string | null | undefined;
  requestedRole?: AccountRole;
}): AccountRole | undefined {
  const ownerOpenId = args.ownerOpenId?.trim();
  if (ownerOpenId && args.openId === ownerOpenId) return "admin";
  if (args.requestedRole === undefined) return undefined;
  return "user";
}
