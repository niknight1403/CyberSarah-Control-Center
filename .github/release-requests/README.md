# Release-Requests

`version.txt` ist ein **Mindeststand**, kein Ueberschreibrecht.

Der APK-Workflow liest die Datei (oder den `version_name`-Input), loest die
Version ueber `resolveBuildVersion` auf und erhoeht automatisch auf die
naechste freie Patch-Version, wenn die gewuenschte Version bereits als
`v<version>-apk`-Release existiert. Ein alter Pin kann damit kein bestehendes
Release mehr ueberschreiben (siehe Vorfall 02.11.2026: `v2.8.0-apk` wurde
mehrfach mit neuen Builds ueberschrieben).
