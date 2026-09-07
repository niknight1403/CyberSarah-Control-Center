import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WEB_DIST_DIR,
  isWebFallbackCandidate,
  mapUrlPathToWebFile,
  resolveWebDistDir,
} from "../lib/static-web-logic";

const createdDirs: string[] = [];

function createTempWebDist(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "cs-web-dist-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop() as string, { recursive: true, force: true });
  }
  delete process.env.WEB_DIST_DIR;
});

describe("mapUrlPathToWebFile", () => {
  it("mappen Wurzel auf index.html", () => {
    expect(mapUrlPathToWebFile("/")).toBe("index.html");
  });

  it("mappt Routen ohne Erweiterung auf .html-Dateien", () => {
    expect(mapUrlPathToWebFile("/account")).toBe("account.html");
    expect(mapUrlPathToWebFile("/account/")).toBe("account.html");
    expect(mapUrlPathToWebFile("/dev/theme-lab")).toBe("dev/theme-lab.html");
  });

  it("laesst Asset-Pfade unveraendert", () => {
    expect(mapUrlPathToWebFile("/assets/app.js")).toBe("assets/app.js");
    expect(mapUrlPathToWebFile("/_expo/static/js/web/entry-abc123.js")).toBe(
      "_expo/static/js/web/entry-abc123.js",
    );
  });

  it("entfernt Query und Fragment", () => {
    expect(mapUrlPathToWebFile("/account?ref=home#top")).toBe("account.html");
  });

  it("blockiert Traversal-Versuche", () => {
    expect(mapUrlPathToWebFile("/../../etc/passwd")).toBeNull();
    expect(mapUrlPathToWebFile("/a/../..")).toBeNull();
  });

  it("lehnt Pfade ohne fuehrenden Slash ab", () => {
    expect(mapUrlPathToWebFile("account")).toBeNull();
  });
});

describe("isWebFallbackCandidate", () => {
  it("erlaubt GET und HEAD auf Nicht-API-Pfade", () => {
    expect(isWebFallbackCandidate("GET", "/login")).toBe(true);
    expect(isWebFallbackCandidate("HEAD", "/account")).toBe(true);
  });

  it("lehnt API-Pfade und Schreib-Methoden ab", () => {
    expect(isWebFallbackCandidate("GET", "/api/health")).toBe(false);
    expect(isWebFallbackCandidate("POST", "/login")).toBe(false);
  });
});

describe("resolveWebDistDir", () => {
  it("nutzt WEB_DIST_DIR wenn das Verzeichnis existiert", () => {
    const dir = createTempWebDist();
    process.env.WEB_DIST_DIR = dir;
    expect(resolveWebDistDir(process.cwd())).toBe(dir);
  });

  it("liefert null fuer fehlende Verzeichnisse", () => {
    process.env.WEB_DIST_DIR = path.join(os.tmpdir(), "existiert-nicht-xyz");
    expect(resolveWebDistDir(process.cwd())).toBeNull();
  });

  it("greift auf den Standard zurueck, wenn web-dist im Basisverzeichnis existiert", () => {
    const base = createTempWebDist();
    const webDist = path.join(base, DEFAULT_WEB_DIST_DIR);
    mkdirSync(webDist);
    createdDirs.push(webDist);
    expect(resolveWebDistDir(base)).toBe(webDist);
  });

  it("liefert null, wenn das Standardverzeichnis fehlt", () => {
    const base = createTempWebDist();
    expect(resolveWebDistDir(base)).toBeNull();
  });
});
