# CyberSarah Control Center — R8/ProGuard-Regeln (Sprint 72)
# Capacitor-Wrapper um einen Expo-Web-Export (WebView-App).

# Stack-Trace-Analyse: Zeilennummern behalten, Quellnamen kürzen.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# AndroidX/WebView: JS-Bridge und generierte Klassen nicht wegoptimieren.
-keep class * extends android.webkit.WebViewClient { *; }
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor: Plugin-Registry per Reflexion — Klassen und Konstruktoren behalten.
-keep class com.getcapacitor.** { *; }
-dontwarn com.getcapacitor.**

# Kotlin-Metadaten (Capacitor nutzt Kotlin-Plugins) nicht entfernen.
-keepattributes KotlinMetadata, RuntimeVisibleAnnotations,AnnotationDefault
-dontwarn org.jetbrains.annotations.**
