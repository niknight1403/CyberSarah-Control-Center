/**
 * Sprint 374 — Google-Login: Client-Hook fuer expo-auth-session.
 *
 * Nutzt den Google-Provider im ID-Token-Modus: Der Browser-Flow liefert ein
 * ID-Token, das der Server gegen den Google-tokeninfo-Endpunkt verifiziert.
 * Die Client-ID kommt zur Laufzeit vom Server (trpc.account.googleLoginConfig),
 * damit ein Nachtragen der Google-Client-ID KEINEN APK-Neubau erfordert.
 *
 * Web-Fix (v2.6.6-Build, Web-Export-Smoke): Google.useIdTokenAuthRequest
 * wirft auf Web beim ersten Render, wenn keine Client-ID vorliegt
 * ("Client Id property `webClientId` must be defined"). Die Client-ID
 * trifft aber erst asynchron vom Server ein — deshalb lebt die echte
 * Auth-Session nicht mehr bedingungslos im Login-Screen, sondern wird
 * erst gemountet, sobald die Konfiguration da ist (<GoogleLoginSession/>).
 * Ohne Client-ID bleibt der Hook sauber inert (kein Crash, kein Button).
 * React-Hook-Regeln bleiben gewahrt: useIdTokenAuthRequest laeuft
 * unbedingte INNERHALB der Session-Komponente, nie bedingt im Eltern-Hook.
 */
import { ReactNode, useCallback, useEffect, useRef } from "react";

import * as Google from "expo-auth-session/providers/google";

type IdTokenHandler = (idToken: string) => Promise<void>;

/**
 * Gemountete Auth-Session. Ruft den Google-Hook NUR mit garantierter
 * Client-ID auf; promptAsync wird dem Eltern-Hook per Ref zugestellt.
 * Rendert selbst nichts (null) — rein funktionales Bauteil.
 */
export function GoogleLoginSession({
  clientId,
  onIdToken,
  onPrompt,
}: {
  clientId: string;
  onIdToken: IdTokenHandler;
  onPrompt: (prompt: () => void) => void;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId,
  });

  const handlerRef = useRef(onIdToken);
  handlerRef.current = onIdToken;
  const handledRef = useRef(false);
  const promptRef = useRef(promptAsync);
  promptRef.current = promptAsync;

  useEffect(() => {
    onPrompt(() => {
      handledRef.current = false;
      void promptRef.current();
    });
  }, [onPrompt, request]);

  useEffect(() => {
    if (response?.type === "success" && !handledRef.current) {
      const idToken = (response.params as Record<string, string> | undefined)?.id_token;
      if (idToken) {
        handledRef.current = true;
        void handlerRef.current(idToken).catch(() => {
          handledRef.current = false;
        });
      }
    }
    if (response && response.type !== "success") {
      handledRef.current = false;
    }
  }, [response]);

  return null;
}

/**
 * Eltern-Hook (API-kompatibel zu Sprint 374: start(), ready):
 *  - ohne Client-ID: inert (ready=false, start() ohne Wirkung),
 *    session = null — kein Mount der Auth-Session, kein Web-Crash.
 *  - mit Client-ID: session = <GoogleLoginSession/>; im Login-Screen
 *    rendern, start() stoesst den Browser-Flow an.
 */
export function useGoogleLogin(clientId: string | null, onIdToken: IdTokenHandler) {
  const promptRef = useRef<(() => void) | null>(null);
  const onIdTokenRef = useRef(onIdToken);
  onIdTokenRef.current = onIdToken;

  const onPrompt = useCallback((prompt: () => void) => {
    promptRef.current = prompt;
  }, []);

  const start = useCallback(() => {
    if (promptRef.current) {
      promptRef.current();
    }
  }, []);

  const session: ReactNode = clientId ? (
    <GoogleLoginSession clientId={clientId} onIdToken={onIdToken} onPrompt={onPrompt} />
  ) : null;

  return { start, ready: Boolean(clientId) && Boolean(promptRef.current), session };
}
