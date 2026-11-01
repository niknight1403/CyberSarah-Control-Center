/**
 * Repo-Chat-Service (Sprint 163) — GitHub-Tarball-Indizierung fuer Code-
 * Abfragen mit Dateipfad und Zeilennummer (V4.0: repoChatEngine).
 *
 * Der Server auf Render hat kein Repo-Checkout; deshalb wird der Repo-
 * Tarball einmal pro Repo/Branch ueber die GitHub-API geladen, in einen
 * gebundenen Sandbox-Temp-Ordner entpackt (nur code-Dateien, Budget-
 * Deckel ueber lib/repo-chat-logic) und der Symbol-Index im Speicher
 * gecacht. Abfragen laufen dann rein ueber answerCodeQuery.
 *
 * Caching: pro "repo@branch" ein Index mit TTL (Default 60 Minuten) —
 * wiederholte Agenten-Fragen kosten keine erneuten API-Calls. Der Tarball-
 * Download selbst ist durch das Tool-Zeitlimit begrenzt.
 *
 * Best-Effort mit ehrlichen Fehlern: Ohne GITHUB_TOKEN (private Repos)
 * bzw. bei Netzwerk-/API-Fehlern liefert searchRepoCode eine strukturierte
 * Fehlermeldung statt erfundener Treffer.
 */

import axios from "axios";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { extract as tarExtract } from "tar";

import {
  answerCodeQuery,
  collectIndexableFiles,
  INDEXABLE_MAX_FILE_BYTES,
  indexRepoFiles,
  type CodeQueryResult,
  type RepoFileContent,
} from "../lib/repo-chat-logic";

const DEFAULT_REPO = process.env.ORCHESTRATOR_GITHUB_REPO ?? "niknight1403/CyberSarah-Control-Center";
const INDEX_TTL_MS = 60 * 60 * 1000;

interface CachedRepoIndex {
  index: ReturnType<typeof indexRepoFiles>;
  builtAt: number;
  expiresAt: number;
}

const indexCache = new Map<string, CachedRepoIndex>();
const buildLocks = new Map<string, Promise<CachedRepoIndex>>();

/** Tarball eines Repos laden (codeload.github.com liefert das Archiv direkt). */
async function downloadRepoTarball(repo: string, branch: string): Promise<Buffer> {
  const token = process.env.GITHUB_TOKEN ?? process.env.ADMIN_GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await axios.get(`https://codeload.github.com/${repo}/tar.gz/${branch}`, {
    headers,
    responseType: "arraybuffer",
    timeout: 60_000,
    maxContentLength: 80 * 1024 * 1024,
  });
  return Buffer.from(response.data as ArrayBuffer);
}

/**
 * Baut (oder laedt aus dem Cache) den Repo-Index. Serialisiert Builds pro
 * repo@branch ueber Locks, damit parallele Fragen nur EINEN Download triggern.
 */
async function getRepoIndex(repo: string, branch: string): Promise<CachedRepoIndex> {
  const cacheKey = `${repo}@${branch}`;
  const cached = indexCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  const existingBuild = buildLocks.get(cacheKey);
  if (existingBuild) return existingBuild;

  const build = (async () => {
    const archive = await downloadRepoTarball(repo, branch);
    const extractRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cybersarah-repo-chat-"));
    const extractDir = await fs.mkdtemp(extractRoot);
    const tarPath = path.join(extractDir, "repo.tar.gz");
    await fs.writeFile(tarPath, archive);
    const unpackDir = path.join(extractDir, "src");
    await fs.mkdir(unpackDir, { recursive: true });
    await tarExtract({ file: tarPath, cwd: unpackDir, strip: 1 });

    const walked = await walkFiles(unpackDir, "");
    const indexable = collectIndexableFiles(walked);
    const files: RepoFileContent[] = [];
    for (const candidate of indexable) {
      const content = await fs.readFile(path.join(unpackDir, candidate.path), "utf8").catch(() => "");
      if (content) files.push({ path: candidate.path, content });
    }

    const built: CachedRepoIndex = {
      index: indexRepoFiles(files),
      builtAt: Date.now(),
      expiresAt: Date.now() + INDEX_TTL_MS,
    };
    indexCache.set(cacheKey, built);
    await fs.rm(extractDir, { recursive: true, force: true }).catch(() => undefined);
    return built;
  })();

  buildLocks.set(cacheKey, build);
  try {
    return await build;
  } finally {
    buildLocks.delete(cacheKey);
  }
}

/** Rekursiver Verzeichnis-Lauf (Pfade relativ zum Unpack-Root). */
async function walkFiles(root: string, relativeDir: string): Promise<{ path: string; size: number }[]> {
  const entries: { path: string; size: number }[] = [];
  const absoluteDir = path.join(root, relativeDir);
  const dirents = await fs.readdir(absoluteDir, { withFileTypes: true }).catch(() => []);
  for (const dirent of dirents) {
    const relativePath = relativeDir ? `${relativeDir}/${dirent.name}` : dirent.name;
    if (dirent.isDirectory()) {
      entries.push(...(await walkFiles(root, relativePath)));
    } else if (dirent.isFile()) {
      let size = 0;
      try {
        size = (await fs.stat(path.join(absoluteDir, dirent.name))).size;
      } catch {
        size = Number.NaN;
      }
      if (size <= INDEXABLE_MAX_FILE_BYTES) entries.push({ path: relativePath, size });
    }
  }
  return entries;
}

export interface RepoSearchResult {
  ok: boolean;
  repo: string;
  branch: string;
  result?: CodeQueryResult;
  error?: string;
}

/**
 * Sprint 163 — Code-Suche mit Pfad:Zeile gegen den aktuellen Repo-Stand.
 * Liefert ok:false mit klarer Ursache, wenn GitHub nicht erreichbar ist.
 */
export async function searchRepoCode(
  query: string,
  options: { repo?: string; branch?: string; limit?: number } = {}
): Promise<RepoSearchResult> {
  const needle = (query ?? "").trim();
  if (!needle) {
    return { ok: false, repo: options.repo ?? DEFAULT_REPO, branch: options.branch ?? "main", error: "Suchbegriff fehlt." };
  }
  const repo = options.repo ?? DEFAULT_REPO;
  const branch = options.branch ?? "main";
  try {
    const { index } = await getRepoIndex(repo, branch);
    const result = answerCodeQuery(needle, index, options.limit ?? 10);
    return { ok: true, repo, branch, result };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 160) : "unbekannter Fehler";
    console.warn("[repoChat] Index-Aufbau fehlgeschlagen:", message);
    return {
      ok: false,
      repo,
      branch,
      error: `Repo-Index nicht aufbaubar (${message}). GITHUB_TOKEN konfiguriert? Netzwerk erreichbar?`,
    };
  }
}

/** Cache-Einblick fuer Tests/Diagnose (Anzahl indizierter Dateien/Symbole). */
export function repoIndexCacheStats(): { key: string; files: number; symbols: number; expiresAt: number }[] {
  return [...indexCache.entries()].map(([key, cached]) => ({
    key,
    files: cached.index.files.length,
    symbols: cached.index.symbols.length,
    expiresAt: cached.expiresAt,
  }));
}
