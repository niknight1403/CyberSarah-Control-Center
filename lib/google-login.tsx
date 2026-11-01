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
 *
 * Lint-/Hook-Konventionen: useIdTokenAuthRequest laeuft unbedingte INNERHALB
 * der Session-Komponente (nie bedingt im Eltern-Hook); Refs werden
 * ausschliesslich in Effects/Callbacks geschrieben und gelesen, nie waehrend
 * des Renders; die Bereitschaft des Auth-Requests wird der Elternkomponente
 * per Callback gemeldet (kein Ref-Zugriff im Render-Pfad).
 */
import { ReactNode, useCallback, useEffect, useRef, useState } from "react";

import * as Google from "expo-auth-session/providers/google";

type IdTokenHandler = (idToken: string) => Promise<void>;

/**
 * Gemountete Auth-Session. Ruft den Google-Hook NUR mit garantierter
 * Client-ID auf; promptAsync wird dem Eltern-Hook per Callback zugestellt.
 * Rendert selbst nichts (null) — rein funktionales Bauteil.
 */
export function GoogleLoginSession({
  clientId,
  onIdToken,
  onPrompt,
  onReady,
}: {
  clientId: string;
  onIdToken: IdTokenHandler;
  onPrompt: (prompt: () => void) => void;
  onReady: (ready: boolean) => void;
}) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId,
  });

  // Ref-Updates ausschliesslich in Effects (React-Regeln):
  const handlerRef = useRef(onIdToken);
  useEffect(() => {
    handlerRef.current = onIdToken;
  }, [onIdToken]);

  const promptRef = useRef(promptAsync);
  useEffect(() => {
    promptRef.current = promptAsync;
  }, [promptAsync]);

  const handledRef = useRef(false);

  // Prompt-Funktion beim Eltern-Hook hinterlegen + Bereitschaft melden,
  // sobald der Auth-Request steht (request kann bis zum Discovery-Abschluss
  // null sein — erst dann ist der Button wirklich klickbar).
  useEffect(() => {
    onPrompt(() => {
      handledRef.current = false;
      void promptRef.current();
    });
    onReady(Boolean(request));
  }, [onPrompt, onReady, request]);

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
  const [sessionReady, setSessionReady] = useState(false);
  const promptRef = useRef<(() => void) | null>(null);

  const onPrompt = useCallback((prompt: () => void) => {
    promptRef.current = prompt;
  }, []);

  const onReady = useCallback((ready: boolean) => {
    setSessionReady(ready);
  }, []);

  const start = useCallback(() => {
    const prompt = promptRef.current;
    if (prompt) {
      prompt();
    }
  }, []);

  const session: ReactNode = clientId ? (
    <GoogleLoginSession
      clientId={clientId}
      onIdToken={onIdToken}
      onPrompt={onPrompt}
      onReady={onReady}
    />
  ) : null;

  return { start, ready: Boolean(clientId) && sessionReady, session };
}
