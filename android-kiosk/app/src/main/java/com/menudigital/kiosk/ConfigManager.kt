package com.menudigital.kiosk

import android.content.Context
import android.content.SharedPreferences
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * ConfigManager — Persistent configuration via SharedPreferences.
 *
 * Stores printer IP, port, paper width, and kiosk URL.
 * All values survive app restarts and device reboots.
 */
class ConfigManager(context: Context) {

    companion object {
        private const val PREFS_NAME = "kiosk_printbridge_config"
        private const val KEY_PRINTER_IP = "printer_ip"
        private const val KEY_PRINTER_PORT = "printer_port"
        private const val KEY_PAPER_WIDTH = "paper_width"
        private const val KEY_AUTO_CUT = "auto_cut"
        private const val KEY_BEEP_ON_PRINT = "beep_on_print"
        private const val KEY_KIOSK_URL = "kiosk_url"

        // Defaults
        private const val DEFAULT_PRINTER_IP = "192.168.20.40"
        private const val DEFAULT_PRINTER_PORT = 9100
        private const val DEFAULT_PAPER_WIDTH = 48
        private const val DEFAULT_KIOSK_URL = "https://menu-digital-pro.vercel.app/kiosk.html"
    }

    private val prefs: SharedPreferences =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // === Getters ===
    fun getPrinterIp(): String = prefs.getString(KEY_PRINTER_IP, DEFAULT_PRINTER_IP) ?: DEFAULT_PRINTER_IP
    fun getPrinterPort(): Int = prefs.getInt(KEY_PRINTER_PORT, DEFAULT_PRINTER_PORT)
    fun getPaperWidth(): Int = prefs.getInt(KEY_PAPER_WIDTH, DEFAULT_PAPER_WIDTH)
    fun getAutoCut(): Boolean = prefs.getBoolean(KEY_AUTO_CUT, true)
    fun getBeepOnPrint(): Boolean = prefs.getBoolean(KEY_BEEP_ON_PRINT, true)
    fun getKioskUrl(): String = prefs.getString(KEY_KIOSK_URL, DEFAULT_KIOSK_URL) ?: DEFAULT_KIOSK_URL

    // === Setters ===
    fun setPrinterIp(ip: String) = prefs.edit().putString(KEY_PRINTER_IP, ip).apply()
    fun setPrinterPort(port: Int) = prefs.edit().putInt(KEY_PRINTER_PORT, port).apply()
    fun setPaperWidth(width: Int) = prefs.edit().putInt(KEY_PAPER_WIDTH, width).apply()
    fun setAutoCut(enabled: Boolean) = prefs.edit().putBoolean(KEY_AUTO_CUT, enabled).apply()
    fun setBeepOnPrint(enabled: Boolean) = prefs.edit().putBoolean(KEY_BEEP_ON_PRINT, enabled).apply()
    fun setKioskUrl(url: String) = prefs.edit().putString(KEY_KIOSK_URL, url).apply()

    // === Get full config as JSON string ===
    fun toJson(): String {
        val obj = JSONObject()
        obj.put("printer_ip", getPrinterIp())
        obj.put("printer_port", getPrinterPort())
        obj.put("paper_width", getPaperWidth())
        obj.put("auto_cut", getAutoCut())
        obj.put("beep_on_print", getBeepOnPrint())
        obj.put("kiosk_url", getKioskUrl())
        return obj.toString()
    }
}

/**
 * AndroidConfigBridge — Exposed to JavaScript as window.AndroidConfig
 *
 * JavaScript calls:
 *   window.AndroidConfig.getConfig()         → JSON string
 *   window.AndroidConfig.setConfig(ip, port) → saves to SharedPreferences
 *   window.AndroidConfig.setKioskUrl(url)    → changes the kiosk URL
 *   window.AndroidConfig.reloadApp()         → reloads the WebView
 */
class AndroidConfigBridge(
    private val config: ConfigManager,
    private val webView: WebView
) {
    @JavascriptInterface
    fun getConfig(): String = config.toJson()

    @JavascriptInterface
    fun setConfig(ip: String, port: Int) {
        config.setPrinterIp(ip)
        config.setPrinterPort(port)
    }

    @JavascriptInterface
    fun setKioskUrl(url: String) {
        config.setKioskUrl(url)
    }

    @JavascriptInterface
    fun reloadApp() {
        webView.post {
            webView.loadUrl(config.getKioskUrl())
        }
    }
}
