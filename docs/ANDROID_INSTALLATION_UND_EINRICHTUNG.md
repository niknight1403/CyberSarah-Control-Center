# CyberSarah Control Center auf Android installieren und einrichten

**App:** CyberSarah Control Center  
**Empfohlene Variante:** Admin-APK, Release `v2.5.9`  
**Paket-ID:** `com.cybersarah.controlcenter`  
**Backend:** `https://app.cybersarah-ki.com`

Diese Anleitung beschreibt die Installation der signierten Admin-APK außerhalb des Google Play Stores und die anschließende Ersteinrichtung auf einem Android-Gerät.

## 1. Welche Datei soll installiert werden?

Für den normalen täglichen Betrieb wird die **Admin-APK** empfohlen:

[CyberSarah Control Center v2.5.9 – Admin-APK herunterladen](https://github.com/niknight1403/CyberSarah-Control-Center/releases/download/v2.5.9-apk/CyberSarah-ControlCenter-v2.5.9-admin.apk)

Die Admin-APK ist ein signierter Release-Build mit dem vollständigen Funktionsumfang. Entwicklungsanzeigen sind ausgeblendet, damit die Oberfläche für den täglichen Einsatz übersichtlich bleibt.

Die **Development-APK** ist ausschließlich für Entwicklung und Diagnose vorgesehen. Sie enthält zusätzliche Entwicklungsanzeigen und ist nicht die empfohlene Version für den normalen Betrieb.

> Die Datei `CyberSarah-ControlCenter-v2.5.9-release.aab` ist für den Google Play Store bestimmt. Sie kann nicht direkt wie eine APK auf dem Gerät installiert werden.

## 2. Voraussetzungen

Vor der Installation sollte das Gerät folgende Bedingungen erfüllen:

- Android 7.0 oder neuer; die aktuelle APK ist für die im Projekt konfigurierte Android-Version gebaut.
- Mindestens etwa 100 MB freier Speicherplatz.
- Eine stabile WLAN- oder Mobilfunkverbindung für Download, Anmeldung und Backend-Zugriff.
- Ein gültiger CyberSarah- beziehungsweise Administratorzugang.
- Die Möglichkeit, die Installation der APK aus der verwendeten Downloadquelle einmalig zu erlauben.

Die APK wird außerhalb des Play Stores verteilt. Android bezeichnet solche Dateien als **Apps aus unbekannten Quellen**. Diese Einstellung darf gezielt nur für die Quelle aktiviert werden, aus der die APK tatsächlich geöffnet wird, beispielsweise Chrome oder die Dateien-App.

## 3. APK direkt auf dem Android-Gerät installieren

### Schritt 1: APK herunterladen

1. Öffne auf dem Android-Gerät den oben verlinkten GitHub-Release.
2. Lade die Datei `CyberSarah-ControlCenter-v2.5.9-admin.apk` herunter.
3. Öffne nach Abschluss des Downloads die Benachrichtigung oder die Datei im Download-Ordner.

Wenn der Browser vor der Datei warnt, prüfe den Dateinamen. Für die tägliche Nutzung muss er auf `-admin.apk` enden. Die Development-Datei sollte nicht versehentlich installiert werden.

### Schritt 2: Installation aus dieser Quelle erlauben

Android zeigt möglicherweise die Meldung, dass die Installation aus dieser Quelle nicht erlaubt ist. Führe dann diese Schritte aus:

1. Tippe auf **Einstellungen** oder **Einstellungen öffnen**.
2. Aktiviere **Von dieser Quelle zulassen** für die App, mit der du die APK geöffnet hast.
3. Gehe zurück zur APK und tippe erneut auf **Installieren**.
4. Warte, bis Android die Installation abgeschlossen hat.
5. Deaktiviere **Von dieser Quelle zulassen** nach der Installation wieder, wenn du keine weiteren APKs aus dieser Quelle installieren möchtest.

Die genaue Bezeichnung kann je nach Hersteller abweichen. Häufiger Pfad ist **Einstellungen → Sicherheit und Datenschutz → Weitere Sicherheitseinstellungen → Apps aus unbekannten Quellen installieren**.

### Schritt 3: Installation abschließen

1. Bestätige die Android-Sicherheitsabfrage.
2. Tippe auf **Installieren**.
3. Tippe nach erfolgreicher Installation auf **Öffnen**.

Wenn bereits eine ältere Version mit derselben Paket-ID installiert ist, wird sie normalerweise als Update behandelt. Deinstalliere die alte Version nicht vor dem Update, weil dadurch lokale App-Daten verloren gehen können.

## 4. Alternative Installation über einen Computer

Falls der Download auf dem Gerät nicht möglich ist, kann die APK per USB übertragen werden:

1. Lade die Admin-APK auf einen Computer herunter.
2. Verbinde das Android-Gerät per USB.
3. Wähle am Gerät **Dateiübertragung** aus.
4. Kopiere die APK in den Ordner **Download** des Geräts.
5. Öffne auf dem Gerät die Dateien-App.
6. Öffne den Download-Ordner und starte die APK.
7. Erlaube die Installation für die Dateien-App und schließe die Installation ab.
8. Deaktiviere die Installationsberechtigung anschließend wieder.

## 5. Erste Einrichtung in der App

### Netzwerkverbindung prüfen

Öffne die App zunächst bei aktiver Internetverbindung. Die installierte Produktionsvariante verwendet standardmäßig das Backend:

`https://app.cybersarah-ki.com`

Wenn das Gerät eine VPN-, DNS- oder Unternehmensrichtlinie verwendet, muss diese Adresse erreichbar sein. Ein lokaler Server auf dem Entwicklungscomputer ist für die veröffentlichte Admin-APK nicht erforderlich.

### Anmeldung durchführen

1. Öffne **CyberSarah Control Center**.
2. Warte, bis der Startbildschirm geladen ist.
3. Öffne den Bereich **Konto** oder den Anmeldebildschirm.
4. Melde dich mit dem bereitgestellten Administratorzugang an.
5. Falls ein Sicherheits- oder OAuth-Dialog erscheint, schließe die Anmeldung vollständig ab und kehre danach zur App zurück.
6. Prüfe, ob Dashboard, Chat und Agentenansicht Daten laden.

Verwende niemals ein Administratorkennwort in Screenshots, Chatnachrichten oder öffentlichen Dokumenten. Wenn der Zugang noch nicht eingerichtet ist, muss der Projektadministrator ihn über die bestehende Serververwaltung anlegen oder zurücksetzen.

### App-Berechtigungen einrichten

Android fragt Berechtigungen nur an, wenn eine Funktion sie benötigt. Empfohlen ist folgende Auswahl:

| Berechtigung | Zweck | Empfehlung |
|---|---|---|
| Benachrichtigungen | Hinweise zu Aufgaben, Agenten und Systemereignissen | Erlauben, wenn zeitnahe Statusmeldungen benötigt werden |
| Mikrofon | Sprachfunktionen beziehungsweise Audioeingabe | Nur erlauben, wenn diese Funktion genutzt wird |
| Kamera oder Medien | Je nach verwendeter Upload- oder Inhaltsfunktion | Nur bei tatsächlichem Bedarf erlauben |
| Netzwerk | Verbindung zum CyberSarah-Backend | Für die App erforderlich; Android verwaltet dies automatisch |

Berechtigungen können später unter **Einstellungen → Apps → CyberSarah Control Center → Berechtigungen** geändert werden.

## 6. Funktionsprüfung nach der Installation

Führe nach der Anmeldung diese kurze Prüfung durch:

1. **Dashboard:** Werden die Hauptkacheln und der aktuelle Status geladen?
2. **Chat:** Kann der Chat geöffnet werden und erscheint eine verständliche Antwort oder ein klarer Verbindungsstatus?
3. **Agent:** Lässt sich die Agentenübersicht öffnen?
4. **Konto:** Wird der angemeldete Benutzer korrekt angezeigt?
5. **Benachrichtigungen:** Erscheinen Benachrichtigungen, sofern die Berechtigung erteilt wurde?
6. **Offline-Verhalten:** Zeigt die App bei kurzzeitig unterbrochener Verbindung eine verständliche Fehlermeldung statt eines leeren Bildschirms?

Wenn diese Punkte funktionieren, ist die Android-Installation grundsätzlich abgeschlossen.

## 7. Häufige Probleme und Lösungen

### „App nicht installiert“

Prüfe zunächst, ob genügend Speicher vorhanden ist und ob bereits eine inkompatible Version installiert ist. Lade die Admin-APK erneut herunter und öffne ausschließlich die Datei mit der Endung `-admin.apk`. Bei einer vorhandenen alten Testversion kann es notwendig sein, diese zu deinstallieren; sichere vorher alle benötigten lokalen Daten.

### Android blockiert die Installation

Aktiviere die Installationsberechtigung für genau die Quelle, aus der die Datei geöffnet wird. Wenn die APK aus Chrome heruntergeladen wurde, muss Chrome die Berechtigung erhalten. Wenn sie über die Dateien-App geöffnet wird, muss die Dateien-App die Berechtigung erhalten.

### Die App öffnet sich, aber Daten werden nicht geladen

Prüfe WLAN oder Mobilfunk, deaktiviere testweise ein VPN und öffne `https://app.cybersarah-ki.com` im Browser. Wenn die Website ebenfalls nicht erreichbar ist, liegt die Ursache wahrscheinlich bei Netzwerk oder Backend und nicht bei der APK.

### Anmeldung schlägt fehl

Prüfe, ob der richtige Administratorzugang verwendet wird. Kopiere keine Leerzeichen vor oder nach der E-Mail-Adresse. Wenn der Zugang serverseitig gesperrt oder noch nicht angelegt ist, muss das Kennwort über die Serververwaltung zurückgesetzt werden.

### Benachrichtigungen erscheinen nicht

Öffne **Einstellungen → Apps → CyberSarah Control Center → Benachrichtigungen** und aktiviere die gewünschten Benachrichtigungen. Prüfe zusätzlich, ob der Energiesparmodus die Hintergrundaktivität der App einschränkt.

### Nach einem Update fehlen Daten

Installiere Updates über die bestehende App, ohne die alte Version vorher zu deinstallieren. Eine Deinstallation löscht normalerweise lokale App-Daten. Serverseitige Daten bleiben davon unberührt, sofern sie im Backend gespeichert sind.

## 8. Sicherheitshinweise

Installiere nur APKs aus dem offiziellen [GitHub-Release des Control Centers](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.5.9-apk). Teile die APK nicht über unbekannte Downloadportale weiter.

Für die Admin-APK des Releases `v2.5.9` kann der Download mit folgendem SHA-256-Hash geprüft werden:

```text
4c161b4291c49ed268cc13a3216995933dab868bcb3e2c5bf4ef64b005d6889a
```

Unter Windows kann der Hash beispielsweise mit `certutil -hashfile <datei> SHA256` geprüft werden. Unter macOS oder Linux funktioniert `sha256sum <datei>`.

Nach der Installation sollte die Berechtigung für unbekannte Quellen wieder deaktiviert werden. Aktualisiere die App nur über einen neuen offiziellen Release und bewahre Administratorzugänge nicht in ungeschützten Notizen auf.

## 9. Update auf eine neue APK-Version

Bei einer neuen Release-Version gehst du genauso vor wie bei der Erstinstallation:

1. Neue Admin-APK aus dem offiziellen GitHub-Release herunterladen.
2. Dateinamen und Release-Version prüfen.
3. APK öffnen und das Update bestätigen.
4. App starten und erneut anmelden, falls Android dies verlangt.
5. Dashboard, Chat und Agenten kurz prüfen.

Die Paket-ID bleibt bei regulären Updates `com.cybersarah.controlcenter`. Dadurch erkennt Android die Datei als Update der bestehenden App.

## 10. Technischer Release-Nachweis

Die empfohlene Admin-APK wurde im GitHub-Actions-Workflow **Build Android APK** gebaut. Der Lauf hat TypeScript-Check, Web-Export, Capacitor-Synchronisierung, Release-Signaturprüfung und AAB-Erstellung erfolgreich abgeschlossen.

Der vollständige Release mit Admin-APK, Development-APK und Play-Store-AAB ist hier verfügbar:

[CyberSarah Control Center v2.5.9 – GitHub Release](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.5.9-apk)

## Referenzen

[1]: https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.5.9-apk "CyberSarah Control Center v2.5.9 Android Release"

[2]: https://github.com/niknight1403/CyberSarah-Control-Center "CyberSarah Control Center Repository"

[3]: https://developer.android.com/privacy-and-security/risks/sideloading "Android Developers: Sideloading and installation security"
