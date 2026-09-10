const fs = require('fs');
const { execSync } = require('child_process');

console.log('1. Erstelle .eas/project.json...');
fs.mkdirSync('.eas', { recursive: true });
fs.writeFileSync('.eas/project.json', JSON.stringify({ projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f" }, null, 2));

console.log('2. Bereite temporäre statische Konfiguration vor...');
let originalConfig = '';
let hasTsConfig = false;
if (fs.existsSync('app.config.ts')) {
  hasTsConfig = true;
  originalConfig = fs.readFileSync('app.config.ts', 'utf8');
  fs.writeFileSync('app.json', JSON.stringify({
    expo: {
      name: "CyberSarah Control Center",
      slug: "custom-ai-studio-mobile",
      version: "1.0.0",
      extra: {
        eas: {
          projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"
        }
      }
    }
  }, null, 2));
}

console.log('3. Führe eas init aus...');
try {
  execSync('eas init --id 4a3ea21d-feab-4c31-96c2-c1075123d58f --non-interactive', { stdio: 'inherit' });
} catch (e) {
  console.log('Initialisierung abgeschlossen.');
}

if (hasTsConfig) {
  console.log('4. Stelle app.config.ts wieder her und integriere Project ID...');
  if (!originalConfig.includes('4a3ea21d-feab-4c31-96c2-c1075123d58f')) {
    if (originalConfig.includes('return {')) {
      originalConfig = originalConfig.replace(/return\s*\{/, 'return {\n  extra: {\n    eas: {\n      projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"\n    }\n  },');
    } else if (originalConfig.includes('expo: {')) {
      originalConfig = originalConfig.replace(/expo\s*:\s*\{/, 'expo: {\n  extra: {\n    eas: {\n      projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"\n    },');
    }
  }
  fs.writeFileSync('app.config.ts', originalConfig);
  if (fs.existsSync('app.json')) {
    fs.unlinkSync('app.json');
  }
}

console.log('5. Starte EAS Build...');
execSync('export EAS_SKIP_AUTO_FINGERPRINT=1 && eas build --platform android --profile preview --non-interactive', { stdio: 'inherit', shell: true });
