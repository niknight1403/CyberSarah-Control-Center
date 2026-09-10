import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("production deployment configuration", () => {
  it("baut mit npm und einem gesperrten Lockfile", () => {
    const pkg = readProjectFile("package.json");
    expect(pkg).toContain('"packageManager": "npm@');
    expect(pkg).not.toContain("start:pm2");

    const lock = JSON.parse(readProjectFile("package-lock.json"));
    expect(lock.lockfileVersion).toBe(3);
  });

  it("stellt den API-Dienst als Docker-Container mit Runtime-Port bereit", () => {
    const dockerfile = readProjectFile("Dockerfile");
    expect(dockerfile).toContain("npm ci");
    expect(dockerfile).toContain("npm run build");
    expect(dockerfile).toContain("npm prune --omit=dev");
    expect(dockerfile).toMatch(/^ENV PORT=\d+$/m);
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
  });

  it("haelt keine Secrets im Image", () => {
    const ignore = readProjectFile(".dockerignore");
    expect(ignore.split("\n")).toContain(".env");
    expect(ignore.split("\n")).toContain(".env.*");
    expect(ignore.split("\n")).toContain("node_modules");
  });

  it("dokumentiert APP_ALLOWED_ORIGINS als Produktions-Pflicht", () => {
    const guide = readProjectFile("docs/render-deployment.md");
    expect(guide).toContain("APP_ALLOWED_ORIGINS");
    expect(guide).toMatch(/Pflicht|403/);
  });

  it("definiert Render als Zielplattform mit Free-Plan-Blueprint", () => {
    const blueprint = readProjectFile("render.yaml");
    expect(blueprint).toContain("plan: free");
    expect(blueprint).toContain("cybersarah-control-center");
    expect(blueprint).toContain("cybersarah-workspace");
    expect(blueprint).toContain("rootDir: workspace-service");

    const workflow = readProjectFile(".github/workflows/render-deploy.yml");
    expect(workflow).toContain("RENDER_API_KEY");
    expect(workflow).toContain("render-deploy.mjs");
  });

  it("haelt das Repository frei von Koyeb-Resten und Klartext-Secrets", () => {
    const deployLogic = readProjectFile("lib/render-deploy-logic.mjs");
    expect(deployLogic).toContain("rnd_");
    expect(deployLogic).toContain("maskSecrets");

    const guide = readProjectFile("docs/render-deployment.md");
    expect(guide).toContain("Neon");
    expect(guide).toContain("ephemeral");
  });

  it("enthaelt keine Hetzner- oder VPS-Betriebsspur mehr", () => {
    const design = readProjectFile("design.md").toLowerCase();
    expect(design).not.toContain("hetzner");

    const ops = readProjectFile("docs/OPERATIONS.md").toLowerCase();
    expect(ops).not.toContain("systemd");
    expect(ops).not.toContain("ntfy");
    expect(ops).not.toContain("/opt/cybersarah-control-center");
    expect(ops).toContain("render");
    expect(ops).toContain("neon");
  });

  it("nutzt PostgreSQL als Datenbank-Treiber", () => {
    const schema = readProjectFile("drizzle/schema.ts");
    expect(schema).toContain("drizzle-orm/pg-core");
    expect(schema).not.toContain("mysql-core");

    const pkg = readProjectFile("package.json");
    expect(pkg).toContain("\"pg\"");
    expect(pkg).not.toContain("mysql2");

    const validator = readProjectFile("scripts/validate-production.mjs");
    expect(validator).toContain("node-postgres");
    expect(validator).not.toContain("mysql2/promise");
  });
});
