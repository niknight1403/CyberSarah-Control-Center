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
import { Link, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { apiClient } from '../services/api';

function validateEmail(email: string): string | null {
  if (!email.trim()) return 'E-Mail-Adresse eingeben';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email.trim())) return 'Ungültige E-Mail-Adresse';
  return null;
}

export function ForgotPasswordScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const navigation = useNavigation();

  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [shakeAnim]);

  const handleReset = useCallback(async () => {
    Keyboard.dismiss();
    setGeneralError(null);

    const eError = validateEmail(email);
    setEmailError(eError);
    if (eError) { shake(); return; }

    setIsLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      setIsSuccess(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null && 'message' in error
            ? String((error as Record<string, unknown>).message)
            : 'Fehler beim Zurücksetzen.';
      setGeneralError(message);
      shake();
    } finally {
      setIsLoading(false);
    }
  }, [email, shake]);

  if (isSuccess) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.scrollContent, { paddingTop: insets.top + 80, paddingBottom: insets.bottom + 40 }]}>
          <View style={styles.successSection}>
            <View style={[styles.successIcon, { shadowColor: colors.success }]}>
              <Text style={styles.successEmoji}>✉️</Text>
            </View>
            <Text style={[styles.successTitle, { color: colors.text }]}>E-Mail gesendet</Text>
            <Text style={[styles.successText, { color: colors.textMuted }]}>
              Wir haben eine E-Mail an{' '}
              <Text style={{ color: colors.text, fontWeight: '600' }}>{email}</Text>
              {'\n'}gesendet. Folge dem Link, um dein Passwort zurückzusetzen.
            </Text>
            <TouchableOpacity
              style={[styles.backButton, { backgroundColor: colors.primary, shadowColor: colors.primary }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Text style={styles.backButtonText}>Zurück zum Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={styles.headerSection}>
          <Text style={[styles.title, { color: colors.text }]}>Passwort vergessen?</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]}>
            Kein Problem. Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen.
          </Text>
        </View>

        {generalError && (
          <View style={[styles.errorBanner, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)' }]}>
            <Text style={styles.errorBannerText}>{generalError}</Text>
          </View>
        )}

        <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
          <View style={styles.fieldContainer}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>E-Mail</Text>
            <View style={[styles.inputContainer, { backgroundColor: colors.input, borderColor: emailError ? '#ef4444' : colors.border }]}>
              <TextInput
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
                returnKeyType="done"
                onSubmitEditing={handleReset}
                editable={!isLoading}
              />
            </View>
            {emailError && <Text style={styles.fieldError}>{emailError}</Text>}
          </View>

          <TouchableOpacity
            style={[styles.resetButton, { backgroundColor: isLoading ? colors.primary + '80' : colors.primary, shadowColor: colors.primary }]}
            onPress={handleReset}
            disabled={isLoading}
            activeOpacity={0.85}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                <Text style={styles.buttonText}>  Wird gesendet...</Text>
              </View>
            ) : (
              <View style={styles.loadingRow}>
                <Text style={styles.buttonIcon}>📧</Text>
                <Text style={styles.buttonText}>  Link senden</Text>
              </View>
            )}
          </TouchableOpacity>
        </Animated.View>

        <Link to="/Login" style={[styles.backLink, { color: colors.secondary }]}>
          Zurück zum Login
        </Link>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24 },
  headerSection: { marginBottom: 32, marginTop: 20 },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 8, letterSpacing: -0.3 },
  subtitle: { fontSize: 14, lineHeight: 22 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  errorBannerText: { color: '#ef4444', fontSize: 13, fontWeight: '500', flex: 1, lineHeight: 18 },
  fieldContainer: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, letterSpacing: 0.3 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, height: 52, paddingHorizontal: 16 },
  input: { fontSize: 16, height: 52, padding: 0, flex: 1 },
  fieldError: { color: '#ef4444', fontSize: 12, marginTop: 4, marginLeft: 4, fontWeight: '500' },
  resetButton: { height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6, marginBottom: 24 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  buttonIcon: { fontSize: 16 },
  buttonText: { color: '#ffffff', fontSize: 17, fontWeight: '700', letterSpacing: 0.3 },
  backLink: { textAlign: 'center', fontSize: 15, fontWeight: '600', marginTop: 8 },
  successSection: { alignItems: 'center', paddingHorizontal: 16, marginTop: 40 },
  successIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(34,197,94,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 24, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 24 },
  successEmoji: { fontSize: 36 },
  successTitle: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
  successText: { fontSize: 15, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
  backButton: { width: '100%', height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  backButtonText: { color: '#ffffff', fontSize: 17, fontWeight: '700' },
});

export default ForgotPasswordScreen;
