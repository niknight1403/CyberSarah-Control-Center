import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

export default function AccountScreen() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [localUser, setLocalUser] = useState<Awaited<ReturnType<typeof Auth.getUserInfo>>>(null);
  const accountQuery = trpc.account.me.useQuery(undefined, { retry: false });
  const registerMutation = trpc.account.register.useMutation();
  const loginMutation = trpc.account.login.useMutation();
  const logoutMutation = trpc.auth.logout.useMutation();
  const billingQuery = trpc.billing.status.useQuery(undefined, { enabled: Boolean(localUser) || Boolean(accountQuery.data), retry: false });
  const checkoutMutation = trpc.billing.checkout.useMutation();
  const portalMutation = trpc.billing.portal.useMutation();

  useEffect(() => {
    void Auth.getUserInfo().then(setLocalUser);
  }, []);

  const user = accountQuery.data ?? localUser;
  const busy = registerMutation.isPending || loginMutation.isPending || logoutMutation.isPending;

  const persistAccount = async (result: { sessionToken: string; user: NonNullable<typeof user> }) => {
    await Auth.setSessionToken(result.sessionToken);
    await Auth.setUserInfo(result.user);
    setLocalUser(result.user);
    setPassword("");
    setMessage(result.user.role === "admin" ? "Administratorzugang ist vollständig aktiv." : "Anmeldung erfolgreich.");
    await accountQuery.refetch();
  };

  const submit = async () => {
    setMessage("");
    try {
      if (mode === "register") {
        await persistAccount(await registerMutation.mutateAsync({ email, password, ...(name.trim() ? { name: name.trim() } : {}) }));
      } else {
        await persistAccount(await loginMutation.mutateAsync({ email, password }));
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Die Anmeldung konnte nicht abgeschlossen werden.");
    }
  };

  const openCheckout = async () => {
    setMessage("");
    try {
      const result = await checkoutMutation.mutateAsync();
      await Linking.openURL(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Der Live-Checkout konnte nicht geöffnet werden.");
    }
  };

  const openPortal = async () => {
    setMessage("");
    try {
      const result = await portalMutation.mutateAsync();
      await Linking.openURL(result.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Das Kundenportal konnte nicht geöffnet werden.");
    }
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
    await Auth.removeSessionToken();
    await Auth.clearUserInfo();
    setLocalUser(null);
    setMessage("Du wurdest sicher abgemeldet.");
    await accountQuery.refetch();
  };

  return (
    <ScreenContainer className="px-5" edges={["top", "left", "right", "bottom"]}>
      <View style={styles.page}>
        <Text style={styles.eyebrow}>CYBERSARAH · KONTO</Text>
        <Text style={styles.title}>{user ? "Dein Zugang" : mode === "login" ? "Anmelden" : "Konto erstellen"}</Text>
        <Text style={styles.lead}>{user ? "Sitzung, Berechtigungen und Verwaltungszugang werden hier sicher verwaltet." : "Melde dich an, um den Entwicklungsraum, KI-Provider und Verwaltungsfunktionen zu nutzen."}</Text>

        {user ? <View style={styles.card}>
          <Text style={styles.name}>{user.name || user.email || "CyberSarah Nutzer"}</Text>
          <Text style={styles.email}>{user.email || "Keine E-Mail-Adresse hinterlegt"}</Text>
          <View style={[styles.roleBadge, user.role === "admin" && styles.roleBadgeAdmin]}><Text style={styles.roleText}>{user.role === "admin" ? "ADMINISTRATOR · VOLLER ZUGRIFF" : "STANDARDZUGANG"}</Text></View>
          {user.role === "admin" ? <Text style={styles.adminCopy}>Alle Skills, Steuerungselemente und Administrationsfunktionen sind für dieses Konto freigeschaltet.</Text> : null}
          <View style={styles.billingCard}><Text style={styles.billingTitle}>LIVE-ABRECHNUNG</Text><Text style={styles.billingCopy}>{billingQuery.data?.subscription ? `Status: ${billingQuery.data.subscription.status}${billingQuery.data.subscription.cancelAtPeriodEnd ? " · Kündigung vorgemerkt" : ""}` : "Noch kein aktives Abonnement"}</Text>{billingQuery.data?.subscription ? <TouchableOpacity disabled={portalMutation.isPending} onPress={() => void openPortal()} style={styles.billingButton}><Text style={styles.billingButtonText}>{portalMutation.isPending ? "Portal wird geöffnet …" : "Abonnement verwalten"}</Text></TouchableOpacity> : <TouchableOpacity disabled={checkoutMutation.isPending} onPress={() => void openCheckout()} style={styles.billingButton}><Text style={styles.billingButtonText}>{checkoutMutation.isPending ? "Checkout wird geöffnet …" : "Live-Abonnement starten"}</Text></TouchableOpacity>}</View>
          <TouchableOpacity disabled={busy} onPress={() => void logout()} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>{busy ? "Abmeldung läuft …" : "Abmelden"}</Text></TouchableOpacity>
        </View> : <View style={styles.card}>
          <View style={styles.switchRow}><TouchableOpacity onPress={() => setMode("login")} style={[styles.switchButton, mode === "login" && styles.switchButtonActive]}><Text style={styles.switchText}>Login</Text></TouchableOpacity><TouchableOpacity onPress={() => setMode("register")} style={[styles.switchButton, mode === "register" && styles.switchButtonActive]}><Text style={styles.switchText}>Registrieren</Text></TouchableOpacity></View>
          {mode === "register" ? <TextInput autoCapitalize="words" onChangeText={setName} placeholder="Name" placeholderTextColor="#718198" style={styles.input} value={name} /> : null}
          <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="E-Mail-Adresse" placeholderTextColor="#718198" style={styles.input} value={email} />
          <TextInput autoCapitalize="none" autoComplete={mode === "login" ? "current-password" : "new-password"} onChangeText={setPassword} placeholder="Passwort (mindestens 12 Zeichen)" placeholderTextColor="#718198" secureTextEntry style={styles.input} value={password} />
          <TouchableOpacity disabled={busy || !email.trim() || !password} onPress={() => void submit()} style={[styles.primaryButton, (busy || !email.trim() || !password) && styles.disabled]}>{busy ? <ActivityIndicator color="#EFFBFF" /> : <Text style={styles.primaryButtonText}>{mode === "login" ? "Sicher anmelden" : "Konto erstellen"}</Text>}</TouchableOpacity>
        </View>}
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingTop: 20 },
  eyebrow: { color: "#8BDDF5", fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#F1F6FF", fontSize: 28, fontWeight: "900", marginTop: 8 },
  lead: { color: "#9EADBF", fontSize: 13, lineHeight: 20, marginTop: 9 },
  card: { backgroundColor: "#111B29", borderColor: "#2A405B", borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 16 },
  switchRow: { backgroundColor: "#0B121D", borderRadius: 10, flexDirection: "row", marginBottom: 14, padding: 3 },
  switchButton: { alignItems: "center", borderRadius: 8, flex: 1, paddingVertical: 10 },
  switchButtonActive: { backgroundColor: "#20415B" },
  switchText: { color: "#D8E9F8", fontSize: 12, fontWeight: "800" },
  input: { backgroundColor: "#0B121D", borderColor: "#2A405B", borderRadius: 11, borderWidth: 1, color: "#F1F6FF", fontSize: 14, marginTop: 10, minHeight: 48, paddingHorizontal: 12 },
  primaryButton: { alignItems: "center", backgroundColor: "#16728B", borderColor: "#55D5F3", borderRadius: 11, borderWidth: 1, justifyContent: "center", marginTop: 15, minHeight: 48 },
  primaryButtonText: { color: "#F5FDFF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  name: { color: "#F1F6FF", fontSize: 18, fontWeight: "900" },
  email: { color: "#9EADBF", fontSize: 13, marginTop: 5 },
  roleBadge: { alignSelf: "flex-start", backgroundColor: "#293646", borderRadius: 999, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 },
  roleBadgeAdmin: { backgroundColor: "#3F2A66" },
  roleText: { color: "#D9ECFA", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  adminCopy: { color: "#CFC2FF", fontSize: 12, lineHeight: 18, marginTop: 12 },
  billingCard: { backgroundColor: "#0B121D", borderColor: "#3F2E63", borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 12 },
  billingTitle: { color: "#D4C4FF", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  billingCopy: { color: "#AFA3C9", fontSize: 12, lineHeight: 18, marginTop: 6 },
  billingButton: { alignItems: "center", backgroundColor: "#2B2150", borderColor: "#9274E8", borderRadius: 9, borderWidth: 1, marginTop: 11, paddingVertical: 10 },
  billingButtonText: { color: "#E9E1FF", fontSize: 12, fontWeight: "900" },
  secondaryButton: { alignItems: "center", borderColor: "#425D78", borderRadius: 10, borderWidth: 1, marginTop: 18, paddingVertical: 11 },
  secondaryButtonText: { color: "#B8D9ED", fontSize: 12, fontWeight: "800" },
  message: { color: "#9DE8B4", fontSize: 12, lineHeight: 18, marginTop: 14 },
});
