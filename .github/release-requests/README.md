# Release-Requests

`version.txt` ist ein **Mindeststand**, kein Ueberschreibrecht.

Der APK-Workflow liest die Datei (oder den `version_name`-Input), loest die
Version ueber `resolveBuildVersion` auf und erhoeht automatisch auf die
naechste freie Patch-Version, wenn die gewuenschte Version bereits als
`v<version>-apk`-Release existiert. Ein alter Pin kann damit kein bestehendes
Release mehr ueberschreiben (siehe Vorfall 02.11.2026: `v2.8.0-apk` wurde
mehrfach mit neuen Builds ueberschrieben).

## Kein fester Pin mehr

`version.txt` wurde am 02.11.2026 entfernt: der Pin auf `2.8.0` hatte dafuer
gesorgt, dass jeder Build dieselbe Version erneut veroeffentlichte. Der Build
leitet die Version jetzt ausschliesslich aus den vorhandenen Releases ab und
bricht ab, wenn die ermittelte Version bereits existiert (Fail-closed-Guard in
`scripts/next-release-version.mjs` via `isVersionReleased`).
