import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeMode = 'dark' | 'light';

export interface ThemeColors {
  background: string;
  backgroundGradient: string;
  surface: string;
  surfaceLight: string;
  card: string;
  cardBorder: string;
  primary: string;
  primaryHover: string;
  secondary: string;
  accent: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  border: string;
  input: string;
  glassBg: string;
  glassBorder: string;
  tabBar: string;
  tabBarBorder: string;
  statusBar: string;
}

export interface Theme {
  mode: ThemeMode;
  colors: ThemeColors;
}

const darkColors: ThemeColors = {
  background: '#0c0c14',
  backgroundGradient: '#0e0a1a',
  surface: 'rgba(255, 255, 255, 0.04)',
  surfaceLight: 'rgba(255, 255, 255, 0.02)',
  card: 'rgba(255, 255, 255, 0.035)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  primary: '#7c3aed',
  primaryHover: '#8b5cf6',
  secondary: '#3b82f6',
  accent: '#a78bfa',
  text: '#e8e8ed',
  textSecondary: '#a1a1aa',
  textMuted: '#88889a',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  info: '#3b82f6',
  border: 'rgba(255, 255, 255, 0.06)',
  input: 'rgba(255, 255, 255, 0.08)',
  glassBg: 'rgba(255, 255, 255, 0.04)',
  glassBorder: 'rgba(255, 255, 255, 0.08)',
  tabBar: 'rgba(18, 18, 28, 0.95)',
  tabBarBorder: 'rgba(255, 255, 255, 0.08)',
  statusBar: '#0c0c14',
};

const lightColors: ThemeColors = {
  background: '#f8f8fc',
  backgroundGradient: '#f0eef8',
  surface: 'rgba(0, 0, 0, 0.03)',
  surfaceLight: 'rgba(0, 0, 0, 0.02)',
  card: '#ffffff',
  cardBorder: 'rgba(0, 0, 0, 0.08)',
  primary: '#7c3aed',
  primaryHover: '#6d28d9',
  secondary: '#3b82f6',
  accent: '#8b5cf6',
  text: '#1a1a2e',
  textSecondary: '#52525b',
  textMuted: '#71717a',
  success: '#16a34a',
  warning: '#d97706',
  danger: '#dc2626',
  info: '#2563eb',
  border: 'rgba(0, 0, 0, 0.06)',
  input: 'rgba(0, 0, 0, 0.06)',
  glassBg: 'rgba(255, 255, 255, 0.7)',
  glassBorder: 'rgba(0, 0, 0, 0.08)',
  tabBar: 'rgba(255, 255, 255, 0.95)',
  tabBarBorder: 'rgba(0, 0, 0, 0.08)',
  statusBar: '#f8f8fc',
};

interface ThemeContextType {
  theme: ThemeMode;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme?: ThemeMode;
}

export function ThemeProvider({ children, initialTheme }: ThemeProviderProps): React.JSX.Element {
  const systemScheme = useColorScheme();
  const [theme, setThemeState] = useState<ThemeMode>(initialTheme ?? systemScheme ?? 'dark');

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setThemeState(mode);
  }, []);

  const colors = theme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ theme, colors, toggleTheme, setTheme }),
    [theme, colors, toggleTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
