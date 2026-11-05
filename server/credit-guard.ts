/**
 * Guthaben-Wächter für Express-Routen (`requireCredits`).
 *
 * Der Wächter ist eine billige Vorprüfung: reicht das Guthaben überhaupt für
 * den geplanten Lauf? Er bucht nichts. Die exakte Reservierung passiert danach
 * in server/api-v1.ts (atomar, mit Abgleich nach dem Lauf), damit zwei parallele
 * Anfragen nicht denselben Restbetrag verbrauchen.
 *
 * Antwort bei zu wenig Guthaben: HTTP 402 mit strukturiertem Payload
 * (Checkout-URL, Token-Pakete, Upgrade-Ziel) — nicht nur ein Fehlertext.
 */
import type { NextFunction, Request, Response } from "express";
import { buildPaymentRequiredPayload } from "../lib/usage-metering-logic";
import { canAfford } from "../lib/entitlement-logic";
import { creditPacksForCheckout, getUserTotalCredits } from "./credit-ledger";

export interface CreditGuardOptions {
  /** Wie viele Tokens der Lauf mindestens braucht. */
  requiredTokens: number;
  /** Zielplan, den der Client angeboten bekommt. */
  upgradePlan?: string;
  /** Eigene/lokale Provider kosten nichts: Wächter wird übersprungen. */
  free?: boolean;
}

function checkoutUrlFor(req: Request): string {
  const base = (process.env.APP_BASE_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}`).replace(/\/$/, "");
  return `${base}/api/billing/stripe/checkout`;
}

/**
 * Erzeugt die Middleware für eine Route. `requiredTokens` darf klein bleiben
 * (z. B. 1): der Zweck ist, ein leeres Konto sofort und höflich abzuweisen.
 */
export function requireCredits(options: CreditGuardOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.free) {
      next();
      return;
    }
    const user = (res.locals.user ?? (req as unknown as { user?: { openId?: string; role?: string } }).user) as
      | { openId?: string; role?: string }
      | undefined;
    const openId = typeof user?.openId === "string" ? user.openId : "";
    if (!openId) {
      res.status(401).json({ error: "Authentifizierung erforderlich.", code: "unauthenticated" });
      return;
    }
    // Admins arbeiten ohne Guthaben-Grenze (dauerhafte Elite-Garantie).
    if (user?.role === "admin") {
      next();
      return;
    }

    const balance = await getUserTotalCredits(openId);
    const decision = canAfford(balance, options.requiredTokens);
    if (decision.allowed) {
      res.locals.creditBalanceTokens = balance;
      next();
      return;
    }

    res.status(402).json(
      buildPaymentRequiredPayload({
        plan: "free",
        reason:
          balance === null
            ? "Guthaben derzeit nicht prüfbar."
            : "Guthaben reicht für diesen Lauf nicht.",
        requiredTokens: options.requiredTokens,
        remainingTokens: balance,
        checkoutUrl: checkoutUrlFor(req),
        creditPacks: creditPacksForCheckout(),
        upgradePlan: options.upgradePlan ?? "pro",
      }),
    );
  };
}
