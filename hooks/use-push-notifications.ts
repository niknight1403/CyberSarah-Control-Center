import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { getPushStatusMessage, registerForPushNotifications, subscribeToPushNotifications, type PushRegistrationResult } from "@/lib/push-notifications";

export type PushNotificationState = PushRegistrationResult & { message: string; loading: boolean };

export function usePushNotifications() {
  const [state, setState] = useState<PushNotificationState>({ supported: Platform.OS !== "web", permission: "undetermined", token: null, message: "Push-Status wird geprüft …", loading: Platform.OS !== "web" });

  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    const unsubscribe = subscribeToPushNotifications({
      onReceived: () => {
        if (active) setState((current) => ({ ...current, message: "Neue Release- oder Workflow-Benachrichtigung empfangen." }));
      },
      onResponse: () => {
        if (active) setState((current) => ({ ...current, message: "Benachrichtigung geöffnet." }));
      },
    });
    void registerForPushNotifications().then((result) => {
      if (!active) return;
      setState({ ...result, message: getPushStatusMessage(result), loading: false });
    }).catch(() => {
      if (!active) return;
      setState({ supported: true, permission: "denied", token: null, reason: "registration-failed", message: "Push-Registrierung konnte nicht abgeschlossen werden.", loading: false });
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return state;
}
