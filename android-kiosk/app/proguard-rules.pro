# KioskPrintBridge - ProGuard Rules
# Keep JavaScript interface methods from being stripped
-keepclassmembers class com.menudigital.kiosk.PrintBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class com.menudigital.kiosk.AndroidConfigBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.menudigital.kiosk.PrintBridge { *; }
-keep class com.menudigital.kiosk.AndroidConfigBridge { *; }
