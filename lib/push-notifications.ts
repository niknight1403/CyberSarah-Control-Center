import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { createReleaseNotification, type ReleaseStatus } from "@/lib/release-notification-logic";
import { getPushStatusMessage } from "@/lib/push-notifications-logic";
export { getPushStatusMessage } from "@/lib/push-notifications-logic";
export { createReleaseNotification, isTerminalReleaseStatus } from "@/lib/release-notification-logic";

export type PushRegistrationResult = {
  supported: boolean;
  permission: "granted" | "denied" | "undetermined";
  token: string | null;
  reason?: "web" | "permission-denied" | "project-id-missing" | "registration-failed";
};

export type PushNotificationHandlers = {
  onReceived?: (notification: Notifications.Notification) => void;
  onResponse?: (response: Notifications.NotificationResponse) => void;
};

export function resolveExpoProjectId(): string | null {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
}

export async function registerForPushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") return { supported: false, permission: "denied", token: null, reason: "web" };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "CyberSarah Control Center",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#8B7CFF",
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted") return { supported: true, permission: status === "undetermined" ? "undetermined" : "denied", token: null, reason: "permission-denied" };

  const projectId = resolveExpoProjectId();
  if (!projectId) return { supported: true, permission: "granted", token: null, reason: "project-id-missing" };

  try {
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return { supported: true, permission: "granted", token: token.data };
  } catch {
    return { supported: true, permission: "granted", token: null, reason: "registration-failed" };
  }
}

export async function notifyReleaseStatus(status: ReleaseStatus, detail?: string) {
  if (Platform.OS === "web") return false;
  await Notifications.scheduleNotificationAsync({ content: createReleaseNotification(status, detail), trigger: null });
  return true;
}

export function subscribeToPushNotifications(handlers: PushNotificationHandlers = {}) {
  const received = handlers.onReceived ? Notifications.addNotificationReceivedListener(handlers.onReceived) : null;
  const response = handlers.onResponse ? Notifications.addNotificationResponseReceivedListener(handlers.onResponse) : null;
  return () => {
    received?.remove();
    response?.remove();
  };
}

