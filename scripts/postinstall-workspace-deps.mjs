import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const workspacePkgPath = path.join(rootDir, 'workspace-service', 'package.json');

if (fs.existsSync(workspacePkgPath)) {
  console.log('[postinstall] workspace-service/package.json gefunden -> Installiere workspace-service Abhängigkeiten...');
  try {
    execSync('npm --prefix workspace-service install --omit=dev --no-audit --no-fund', {
      cwd: rootDir,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[postinstall] Fehler bei npm install in workspace-service:', err);
    process.exit(err.status || 1);
  }
} else {
  console.log('[postinstall] workspace-service/package.json nicht vorhanden (Docker COPY package.json Layer) -> postinstall skipped.');
}
