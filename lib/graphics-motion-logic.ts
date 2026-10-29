/**
 * Conservative GPU policy for Capacitor Android WebView.
 * Decorative animations are intentionally disabled on Android, while useful
 * screen data, navigation and explicit loading/error states remain live.
 */
export type GraphicsEnvironment = {
  capacitorPlatform: string;
  nativePlatform: string;
  reducedMotion: boolean;
};

export function shouldAnimateDecorations(env: GraphicsEnvironment): boolean {
  return env.capacitorPlatform !== "android"
    && env.nativePlatform !== "android"
    && !env.reducedMotion;
}
