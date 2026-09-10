const fs = require('fs');
if (fs.existsSync('app.config.ts')) {
  let content = fs.readFileSync('app.config.ts', 'utf8');
  if (!content.includes('4a3ea21d-feab-4c31-96c2-c1075123d58f')) {
    if (content.includes('extra:')) {
      content = content.replace(/extra\s*:\s*\{/, 'extra: {\n      eas: {\n        projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"\n      },');
    } else {
      content = content.replace(/return\s*\{/, 'return {\n    extra: {\n      eas: {\n        projectId: "4a3ea21d-feab-4c31-96c2-c1075123d58f"\n      }\n    },');
    }
    fs.writeFileSync('app.config.ts', content);
    console.log('app.config.ts patched successfully.');
  } else {
    console.log('Project ID already present.');
  }
}
