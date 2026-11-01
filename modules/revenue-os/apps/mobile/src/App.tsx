/**
 * CyberSarah Revenue OS — App-Root
 *
 * Initialisierung beim Start:
 *  1. Health-Check gegen Hetzner-Server (/health) → UI erst freigeben wenn Server antwortet
 *  2. Auth-Status wiederherstellen (Token aus SecureStore)
 *  3. WebSocket-Verbindung aufbauen (wenn authentifiziert)
 *  4. Hintergrund-Sync starten
 *  5. AppState-Listener für Fokus-Management + WS-Reconnect
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import {
  StatusBar,
  StyleSheet,
  AppState,
  AppStateStatus,
  Platform,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { StripeProvider } from '@stripe/stripe-react-native';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef } from './services/navigation';
import { AuthProvider, useAuth } from './store/AuthContext';
import { ThemeProvider, useTheme } from './theme/ThemeContext';
import { RootNavigator } from './navigation/RootNavigator';
import { SplashScreen } from './screens/SplashScreen';
import { SyncService } from './services/sync';
import { wsClient } from './services/websocket';
import { apiClient, setUnauthorizedHandler } from './services/api';
import { getEffectiveApiUrl, HEALTH_ENDPOINT, API_TIMEOUT_HEALTH } from './config/env';

// ══════════════════════════════════════════════════════════════════════
// REACT QUERY
// ══════════════════════════════════════════════════════════════════════

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// ══════════════════════════════════════════════════════════════════════
// ONLINE-MANAGER (NetInfo)
// ══════════════════════════════════════════════════════════════════════

onlineManager.setEventListener((setOnline) => {
  return NetInfo.addEventListener((state) => {
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════

type HealthStatus = 'checking' | 'online' | 'offline';

async function checkServerHealth(): Promise<HealthStatus> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_HEALTH);

    const resp = await fetch(`${getEffectiveApiUrl()}${HEALTH_ENDPOINT}`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    return resp.ok ? 'online' : 'offline';
  } catch {
    return 'offline';
  }
}

// ══════════════════════════════════════════════════════════════════════
// APPSTATE-LISTENER
// ══════════════════════════════════════════════════════════════════════

function setupAppStateListener(): () => void {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    // React Query Fokus-Management
    if (Platform.OS !== 'web') {
      focusManager.setFocused(status === 'active');
    }

    // WebSocket: Bei Rückkehr in Vordergrund reconnecten
    if (status === 'active') {
      wsClient.onAppForeground();
    }
  });
  return () => subscription.remove();
}

// ══════════════════════════════════════════════════════════════════════
// INTERNER AUTH-CALLBACK (globaler 401-Handler)
// ══════════════════════════════════════════════════════════════════════

let globalLogoutRef: (() => void) | null = null;

// ══════════════════════════════════════════════════════════════════════
// HEALTH-SCREEN (während Server-Check)
// ══════════════════════════════════════════════════════════════════════

function HealthCheckScreen({
  status,
  onRetry,
}: {
  status: HealthStatus;
  onRetry: () => void;
}): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <View style={[healthStyles.container, { backgroundColor: colors.background }]}>
      {status === 'checking' ? (
        <>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[healthStyles.text, { color: colors.text }]}>
            Verbinde mit Server...
          </Text>
          <Text style={[healthStyles.subtext, { color: colors.textMuted }]}>
            {getEffectiveApiUrl()}
          </Text>
        </>
      ) : (
        <>
          <Text style={healthStyles.icon}>📡</Text>
          <Text style={[healthStyles.text, { color: colors.text }]}>
            Server nicht erreichbar
          </Text>
          <Text style={[healthStyles.subtext, { color: colors.textMuted }]}>
            {getEffectiveApiUrl()}
          </Text>
          <Text
            style={[healthStyles.retryBtn, { color: colors.primary }]}
            onPress={onRetry}
          >
            Erneut versuchen
          </Text>
        </>
      )}
    </View>
  );
}

const healthStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  icon: { fontSize: 48, marginBottom: 16 },
  text: { fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  subtext: { fontSize: 13, textAlign: 'center', fontFamily: 'monospace' },
  retryBtn: { fontSize: 15, fontWeight: '700', marginTop: 20, padding: 12 },
});

// ══════════════════════════════════════════════════════════════════════
// APP-CONTENT
// ══════════════════════════════════════════════════════════════════════

function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [showSplash, setShowSplash] = React.useState(true);
  const [healthStatus, setHealthStatus] = React.useState<HealthStatus>('checking');
  const healthChecked = useRef(false);

  // Globalen 401-Handler registrieren (einmalig)
  useEffect(() => {
    globalLogoutRef = logout;
    setUnauthorizedHandler(() => {
      console.warn('[App] 401 — Globaler Logout ausgelöst');
      if (globalLogoutRef) globalLogoutRef();
      wsClient.disconnect();
    });
  }, [logout]);

  // Health-Check beim Start
  useEffect(() => {
    if (healthChecked.current) return;
    healthChecked.current = true;

    async function doHealthCheck() {
      setHealthStatus('checking');
      const result = await checkServerHealth();
      setHealthStatus(result);

      if (result === 'online') {
        console.log('[App] ✅ Hetzner-Server erreicht — App wird gestartet');
      } else {
        console.warn('[App] ❌ Server nicht erreichbar — Offline-Modus?');
      }
    }

    doHealthCheck();
  }, []);

  // WebSocket verbinden wenn authentifiziert (nach Splash)
  useEffect(() => {
    if (isAuthenticated && !showSplash && healthStatus === 'online') {
      wsClient.connect().catch(() => {});
    }
    if (!isAuthenticated) {
      wsClient.disconnect();
    }
  }, [isAuthenticated, showSplash, healthStatus]);

  // Sync nach Auth + Splash
  useEffect(() => {
    if (isAuthenticated && !showSplash && healthStatus === 'online') {
      SyncService.syncAll().catch((err: Error) => {
        console.warn('[Sync] Initial-Sync fehlgeschlagen:', err.message);
      });
    }
  }, [isAuthenticated, showSplash, healthStatus]);

  // AppState-Listener (einmalig)
  useEffect(() => {
    const cleanup = setupAppStateListener();
    return cleanup;
  }, []);

  const handleSplashFinish = useCallback(() => {
    setShowSplash(false);
  }, []);

  // Gesundheitsprüfung läuft noch → Warte-Screen
  if (healthStatus === 'checking') {
    return <HealthCheckScreen status="checking" onRetry={() => {}} />;
  }

  // Server offline → Fehler-Screen mit Retry
  if (healthStatus === 'offline') {
    return (
      <HealthCheckScreen
        status="offline"
        onRetry={() => {
          healthChecked.current = false;
          setHealthStatus('checking');
        }}
      />
    );
  }

  // Splash
  if (showSplash || authLoading) {
    return <SplashScreen onFinish={handleSplashFinish} />;
  }

  // Haupt-Navigation
  return <RootNavigator />;
}

// ══════════════════════════════════════════════════════════════════════
// ROOT-PROVIDER
// ══════════════════════════════════════════════════════════════════════

const STRIPE_PUBLISHABLE_KEY = __DEV__
  ? 'pk_test_51Tf8pBAuUge07PL9Iuip0CZqZDRDmS5VvwJngiHf4q8CWWgtNq9xRhTJIPISTnydJVhT4bwmGEDvMkEGsMb8CLuc00u8pM6Sg7'
  : 'pk_live_51Tf8pBAuUge07PL9Iuip0CZqZDRDmS5VvwJngiHf4q8CWWgtNq9xRhTJIPISTnydJVhT4bwmGEDvMkEGsMb8CLuc00u8pM6Sg7';

function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider initialTheme="dark">
            <NavigationContainer
              ref={navigationRef}
              onReady={() => {
                if (__DEV__) {
                  console.log('[Nav] ✅ Navigation bereit');
                }
              }}
            >
              <StatusBar
                barStyle="light-content"
                backgroundColor="#0c0c14"
                translucent={false}
              />
              <AuthProvider>
                <StripeProvider
                  publishableKey={STRIPE_PUBLISHABLE_KEY}
                  merchantIdentifier="merchant.com.cybersarah.app"
                  urlScheme="cybersarah"
                >
                  <AppContent />
                </StripeProvider>
              </AuthProvider>
            </NavigationContainer>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0c0c14',
  },
});

export default App;
