/**
 * Sprint 294 — EN-Sprach-Toggle: reine, deterministische Logik fuer
 * die Sprachumschaltung (DE ↔ EN).
 *
 * Datenfluss:
 *   AsyncStorage "cybersarah.lang.v1" — "de" | "en"
 *   Ohne gespeicherten Wert gilt "de" als Standard.
 *
 * Die UI liest alle Strings ueber t(key) aus dem Wörterbuch; die Logik
 * hier liefert die reine Uebersetzung, Normalisierung und Persistenz-Helfer.
 *
 * Ehrlichkeits-Grenze: Das Wörterbuch deckt die Kern-UI-Strings ab. Nicht
 * jeder Freitext (z. B. Chat-Antworten, dynamische Fehlermeldungen vom
 * Provider) wird uebersetzt — nur statische UI-Labels.
 */

export type AppLanguage = "de" | "en";

export const DEFAULT_LANGUAGE: AppLanguage = "de";
export const SUPPORTED_LANGUAGES: readonly AppLanguage[] = ["de", "en"];
export const LANGUAGE_STORAGE_KEY = "cybersarah.lang.v1";

/** Normalisiert einen rohen Storage-Wert in eine gueltige Sprache (Fallback DE). */
export function normalizeLanguage(value: unknown): AppLanguage {
  if (value === "en" || value === "de") return value;
  return DEFAULT_LANGUAGE;
}

/**
 * Umschalter: gibt die jeweils andere Sprache zurueck.
 */
export function toggleLanguage(lang: AppLanguage): AppLanguage {
  return lang === "de" ? "en" : "de";
}

/** Sprach-Display-Name fuer die UI. */
export function languageDisplayName(lang: AppLanguage): string {
  return lang === "de" ? "Deutsch" : "English";
}

/** Flag/Symbol fuer die Sprache. */
export function languageFlag(lang: AppLanguage): string {
  return lang === "de" ? "🇩🇪" : "🇬🇧";
}

/**
 * Verweis auf den anderen Modus fuer den Toggle-Button.
 * Z. B. "Switch to English" wenn aktuell DE aktiv ist.
 */
export function toggleButtonLabel(lang: AppLanguage): string {
  const other = toggleLanguage(lang);
  return lang === "de" ? `Switch to English` : `Zur Deutsch wechseln`;
}

/* ==================== Wörterbuch ==================== */

/** Schluessel fuer alle uebersetzten UI-Strings. */
export type I18nKey =
  | "app.title"
  | "app.tagline"
  | "tab.dashboard"
  | "tab.chat"
  | "tab.workspace"
  | "tab.media"
  | "tab.settings"
  | "chat.placeholder"
  | "chat.empty.title"
  | "chat.empty.subtitle"
  | "chat.empty.starter1"
  | "chat.empty.starter2"
  | "chat.empty.starter3"
  | "chat.empty.starter4"
  | "settings.language"
  | "settings.theme"
  | "settings.account"
  | "settings.logout"
  | "onboarding.welcome.title"
  | "onboarding.welcome.text"
  | "onboarding.workspace.title"
  | "onboarding.workspace.text"
  | "onboarding.theme.title"
  | "onboarding.theme.text"
  | "onboarding.next"
  | "onboarding.finish"
  | "onboarding.step1"
  | "onboarding.step2"
  | "onboarding.step3"
  | "error.fallback.title"
  | "error.fallback.text"
  | "error.retry"
  | "error.home"
  | "template.title"
  | "template.category.all"
  | "template.category.blank"
  | "template.category.dashboard"
  | "template.category.chat"
  | "template.category.media"
  | "common.loading"
  | "common.cancel"
  | "common.confirm"
  | "common.save";

type Dictionary = Record<I18nKey, string>;

