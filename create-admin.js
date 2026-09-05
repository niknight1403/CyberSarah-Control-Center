import { db } from './server/db.js';
import { users } from './drizzle/schema.ts';
import bcrypt from 'bcrypt';

async function run() {
  const hashedPassword = await bcrypt.hash('Niko6529!!!!!', 10);
  try {
    await db.insert(users).values({
      email: 'niko.oeben@gmail.com',
      password: hashedPassword,
      role: 'admin',
      isVerified: true
    });
    console.log("Admin-User erfolgreich angelegt!");
  } catch (e) {
    console.log("Fehler oder User existiert bereits:", e.message);
  }
  process.exit(0);
}
run();
