# Android APK – Mobile UI & Workspace Fix

Release-Request nach Merge der PRs #89–#92.

- Mobile-first: Navigation, kompakte KPI-Kacheln, größere Touch-Ziele.
- Status: kein irreführendes Grün bei nicht erreichbarem Workspace.
- Workspace: öffentlicher Read-only-Healthcheck mit Browser-CORS, geschützte Routen unverändert.
- Android: Admin-APK und Dev-APK plus signiertes AAB über build-apk.yml erzeugen.

Abnahme: CI, Android Build, Signaturprüfung und tatsächliche GitHub-Release-Assets müssen erfolgreich sein. Kein E2E- oder Gerätestatus ohne Messung behaupten.
