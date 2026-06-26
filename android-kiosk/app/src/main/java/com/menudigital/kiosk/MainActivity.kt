package com.menudigital.kiosk

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.*
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var configManager: ConfigManager
    private lateinit var printBridge: PrintBridge

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Fullscreen immersive mode
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.hide(WindowInsetsCompat.Type.systemBars())
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

        // Keep screen on while app is active
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_main)

        configManager = ConfigManager(this)
        printBridge = PrintBridge(configManager)

        webView = findViewById(R.id.webView)
        setupWebView()
        loadKioskUrl()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = true

            // Modern user agent
            userAgentString = userAgentString + " KioskPrintBridge/1.0"
        }

        // Register JavaScript interfaces
        webView.addJavascriptInterface(printBridge, "AndroidPrint")
        webView.addJavascriptInterface(AndroidConfigBridge(configManager, webView), "AndroidConfig")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Inject a flag so JS knows it's running inside the APK
                view?.evaluateJavascript(
                    "window.__ANDROID_KIOSK__ = true; console.log('[AndroidKiosk] Bridge activo');",
                    null
                )
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                // Only handle main frame errors
                if (request?.isForMainFrame == true) {
                    view?.loadData(
                        """
                        <html><body style="display:flex;align-items:center;justify-content:center;height:100vh;
                        font-family:sans-serif;background:#111;color:white;text-align:center;padding:40px;">
                        <div>
                            <h1 style="font-size:48px;">⚠️</h1>
                            <h2>Sin Conexión a Internet</h2>
                            <p style="color:#999;">Verifica tu conexión WiFi y presiona el botón para reintentar.</p>
                            <button onclick="location.reload()" style="margin-top:20px;padding:16px 32px;
                            background:#ea580c;color:white;border:none;border-radius:12px;font-size:18px;
                            font-weight:bold;cursor:pointer;">🔄 Reintentar</button>
                        </div>
                        </body></html>
                        """.trimIndent(),
                        "text/html", "utf-8"
                    )
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(
                view: WebView?, url: String?, message: String?, result: JsResult?
            ): Boolean {
                // Use default browser alert behavior
                return super.onJsAlert(view, url, message, result)
            }

            override fun onJsPrompt(
                view: WebView?, url: String?, message: String?,
                defaultValue: String?, result: JsPromptResult?
            ): Boolean {
                // Use default browser prompt behavior (needed for IP config dialog)
                return super.onJsPrompt(view, url, message, defaultValue, result)
            }
        }
    }

    private fun loadKioskUrl() {
        val url = configManager.getKioskUrl()
        webView.loadUrl(url)
    }

    @Deprecated("Use OnBackPressedDispatcher")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }
}
