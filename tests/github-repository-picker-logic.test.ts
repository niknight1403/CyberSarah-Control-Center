import { describe, expect, it } from "vitest";

import {
  filterGithubRepositories,
  formatRelativeUpdatedAt,
  parseGithubRepositoryList,
  repositoryToConnectInput,
  type GithubRepositorySummary,
} from "@/lib/github-repository-picker-logic";

function rawRepo(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    full_name: "niknight1403/CyberSarah-Control-Center",
    html_url: "https://github.com/niknight1403/CyberSarah-Control-Center",
    description: "Control Center App",
    default_branch: "main",
    private: false,
    fork: false,
    updated_at: "2026-09-16T05:00:00.000Z",
    stargazers_count: 3,
    ...overrides,
  };
}

describe("parseGithubRepositoryList", () => {
  it("normalisiert gueltige Repo-Objekte", () => {
    const list = parseGithubRepositoryList([rawRepo()]);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 1,
      fullName: "niknight1403/CyberSarah-Control-Center",
      htmlUrl: "https://github.com/niknight1403/CyberSarah-Control-Center",
      description: "Control Center App",
      defaultBranch: "main",
      isPrivate: false,
      isFork: false,
      updatedAt: "2026-09-16T05:00:00.000Z",
      stars: 3,
    });
  });

  it("verwirft ungueltige Eintraege statt zu crashen", () => {
    expect(parseGithubRepositoryList("kein-array")).toEqual([]);
    expect(parseGithubRepositoryList([null, 42, {}, rawRepo({ id: 2, full_name: "a/b", html_url: "https://x" })])).toHaveLength(1);
  });

  it("sortiert neueste Aktivitaet zuerst", () => {
    const older = rawRepo({ id: 1, full_name: "a/old", html_url: "https://github.com/a/old", updated_at: "2025-01-01T00:00:00.000Z" });
    const newer = rawRepo({ id: 2, full_name: "a/new", html_url: "https://github.com/a/new", updated_at: "2026-09-01T00:00:00.000Z" });
    const list = parseGithubRepositoryList([older, newer]);
    expect(list.map((repo) => repo.fullName)).toEqual(["a/new", "a/old"]);
  });

  it("fuellt default_branch mit 'main', wenn leer", () => {
    const list = parseGithubRepositoryList([rawRepo({ default_branch: "" })]);
    expect(list[0].defaultBranch).toBe("main");
  });
});

describe("filterGithubRepositories", () => {
  const repos: GithubRepositorySummary[] = parseGithubRepositoryList([
    rawRepo({ id: 1, full_name: "niknight1403/CyberSarah-Control-Center", html_url: "https://github.com/niknight1403/CyberSarah-Control-Center", description: "" }),
    rawRepo({ id: 2, full_name: "niknight1403/cybersarah-revenue-os", html_url: "https://github.com/niknight1403/cybersarah-revenue-os", description: "Revenue Orchestrator" }),
  ]);

  it("gibt bei leerer Query alle zurueck", () => {
    expect(filterGithubRepositories(repos, "")).toHaveLength(2);
  });

  it("filtert case-insensitive nach Name", () => {
    expect(filterGithubRepositories(repos, "REVENUE").map((r) => r.fullName)).toEqual(["niknight1403/cybersarah-revenue-os"]);
  });

  it("filtert auch nach Beschreibung", () => {
    expect(filterGithubRepositories(repos, "orchestrator").map((r) => r.fullName)).toEqual(["niknight1403/cybersarah-revenue-os"]);
  });
});

describe("repositoryToConnectInput", () => {
  it("entfernt ein .git-Suffix und uebernimmt den Default-Branch", () => {
    const [repo] = parseGithubRepositoryList([rawRepo({ html_url: "https://github.com/a/b.git", default_branch: "develop" })]);
    expect(repositoryToConnectInput(repo)).toEqual({ repositoryUrl: "https://github.com/a/b", branch: "develop" });
  });
});

describe("formatRelativeUpdatedAt", () => {
  const now = new Date("2026-09-16T12:00:00.000Z").getTime();

  it("rundet auf Minuten/Stunden/Tage/Monate/Jahre", () => {
    expect(formatRelativeUpdatedAt("2026-09-16T11:59:30.000Z", now)).toBe("gerade eben");
    expect(formatRelativeUpdatedAt("2026-09-16T11:30:00.000Z", now)).toBe("vor 30 Min.");
    expect(formatRelativeUpdatedAt("2026-09-16T02:00:00.000Z", now)).toBe("vor 10 Std.");
    expect(formatRelativeUpdatedAt("2026-09-10T12:00:00.000Z", now)).toBe("vor 6 Tagen");
    expect(formatRelativeUpdatedAt("2026-06-16T12:00:00.000Z", now)).toBe("vor 3 Monaten");
    expect(formatRelativeUpdatedAt("2024-09-16T12:00:00.000Z", now)).toBe("vor 2 Jahren");
  });

  it("faengt zukuenftige/ungueltige Zeitstempel ab", () => {
    expect(formatRelativeUpdatedAt("2099-01-01T00:00:00.000Z", now)).toBe("gerade eben");
    expect(formatRelativeUpdatedAt("nicht-valide", now)).toBe("gerade eben");
  });
});
