import { describe, expect, it } from "vitest";

import { buildProjectPromptContract } from "../lib/prompt-contract-logic";

describe("buildProjectPromptContract – Ziel", () => {
  it("baut das Ziel aus Projektname und Zielbeschreibung", () => {
    const contract = buildProjectPromptContract({
      projectName: "Kita-App",
      goal: "Portal starten",
      toolGrants: ["fs.readWorkspaceFile"],
    });
    expect(contract.goal).toBe(
      'Finish "Kita-App": Portal starten. Done means the requested result is implemented, tested and passes the production quality gate.'
    );
  });
});

describe("buildProjectPromptContract – Constraints", () => {
  it("haelt Sicherheits- und Umsetzungsregeln fest und nennt die Grants", () => {
    const contract = buildProjectPromptContract({
      projectName: "Kita-App",
      goal: "Portal starten",
      toolGrants: ["fs.readWorkspaceFile", "repo.searchCode"],
    });
    expect(contract.constraints).toHaveLength(4);
    expect(contract.constraints[0]).toContain("secrets outside source code");
    expect(contract.constraints[1]).toContain("policy gate");
    expect(contract.constraints[2]).toContain(
      "Use only granted tools: fs.readWorkspaceFile, repo.searchCode."
    );
    expect(contract.constraints[3]).toContain("no pseudocode placeholders");
  });

  it("nennt 'none', wenn keine Tools gewaehrt sind", () => {
    const contract = buildProjectPromptContract({
      projectName: "Kita-App",
      goal: "Portal starten",
      toolGrants: [],
    });
    expect(contract.constraints[2]).toContain("Use only granted tools: none.");
  });
});

describe("buildProjectPromptContract – Format und Fehlerbehandlung", () => {
  it("fordert nachweisbare Ergebnisse und eine klar geregelte Fehlerbehandlung", () => {
    const contract = buildProjectPromptContract({
      projectName: "Kita-App",
      goal: "Portal starten",
      toolGrants: ["fs.readWorkspaceFile"],
    });
    expect(contract.format).toContain("machine-verifiable test");
    expect(contract.failureHandling).toHaveLength(4);
    expect(contract.failureHandling[0]).toContain("stderr/stdout evidence");
    expect(contract.failureHandling[1]).toContain("smallest reversible fix");
    expect(contract.failureHandling[2]).toContain("failover cascade");
    expect(contract.failureHandling[3]).toContain("not satisfied");
  });

  it("ist deterministisch: gleicher Input, gleiches Ergebnis", () => {
    const input = {
      projectName: "Kita-App",
      goal: "Portal starten",
      toolGrants: ["fs.readWorkspaceFile"],
    };
    expect(buildProjectPromptContract(input)).toEqual(buildProjectPromptContract(input));
  });
});
