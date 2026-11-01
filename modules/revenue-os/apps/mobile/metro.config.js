const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');
const fs = require('fs');

// ─── Monorepo-Unterstützung: Ermittle alle Workspace-Pakete ────────
const workspaceRoot = path.resolve(__dirname, '../..');
const pnpmWorkspace = path.join(workspaceRoot, 'pnpm-workspace.yaml');

let extraNodeModules = {};
let watchFolders = [path.resolve(__dirname)];

// Lese pnpm-workspace.yaml, um zusätzliche Pakete zu finden
try {
  const yamlContent = fs.readFileSync(pnpmWorkspace, 'utf8');
  const packagePatterns = yamlContent
    .split('\n')
    .filter(line => line.startsWith('  - "') || line.startsWith('  - '))
    .map(line => line.replace(/^\s*-\s*["']?/, '').replace(/["']?$/, '').trim())
    .filter(Boolean);

  for (const pattern of packagePatterns) {
    const fullPath = path.resolve(workspaceRoot, pattern);
    if (fs.existsSync(fullPath)) {
      watchFolders.push(fullPath);
    }
  }

  // Füge node_modules vom Workspace-Root hinzu
  watchFolders.push(path.join(workspaceRoot, 'node_modules'));

  // Extrahiere Workspace-Dependencies für moduleResolution
  const rootPkgPath = path.join(workspaceRoot, 'package.json');
  if (fs.existsSync(rootPkgPath)) {
    const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
    const allDeps = {
      ...(rootPkg.dependencies || {}),
      ...(rootPkg.devDependencies || {}),
    };
    for (const depName of Object.keys(allDeps)) {
      const depPath = path.join(workspaceRoot, 'node_modules', depName);
      if (fs.existsSync(depPath)) {
        extraNodeModules[depName] = depPath;
      }
    }
  }
} catch (err) {
  console.warn('[Metro] Konnte Workspace-Konfiguration nicht lesen:', err.message);
}

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  projectRoot: __dirname,
  watchFolders,
  resolver: {
    extraNodeModules: {
      ...extraNodeModules,
      ...defaultConfig.resolver.extraNodeModules,
    },
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    sourceExts: [...defaultConfig.resolver.sourceExts, 'sql'],
  },
  transformer: {
    ...defaultConfig.transformer,
    babelTransformerPath: require.resolve('metro-react-native-babel-transformer'),
    assetPlugins: ['react-native-reanimated/plugin'],
  },
  server: {
    port: 8081,
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // CORS-Header für Development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        return middleware(req, res, next);
      };
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
