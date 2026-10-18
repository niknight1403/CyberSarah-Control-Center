/**
 * Sprint 374 — Google-Login: Client-Hook fuer expo-auth-session.
 *
 * Nutzt den Google-Provider im ID-Token-Modus: Der-native Browser-Flow liefert
 * ein ID-Token, das der Server gegen den Google-tokeninfo-Endpunkt verifiziert.
 * Die Client-ID kommt zur Laufzeit vom Server (trpc.account.googleLoginConfig),
 * damit ein Nachtragen der Google-Client-ID KEINEN APK-Neubau erfordert.
 */
import { useCallback, useEffect, useRef } from "react";

import * as Google from "expo-auth-session/providers/google";

export function useGoogleLogin(clientId: string | null, onIdToken: (idToken: string) => Promise<void>) {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: clientId ?? undefined,
  });
  const handlerRef = useRef(onIdToken);
  handlerRef.current = onIdToken;
  const handledRef = useRef(false);

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

  const start = useCallback(() => {
    handledRef.current = false;
    void promptAsync();
  }, [promptAsync]);

  return { start, ready: Boolean(request) };
}
