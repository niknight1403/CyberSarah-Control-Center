import "dotenv/config";

import { ensureAdminAccount } from "../server/db";
import { hashPassword } from "../server/local-auth";

const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? "";

if (!email || !password) {
  throw new Error("ADMIN_EMAIL und ADMIN_PASSWORD müssen für das Admin-Seeding gesetzt sein.");
}

const passwordHash = await hashPassword(password);
const user = await ensureAdminAccount({
  email,
  name: "CyberSarah Administrator",
  passwordHash,
});

console.log(`[Admin] Konto bereit: ${user.email ?? email} (role=${user.role})`);
