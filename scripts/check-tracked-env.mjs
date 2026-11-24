import { execFileSync } from "node:child_process";

const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbidden = paths.filter(path => {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return (name === ".env" || name.startsWith(".env.") || /\.env\.bak/.test(name)) && name !== ".env.example";
});
if (forbidden.length) {
  console.error("Tracked environment files must be removed:\n" + forbidden.join("\n"));
  process.exitCode = 1;
} else {
  console.log("No tracked environment backups or live .env files.");
}
