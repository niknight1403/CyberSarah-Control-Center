# Abhaengigkeits-Matrix (Sprint 116)

Gepflegte Kern-Abhaengigkeiten mit gepinnter Major-Version. Der Tech-Scanner
(`scripts/tech-scanner.mjs`) gleicht npm-Funde gegen diese Matrix ab; die
Issue-Ableitung (`scripts/tech-issue-deriver.mjs`) erzeugt fuer jeden
Major-Versionsprung eine Issue-Vorlage in docs/research/tech-issues/.

| Paket | Major | Bereich | Hinweis |
|---|---|---|---|
| expo | 57 | Mobile-Stack | Expo-SDK-Upgrade fuehrt React-Native/Podfiles mit; Upgrade nur mit naechtem Dev-Build und Play-Store-Regression. |
| react-native | 0 | Mobile-Stack | Wird mit dem Expo-SDK mitgefuehrt (0.x-Zoemmer: Major = erste Zifferngruppe). |
| typescript | 7 | DevOps | tsc-clean ist Sprint-Konvention; neue Major-Version zuerst gegen die Suite pruefen. |
| drizzle-orm | 0 | Backend | Schema-Migration pruefen; Drizzle-Versionen aendern Kit-Verhalten. |
| vitest | 5 | DevOps | Suite muss ohne Konfig-Aenderung gruen bleiben. |
| stripe | 22 | Billing | Stripe-API-Versionen sind abrechnungsrelevant — Upgrade nur mit Checkout-Regression. |
| @capacitor/core | 8 | Mobile-Stack | Android-Bundle mitfuehren; native Plugins gegen Changelog pruefen. |
| @trpc/server | 11 | Backend | Router-Konventionen koennen sich aendern; tsc + Suite decken es ab. |
