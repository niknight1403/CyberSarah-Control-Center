/**
 * adminAccount — Autonome Administrator-Kontoverwaltung
 *
 * Erstellt beim Server-Start autonom das Administrator-Konto (falls es nicht
 * existiert) und stellt Login/Token-Verifikation bereit. Passwörter werden
 * NIE im Klartext gespeichert, sondern als Scrypt-Hash (node:crypto, ohne
 * externe Abhängigkeiten): Format "scrypt$<salt-hex>$<hash-hex>".
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "niko.oeben@gmail.com").toLowerCase();
const ADMIN_NAME = process.env.ADMIN_NAME ?? "Niko (Administrator)";
/** Wird beim ersten Start gesetzt, danach nur noch über ADMIN_PASSWORT änderbar. */
const ADMIN_PASSWORT = process.env.ADMIN_PASSWORT;

const TOKEN_GUELTIGKEIT_MS = 24 * 60 * 60 * 1000; // 24 Stunden
const AUTH_SECRET =
  process.env.AUTH_SECRET ?? process.env.ADMIN_EMAIL ?? "cybersarah-dev-secret";

// ── Passwort-Hashing (Scrypt) ────────────────────────────────────────────────
export function hashePasswort(klartext: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(klartext, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function pruefePasswort(klartext: string, gesichert: string | null | undefined): boolean {
  if (!gesichert?.startsWith("scrypt$")) return false;
  const [, salt, erwarteterHash] = gesichert.split("$");
  try {
    const hash = scryptSync(klartext, salt, 64);
    const erwartet = Buffer.from(erwarteterHash, "hex");
    return hash.length === erwartet.length && timingSafeEqual(hash, erwartet);
  } catch {
    return false;
  }
}

// ── Session-Tokens (HMAC-signiert, zustandslos) ─────────────────────────────
export function erzeugeToken(userId: number, email: string): string {
  const laeuftAb = Date.now() + TOKEN_GUELTIGKEIT_MS;
  // Achtung: "|" als Trenner — E-Mails enthalten Punkte, "." wuerde das
  // Parsen unmoeglich machen. "|" ist in E-Mails nie gueltig.
  const nutzlast = `${userId}|${email}|${laeuftAb}`;
  const signatur = createHmac("sha256", AUTH_SECRET).update(nutzlast).digest("hex");
  return Buffer.from(`${nutzlast}|${signatur}`).toString("base64url");
}

export function verifiziereToken(token: string): { userId: number; email: string } | null {
  try {
    const [userId, email, laeuftAb, signatur] = Buffer.from(token, "base64url").toString().split("|");
    if (Number(laeuftAb) < Date.now()) return null;
    const erwartet = createHmac("sha256", AUTH_SECRET).update(`${userId}|${email}|${laeuftAb}`).digest("hex");
    if (signatur !== erwartet) return null;
    return { userId: Number(userId), email };
  } catch {
    return null;
  }
}

// ── Autonomer Admin-Seed ────────────────────────────────────────────────────
export interface AdminSeedErgebnis {
  erstellt: boolean;
  email: string;
  userId: number | null;
}

/** Erstellt das Administrator-Konto autonom beim Start (idempotent). */
export async function stelleAdminBereit(): Promise<AdminSeedErgebnis> {
  try {
    const [vorhanden] = await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL)).limit(1);

    if (vorhanden) {
      // Rollen & Rechte autonom auf Administrator-Niveau halten
      if (vorhanden.rolle !== "admin" || vorhanden.berechtigungen?.includes?.("*") !== true) {
        await db
          .update(usersTable)
          .set({
            rolle: "admin",
            berechtigungen: JSON.stringify(["*"]),
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, vorhanden.id));
        logger.info({ email: ADMIN_EMAIL }, "Administrator-Konto auf volle Rechte aktualisiert");
      }
      return { erstellt: false, email: ADMIN_EMAIL, userId: vorhanden.id };
    }

    if (!ADMIN_PASSWORT) {
      logger.warn(
        { email: ADMIN_EMAIL },
        "ADMIN_PASSWORT nicht gesetzt — Administrator-Konto wird nicht neu erstellt",
      );
      return { erstellt: false, email: ADMIN_EMAIL, userId: null };
    }

    const [neu] = await db
      .insert(usersTable)
      .values({
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        rolle: "admin",
        passwortHash: hashePasswort(ADMIN_PASSWORT),
        berechtigungen: JSON.stringify(["*"]),
      })
      .returning();

    logger.info({ email: ADMIN_EMAIL, userId: neu?.id }, "✅ Administrator-Konto autonom erstellt (alle Rechte)");
    return { erstellt: true, email: ADMIN_EMAIL, userId: neu?.id ?? null };
  } catch (err) {
    logger.error({ err }, "Admin-Seed fehlgeschlagen (DB nicht erreichbar?)");
    return { erstellt: false, email: ADMIN_EMAIL, userId: null };
  }
}

export async function login(email: string, passwort: string): Promise<{
  token: string
  nutzer: { id: number; email: string; name: string | null; rolle: string; berechtigungen: string[] }
} | null> {
  const [nutzer] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (!nutzer || !pruefePasswort(passwort, nutzer.passwortHash)) return null;

  let berechtigungen: string[] = [];
  try {
    berechtigungen = JSON.parse(nutzer.berechtigungen ?? "[]");
  } catch {
    berechtigungen = [];
  }

  return {
    token: erzeugeToken(nutzer.id, nutzer.email ?? email),
    nutzer: {
      id: nutzer.id,
      email: nutzer.email ?? email,
      name: nutzer.name,
      rolle: nutzer.rolle,
      berechtigungen,
    },
  };
}
