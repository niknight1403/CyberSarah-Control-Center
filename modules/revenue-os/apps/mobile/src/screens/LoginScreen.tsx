import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  ActivityIndicator,
  Keyboard,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../theme/ThemeContext';

// ─── Validierungsfunktionen ───────────────────────────────────────
function validateEmail(email: string): string | null {
  if (!email.trim()) return 'E-Mail-Adresse eingeben';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return 'Ungültige E-Mail-Adresse';
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return 'Passwort eingeben';
  if (password.length < 8) return 'Mindestens 8 Zeichen';
  if (password.length > 128) return 'Maximal 128 Zeichen';
  return null;
}

// ─── LoginScreen ─────────────────────────────────────────────────
export function LoginScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { login } = useAuth();

  // ── State ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Refs ──
  const passwordRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // ── Shake-Animation bei Fehler ──
  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  // ── Login-Handler ──
  const handleLogin = useCallback(async () => {
    Keyboard.dismiss();
    setGeneralError(null);

    // Validierung
    const eError = validateEmail(email);
    const pError = validatePassword(password);
    setEmailError(eError);
    setPasswordError(pError);

    if (eError || pError) {
      shake();
      return;
    }

    setIsLoading(true);
    try {
      await login(email.trim(), password);
      // Navigation erfolgt automatisch über AuthContext → resetTo('MainTabs')
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : 'Anmeldung fehlgeschlagen. Bitte versuche es erneut.';

      if (message.includes('401') || message.includes('Unauthorized') || message.includes('ungültig')) {
        setGeneralError('E-Mail oder Passwort ist falsch.');
        setPassword('');
        passwordRef.current?.focus();
      } else if (message.includes('404') || message.includes('nicht gefunden')) {
        setEmailError('Diese E-Mail ist nicht registriert.');
      } else if (message.includes('429') || message.includes('zu viele')) {
        setGeneralError('Zu viele Versuche. Bitte warte einen Moment.');
      } else if (message.includes('Netzwerk') || message.includes('network') || message.includes('timeout')) {
        setGeneralError('Netzwerkfehler. Bitte prüfe deine Internetverbindung.');
      } else {
        setGeneralError(message);
      }
      shake();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, login, shake]);

  // ── E-Mail-Trim beim Verlassen des Feldes ──
  const handleEmailBlur = useCallback(() => {
    setEmail((prev) => prev.trim());
    setEmailError(validateEmail(email));
  }, [email]);

  const handlePasswordBlur = useCallback(() => {
    setPasswordError(validatePassword(password));
  }, [password]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? -insets.bottom : 0}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Logo & Branding ── */}
        <View style={styles.logoSection}>
          <View style={[styles.logoContainer, { shadowColor: colors.primary }]}>
            <Text style={styles.logoIcon}>⚡</Text>
          </View>
          <Text style={[styles.appName, { color: colors.text }]}>CyberSarah</Text>
          <Text style={[styles.tagline, { color: colors.textMuted }]}>
            Revenue Operating System
          </Text>
        </View>

        {/* ── Fehleranzeige ── */}
        {generalError && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239, 68, 68, 0.1)', borderColor: 'rgba(239, 68, 68, 0.2)' }]}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        {/* ── Formular ── */}
        <Animated.View
          style={[
            styles.formSection,
            { transform: [{ translateX: shakeAnim }] },
          ]}
        >
          {/* E-Mail */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>E-Mail</Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: colors.input, borderColor: emailError ? '#ef4444' : colors.border },
            ]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="deine@email.de"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError(null);
                  if (generalError) setGeneralError(null);
                }}
                onBlur={handleEmailBlur}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
                importantForAccessibility="yes"
              />
            </View>
            {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
          </View>

          {/* Passwort */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Passwort</Text>
            <View style={[
              styles.inputContainer,
              { backgroundColor: colors.input, borderColor: passwordError ? '#ef4444' : colors.border },
            ]}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { color: colors.text, flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError(null);
                  if (generalError) setGeneralError(null);
                }}
                onBlur={handlePasswordBlur}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="password"
                autoComplete="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!isLoading}
                importantForAccessibility="yes"
              />
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                style={styles.eyeButton}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={isLoading}
              >
                <Text style={[styles.eyeIcon, { color: colors.textMuted }]}>
                  {showPassword ? '👁' : '👁‍🗨'}
                </Text>
              </TouchableOpacity>
            </View>
            {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
          </View>

          {/* Passwort vergessen */}
          <TouchableOpacity
            style={styles.forgotRow}
            onPress={() => {}}
            disabled={isLoading}
          >
            <Text style={[styles.forgotText, { color: colors.secondary }]}>
              Passwort vergessen?
            </Text>
          </TouchableOpacity>

          {/* Login-Button */}
          <TouchableOpacity
            style={[
              styles.loginButton,
              {
                backgroundColor: isLoading ? colors.primary + '80' : colors.primary,
                shadowColor: colors.primary,
              },
            ]}
            onPress={handleLogin}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.loginButtonText}>  Wird angemeldet...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Text style={styles.loginButtonIcon}>🔑</Text>
                <Text style={styles.loginButtonText}>  Anmelden</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Registrieren-Link ── */}
        <View style={styles.registerSection}>
          <Text style={[styles.registerText, { color: colors.textMuted }]}>
            Noch kein Konto?{' '}
          </Text>
          <Link to="/Register" style={[styles.registerLink, { color: colors.primary }]}>
            Jetzt registrieren
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
  logoIcon: {
    fontSize: 36,
  },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  tagline: {
    fontSize: 13,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '500',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  errorBannerText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
    flex: 1,
  },
  formSection: {
    marginBottom: 32,
  },
  fieldContainer: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 16,
  },
  input: {
    fontSize: 16,
    height: 52,
    padding: 0,
  },
  eyeButton: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 18,
  },
  fieldError: {
    color: '#ef4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 24,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 14,
    fontWeight: '600',
  },
  loginButton: {
    height: 54,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonIcon: {
    fontSize: 16,
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  registerSection: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },
  registerText: {
    fontSize: 14,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: '700',
  },
});

export default LoginScreen;
