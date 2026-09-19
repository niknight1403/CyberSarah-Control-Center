import { useRef } from "react";
import { Animated } from "react-native";

/**
 * Compat-Hook fuer Animated.Values — Web-Export-sicher (Sprint 195 FIX).
 *
 * React Native 0.78 exportiert `useAnimatedValue` direkt aus "react-native",
 * react-native-web hat diesen Hook jedoch NICHT (Stand RNW 0.19x): Der
 * Expo-Web-Export (Grundlage der Android-APK) stuerzte beim allerersten
 * Render mit "TypeError: useAnimatedValue is not a function" ab und die
 * App zeigte einen permanent weissen Bildschirm.
 *
 * Dieser Hook liefert dieselbe Semantik (stabile Animated.Value-Instanz mit
 * Initialwert, lazy erzeugt, identisch ueber Re-Renders) auf ALLEN
 * Plattformen: native und Web. Die Implementierung entspricht dem
 * offiziellen RN-Muster (useRef + einmalige Instantiierung) und ist damit
 * auch bei StrictMode-Doppelrendern sicher (idempotente Initialisierung).
 */
export function useAnimatedValue(initial: number): Animated.Value {
  const ref = useRef<Animated.Value | null>(null);
  if (ref.current === null) {
    ref.current = new Animated.Value(initial);
  }
  return ref.current;
}
