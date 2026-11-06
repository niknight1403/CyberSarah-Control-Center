/**
 * Oeffentliche Verkaufsseite des AI Influenza Teams.
 *
 * Diese Seite ist die `salespage_url` fuer Digistore24 und der Einstieg fuer
 * kalte Besucher. Sie ist absichtlich nuechtern: echte Preise aus den Paketen,
 * echte Lieferbestandteile, keine Erfolgsversprechen und keine Frist-Timer.
 *
 * Kaufen ohne Konto: der Checkout laeuft als Gast-Checkout direkt zu Stripe,
 * die E-Mail wird dort erhoben. Vorher war hier ein Login vorgeschaltet — 17
 * gestartete Checkouts und keine einzige Zahlung waren der Beleg, dass diese
 * Huerde mehr kostet als sie schuetzt. Nach der Zahlung kommt der Anmeldelink
 * per Mail, das Konto entsteht also nach dem Kauf, nicht davor.
 *
 * Wer vor dem Kauf sprechen will, kann ein Erstgespraech anfragen. Die Anfrage
 * ist ein Kontaktwunsch (Grundlage: Selbstauskunft), landet in der Lead-Pipeline
 * und loest keinen automatischen Versand aus.
 */
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { GlassBackdrop } from "@/components/glass/glass-backdrop";
import { GlassCard, GlowButton, StatusChip } from "@/components/glass/glass-primitives";
import { ScreenContainer } from "@/components/screen-container";
import {
  AI_INFLUENZA_INTRO_LIMITS,
  AI_INFLUENZA_INTRO_PACKAGE_CHOICES,
  AI_INFLUENZA_INTRO_PACKAGE_LABELS,
  AI_INFLUENZA_INTRO_WINDOWS,
  AI_INFLUENZA_INTRO_WINDOW_LABELS,
  introRequestConfirmationText,
  type AiInfluenzaIntroPackageChoice,
  type AiInfluenzaIntroWindow,
} from "@/lib/ai-influenza-intro-request-logic";
import {
  AI_INFLUENZA_ENTRY_PACKAGE_ID,
  AI_INFLUENZA_PACKAGES,
  isAiInfluenzaPackageBookable,
  type AiInfluenzaPackageId,
} from "@/lib/ai-influenza-team-logic";
import { LegalFooter } from "@/components/legal/legal-footer";
import { buildPackageLoginPath } from "@/lib/post-login-navigation-logic";
import { glassDepth, glassPalette, glassRadii, glassSurface } from "@/lib/design/future-glass";
import { trpc } from "@/lib/trpc";

// Gesperrte Pakete erscheinen nicht: die Sperre wirkt in UI und Checkout.
const PACKAGE_ORDER: readonly AiInfluenzaPackageId[] = (["starter", "growth", "business"] as const).filter(
  (packageId) => isAiInfluenzaPackageBookable(packageId),
);

function euro(cents: number) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const ABLAUF: readonly { step: string; detail: string }[] = [
  { step: "1 · Analyse", detail: "Wir lesen deinen Markt, deine Wettbewerber und deine bisherigen Kanaele. Ergebnis: eine belegte Ausgangslage statt Bauchgefuehl." },
  { step: "2 · Aufbau", detail: "Zielgruppe, Angebot und Preislogik werden festgelegt, die Kampagnen und Content-Pakete daraus abgeleitet." },
  { step: "3 · Betrieb", detail: "Content, Video und Ausspielung laufen im Tageszyklus. Jede Aktion und jeder Token-Verbrauch ist im Dashboard nachvollziehbar." },
  { step: "4 · Auswertung", detail: "Monatlicher Report: Umsatz, Kosten, Marge je Auftrag. Was nicht traegt, fliegt raus." },
];

