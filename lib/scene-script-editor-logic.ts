/**
 * Sprint 307 — Szenen-Skript-Editor: reine, deterministische Logik fuer
 * die manuelle Nachbearbeitung des deterministischen Skripts.
 *
 * Datenfluss:
 *   Das deterministische Skript (scene-script-logic) ist die Baseline;
 *   der Nutzer bearbeitet Text, Reihenfolge und Dauer. Dirty-Tracking
 *   und Revert sind rein berechnet.
 *
 * Ehrlichkeits-Grenze: Bearbeitung aendert die geschaetzte Vorlese-Dauer
 *   nur ueber die Schluessel-Heuristik — sie bleibt eine SCHAETZUNG und
 *   wird als solche markiert, niemals als gemessene Dauer ausgegeben.
 */

import type { Scene, SceneScript } from "./scene-script-logic";

export const SCENE_EDITOR_LIMITS = {
  minSeconds: 2,
  maxSeconds: 30,
  maxTitleChars: 60,
  maxNarrationChars: 600,
} as const;

export function editSceneTitle(
  script: SceneScript,
  sceneId: string,
  title: string,
): SceneScript {
  return mapScene(script, sceneId, (scene) => ({
    ...scene,
    title: title.trim().slice(0, SCENE_EDITOR_LIMITS.maxTitleChars),
  }));
}

export function editSceneNarration(
  script: SceneScript,
  sceneId: string,
  narration: string,
): SceneScript {
  return mapScene(script, sceneId, (scene) => ({
    ...scene,
    narration: narration.trim().slice(0, SCENE_EDITOR_LIMITS.maxNarrationChars),
  }));
}

/** Dauer anpassen mit Clamp — NIE ausserhalb der Grenzen zulassen. */
export function adjustSceneSeconds(
  script: SceneScript,
  sceneId: string,
  seconds: number,
): SceneScript {
  const clamped = Math.min(
    SCENE_EDITOR_LIMITS.maxSeconds,
    Math.max(SCENE_EDITOR_LIMITS.minSeconds, Math.round(seconds)),
  );
  return mapScene(script, sceneId, (scene) => ({ ...scene, estimatedSeconds: clamped }));
}

/** Szene um eine Position verschieben (clamped, keine Loecher in der Reihenfolge). */
export function moveScene(
  script: SceneScript,
  sceneId: string,
  targetIndex: number,
): SceneScript {
  const from = script.scenes.findIndex((s) => s.id === sceneId);
  if (from < 0) return script;
  const to = Math.min(script.scenes.length - 1, Math.max(0, targetIndex));
  const scenes = [...script.scenes];
  const [moved] = scenes.splice(from, 1);
  scenes.splice(to, 0, moved);
  return { ...script, scenes: reindex(scenes) };
}

/** Geschaetzte Gesamtdauer nach Bearbeitung neu berechnen (Basis: Szenen-Summe). */
export function recalcTotalSeconds(script: SceneScript): SceneScript {
  return {
    ...script,
    estimatedTotalSeconds: script.scenes.reduce((sum, s) => sum + s.estimatedSeconds, 0),
  };
}

/** Aenderungen gegenueber der deterministischen Baseline (fuer Dirty-Badge). */
export function diffScenes(
  baseline: SceneScript,
  edited: SceneScript,
): Array<{ sceneId: string; field: "title" | "narration" | "estimatedSeconds" | "reordered" }> {
  const changes: Array<{ sceneId: string; field: "title" | "narration" | "estimatedSeconds" | "reordered" }> = [];
  const baseById = new Map(baseline.scenes.map((s) => [s.id, s]));

  edited.scenes.forEach((scene, idx) => {
    const base = baseById.get(scene.id);
    if (!base) {
      changes.push({ sceneId: scene.id, field: "reordered" });
      return;
    }
    if (scene.title !== base.title) changes.push({ sceneId: scene.id, field: "title" });
    if (scene.narration !== base.narration) changes.push({ sceneId: scene.id, field: "narration" });
    if (scene.estimatedSeconds !== base.estimatedSeconds) {
      changes.push({ sceneId: scene.id, field: "estimatedSeconds" });
    }
    if (baseline.scenes[idx]?.id !== scene.id) {
      changes.push({ sceneId: scene.id, field: "reordered" });
    }
  });
  return changes;
}

export function isDirty(baseline: SceneScript, edited: SceneScript): boolean {
  return diffScenes(baseline, edited).length > 0;
}

/** Zurueck auf die deterministische Baseline (vollstaendig, kein Mischzustand). */
export function revertToBaseline(baseline: SceneScript): SceneScript {
  return { ...baseline, scenes: baseline.scenes.map((s) => ({ ...s })) };
}

function mapScene(
  script: SceneScript,
  sceneId: string,
  fn: (scene: Scene) => Scene,
): SceneScript {
  return {
    ...script,
    scenes: script.scenes.map((s) => (s.id === sceneId ? fn(s) : s)),
  };
}

function reindex(scenes: Scene[]): Scene[] {
  return scenes.map((s, i) => ({ ...s, index: i }));
}
