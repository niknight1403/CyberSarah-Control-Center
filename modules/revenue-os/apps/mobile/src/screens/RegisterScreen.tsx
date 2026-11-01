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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Link } from '@react-navigation/native';
import { useAuth } from '../store/AuthContext';
import { useTheme } from '../theme/ThemeContext';

// ─── Validierung ─────────────────────────────────────────────────
function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Vor- und Nachname eingeben';
  if (trimmed.length < 2) return 'Mindestens 2 Zeichen';
  if (trimmed.length > 100) return 'Maximal 100 Zeichen';
  if (!/^[a-zA-ZÀ-ÿ\u00C0-\u024F\u0400-\u04FF\s'-]+$/.test(trimmed)) {
    return 'Ungültige Zeichen im Namen';
  }
  return null;
}

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
  if (!/[A-Z]/.test(password)) return 'Mindestens ein Großbuchstabe';
  if (!/[a-z]/.test(password)) return 'Mindestens ein Kleinbuchstabe';
  if (!/[0-9]/.test(password)) return 'Mindestens eine Zahl';
  return null;
}

function validateConfirmPassword(password: string, confirm: string): string | null {
  if (!confirm) return 'Passwort bestätigen';
  if (password !== confirm) return 'Passwörter stimmen nicht überein';
  return null;
}

// ─── Passwort-Stärke ─────────────────────────────────────────────
function getPasswordStrength(password: string): { label: string; color: string; score: number } {
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 2) return { label: 'Schwach', color: '#ef4444', score };
  if (score <= 4) return { label: 'Mittel', color: '#f59e0b', score };
  return { label: 'Stark', color: '#22c55e', score };
}

