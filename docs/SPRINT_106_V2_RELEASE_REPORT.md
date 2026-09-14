# Sprint 106 — V2.0-Releasebericht

**Status:** Erfolgreich abgeschlossen · **Datum:** 14.09.2026 · **Version:** v2.0.0

Der V2.0-Stand wurde auf `main` veröffentlicht und über den GitHub-Actions-Workflow `Build Android APK` gebaut. Workflow-Run **34826107472** lief erfolgreich durch.

## Geprüfte Build-Gates

Der Workflow hat den Repository-Checkout, npm-Installation, Release-Versionierung, TypeScript-Check, Expo-Web-Export, Capacitor-Synchronisation, Debug-APK-Build, Release-Signing, APK-Signaturprüfung, AAB-Build und AAB-Signaturprüfung erfolgreich abgeschlossen.

Die Release-Version ist konsistent gesetzt:

- Expo-Version: `2.0.0`
- Android `versionName`: `2.0.0`
- Android `versionCode`: `20000`
- Paket-ID: `com.cybersarah.controlcenter`

## Download

Der Release ist unter [v2.0.0-apk auf GitHub](https://github.com/niknight1403/CyberSarah-Control-Center/releases/tag/v2.0.0-apk) veröffentlicht.

Direkter Download der signierten Release-APK: [CyberSarah-ControlCenter-v2.0.0-release.apk](https://github.com/niknight1403/CyberSarah-Control-Center/releases/download/v2.0.0-apk/CyberSarah-ControlCenter-v2.0.0-release.apk)

Zusätzlich verfügbar:

- [Debug-APK](https://github.com/niknight1403/CyberSarah-Control-Center/releases/download/v2.0.0-apk/CyberSarah-ControlCenter-v2.0.0-debug.apk)
- [Signiertes Play-Store-AAB](https://github.com/niknight1403/CyberSarah-Control-Center/releases/download/v2.0.0-apk/CyberSarah-ControlCenter-v2.0.0-release.aab)

## Verbleibende Owner-Handoffs

Vor einem breiten Rollout sollte die signierte APK auf einem echten Android-Gerät installiert und insbesondere SecureStore, Workspace-Verbindung, Benachrichtigungen, Kamera/Mikrofon und Offline-Verhalten geprüft werden. Die Play-Store-Einreichung des AAB bleibt eine separate Aktion in der Play Console.
