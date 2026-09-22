import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { navigate, resetTo } from '../services/navigation';
import { apiClient } from '../services/api';

// ─── Typen ──────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  avatar?: string;
  createdAt: string;
  stripeCustomerId?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: User | null;
  token: string | null;
}

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
}

// ─── Konstanten ────────────────────────────────────────────────────
const AUTH_TOKEN_KEY = '@cybersarah/auth_token';
const AUTH_USER_KEY = '@cybersarah/auth_user';
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 Minuten vor Ablauf

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Token-Hilfsfunktionen ─────────────────────────────────────────
async function getStoredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

async function storeAuthData(token: string, user: User): Promise<void> {
  await AsyncStorage.multiSet([
    [AUTH_TOKEN_KEY, token],
    [AUTH_USER_KEY, JSON.stringify(user)],
  ]);
}

async function clearAuthData(): Promise<void> {
  await AsyncStorage.multiRemove([AUTH_TOKEN_KEY, AUTH_USER_KEY]);
}

function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? ''));
    const expiry = (payload.exp ?? 0) * 1000;
    return Date.now() >= expiry - TOKEN_REFRESH_THRESHOLD;
  } catch {
    return true;
  }
}

// ─── Provider ──────────────────────────────────────────────────────
interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    token: null,
  });

  // Initialer Ladevorgang: Token aus Storage wiederherstellen
  useEffect(() => {
    async function bootstrap(): Promise<void> {
      try {
        const [token, user] = await Promise.all([getStoredToken(), getStoredUser()]);

        if (token && user) {
          if (isTokenExpired(token)) {
            await refreshTokenInternal(token);
          } else {
            apiClient.setAuthToken(token);
            setState({
              isAuthenticated: true,
              isLoading: false,
              user,
              token,
            });
            return;
          }
        }
      } catch (err) {
        console.warn('[Auth] Bootstrap-Fehler:', err instanceof Error ? err.message : 'Unbekannt');
        await clearAuthData();
      }
      setState((prev) => ({ ...prev, isLoading: false }));
    }

    bootstrap();
  }, []);

  const refreshTokenInternal = useCallback(async (oldToken: string): Promise<string | null> => {
    try {
      const response = await apiClient.post<{ token: string; user: User }>('/auth/refresh', null, {
        headers: { Authorization: `Bearer ${oldToken}` },
      });
      const { token, user } = response;
      await storeAuthData(token, user);
      apiClient.setAuthToken(token);
      setState({
        isAuthenticated: true,
        isLoading: false,
        user,
        token,
      });
      return token;
    } catch {
      await clearAuthData();
      setState({ isAuthenticated: false, isLoading: false, user: null, token: null });
      return null;
    }
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await apiClient.post<{ token: string; user: User }>('/auth/login', {
      email,
      password,
    });
    const { token, user } = response;
    await storeAuthData(token, user);
    apiClient.setAuthToken(token);
    setState({ isAuthenticated: true, isLoading: false, user, token });
    resetTo('MainTabs');
  }, []);

  const register = useCallback(async (email: string, password: string, name: string): Promise<void> => {
    const response = await apiClient.post<{ token: string; user: User }>('/auth/register', {
      email,
      password,
      name,
    });
    const { token, user } = response;
    await storeAuthData(token, user);
    apiClient.setAuthToken(token);
    setState({ isAuthenticated: true, isLoading: false, user, token });
    resetTo('MainTabs');
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Logout auch bei Fehler durchführen
    }
    await clearAuthData();
    apiClient.clearAuthToken();
    setState({ isAuthenticated: false, isLoading: false, user: null, token: null });
    resetTo('Auth');
  }, []);

  const refreshToken = useCallback(async (): Promise<void> => {
    if (state.token) {
      await refreshTokenInternal(state.token);
    }
  }, [state.token, refreshTokenInternal]);

  const updateUser = useCallback((updates: Partial<User>): void => {
    setState((prev) => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...updates };
      AsyncStorage.setItem(AUTH_USER_KEY, JSON.stringify(updatedUser)).catch(() => {});
      return { ...prev, user: updatedUser };
    });
  }, []);

  const value = useMemo(
    () => ({
      ...state,
      login,
      register,
      logout,
      refreshToken,
      updateUser,
    }),
    [state, login, register, logout, refreshToken, updateUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
