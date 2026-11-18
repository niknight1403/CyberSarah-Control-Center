# Android / APK telemetry contract

The CyberSarah mobile app should report to the same observability hub using the existing crash-reporting integration or an OpenTelemetry-compatible mobile exporter.

Required dimensions:
- app identifier, semantic version and build number;
- OS version and device class (not serial number or advertising ID);
- release channel and environment;
- exception fingerprint, sanitized stack trace and performance span;
- timestamp and sampled session identifier generated specifically for telemetry.

Privacy and safety:
- redact authorization headers, cookies, tokens, email addresses, payment data and user-entered form content;
- do not log raw API request/response bodies;
- use sampling and bounded payload sizes;
- attach Android ProGuard/R8 mapping files to the corresponding release for native stack deobfuscation;
- separate test and production telemetry environments.

The repository already exposes a crash-reporting router. This document defines the export contract; the Android native SDK/exporter wiring, mapping-file upload and a real APK crash round-trip still require implementation and device verification.
