import "dotenv/config";

import { getDb } from "../server/db";
import { users } from "../drizzle/schema";

/**
 * Diagnose-Script (read-only): Listet alle Konten mit Rolle/EMail/Login-Methode
 * aus der produktiven Datenbank, damit erklaerbar ist, warum ein Login
 * keine Admin-Rechte hat. Wird von .github/workflows/diagnose-admin.yml
 * gegen das DATABASE_URL-Secret ausgefuehrt.
 */
async function main() {
  const db = await getDb();
  if (!db) {
    throw new Error("Datenbank nicht verfuegbar — DATABASE_URL pruefen.");
  }
  const rows = await db
    .select({
      id: users.id,
      openId: users.openId,
      email: users.email,
      name: users.name,
      loginMethod: users.loginMethod,
      role: users.role,
      lastSignedIn: users.lastSignedIn,
    })
    .from(users)
    .orderBy(users.id);

  console.log(`--- Konten (${rows.length}) ---`);
  for (const row of rows) {
    const email = row.email ?? "(null)";
    const name = row.name ?? "(null)";
    console.log(
      `id=${row.id} | openId=${row.openId} | email=${email} | name=${name} | login=${row.loginMethod ?? "null"} | role=${row.role} | lastSignedIn=${row.lastSignedIn?.toISOString?.() ?? row.lastSignedIn}`,
    );
  }
  console.log("--- ENV ---");
  console.log(`ADMIN_EMAIL (ENV): ${process.env.ADMIN_EMAIL ?? "(nicht gesetzt)"}`);
  console.log(`OWNER_OPEN_ID (ENV): ${process.env.OWNER_OPEN_ID ? "(gesetzt)" : "(nicht gesetzt)"}`);
}

main().catch((error) => {
  console.error(`[Diagnose] Fehlgeschlagen: ${error.message}`);
  process.exit(1);
});
