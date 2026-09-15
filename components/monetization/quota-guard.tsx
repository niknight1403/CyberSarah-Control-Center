import React, { useCallback, useEffect, useState } from "react";

import { PaywallModal } from "./paywall-modal";
import { trpc } from "@/lib/trpc";
import type { QuotaCheck } from "@/lib/monetization-logic";

/**
 * Sprint 124 — QuotaGuard: Wiederverwendbarer Wrapper, der automatische
 * Paywall-Logik kapselt. Nutzung:
 *
 *   <QuotaGuard estimatedTokens={4000}>
 *     <AgentWorkflowLauncher ... />
 *   </QuotaGuard>
 *
 * Vor der Nutzung erweiterter Agenten-/Cloud-Features wird die Quota geprueft
 * (Pre-Flight); bei Limitueberschreitung erscheint die Paywall statt der
 * Feature-Ausfuehrung. Im Monitor-Modus (Rollout) wird nicht geblockt.
 */

interface QuotaGuardProps {
  children: React.ReactNode;
  /** Schaetzung der Token fuer den geplanten Cloud-Aufruf. */
  estimatedTokens: number;
  /** Feature-Name fuer die Paywall-UEberschrift. */
  featureLabel?: string;
}

export function QuotaGuard({ children, estimatedTokens, featureLabel = "Cloud-Workflow" }: QuotaGuardProps) {
  const [decision, setDecision] = useState<(QuotaCheck & { enforcement?: string }) | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const checkQuota = trpc.monetization.checkQuota.useMutation();
  const account = trpc.monetization.account.useQuery();

  const runPreFlight = useCallback(async () => {
    const result = await checkQuota.mutateAsync({ estimatedTokens });
    setDecision(result);
    if (!result.allowed) setPaywallVisible(true);
    return result;
  }, [checkQuota, estimatedTokens]);

  useEffect(() => {
    void runPreFlight();
  }, [runPreFlight]);

  // Im Monitor-Modus (Rollout) wird nie geblockt — die Paywall wird nur
  // praeventiv gezeigt, wenn aktives Enforcement sie anfordert.
  const blocked = decision ? !decision.allowed && decision.enforcement === "enforce" : false;

  return (
    <>
      {blocked ? null : children}
      <PaywallModal
        visible={paywallVisible}
        reason={decision?.reason ?? `Dein Kontingent für ${featureLabel} ist aufgebraucht.`}
        recommendedPlanLabel={account.data?.planLabel === "Expert" ? "Expert" : "Pro"}
        onClose={() => setPaywallVisible(false)}
        onBuyCredits={() => {
          setPaywallVisible(false);
          // Integration: Credit-Pack-Auswahl (Google Play Billing) hier anbinden.
        }}
      />
    </>
  );
}
