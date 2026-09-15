/**
 * Sprint 117 — Onboarding-Hook: AsyncStorage-gestuetztes Abschluss-Flag.
 *
 * "checking" solange der Speicher noch nicht gelesen ist (kein Flackern
 * zwischen Tabs und Onboarding), danach "incomplete" oder "complete".
 * completeOnboarding() schreibt das Flag einmalig persistent.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useState } from "react";

import { normalizeOnboardingCompletion, ONBOARDING_STORAGE_KEY } from "@/lib/onboarding-logic";

export type OnboardingStatus = "checking" | "incomplete" | "complete";

export function useOnboarding() {
  const [status, setStatus] = useState<OnboardingStatus>("checking");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
        if (!cancelled) setStatus(normalizeOnboardingCompletion(stored) ? "complete" : "incomplete");
      } catch {
        // Lesefehler ≠ Endlosschleife: der Flow wird einmalig angeboten.
        if (!cancelled) setStatus("incomplete");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    } catch {
      // Speicherfehler: der Flow startet beim naechsten Start erneut — ehrlich.
    }
    setStatus("complete");
  }, []);

  return { status, completeOnboarding };
}
