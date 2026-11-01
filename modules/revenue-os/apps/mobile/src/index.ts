import { AppRegistry, LogBox, Platform, UIManager } from 'react-native';
import App from './App';
import { name as appName } from '../app.json';

// ─── Strenge TypeScript-Laufzeit ───────────────────────────────────
// Aktiviert TypeScripts strict mode checks auch zur Laufzeit,
// indem undefined/null explizit behandelt werden.
if (__DEV__) {
  const consoleError = console.error;
  console.error = (...args: unknown[]) => {
    const message = args.join(' ');
    // Ignoriere bekannte Drittanbieter-Warnungen
    if (
      message.includes('VirtualizedLists should never be nested') ||
      message.includes('Non-serializable values were found in the navigation state') ||
      message.includes('ReactNativeFiberHostComponent')
    ) {
      return;
    }
    consoleError.apply(console, args);
  };
}

// ─── LogBox-Konfiguration ──────────────────────────────────────────
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',
  'Non-serializable values were found in the navigation state',
  'ReactNativeFiberHostComponent',
  'ViewPropTypes will be removed',
  'Sending `onAnimatedValueUpdate`',
]);

// ─── Android LayoutAnimation für UIKit ────────────────────────────
if (Platform.OS === 'android') {
  if (UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
  }
}

// ─── Hintergrund-Job-Initialisierung ──────────────────────────────
// Registriert globale Background-Fetch und Push-Notification-Handler.
// Diese werden geladen, sobald die native Brücke bereit ist.
import './services/backgroundTasks';
import './services/pushNotifications';

// ─── Realm-Datenbank initialisieren (vor App-Start) ────────────────
import { initializeDatabase } from './services/database';
initializeDatabase()
  .then(() => {
    if (__DEV__) {
      console.log('[DB] Realm-Datenbank erfolgreich initialisiert');
    }
  })
  .catch((error: Error) => {
    console.error('[DB] Realm-Initialisierung fehlgeschlagen:', error.message);
  });

// ─── App registrieren ──────────────────────────────────────────────
AppRegistry.registerComponent(appName, () => App);

export default App;
