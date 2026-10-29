import { Capacitor } from "@capacitor/core";
import { Platform } from "react-native";
import { shouldAnimateDecorations } from "./graphics-motion-logic";

/** Called at render time; never reads secrets or opens a native bridge. */
export function decorativeMotionEnabled(): boolean {
  const reducedMotion = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return shouldAnimateDecorations({
    capacitorPlatform: Capacitor.getPlatform(),
    nativePlatform: Platform.OS,
    reducedMotion: Boolean(reducedMotion),
  });
}
