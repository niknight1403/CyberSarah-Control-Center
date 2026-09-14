import { ScreenContainer } from "@/components/screen-container";
import { trpc } from "@/lib/trpc";
import { useAdminAutoSetup } from "@/lib/use-admin-autosetup";
import * as Auth from "@/lib/_core/auth";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { lighten, withAlpha } from "@/lib/theme-color-utils";
import { useColors } from "@/hooks/use-colors";

export default function AccountScreen() {
    const colors = useColors();
    const styles = useMemo(() => createStyles(colors), [colors]);
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
  const checkoutMutation = trpc.billing.checkoutTier.useMutation();
  const portalMutation = trpc.billing.portal.useMutation();
  const cancelMutation = trpc.billing.cancel.useMutation();
  const invoicesQuery = trpc.billing.invoices.useQuery(undefined, { enabled: Boolean(localUser) || Boolean(accountQuery.data), retry: false });

  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    void Auth.getUserInfo().then(setLocalUser);
  }, []);

  // Sprint 108 — Ehrliche Session-Anzeige: Lehnt der Server die Sitzung mit
  // UNAUTHORIZED ("Please login (10001)") ab, waehrend lokal noch ein Profil
  // liegt, ist der gespeicherte Token ungueltig (z. B. JWT-Rotation oder
  // abgelaufen). Der Stumpf-Zustand wird entfernt, statt einen aktiven
  // Administrator-Status aus dem Cache vorzutaeuschen.
  useEffect(() => {
    const error = accountQuery.error;
    if (!error) return;
    const code = (error as { data?: { code?: string } }).data?.code ?? "";
    const unauthorized = code === "UNAUTHORIZED" || error.message.includes("10001");
    if (!unauthorized || !localUser) return;
    let active = true;
    void (async () => {
      await Auth.removeSessionToken();
      await Auth.clearUserInfo();
      if (!active) return;
      setLocalUser(null);
      setSessionExpired(true);
      setMode("login");
      setMessage("Sitzung abgelaufen — bitte mit deinem Zugang neu anmelden.");
    })();
    return () => {
      active = false;
    };
  }, [accountQuery.error, localUser]);

  const user = accountQuery.data ?? localUser;
  useAdminAutoSetup(user?.role === "admin" ? user : null);
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

  const openCheckout = async (tier: "lite" | "pro" | "expert") => {
    setMessage("");
    try {
      const result = await checkoutMutation.mutateAsync({ tier });
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
        <Text style={styles.title}>{sessionExpired && !user ? "Sitzung abgelaufen" : user ? "Dein Zugang" : mode === "login" ? "Anmelden" : "Konto erstellen"}</Text>
        <Text style={styles.lead}>{user ? "Sitzung, Berechtigungen und Verwaltungszugang werden hier sicher verwaltet." : "Melde dich an, um den Entwicklungsraum, KI-Provider und Verwaltungsfunktionen zu nutzen."}</Text>

        {user ? <View style={styles.card}>
          <Text style={styles.name}>{user.name || user.email || "CyberSarah Nutzer"}</Text>
          <Text style={styles.email}>{user.email || "Keine E-Mail-Adresse hinterlegt"}</Text>
          <View style={[styles.roleBadge, user.role === "admin" && styles.roleBadgeAdmin]}><Text style={styles.roleText}>{user.role === "admin" ? "ADMINISTRATOR · VOLLER ZUGRIFF" : "STANDARDZUGANG"}</Text></View>
          {user.role === "admin" ? <Text style={styles.adminCopy}>Alle Skills, Steuerungselemente und Administrationsfunktionen sind für dieses Konto freigeschaltet.</Text> : null}
          {user.role === "admin" ? (
            <View style={styles.billingCard}>
              <Text style={styles.billingTitle}>EXPERT-ZUGANG AKTIV</Text>
              <Text style={styles.billingCopy}>
                Dein Administratorzugang umfasst dauerhaft alle Expert-Funktionen.
                Ein Abonnement oder Stripe-Checkout ist nicht erforderlich.
              </Text>
            </View>
          ) : (
          <View style={styles.billingCard}>
            <Text style={styles.billingTitle}>LIVE-ABRECHNUNG</Text>
            <Text style={styles.billingCopy}>{billingQuery.data?.subscription ? `Stufe: ${billingQuery.data?.tierLabel ?? "Lite"} · Status: ${billingQuery.data.subscription.status}${billingQuery.data.subscription.cancelAtPeriodEnd ? " · Kündigung vorgemerkt" : ""}` : "Noch kein aktives Abonnement — Stufe wählen:"}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              {(["lite", "pro", "expert"] as const).map((tier) => (
                <TouchableOpacity key={tier} disabled={checkoutMutation.isPending} onPress={() => void openCheckout(tier)} style={[styles.billingButton, { flex: 1, backgroundColor: billingQuery.data?.tier === tier ? "#4b5563" : undefined }]}>
                  <Text style={styles.billingButtonText}>{checkoutMutation.isPending && checkoutMutation.variables?.tier === tier ? "…" : tier === "expert" ? "Expert" : tier === "pro" ? "Pro" : "Lite"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {billingQuery.data?.subscription ? (
              <>
                <TouchableOpacity disabled={portalMutation.isPending || cancelMutation.isPending} onPress={() => void openPortal()} style={[styles.billingButton, { marginTop: 8 }]}>
                  <Text style={styles.billingButtonText}>{portalMutation.isPending ? "Portal wird geöffnet …" : "Abonnement verwalten"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={cancelMutation.isPending || billingQuery.data.subscription.cancelAtPeriodEnd}
                  onPress={async () => {
                    try {
                      await cancelMutation.mutateAsync();
                      setMessage("Abonnement wird zum Periodenende gekündigt — im Portal widerrufbar.");
                      await billingQuery.refetch();
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Die Kündigung ist fehlgeschlagen.");
                    }
                  }}
                  style={[styles.billingButton, { marginTop: 8, opacity: billingQuery.data.subscription.cancelAtPeriodEnd ? 0.5 : 1 }]}
                >
                  <Text style={styles.billingButtonText}>{billingQuery.data.subscription.cancelAtPeriodEnd ? "Kündigung vorgemerkt" : "Zum Periodenende kündigen"}</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {(invoicesQuery.data?.invoices?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.billingCopy}>Rechnungen:</Text>
                {invoicesQuery.data!.invoices.slice(0, 5).map((invoice) => (
                  <TouchableOpacity key={invoice.id} disabled={!invoice.hostedInvoiceUrl} onPress={() => (invoice.hostedInvoiceUrl ? Linking.openURL(invoice.hostedInvoiceUrl) : undefined)} style={{ paddingVertical: 6 }}>
                    <Text style={[styles.billingCopy, { color: "#9ca3af" }]}>{invoice.created ? new Date(invoice.created).toLocaleDateString("de-DE") : "—"} · {(invoice.amountTotal / 100).toFixed(2)} € · {invoice.status === "paid" ? "bezahlt" : invoice.status === "open" ? "offen" : "storniert"}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </View>
          )}
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

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
  page: { flex: 1, paddingTop: 20 },
  eyebrow: { color: lighten(colors.tint, 0.2), fontSize: 11, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#F1F6FF", fontSize: 28, fontWeight: "900", marginTop: 8 },
  lead: { color: "#9EADBF", fontSize: 13, lineHeight: 20, marginTop: 9 },
  card: { backgroundColor: "#111B29", borderColor: withAlpha(colors.tint, 0.16), borderRadius: 18, borderWidth: 1, marginTop: 22, padding: 16 },
  switchRow: { backgroundColor: "#0B121D", borderRadius: 10, flexDirection: "row", marginBottom: 14, padding: 3 },
  switchButton: { alignItems: "center", borderRadius: 8, flex: 1, paddingVertical: 10 },
  switchButtonActive: { backgroundColor: withAlpha(colors.tint, 0.16) },
  switchText: { color: "#D8E9F8", fontSize: 12, fontWeight: "800" },
  input: { backgroundColor: "#0B121D", borderColor: withAlpha(colors.tint, 0.16), borderRadius: 11, borderWidth: 1, color: "#F1F6FF", fontSize: 14, marginTop: 10, minHeight: 48, paddingHorizontal: 12 },
  primaryButton: { alignItems: "center", backgroundColor: withAlpha(colors.tint, 0.3), borderColor: colors.tint, borderRadius: 11, borderWidth: 1, justifyContent: "center", marginTop: 15, minHeight: 48 },
  primaryButtonText: { color: "#F5FDFF", fontSize: 13, fontWeight: "900" },
  disabled: { opacity: 0.45 },
  name: { color: "#F1F6FF", fontSize: 18, fontWeight: "900" },
  email: { color: "#9EADBF", fontSize: 13, marginTop: 5 },
  roleBadge: { alignSelf: "flex-start", backgroundColor: "#293646", borderRadius: 999, marginTop: 14, paddingHorizontal: 10, paddingVertical: 6 },
  roleBadgeAdmin: { backgroundColor: withAlpha(colors.tint, 0.2) },
  roleText: { color: "#D9ECFA", fontSize: 10, fontWeight: "900", letterSpacing: 0.7 },
  adminCopy: { color: lighten(colors.tint, 0.28), fontSize: 12, lineHeight: 18, marginTop: 12 },
  billingCard: { backgroundColor: "#0B121D", borderColor: withAlpha(colors.tint, 0.2), borderRadius: 12, borderWidth: 1, marginTop: 16, padding: 12 },
  billingTitle: { color: lighten(colors.tint, 0.28), fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  billingCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  billingButton: { alignItems: "center", backgroundColor: withAlpha(colors.tint, 0.14), borderColor: colors.tint, borderRadius: 9, borderWidth: 1, marginTop: 11, paddingVertical: 10 },
  billingButtonText: { color: "#E9E1FF", fontSize: 12, fontWeight: "900" },
  secondaryButton: { alignItems: "center", borderColor: "#425D78", borderRadius: 10, borderWidth: 1, marginTop: 18, paddingVertical: 11 },
  secondaryButtonText: { color: lighten(colors.tint, 0.35), fontSize: 12, fontWeight: "800" },
  message: { color: lighten(colors.success, 0.2), fontSize: 12, lineHeight: 18, marginTop: 14 },
  });
}