export default function AiInfluenzaVerkaufsseite() {
  const styles = useMemo(() => createStyles(), []);

  /**
   * Gast-Kauf: kein Login, keine Registrierung. Die Adresse aus dem
   * Erstgespraech-Formular wird vorbelegt, wenn sie schon getippt wurde —
   * spart einen zweiten Eintrag auf der Stripe-Seite.
   */
  const startGuestCheckout = async (packageId: AiInfluenzaPackageId) => {
    setCheckoutError("");
    try {
      const typedEmail = email.trim();
      const result = await guestCheckout.mutateAsync({
        packageId,
        ...(typedEmail.includes("@") ? { email: typedEmail } : {}),
      });
      await Linking.openURL(result.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error ? error.message : "Der Checkout konnte nicht geöffnet werden. Bitte später erneut.",
      );
    }
  };
  const [checkoutError, setCheckoutError] = useState("");
  const guestCheckout = trpc.aiInfluenzaTeam.guestCheckout.useMutation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [goal, setGoal] = useState("");
  const [packageChoice, setPackageChoice] = useState<AiInfluenzaIntroPackageChoice>("unsure");
  const [preferredWindow, setPreferredWindow] = useState<AiInfluenzaIntroWindow>("flexibel");
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");

  const requestIntro = trpc.aiInfluenzaTeam.introRequest.useMutation({
    onSuccess: (result) => {
      setError("");
      setConfirmation(
        result.confirmation ??
          introRequestConfirmationText({ preferredWindow }),
      );
      setGoal("");
      setConsent(false);
    },
    onError: (mutationError) => {
      setConfirmation("");
      setError(mutationError.message || "Anfrage konnte nicht gesendet werden.");
    },
  });

  const canSubmit =
    name.trim().length >= AI_INFLUENZA_INTRO_LIMITS.name.min &&
    email.includes("@") &&
    consent &&
    !requestIntro.isPending;

  function submitIntroRequest() {
    if (!canSubmit) return;
    setError("");
    requestIntro.mutate({
      name: name.trim(),
      email: email.trim(),
      company: company.trim() || undefined,
      packageId: packageChoice,
      preferredWindow,
      goal: goal.trim() || undefined,
      consent,
    });
  }

  return (
    <GlassBackdrop accent="magenta">
      <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-transparent" safeAreaClassName="bg-transparent">
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>CYBERSARAH · AI INFLUENZA TEAM</Text>
            <Text style={styles.title}>Ein KI-Marketing-Team, das seine Arbeit belegt.</Text>
            <Text style={styles.lead}>
              Acht spezialisierte Agenten arbeiten an Marktanalyse, CRM, Angeboten, Content, Video und Reporting.
              Du siehst jeden Schritt, jeden Kostenpunkt und jeden Umsatz im Dashboard. Keine Blackbox, keine
              Mindestlaufzeit.
            </Text>
            <StatusChip label="Monatlich kündbar" accent="magenta" />
          </View>

          <GlassCard accent="magenta" style={styles.card}>
            <Text style={styles.kicker}>SO LAEUFT ES</Text>
            {ABLAUF.map((item) => (
              <View key={item.step} style={styles.row}>
                <Text style={styles.stepLabel}>{item.step}</Text>
                <Text style={styles.stepDetail}>{item.detail}</Text>
              </View>
            ))}
          </GlassCard>

          <Text style={styles.sectionTitle}>Pakete</Text>
          {PACKAGE_ORDER.map((packageId) => {
            const pkg = AI_INFLUENZA_PACKAGES[packageId];
            return (
              <GlassCard key={pkg.id} accent="magenta" style={styles.card}>
                <View style={styles.packageHead}>
                  <Text style={styles.packageName}>{pkg.name}</Text>
                  <Text style={styles.price}>{euro(pkg.monthlyPriceCents)}</Text>
                </View>
                <Text style={styles.priceNote}>pro Monat, inkl. gesetzlicher USt. · monatlich kündbar</Text>
                <View style={styles.deliverables}>
                  {pkg.deliverables.map((item) => (
                    <Text key={item} style={styles.deliverable}>· {item}</Text>
                  ))}
                </View>
                <GlowButton
                  label={pkg.id === AI_INFLUENZA_ENTRY_PACKAGE_ID ? `Für ${euro(pkg.monthlyPriceCents)} starten` : "Paket wählen"}
                  accent="magenta"
                  variant={pkg.id === AI_INFLUENZA_ENTRY_PACKAGE_ID ? "primary" : "secondary"}
                  // Direkt zum Gast-Checkout: keine Registrierung vor der Zahlung.
                  disabled={guestCheckout.isPending}
                  onPress={() => void startGuestCheckout(pkg.id)}
                />
              </GlassCard>
            );
          })}

          <GlassCard accent="cyan" style={styles.card}>
            <Text style={styles.kicker}>ERSTGESPRAECH ANFRAGEN</Text>
            <Text style={styles.small}>
              Du willst vor der Paketwahl sprechen? Schreib uns hier. Die Anfrage ist ein Kontaktwunsch von dir,
              kein Abo und keine Zahlung. Wir antworten per E-Mail zur Terminabstimmung.
            </Text>

            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={glassSurface.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Name"
              testID="intro-name"
            />
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="E-Mail-Adresse"
              placeholderTextColor={glassSurface.textMuted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              accessibilityLabel="E-Mail-Adresse"
              testID="intro-email"
            />
            <TextInput
              style={styles.input}
              value={company}
              onChangeText={setCompany}
              placeholder="Unternehmen (optional)"
              placeholderTextColor={glassSurface.textMuted}
              autoCapitalize="words"
              accessibilityLabel="Unternehmen"
              testID="intro-company"
            />

            <Text style={styles.fieldLabel}>Paket, das dich interessiert</Text>
            <View style={styles.chipRow}>
              {AI_INFLUENZA_INTRO_PACKAGE_CHOICES.map((choice) => {
                const active = packageChoice === choice;
                return (
                  <Pressable
                    key={choice}
                    onPress={() => setPackageChoice(choice)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, active ? styles.chipActive : null]}
                  >
                    <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>
                      {AI_INFLUENZA_INTRO_PACKAGE_LABELS[choice]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Wann passt es dir?</Text>
            <View style={styles.chipRow}>
              {AI_INFLUENZA_INTRO_WINDOWS.map((window) => {
                const active = preferredWindow === window;
                return (
                  <Pressable
                    key={window}
                    onPress={() => setPreferredWindow(window)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    style={[styles.chip, active ? styles.chipActive : null]}
                  >
                    <Text style={[styles.chipLabel, active ? styles.chipLabelActive : null]}>
                      {AI_INFLUENZA_INTRO_WINDOW_LABELS[window]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={goal}
              onChangeText={setGoal}
              placeholder="Worum geht es? (optional, max. 1200 Zeichen)"
              placeholderTextColor={glassSurface.textMuted}
              multiline
              numberOfLines={4}
              maxLength={AI_INFLUENZA_INTRO_LIMITS.goal.max}
              accessibilityLabel="Anliegen"
              testID="intro-goal"
            />

            <Pressable
              onPress={() => setConsent((current) => !current)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: consent }}
              style={styles.consentRow}
              testID="intro-consent"
            >
              <View style={[styles.checkbox, consent ? styles.checkboxActive : null]}>
                {consent ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
              <Text style={styles.consentText}>
                Ich bin einverstanden, dass meine Angaben zur Kontaktaufnahme gespeichert werden. Keine Weitergabe
                an Dritte, kein automatischer Werbeversand.
              </Text>
            </Pressable>

            {requestIntro.isPending ? (
              <View style={styles.busyRow}>
                <ActivityIndicator color={glassPalette.cyan} />
              </View>
            ) : (
              <GlowButton
                label="Erstgespräch anfragen"
                accent="cyan"
                variant="primary"
                disabled={!canSubmit}
                onPress={submitIntroRequest}
                testID="intro-submit"
              />
            )}

            {confirmation ? <Text style={styles.success}>{confirmation}</Text> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Text style={styles.tinyNote}>
              Pflicht sind Name, E-Mail und die Einwilligung. Ohne Einwilligung wird nichts gespeichert.
            </Text>
          </GlassCard>

          <GlassCard accent="purple" style={styles.card}>
            <Text style={styles.kicker}>WAS HIER NICHT PASSIERT</Text>
            <Text style={styles.small}>
              Keine Erfolgsgarantie, keine Reichweiten-Versprechen, keine versteckten Staffelpreise. Zahlungen laufen
              ausschliesslich über Stripe; der Kauf braucht ein Konto, weil jede Lieferung einer Rechnung zugeordnet
              werden muss. Rechnungen und Kündigung findest du im Abo-Portal.
            </Text>
          </GlassCard>
        
          {checkoutError ? (
            <Text style={styles.checkoutError} accessibilityRole="alert">
              {checkoutError}
            </Text>
          ) : null}

          <LegalFooter context="AI Influenza Team" />
        </ScrollView>
      </ScreenContainer>
    </GlassBackdrop>
  );
}

function createStyles() {
  return StyleSheet.create({
    content: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 16 },
    header: { gap: 12 },
    eyebrow: { color: glassPalette.magenta, fontSize: 11, letterSpacing: 2, fontWeight: "700" },
    title: { color: glassSurface.textPrimary, fontSize: 30, fontWeight: "800", lineHeight: 36 },
    lead: { color: glassSurface.textMuted, fontSize: 15, lineHeight: 22 },
    card: { padding: 18, gap: 10 },
    checkoutError: { color: glassPalette.amber, fontSize: 13, lineHeight: 19, fontWeight: "700" },
    kicker: { color: glassPalette.magenta, fontSize: 11, letterSpacing: 1.6, fontWeight: "700" },
    row: { gap: 2, paddingTop: 6 },
    stepLabel: { color: glassSurface.textPrimary, fontSize: 14, fontWeight: "700" },
    stepDetail: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 19 },
    sectionTitle: { color: glassSurface.textPrimary, fontSize: 20, fontWeight: "800", paddingTop: 8 },
    packageHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    packageName: { color: glassSurface.textPrimary, fontSize: 18, fontWeight: "800" },
    price: { color: glassPalette.magenta, fontSize: 22, fontWeight: "800" },
    priceNote: { color: glassSurface.textMuted, fontSize: 12 },
    deliverables: { gap: 4, paddingVertical: 4 },
    deliverable: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 19 },
    small: { color: glassSurface.textMuted, fontSize: 13, lineHeight: 20 },
    input: {
      backgroundColor: glassDepth.layer,
      borderColor: glassSurface.border,
      borderRadius: glassRadii.md,
      borderWidth: 1,
      color: glassSurface.textPrimary,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    inputMultiline: { minHeight: 88, textAlignVertical: "top" },
    fieldLabel: { color: glassSurface.textMuted, fontSize: 12, letterSpacing: 0.6, paddingTop: 4 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderColor: glassSurface.border,
      borderRadius: glassRadii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    chipActive: { borderColor: glassPalette.cyan },
    chipLabel: { color: glassSurface.textMuted, fontSize: 12, fontWeight: "600" },
    chipLabelActive: { color: glassSurface.textPrimary },
    consentRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 },
    checkbox: {
      alignItems: "center",
      borderColor: glassSurface.border,
      borderRadius: 6,
      borderWidth: 1,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    checkboxActive: { borderColor: glassPalette.cyan },
    checkMark: { color: glassSurface.textPrimary, fontSize: 13, fontWeight: "800" },
    consentText: { color: glassSurface.textMuted, flex: 1, fontSize: 12, lineHeight: 18 },
    busyRow: { alignItems: "center", paddingVertical: 12 },
    success: { color: glassPalette.green, fontSize: 13, lineHeight: 19 },
    error: { color: glassPalette.red, fontSize: 13, lineHeight: 19 },
    tinyNote: { color: glassSurface.textMuted, fontSize: 11, lineHeight: 16 },
  });
}
