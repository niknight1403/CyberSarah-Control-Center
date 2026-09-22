import { Platform, PermissionsAndroid, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from './api';

// ─── FCM-Token Speicher ─────────────────────────────────────────────
const FCM_TOKEN_KEY = '@cybersarah/fcm_token';

// ─── Push-Notification Service ─────────────────────────────────────
// Registriert FCM, fordert Berechtigungen an und synchronisiert
// den Push-Token mit dem Backend.

class PushNotificationService {
  private fcmToken: string | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const storedToken = await AsyncStorage.getItem(FCM_TOKEN_KEY);
      if (storedToken) {
        this.fcmToken = storedToken;
      }

      // Berechtigungen anfordern
      const hasPermission = await this.requestPermission();
      if (!hasPermission) {
        console.warn('[Push] Keine Berechtigung für Push-Benachrichtigungen');
        return;
      }

      // FCM initialisieren (wenn Firebase verfügbar)
      try {
        const firebaseApp = require('@react-native-firebase/app');
        const messaging = require('@react-native-firebase/messaging');
        const fcmToken = await messaging().getToken();
        if (fcmToken) {
          this.fcmToken = fcmToken;
          await AsyncStorage.setItem(FCM_TOKEN_KEY, fcmToken);
          await this.syncTokenToBackend(fcmToken);
        }

        // Token-Aktualisierung abonnieren
        messaging().onTokenRefresh(async (newToken: string) => {
          this.fcmToken = newToken;
          await AsyncStorage.setItem(FCM_TOKEN_KEY, newToken);
          await this.syncTokenToBackend(newToken);
        });

        // Vordergrund-Nachrichten
        messaging().onMessage(async (remoteMessage: unknown) => {
          this.handleForegroundMessage(remoteMessage);
        });

        // Hintergrund-Nachrichten (registriert in index.ts)
        messaging().setBackgroundMessageHandler(async (remoteMessage: unknown) => {
          this.handleBackgroundMessage(remoteMessage);
        });
      } catch {
        console.warn('[Push] Firebase nicht konfiguriert');
      }

      this.isInitialized = true;
    } catch (error) {
      console.error('[Push] Initialisierung fehlgeschlagen:', error instanceof Error ? error.message : 'Unbekannt');
    }
  }

  private async requestPermission(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      try {
        const messaging = require('@react-native-firebase/messaging');
        const authStatus = await messaging().requestPermission();
        return (
          authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
          authStatus === messaging.AuthorizationStatus.PROVISIONAL
        );
      } catch {
        return false;
      }
    }

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }

    return true;
  }

  private async syncTokenToBackend(token: string): Promise<void> {
    try {
      await apiClient.post('/auth/push-token', {
        token,
        platform: Platform.OS,
      });
    } catch {
      console.warn('[Push] Token-Sync fehlgeschlagen');
    }
  }

  private handleForegroundMessage(message: unknown): void {
    const msg = message as { notification?: { title?: string; body?: string } };
    if (msg.notification?.title) {
      // In-App-Benachrichtigung anzeigen
      console.log('[Push] Foreground:', msg.notification.title);
    }
  }

  private handleBackgroundMessage(message: unknown): void {
    const msg = message as { data?: Record<string, string>; notification?: { title?: string } };
    console.log('[Push] Background:', msg.notification?.title ?? 'Keine Benachrichtigung');
  }

  getFcmToken(): string | null {
    return this.fcmToken;
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
