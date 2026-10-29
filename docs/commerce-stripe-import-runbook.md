# Commerce Studio: Stripe Katalog/Preise – sichere Betriebsanleitung

Stand: 29.10.2026. PR #130 ist ein Draft. Keine Berechtigung zum automatischen Live-Preiswechsel.

## Datenfluss
1. Ausschliesslich eine authentifizierte Admin-Rolle darf den Import manuell starten.
2. Nur Stripe products.list und prices.list werden aufgerufen. Es gibt keine externen Stripe-Write-Operationen.
3. Angebote werden in derselben Revenue-Offer-Tabelle als inaktive Entwuerfe gespeichert; bestehende Stripe-Kunden und Abonnements bleiben unveraendert.
4. Ein DB Advisory Lock und stabile Stripe-IDs verhindern doppelte Importe bei wiederholtem Ausloesen.
5. Preise bleiben in der Ursprungswaehrung als kleinste Waehrungseinheit. Der lokale EUR-Preis wird nur bei gueltigem aktivem EUR-Standardpreis angezeigt.
6. Produktvarianten notieren Preis-ID, Waehrung, Steuerverhalten und das Intervall wiederkehrender Zahlungen. Abonnementpreise werden nicht als Einmalpreise bezeichnet.
7. Stripe-Metadaten zu Bildrechten gelten als unverifizierte Behauptungen. Mediennutzung und Affiliate-Disclosure erfordern eigene Freigaben.
8. Quelle und Importzeit bleiben in der Metadaten-Spur sichtbar. Unvollstaendige Pagination ist als unvollstaendig markiert und darf nicht als vollstaendiger Katalog ausgegeben werden.

## Sicherheit
- STRIPE_SECRET_KEY nur als Server-Secret. Zuerst Test-Mode-Schluessel verwenden und keine Secrets in Logs oder GitHub ablegen.
- Ein importiertes Produkt ist nicht automatisch veroeffentlicht, beworben oder kaufbar.
- Kein Auto-Publishing und kein Preis-A/B-Rollout ohne gesonderte Freigabe; alle Content-Artefakte in der bestehenden Draft-Queue belassen.
- Bei DSGVO-, Steuer- oder Werbepruefungen sind echte Rechts- und Datenquellen erforderlich. Die Importfunktion ist keine Compliance-Zertifizierung.

## Qualitaetsgates
- tests/commerce-catalog-logic.test.ts: 100 Produkte, Dubletten, EUR/USD, Typklassifizierung, Affiliate und Bildrechte.
- tests/commerce-price-catalog-logic.test.ts: mindestens 101 Preisvarianten, Multi-Currency, wiederkehrende Preise, abgebrochene Pagination.
- npm run check, npm run lint und npm test muessen am finalen Commit tatsaechlich erfolgreich sein.
- Echte Stripe-Testmode-Integration mit mehreren Preisen muss spaeter mit passenden Zugangsdaten durchgefuehrt werden.

## Stop und Rollback
- COMMERCE_STUDIO_AUTOPILOT=off deaktiviert den periodischen Draft-Generator nach Server-Neustart.
- Neue Importentwuerfe muessen fuer eine Datenbank-Ruecknahme einzeln nach Stripe-IDs geprueft werden. Kein pauschales Loeschen oder Update von Live-Produkten.
- Git-Revert alleine macht zuvor importierte Draft-Datensaetze nicht rueckgaengig.

## Offene Blocker
Live-Stripe-Testmode-Test, DSGVO/Steuer-Abnahme, Reels-Publishing-End-to-End, Web-Deploy und installierte Android-APK sind NICHT nachgewiesen. Solange diese Nachweise fehlen, bleibt PR #130 im Draft.