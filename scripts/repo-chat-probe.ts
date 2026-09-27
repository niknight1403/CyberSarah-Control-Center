import { searchRepoCode, repoIndexCacheStats } from "../server/repo-chat-service";

async function main() {
  const result = await searchRepoCode("evaluateHITLRisk");
  console.log("ok:", result.ok, "| repo:", result.repo, "| branch:", result.branch);
  if (!result.result) { console.log("error:", result.error); process.exit(1); }
  console.log("Treffer:", result.result.symbols.length, "Symbole,", result.result.files.length, "Dateien");
  for (const symbol of result.result.symbols.slice(0, 5)) {
    console.log(`  [${symbol.kind}] ${symbol.name} -> ${symbol.filePath}:${symbol.line} (score ${symbol.score})`);
  }
  console.log("Cache:", JSON.stringify(repoIndexCacheStats()));
}
main();
