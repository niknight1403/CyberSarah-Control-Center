export const themeColors: {
  primary: { light: string; dark: string };
  background: { light: string; dark: string };
  backgroundElevated: { light: string; dark: string };
  surface: { light: string; dark: string };
  surfaceStrong: { light: string; dark: string };
  foreground: { light: string; dark: string };
  muted: { light: string; dark: string };
  icon: { light: string; dark: string };
  border: { light: string; dark: string };
  success: { light: string; dark: string };
  warning: { light: string; dark: string };
  error: { light: string; dark: string };
  accent: { light: string; dark: string };
  shadow: { light: string; dark: string };
};

declare const themeConfig: {
  themeColors: typeof themeColors;
};

export default themeConfig;