// ─── RegisterScreen ──────────────────────────────────────────────
export function RegisterScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { register } = useAuth();

  // ── State ──
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Refs ──
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const passwordStrength = getPasswordStrength(password);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleRegister = useCallback(async () => {
    Keyboard.dismiss();
    setGeneralError(null);

    const nError = validateName(name);
    const eError = validateEmail(email);
    const pError = validatePassword(password);
    const cError = validateConfirmPassword(password, confirmPassword);

    setNameError(nError);
    setEmailError(eError);
    setPasswordError(pError);
    setConfirmError(cError);

    if (nError || eError || pError || cError) {
      shake();
      return;
    }

    if (!agreeTerms) {
      setGeneralError('Bitte stimme den AGB und Datenschutzbestimmungen zu.');
      shake();
      return;
    }

    setIsLoading(true);
    try {
      await register(email.trim(), password, name.trim());
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : 'Registrierung fehlgeschlagen.';

      if (message.includes('409') || message.includes('existiert') || message.includes('bereits')) {
        setEmailError('Diese E-Mail ist bereits registriert.');
      } else if (message.includes('Netzwerk') || message.includes('network')) {
        setGeneralError('Netzwerkfehler. Bitte prüfe deine Internetverbindung.');
      } else {
        setGeneralError(message);
      }
      shake();
    } finally {
      setIsLoading(false);
    }
  }, [name, email, password, confirmPassword, agreeTerms, register, shake]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? -insets.bottom : 0}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Header ── */}
        <View style={styles.headerSection}>
          <Text style={[styles.title, { color: colors.text }]}>Konto erstellen</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Erstelle dein CyberSarah-Konto und starte mit der Umsatzoptimierung.
          </Text>
        </View>

        {/* ── Fehler ── */}
        {generalError && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        {/* ── Formular ── */}
        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          {/* Name */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: nameError ? '#ef4444' : colors.border }]}>
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Max Mustermann"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={(t) => { setName(t); if (nameError) setNameError(null); if (generalError) setGeneralError(null); }}
                onBlur={() => setNameError(validateName(name))}
                autoCapitalize="words"
                autoCorrect={false}
                textContentType="name"
                returnKeyType="next"
                onSubmitEditing={() => emailRef.current?.focus()}
                editable={!isLoading}
              />
            </View>
            {nameError && <Text style={styles.fieldError}>{nameError}</Text>}
          </View>

          {/* E-Mail */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>E-Mail</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: emailError ? '#ef4444' : colors.border }]}>
              <TextInput
                ref={emailRef}
                style={[styles.input, { color: colors.text }]}
                placeholder="deine@email.de"
                placeholderTextColor={colors.textMuted}
                value={email}
                onChangeText={(t) => { setEmail(t); if (emailError) setEmailError(null); if (generalError) setGeneralError(null); }}
                onBlur={() => setEmailError(validateEmail(email))}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                editable={!isLoading}
              />
            </View>
            {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
          </View>

          {/* Passwort */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Passwort</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: passwordError ? '#ef4444' : colors.border }]}>
              <TextInput
                ref={passwordRef}
                style={[styles.input, { color: colors.text, flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={password}
                onChangeText={(t) => { setPassword(t); if (passwordError) setPasswordError(null); if (generalError) setGeneralError(null); }}
                onBlur={() => setPasswordError(validatePassword(password))}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="next"
                onSubmitEditing={() => confirmRef.current?.focus()}
                editable={!isLoading}
              />
              <TouchableOpacity onPress={() => setShowPassword((p) => !p)} style={styles.eyeButton} disabled={isLoading}>
                <Text style={[styles.eyeIcon, { color: colors.textMuted }]}>{showPassword ? '👁' : '👁‍🗨'}</Text>
              </TouchableOpacity>
            </View>
            {password && password.length >= 4 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.strengthSegment,
                        { backgroundColor: i <= passwordStrength.score ? passwordStrength.color : 'rgba(255,255,255,0.06)' },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: passwordStrength.color }]}>
                  {passwordStrength.label}
                </Text>
              </View>
            )}
            {passwordError && <Text style={styles.fieldError}>{passwordError}</Text>}
          </View>

          {/* Passwort bestätigen */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Passwort bestätigen</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: confirmError ? '#ef4444' : colors.border }]}>
              <TextInput
                ref={confirmRef}
                style={[styles.input, { color: colors.text, flex: 1 }]}
                placeholder="••••••••"
                placeholderTextColor={colors.textMuted}
                value={confirmPassword}
                onChangeText={(t) => { setConfirmPassword(t); if (confirmError) setConfirmError(null); if (generalError) setGeneralError(null); }}
                onBlur={() => setConfirmError(validateConfirmPassword(password, confirmPassword))}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleRegister}
                editable={!isLoading}
              />
              <TouchableOpacity onPress={() => setShowConfirm((p) => !p)} style={styles.eyeButton} disabled={isLoading}>
                <Text style={[styles.eyeIcon, { color: colors.textMuted }]}>{showConfirm ? '👁' : '👁‍🗨'}</Text>
              </TouchableOpacity>
            </View>
            {confirmError && <Text style={styles.fieldError}>{confirmError}</Text>}
          </View>

          {/* AGB */}
          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAgreeTerms((p) => !p)}
            disabled={isLoading}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, agreeTerms && styles.checkboxActive, { borderColor: agreeTerms ? colors.primary : colors.border }]}>
              {agreeTerms && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={[styles.termsText, { color: colors.textSecondary }]}>
              Ich stimme den{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>AGB</Text> und{' '}
              <Text style={{ color: colors.primary, fontWeight: '600' }}>Datenschutzbestimmungen</Text> zu.
            </Text>
          </TouchableOpacity>

          {/* Register-Button */}
          <TouchableOpacity
            style={[styles.registerButton, { backgroundColor: isLoading ? colors.primary + '80' : colors.primary, shadowColor: colors.primary }]}
            onPress={handleRegister}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>  Wird registriert...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Text style={styles.buttonIcon}>🚀</Text>
                <Text style={styles.buttonText}>  Kostenlos starten</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* ── Login-Link ── */}
        <View style={styles.loginSection}>
          <Text style={[styles.loginText, { color: colors.textMuted }]}>Bereits registriert? </Text>
          <Link to="/Login" style={[styles.loginLink, { color: colors.primary }]}>Jetzt anmelden</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  headerSection: { marginBottom: 28 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 6, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  errorBannerText: { color: '#ef4444', fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  fieldContainer: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 16 },
  input: { fontSize: 16, height: 52, padding: 0, flex: 1 },
  eyeButton: { padding: 4 },
  eyeIcon: { fontSize: 18 },
  fieldError: { color: '#ef4444', fontSize: 12, marginTop: 4, marginLeft: 4, fontWeight: '500' },
  strengthContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8 },
  strengthBar: { flex: 1, flexDirection: 'row', gap: 3 },
  strengthSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 11, fontWeight: '700', minWidth: 50, textAlign: 'right' },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 24, gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  checkboxActive: { backgroundColor: '#7c3aed', borderColor: '#7c3aed' },
  checkmark: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  termsText: { flex: 1, fontSize: 13, lineHeight: 20 },
  registerButton: { height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonIcon: { fontSize: 16 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  loginSection: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 20, marginTop: 8 },
  loginText: { fontSize: 14 },
  loginLink: { fontSize: 14, fontWeight: '700' },
});

export default RegisterScreen;
