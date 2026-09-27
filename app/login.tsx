/**
 * Sprint 373 — Login-Bereich beim Start der App.
 *
 * Das Auth-Gate (lib/auth-gate-logic.ts) leitet hierher, sobald die Session-
 * Abfrage entschieden hat, dass niemand angemeldet ist. Nach dem Login
 * (Administrator oder Nutzer) uebernimmt die App — beim Administrator laeuft
 * danach vollautomatisch die Admin-Autonomie (Vollintegration inkl. der
 * autonomen Ideen→Influencer-Kampagnen-Bruecke, Sprint 373).
 *
 * Ehrlichkeit: Fehlgeschlagene Anmeldungen zeigen die Server-Meldung, kein
 * Fake-Erfolg. Die Route ist bewusst eigenstaendig — der Login-Bereich ist
 * der Start der App, kein Tab.
 */
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

import * as Auth from "@/lib/_core/auth";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { ScreenContainer } from "@/components/screen-container";
import { glassPalette, glassSurface } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";

export default function LoginScreen() {
  const styles = useMemo(() => createStyles(), []);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const loginMutation = trpc.account.login.useMutation();
  const registerMutation = trpc.account.register.useMutation();
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const busy = loginMutation.isPending || registerMutation.isPending;

  const submit = async () => {
    setMessage("");
    try {
      const result =
        mode === "register"
          ? await registerMutation.mutateAsync({ email, password, ...(name.trim() ? { name: name.trim() } : {}) })
          : await loginMutation.mutateAsync({ email, password });
      await Auth.setSessionToken(result.sessionToken);
      await Auth.setUserInfo(result.user);
      await accountQuery.refetch();
      router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Anmeldung konnte nicht abgeschlossen werden.");
    }
  };

  return (
    <GlassBackdrop accent="purple">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <View style={styles.wrap}>
          <View style={styles.header}>
            <Text style={styles.kicker}>CYBERSARAH CONTROL CENTER</Text>
            <Text style={styles.title}>{mode === "login" ? "Willkommen zurück" : "Konto erstellen"}</Text>
            <Text style={styles.subtitle}>
              Der Login-Bereich ist der Einstieg der App. Nach der Administrator-Anmeldung integriert das Control Center
              alles Nötige vollautonom — inklusive der Kampagnen-Brücke für deine Produkte und Ideen.
            </Text>
          </View>

          <View style={styles.card}>
            {mode === "register" ? (
              <TextInput
                accessibilityLabel="Name"
                autoCapitalize="words"
                onChangeText={setName}
                placeholder="Name (optional)"
                placeholderTextColor={glassSurface.textMuted}
                style={styles.input}
                value={name}
              />
            ) : null}
            <TextInput
              accessibilityLabel="E-Mail-Adresse"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="E-Mail-Adresse"
              placeholderTextColor={glassSurface.textMuted}
              style={styles.input}
              value={email}
            />
            <TextInput
              accessibilityLabel="Passwort"
              autoCapitalize="none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              onChangeText={setPassword}
              placeholder={mode === "login" ? "Passwort" : "Passwort (mindestens 12 Zeichen)"}
              placeholderTextColor={glassSurface.textMuted}
              secureTextEntry
              style={styles.input}
              value={password}
            />
            <Pressable
              accessibilityLabel={mode === "login" ? "Anmelden" : "Konto erstellen und anmelden"}
              accessibilityRole="button"
              disabled={busy || email.trim().length === 0 || password.length === 0}
              onPress={() => void submit()}
              style={({ pressed }) => [styles.primary, (busy || email.trim().length === 0 || password.length === 0) && styles.disabled, pressed && styles.pressed]}
            >
              {busy ? (
                <ActivityIndicator color={glassSurface.textPrimary} />
              ) : (
                <Text style={styles.primaryText}>{mode === "login" ? "Anmelden" : "Konto erstellen"}</Text>
              )}
            </Pressable>

            {message.length > 0 ? <Text style={styles.message}>{message}</Text> : null}

            <View style={styles.switchRow}>
              <Pressable accessibilityRole="button" onPress={() => setMode(mode === "login" ? "register" : "login")}>
                <Text style={styles.switchText}>
                  {mode === "login" ? "Noch kein Konto? Jetzt registrieren" : "Schon registriert? Zum Login"}
                </Text>
              </Pressable>
            </View>
          </View>

          <Text style={styles.footnote}>Alle Funktionen bleiben nach dem Login autonom erreichbar — nichts wird simuliert, nichts ist Platzhalter.</Text>
        </View>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    wrap: { alignSelf: "center", maxWidth: 460, width: "100%" },
    header: { marginBottom: 18 },
    kicker: { color: glassPalette.purple, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
    title: { color: glassSurface.textPrimary, fontSize: 26, fontWeight: "900", marginTop: 6 },
    subtitle: { color: glassSurface.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
    card: { backgroundColor: glassSurface.background, borderColor: glassSurface.border, borderRadius: 18, borderWidth: 1, gap: 10, padding: 18 },
    input: { backgroundColor: "transparent", borderColor: glassSurface.border, borderRadius: 12, borderWidth: 1, color: glassSurface.textPrimary, fontSize: 14, minHeight: 46, paddingHorizontal: 12 },
    primary: { alignItems: "center", backgroundColor: glassPalette.purple, borderRadius: 12, justifyContent: "center", minHeight: 46 },
    primaryText: { color: glassSurface.textPrimary, fontWeight: "800" },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.8 },
    message: { color: glassPalette.red, fontSize: 12, lineHeight: 17 },
    switchRow: { alignItems: "center", marginTop: 4 },
    switchText: { color: glassPalette.cyan, fontSize: 12, fontWeight: "700" },
    footnote: { color: glassSurface.textMuted, fontSize: 10, lineHeight: 15, marginTop: 14, textAlign: "center" },
  });
}