const DE_DICTIONARY: Dictionary = {
  "app.title": "CyberSarah",
  "app.tagline": "Dein persönliches KI-Control-Center",
  "tab.dashboard": "Dashboard",
  "tab.chat": "Chat",
  "tab.workspace": "Workspace",
  "tab.media": "Medien",
  "tab.settings": "Einstellungen",
  "chat.placeholder": "Frage CyberSarah...",
  "chat.empty.title": "Womit kann ich helfen?",
  "chat.empty.subtitle": "Wähle einen Vorschlag oder schreib frei.",
  "chat.empty.starter1": "Erkläre mir mein aktuelles Projekt",
  "chat.empty.starter2": "Analysiere die letzte CI-Pipeline",
  "chat.empty.starter3": "Optimiere mein Onboarding",
  "chat.empty.starter4": "Fasse die letzten Commits zusammen",
  "settings.language": "Sprache",
  "settings.theme": "Design",
  "settings.account": "Konto",
  "settings.logout": "Abmelden",
  "onboarding.welcome.title": "Willkommen bei CyberSarah",
  "onboarding.welcome.text": "Dein persönliches KI-Control-Center: Agenten, Workspace, Dashboard und Qualität — alles an einem Ort.",
  "onboarding.workspace.title": "Dein Workspace",
  "onboarding.workspace.text": "Repository anbinden, Commits und Pull Requests prüfen, Qualität im Blick behalten — die Tabs führen dich durch.",
  "onboarding.theme.title": "Dein Look",
  "onboarding.theme.text": "Wähle ein Design und ob die App hell, dunkel oder dem System folgen soll. Jederzeit im Konto-Tab änderbar.",
  "onboarding.next": "Weiter",
  "onboarding.finish": "Los geht's",
  "onboarding.step1": "Schritt 1 von 3",
  "onboarding.step2": "Schritt 2 von 3",
  "onboarding.step3": "Schritt 3 von 3",
  "error.fallback.title": "Etwas ist schiefgelaufen",
  "error.fallback.text": "Die App konnte diese Ansicht nicht laden. Du kannst es erneut versuchen oder zum Hauptbildschirm zurückkehren.",
  "error.retry": "Erneut versuchen",
  "error.home": "Zum Hauptbildschirm",
  "template.title": "Vorlagen",
  "template.category.all": "Alle",
  "template.category.blank": "Leer",
  "template.category.dashboard": "Dashboard",
  "template.category.chat": "Chat",
  "template.category.media": "Medien",
  "common.loading": "Laden...",
  "common.cancel": "Abbrechen",
  "common.confirm": "Bestätigen",
  "common.save": "Speichern",
};

const EN_DICTIONARY: Dictionary = {
  "app.title": "CyberSarah",
  "app.tagline": "Your personal AI control center",
  "tab.dashboard": "Dashboard",
  "tab.chat": "Chat",
  "tab.workspace": "Workspace",
  "tab.media": "Media",
  "tab.settings": "Settings",
  "chat.placeholder": "Ask CyberSarah...",
  "chat.empty.title": "How can I help?",
  "chat.empty.subtitle": "Pick a suggestion or type freely.",
  "chat.empty.starter1": "Explain my current project",
  "chat.empty.starter2": "Analyze the latest CI pipeline",
  "chat.empty.starter3": "Optimize my onboarding",
  "chat.empty.starter4": "Summarize the latest commits",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.account": "Account",
  "settings.logout": "Sign out",
  "onboarding.welcome.title": "Welcome to CyberSarah",
  "onboarding.welcome.text": "Your personal AI control center: agents, workspace, dashboard and quality — all in one place.",
  "onboarding.workspace.title": "Your workspace",
  "onboarding.workspace.text": "Connect a repository, review commits and pull requests, keep an eye on quality — the tabs guide you through.",
  "onboarding.theme.title": "Your look",
  "onboarding.theme.text": "Choose a design and whether the app should be light, dark, or follow the system. Changeable anytime in the account tab.",
  "onboarding.next": "Next",
  "onboarding.finish": "Get started",
  "onboarding.step1": "Step 1 of 3",
  "onboarding.step2": "Step 2 of 3",
  "onboarding.step3": "Step 3 of 3",
  "error.fallback.title": "Something went wrong",
  "error.fallback.text": "The app couldn't load this view. You can try again or return to the main screen.",
  "error.retry": "Try again",
  "error.home": "Go to main screen",
  "template.title": "Templates",
  "template.category.all": "All",
  "template.category.blank": "Blank",
  "template.category.dashboard": "Dashboard",
  "template.category.chat": "Chat",
  "template.category.media": "Media",
  "common.loading": "Loading...",
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.save": "Save",
};

const DICTIONARIES: Record<AppLanguage, Dictionary> = {
  de: DE_DICTIONARY,
  en: EN_DICTIONARY,
};

/**
 * Uebersetzt einen Schluessel in der gegebenen Sprache.
 * Unbekannter Schluessel → Fallback auf DE, dann auf den Schluessel selbst.
 */
export function translate(lang: AppLanguage, key: I18nKey): string {
  const dict = DICTIONARIES[lang];
  if (dict && dict[key]) return dict[key];
  const deDict = DICTIONARIES.de;
  if (deDict && deDict[key]) return deDict[key];
  return key;
}

/** Kurzform-Helper: gibt eine t-Funktion fuer die aktuelle Sprache zurueck. */
export function createTranslator(lang: AppLanguage): (key: I18nKey) => string {
  return (key: I18nKey) => translate(lang, key);
}

/** Prueft, ob ein String eine gueltige Sprache ist. */
export function isSupportedLanguage(value: string): value is AppLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/** Alle verfuegbaren Sprachen mit Metadaten fuer die UI-Auswahl. */
export function getLanguageOptions(): { lang: AppLanguage; label: string; flag: string }[] {
  return SUPPORTED_LANGUAGES.map((lang) => ({
    lang,
    label: languageDisplayName(lang),
    flag: languageFlag(lang),
  }));
}
