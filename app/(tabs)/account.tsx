/**
 * Sprint 173 — Konto-Screen auf "CyberSarah Future Glass" umgebaut.
 *
 * Logik (Auth, Session-Expiry-Handling, Billing-Checkout/Portal/Kündigung,
 * Rechnungsliste) bleibt unveraendert; ausschliesslich die visuelle Schicht
 * wird auf das verbindliche Glass-System (Sprint 168) uebertragen:
 * GlassBackdrop statt flachem Hintergrund, GlassCard statt Ad-hoc-Karte,
 * GlowButton statt handgebauter Buttons, StatusChip statt Role-Badge,
 * Typography/Tokens aus lib/design/future-glass statt Hartkodierungen.
 */
import { ScreenContainer } from "@/components/screen-container";
import { NavDrawer, NavDrawerButton, useNavDrawer } from "@/components/responsive/nav-drawer";
import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { trpc } from "@/lib/trpc";
import * as Auth from "@/lib/_core/auth";
import { accentAlpha, glassDepth, glassPalette, glassRadii, glassSpacing, glassSurface, glassType } from "@/lib/design/future-glass";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";

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

  const navDrawer = useNavDrawer();
  return (
    <GlassBackdrop accent="purple">
      <ScreenContainer style={styles.transparent} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.page}>
          <View style={styles.menuRow}>
            <NavDrawer {...navDrawer.drawerProps} />
            <NavDrawerButton {...navDrawer.hamburgerProps} />
          </View>
          <Text style={styles.eyebrow}>CYBERSARAH · KONTO</Text>
          <Text style={styles.title}>{sessionExpired && !user ? "Sitzung abgelaufen" : user ? "Dein Zugang" : mode === "login" ? "Anmelden" : "Konto erstellen"}</Text>
          <Text style={styles.lead}>{user ? "Sitzung, Berechtigungen und Verwaltungszugang werden hier sicher verwaltet." : "Melde dich an, um den Entwicklungsraum, KI-Provider und Verwaltungsfunktionen zu nutzen."}</Text>

          {user ? (
            <GlassCard accent="purple" glow={1} style={styles.card}>
              <Text style={styles.name}>{user.name || user.email || "CyberSarah Nutzer"}</Text>
              <Text style={styles.email}>{user.email || "Keine E-Mail-Adresse hinterlegt"}</Text>
              <View style={styles.roleRow}>
                <StatusChip label={user.role === "admin" ? "ADMINISTRATOR · VOLLER ZUGRIFF" : "STANDARDZUGANG"} accent={user.role === "admin" ? "purple" : "blue"} />
              </View>
              {user.role === "admin" ? <Text style={styles.adminCopy}>Alle Skills, Steuerungselemente und Administrationsfunktionen sind für dieses Konto freigeschaltet.</Text> : null}
              {user.role === "admin" ? (
                <>
                  <GlassCard accent="green" style={styles.billingCard}>
                    <Text style={styles.billingTitle}>EXPERT-ZUGANG AKTIV</Text>
                    <Text style={styles.billingCopy}>
                      Dein Administratorzugang umfasst dauerhaft alle Expert-Funktionen.
                      Ein Abonnement oder Stripe-Checkout ist nicht erforderlich.
                    </Text>
                  </GlassCard>
                  <GlowButton label="Admin-Control-Center öffnen" onPress={() => router.push("/admin")} accent="cyan" variant="secondary" testID="account-open-admin" />
                </>
              ) : (
                <GlassCard accent="green" style={styles.billingCard}>
                  <Text style={styles.billingTitle}>LIVE-ABRECHNUNG</Text>
                  <Text style={styles.billingCopy}>{billingQuery.data?.subscription ? `Stufe: ${billingQuery.data?.tierLabel ?? "Lite"} · Status: ${billingQuery.data.subscription.status}${billingQuery.data.subscription.cancelAtPeriodEnd ? " · Kündigung vorgemerkt" : ""}` : "Noch kein aktives Abonnement — Stufe wählen:"}</Text>
                  <View style={styles.tierRow}>
                    {(["lite", "pro", "expert"] as const).map((tier) => (
                      <GlowButton
                        key={tier}
                        label={checkoutMutation.isPending && checkoutMutation.variables?.tier === tier ? "…" : tier === "expert" ? "Expert" : tier === "pro" ? "Pro" : "Lite"}
                        onPress={() => void openCheckout(tier)}
                        disabled={checkoutMutation.isPending}
                        accent="green"
                        variant={billingQuery.data?.tier === tier ? "primary" : "ghost"}
                      />
                    ))}
                  </View>
                  {billingQuery.data?.subscription ? (
                    <>
                      <GlowButton label={portalMutation.isPending ? "Portal wird geöffnet …" : "Abonnement verwalten"} onPress={() => void openPortal()} disabled={portalMutation.isPending || cancelMutation.isPending} accent="green" variant="secondary" testID="account-open-portal" />
                      <GlowButton
                        label={billingQuery.data.subscription.cancelAtPeriodEnd ? "Kündigung vorgemerkt" : "Zum Periodenende kündigen"}
                        onPress={() =>
                          void (async () => {
                            try {
                              await cancelMutation.mutateAsync();
                              setMessage("Abonnement wird zum Periodenende gekündigt — im Portal widerrufbar.");
                              await billingQuery.refetch();
                            } catch (error) {
                              setMessage(error instanceof Error ? error.message : "Die Kündigung ist fehlgeschlagen.");
                            }
                          })()
                        }
                        disabled={cancelMutation.isPending || billingQuery.data.subscription.cancelAtPeriodEnd}
                        accent="amber"
                        variant="ghost"
                        testID="account-cancel-subscription"
                      />
                    </>
                  ) : null}
                  {(invoicesQuery.data?.invoices?.length ?? 0) > 0 ? (
                    <View style={styles.invoiceBlock}>
                      <Text style={styles.billingCopy}>Rechnungen:</Text>
                      {invoicesQuery.data!.invoices.slice(0, 5).map((invoice) => (
                        <Pressable key={invoice.id} disabled={!invoice.hostedInvoiceUrl} onPress={() => (invoice.hostedInvoiceUrl ? Linking.openURL(invoice.hostedInvoiceUrl) : undefined)} style={styles.invoiceRow}>
                          <Text style={styles.invoiceText}>{invoice.created ? new Date(invoice.created).toLocaleDateString("de-DE") : "—"} · {(invoice.amountTotal / 100).toFixed(2)} € · {invoice.status === "paid" ? "bezahlt" : invoice.status === "open" ? "offen" : "storniert"}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </GlassCard>
              )}
              <View style={styles.logoutRow}>
                <GlowButton label={busy ? "Abmeldung läuft …" : "Abmelden"} onPress={() => void logout()} disabled={busy} accent="red" variant="ghost" testID="account-logout" />
              </View>
            </GlassCard>
          ) : (
            <GlassCard accent="cyan" glow={1} style={styles.card}>
              <View style={styles.switchRow}>
                <Pressable onPress={() => setMode("login")} style={[styles.switchButton, mode === "login" && styles.switchButtonActive]} accessibilityRole="button">
                  <Text style={[styles.switchText, mode === "login" && styles.switchTextActive]}>Login</Text>
                </Pressable>
                <Pressable onPress={() => setMode("register")} style={[styles.switchButton, mode === "register" && styles.switchButtonActive]} accessibilityRole="button">
                  <Text style={[styles.switchText, mode === "register" && styles.switchTextActive]}>Registrieren</Text>
                </Pressable>
              </View>
              {mode === "register" ? <TextInput autoCapitalize="words" onChangeText={setName} placeholder="Name" placeholderTextColor={glassSurface.textMuted} style={styles.input} value={name} /> : null}
              <TextInput autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="E-Mail-Adresse" placeholderTextColor={glassSurface.textMuted} style={styles.input} value={email} />
              <TextInput autoCapitalize="none" autoComplete={mode === "login" ? "current-password" : "new-password"} onChangeText={setPassword} placeholder="Passwort (mindestens 12 Zeichen)" placeholderTextColor={glassSurface.textMuted} secureTextEntry style={styles.input} value={password} />
              {busy ? (
                <View style={styles.busyRow}>
                  <ActivityIndicator color={glassPalette.cyan} />
                </View>
              ) : (
                <GlowButton label={mode === "login" ? "Sicher anmelden" : "Konto erstellen"} onPress={() => void submit()} disabled={busy || !email.trim() || !password} accent="cyan" variant="primary" testID="account-submit" />
              )}
            </GlassCard>
          )}
          {message ? <Text style={styles.message}>{message}</Text> : null}
        </View>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

const styles = StyleSheet.create({
  transparent: { backgroundColor: "transparent" },
  menuRow: { marginBottom: glassSpacing.md },
  page: { flex: 1, paddingTop: glassSpacing.xl },
  eyebrow: { ...glassType.label, color: accentAlpha("cyan", 0.9), marginTop: glassSpacing.sm },
  title: { ...glassType.display, color: glassSurface.textPrimary, marginTop: glassSpacing.sm },
  lead: { ...glassType.body, color: glassSurface.textSecondary, lineHeight: 20, marginTop: glassSpacing.sm },
  card: { marginTop: glassSpacing.xl, padding: glassSpacing.lg },
  name: { ...glassType.headline, color: glassSurface.textPrimary },
  email: { ...glassType.body, color: glassSurface.textSecondary, marginTop: glassSpacing.xs },
  roleRow: { marginTop: glassSpacing.md },
  adminCopy: { ...glassType.caption, color: accentAlpha("cyan", 0.85), lineHeight: 18, marginTop: glassSpacing.md },
  billingCard: { marginTop: glassSpacing.lg, padding: glassSpacing.md },
  billingTitle: { ...glassType.label, color: glassPalette.green },
  billingCopy: { ...glassType.caption, color: glassSurface.textSecondary, lineHeight: 18, marginTop: glassSpacing.xs },
  tierRow: { flexDirection: "row", gap: glassSpacing.sm, marginTop: glassSpacing.md },
  invoiceBlock: { marginTop: glassSpacing.md },
  invoiceRow: { paddingVertical: 6 },
  invoiceText: { ...glassType.caption, color: glassSurface.textMuted },
  logoutRow: { marginTop: glassSpacing.lg },
  switchRow: { backgroundColor: glassDepth.layer, borderRadius: glassRadii.md, flexDirection: "row", marginBottom: glassSpacing.md, padding: 3 },
  switchButton: { alignItems: "center", borderRadius: glassRadii.sm, flex: 1, paddingVertical: 10 },
  switchButtonActive: { backgroundColor: accentAlpha("cyan", 0.16) },
  switchText: { ...glassType.caption, color: glassSurface.textSecondary },
  switchTextActive: { color: glassPalette.cyan },
  input: {
    backgroundColor: glassDepth.layer,
    borderColor: glassSurface.border,
    borderRadius: glassRadii.md,
    borderWidth: 1,
    color: glassSurface.textPrimary,
    fontSize: 14,
    marginTop: glassSpacing.sm,
    minHeight: 48,
    paddingHorizontal: glassSpacing.md,
  },
  busyRow: { alignItems: "center", justifyContent: "center", marginTop: glassSpacing.lg, minHeight: 48 },
  message: { ...glassType.caption, color: glassPalette.green, lineHeight: 18, marginTop: glassSpacing.md },
});
