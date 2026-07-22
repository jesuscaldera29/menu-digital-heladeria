package com.menudigital.kiosk

import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread

/**
 * PrintBridge — Native thermal printer bridge exposed to JavaScript.
 *
 * JavaScript calls:
 *   window.AndroidPrint.printTicket(jsonString)
 *   window.AndroidPrint.printComanda(jsonString)
 *   window.AndroidPrint.testPrint()
 *   window.AndroidPrint.isAvailable()  → "true"
 */
class PrintBridge(private val config: ConfigManager) {

    @JavascriptInterface
    fun isAvailable(): String = "true"

    @JavascriptInterface
    fun printTicket(jsonString: String): String {
        return try {
            val data = JSONObject(jsonString)
            val bytes = EscPosBuilder.buildTicket(data, config)
            sendToPrinter(bytes)
            "OK"
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun printComanda(jsonString: String): String {
        return try {
            val data = JSONObject(jsonString)
            val bytes = EscPosBuilder.buildComanda(data, config)
            sendToPrinter(bytes)
            "OK"
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun printReport(jsonString: String): String {
        return try {
            val data = JSONObject(jsonString)
            val bytes = EscPosBuilder.buildReport(data, config)
            sendToPrinter(bytes)
            "OK"
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    @JavascriptInterface
    fun testPrint(): String {
        return try {
            val builder = EscPosBuilder(config.getPaperWidth())
            builder.init()
                .alignCenter()
                .doubleSize(true)
                .textLine("** KIOSK PRINT **")
                .normalSize()
                .newline()
                .textLine("Prueba de impresion exitosa!")
                .newline()
                .textLine("IP: ${config.getPrinterIp()}")
                .textLine("Puerto: ${config.getPrinterPort()}")
                .newline()
                .textLine(java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date()))
                .newline()
                .separator()
                .textLine("Todo funciona correctamente")
                .newline()

            if (config.getBeepOnPrint()) builder.beep(1, 2)
            if (config.getAutoCut()) builder.cut()

            sendToPrinter(builder.build())
            "OK"
        } catch (e: Exception) {
            "ERROR: ${e.message}"
        }
    }

    private fun sendToPrinter(data: ByteArray) {
        val ip = config.getPrinterIp()
        val port = config.getPrinterPort()

        // Run on a background thread (network on main thread throws exception)
        val result = arrayOfNulls<Exception>(1)
        val t = thread {
            var socket: Socket? = null
            try {
                socket = Socket()
                socket.connect(InetSocketAddress(ip, port), 10000) // 10s timeout
                socket.soTimeout = 10000
                val out: OutputStream = socket.getOutputStream()
                out.write(data)
                out.flush()
            } catch (e: Exception) {
                result[0] = e
            } finally {
                try { socket?.close() } catch (_: Exception) {}
            }
        }
        t.join(15000) // Wait max 15s
        if (t.isAlive) {
            t.interrupt()
            throw Exception("Timeout: No se pudo conectar a la impresora en $ip:$port")
        }
        result[0]?.let { throw it }
    }
}
