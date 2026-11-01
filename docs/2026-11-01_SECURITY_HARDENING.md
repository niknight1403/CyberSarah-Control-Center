# Security-Hardening – 1. November 2026

## Umfang

Diese Änderung behandelt drei freigegebene Risiken auf einem Feature-Branch. Sie ändert weder produktive Daten noch Backups oder die Git-Historie und enthält keine Migration.

1. **Admin-Rollen:** Öffentliche lokale und Google-Registrierungen erhalten immer die Rolle `user`. Eine angeforderte `admin`-Rolle aus einem Identitäts-Upsert wird ignoriert, außer die OpenID stimmt exakt mit der explizit konfigurierten `OWNER_OPEN_ID` überein. Der bisherige fest codierte E-Mail-Fallback ist entfernt. Der bestehende serverseitige Admin-Bootstrap bleibt verfügbar.
2. **DB-Diagnose:** `/api/db-debug` bleibt durch `METRICS_TOKEN` geschützt, prüft aber ausschließlich die konfigurierte Datenbankverbindung über den regulären DB-Pool; es gibt keinen separaten Zielhost und keinen TLS-Override mehr. Host-, URL-, Datenbank-, Credential- und rohe Fehlerdetails werden nicht zurückgegeben. Die globale TLS-/Zertifikatsvalidierung der DB-Verbindung wurde nicht geändert; sie folgt weiterhin der bestehenden `DATABASE_URL`-/SSL-Konfiguration und ist separat zu prüfen.
3. **Stripe-Zahlung:** `active` und `trialing` allein setzen keinen AI-Influenza-Auftrag auf `paid`. Freischaltung erfordert eine positive, als bezahlt bestätigte Stripe-Rechnung, die auf die erwartete Subscription und den Auftrag passt. Der Beleg der letzten bezahlten Rechnung wird im bestehenden JSON-Auftragspayload gespeichert; es ist keine Schemaänderung nötig. Delivery-Aufgaben behalten ihre bestehenden deduplizierten Schlüssel.

## Betriebs-/Rollout-Hinweise

- Vor einem Deployment muss der legitime Admin-Zugang über den bestehenden expliziten Admin-Bootstrap bzw. eine verifizierte `OWNER_OPEN_ID` sichergestellt werden. Bestehende Datenbankrollen wurden hier bewusst nicht verändert.
- Falls ein Konto in der Produktion früher durch die alte Standard-E-Mail-Regel unberechtigt die Rolle `admin` erhalten hat, nimmt dieser Code-Fix die bestehende Rolle nicht automatisch zurück. Die produktive Adminliste ist deshalb vor dem Rollout durch einen berechtigten Betreiber zu prüfen.
- Der neue Zahlungsgate setzt voraus, dass Stripe-`invoice.paid`-Webhooks zugestellt werden und Subscription-Metadaten `businessUnit`, `orderId` sowie Subscription-ID enthalten. Nullbetrag-/Testrechnungen schalten reale Lieferaufträge nicht frei.
- Nicht Teil dieser Änderung: Prüfung, Entfernung oder Historienbereinigung der getrackten `.env.bak-dbfix`-/SQLite-Dateien sowie eine mögliche Geheimnisrotation; diese Dateien blieben unangetastet.

## Lokale Prüfungen

- `npm test -- --reporter=dot` – bestanden: **409 Testdateien, 2.986 Tests**.
- `npm run check` – bestanden.
- `npm run build` – bestanden.
- `npm run lint` – ohne Fehler; der Projektlauf meldet **122 Warnungen**.
- Keine Stripe-/Google-/CRM-API, Live-Datenbank, Zahlung, Migration, Veröffentlichung oder Produktionsumgebung aufgerufen.
