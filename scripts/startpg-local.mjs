import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";

const dataDir = "/tmp/cybersarah-pgdata";
const alreadyInit = fs.existsSync(dataDir + "/PG_VERSION");

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "cybersarah",
  password: "cybersarah",
  port: 5432,
  persistent: true,
  createPostgresUser: !alreadyInit || true,
});

if (!alreadyInit) {
  await pg.initialise();
  console.log("INITIALISED");
}
await pg.start();
console.log("PG_STARTED");
try { await pg.createDatabase("cybersarah"); console.log("DB_CREATED"); }
catch (e) { console.log("DB_NOTE:", String(e).slice(0, 150)); }
setInterval(() => {}, 1 << 30);
