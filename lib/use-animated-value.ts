import { useState } from "react";
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
 * Initialwert, exakt einmal erzeugt, identisch ueber alle Re-Renders) auf
 * ALLEN Plattformen: native und Web. Die lazy useState-Initialisierung
 * erzeugt die Instanz einmalig und ref-frei — auch unter StrictMode und
 * der React-Compiler-Lint-Regel "keine Ref-Zugriffe im Render" sauber.
 */
export function useAnimatedValue(initial: number): Animated.Value {
  const [value] = useState(() => new Animated.Value(initial));
  return value;
}
