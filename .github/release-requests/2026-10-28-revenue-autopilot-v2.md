# CyberSarah Revenue Autopilot 2.0 release request

Build the production Android artifacts for the merged Revenue Autopilot 2.0 release.

Required gates:
- Admin release APK, signed and apksigner-verified
- Google Play release AAB, jarsigner-verified
- Development APK
- Web export smoke gate
- Package: com.cybersarah.controlcenter
- Version must remain >= 2.7 (current app line is 3.x)
- Source must be the merged main commit
