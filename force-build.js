const fs = require('fs');
const { execSync } = require('child_process');

console.log('1. Generiere vollständige statische app.json...');
const staticConfig = {
  expo: {
    name: "CyberSarah Control Center",
    slug: "custom-ai-studio-mobile",
    version: "1.0.0",
    android: {
      package: "com.niko1981.cybersarahcontrolcenter"
    },
    extra: {
      eas: {
        projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"
      }
    }
  }
};
fs.writeFileSync('app.json', JSON.stringify(staticConfig, null, 2));

console.log('2. Sichere app.config.ts temporär weg...');
let hasTs = false;
if (fs.existsSync('app.config.ts')) {
  hasTs = true;
  fs.renameSync('app.config.ts', 'app.config.ts.bak');
}

console.log('3. Erstelle .eas/project.json...');
fs.mkdirSync('.eas', { recursive: true });
fs.writeFileSync('.eas/project.json', JSON.stringify({ projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f" }, null, 2));

console.log('4. Starte Build mit vollständiger statischer Konfiguration...');
try {
  execSync('export EAS_SKIP_AUTO_FINGERPRINT=1 && eas build --platform android --profile preview --non-interactive', { stdio: 'inherit', shell: true });
} catch (e) {
  console.log('Build beendet.');
} finally {
  if (hasTs && fs.existsSync('app.config.ts.bak')) {
    fs.renameSync('app.config.ts.bak', 'app.config.ts');
  }
  if (fs.existsSync('app.json')) {
    fs.unlinkSync('app.json');
  }
}
