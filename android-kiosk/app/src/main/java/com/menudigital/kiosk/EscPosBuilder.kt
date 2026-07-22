package com.menudigital.kiosk

import org.json.JSONArray
import org.json.JSONObject

/**
 * ESC/POS Command Builder for Thermal Printers.
 * Direct port from escpos-builder.js to Kotlin.
 * Produces identical output to the Windows PrintBridge.
 */
class EscPosBuilder(private val w: Int = 48) {

    companion object {
        const val ESC = 0x1B
        const val GS = 0x1D
        const val LF = 0x0A

        // ===== Sanitize text (remove accents and non-printable chars) =====
        fun san(t: String?): String {
            if (t.isNullOrEmpty()) return ""
            return t
                .replace(Regex("[áàâä]"), "a")
                .replace(Regex("[éèêë]"), "e")
                .replace(Regex("[íìîï]"), "i")
                .replace(Regex("[óòôö]"), "o")
                .replace(Regex("[úùûü]"), "u")
                .replace(Regex("[ÁÀÂÄ]"), "A")
                .replace(Regex("[ÉÈÊË]"), "E")
                .replace(Regex("[ÍÌÎÏ]"), "I")
                .replace(Regex("[ÓÒÔÖ]"), "O")
                .replace(Regex("[ÚÙÛÜ]"), "U")
                .replace("ñ", "n")
                .replace("Ñ", "N")
                .replace(Regex("[^\\x20-\\x7E]"), "")
        }

        fun fmt(n: Number): String {
            val value = n.toLong()
            return "$${String.format("%,d", value)}"
        }

        // ===== Build Ticket (receipt for customer) =====
        fun buildTicket(d: JSONObject, config: ConfigManager): ByteArray {
            val pw = config.getPaperWidth()
            val b = EscPosBuilder(pw)
            b.init().alignCenter()

            // Business name
            b.bold(true).doubleHeight(true)
                .textLine(san(d.optString("business_name", "MI NEGOCIO")).uppercase())
                .normalSize().bold(false)

            // Ticket data (sede, direccion, telefono, email)
            val ticketData = d.opt("ticket_data")
            if (ticketData != null && ticketData.toString() != "null") {
                val td = when (ticketData) {
                    is JSONObject -> ticketData
                    is String -> if (ticketData.isNotEmpty()) JSONObject(ticketData) else null
                    else -> null
                }
                td?.let {
                    if (it.has("sede")) b.textLine("Sede: " + san(it.optString("sede")))
                    if (it.has("direccion")) b.textLine(san(it.optString("direccion")))
                    if (it.has("telefono")) b.textLine("Tel: " + san(it.optString("telefono")))
                    if (it.has("email")) b.textLine(san(it.optString("email")))
                }
            }
            b.separator('-')

            // Date and Order Number
            b.textLine(d.optString("date", java.text.SimpleDateFormat("dd/MM/yyyy HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())))
            b.bold(true).doubleHeight(true)
                .textLine("ORDEN No. " + san(d.optString("ticket_id", "0000")))
                .normalSize().bold(false)

            // Delivery method
            var dt = d.optString("delivery_method", "LOCAL").uppercase()
            if (dt == "A LA MESA") {
                val addr = d.optString("address", "")
                val m = addr.replace(Regex("Mesa\\s*", RegexOption.IGNORE_CASE), "").trim()
                dt = if (m.isNotEmpty()) "MESA $m" else "MESA"
            }
            b.bold(true).textLine(dt).bold(false)
            b.separator('-')

            // Items List
            b.alignLeft()
            val items = d.optJSONArray("items")
            if (items != null) {
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    val q = item.optInt("qty", item.optInt("quantity", 1))
                    var mn = item.optString("name", "")
                    val extras = mutableListOf<String>()

                    // Parse extras from name pattern: "Name (extra1, extra2)"
                    val regex = Regex("^(.*) \\((.*)\\)$")
                    val match = regex.find(mn)
                    if (match != null) {
                        mn = match.groupValues[1]
                        extras.addAll(match.groupValues[2].split(",").map { it.trim() })
                    }

                    val price = item.optDouble("price", 0.0)
                    b.bold(true)
                        .leftRight(san(mn).uppercase() + " x $q", fmt((price * q).toLong()))
                        .bold(false)

                    extras.forEach { e ->
                        b.leftRight("  - " + san(e) + " x $q", fmt(0))
                    }
                }
            }

            b.newline()
            b.alignCenter()
            b.separator('-')

            // Pricing breakdown
            val total = d.optDouble("total", 0.0)
            val deliveryFee = d.optDouble("delivery_fee", 0.0)
            val discount = d.optDouble("discount", 0.0)
            val subtotal = total - deliveryFee + discount

            b.leftRight("Subtotal", fmt(subtotal.toLong()))
            if (deliveryFee > 0) {
                b.leftRight("Domicilio/Envio", fmt(deliveryFee.toLong()))
            }
            if (discount > 0) {
                b.leftRight("Descuento", "-" + fmt(discount.toLong()))
            }
            b.bold(true).doubleHeight(true)
                .leftRight("TOTAL A PAGAR", fmt(total.toLong()))
                .normalSize().bold(false)
            b.separator('-')

            // Payment breakdown
            val paymentMethod = san(d.optString("payment_method", "Pendiente")).uppercase()
            val cashReceived = d.optDouble("cash_received", total)
            b.leftRight("METODO DE PAGO:", paymentMethod)
            b.leftRight("VALOR RECIBIDO:", fmt(cashReceived.toLong()))
            val change = cashReceived - total
            b.bold(true)
                .leftRight("CAMBIO:", fmt(if (change > 0) change.toLong() else 0))
                .bold(false)

            // Kiosk cashier warning
            if (paymentMethod == "PENDIENTE") {
                b.newline()
                b.alignCenter().bold(true)
                    .textLine("*** FAVOR LLEVAR TICKET A CAJA ***")
                    .bold(false)
                b.alignCenter().bold(true)
                    .textLine("***     PARA PROCESAR PAGO     ***")
                    .bold(false)
                b.newline()
            }

            b.separator('-')
            b.newline().alignCenter()
                .textLine(san(d.optString("footer", "Gracias por su compra!")))
                .newline()

            if (config.getBeepOnPrint()) b.beep(2, 3)
            if (config.getAutoCut()) b.cut()

            return b.build()
        }

        // ===== Build Comanda (kitchen order - no prices) =====
        fun buildComanda(d: JSONObject, config: ConfigManager): ByteArray {
            val pw = config.getPaperWidth()
            val b = EscPosBuilder(pw)
            b.init().alignCenter().textLine("Comanda")

            val ticketId = d.optString("ticket_id", "")
            if (ticketId.isNotEmpty()) {
                b.textLine("Orden # " + san(ticketId))
            }

            var dt = d.optString("delivery_method", "LOCAL").uppercase()
            if (dt == "A LA MESA") {
                val addr = d.optString("address", "")
                val m = addr.replace(Regex("Mesa\\s*", RegexOption.IGNORE_CASE), "").trim()
                dt = if (m.isNotEmpty()) "MESA $m" else "MESA"
            }

            b.newline()
            b.doubleSize(true).bold(true).alignCenter().textLine(dt).normalSize().bold(false)
            b.newline()
            b.newline()
            b.alignLeft()

            val time = d.optString("time", d.optString("date",
                java.text.SimpleDateFormat("HH:mm", java.util.Locale.getDefault()).format(java.util.Date())
            ))
            b.textLine(time)

            val items = d.optJSONArray("items")
            if (items != null) {
                b.doubleHeight(true)
                for (i in 0 until items.length()) {
                    val item = items.getJSONObject(i)
                    val q = item.optInt("qty", item.optInt("quantity", 1))
                    var mn = item.optString("name", "")
                    val extras = mutableListOf<String>()

                    val regex = Regex("^(.*) \\((.*)\\)$")
                    val match = regex.find(mn)
                    if (match != null) {
                        mn = match.groupValues[1]
                        extras.addAll(match.groupValues[2].split(",").map { it.trim() })
                    }

                    b.textLine("* " + san(mn).uppercase() + " x $q")
                    extras.forEach { e ->
                        b.textLine("  " + san(e).uppercase() + " x $q")
                    }
                }
                b.normalSize()
            }

            b.newline(2)
            if (config.getBeepOnPrint()) b.beep(3, 5)
            if (config.getAutoCut()) b.cut()

        // ===== Build Report (Z-Report) =====
        fun buildReport(d: JSONObject, config: ConfigManager): ByteArray {
            val pw = config.getPaperWidth()
            val b = EscPosBuilder(pw)
            b.init().alignCenter()

            // Header
            b.bold(true).doubleHeight(true).textLine(san(d.optString("business_name", "MI NEGOCIO")).uppercase()).normalSize().bold(false)
            b.bold(true).textLine("CORTE DE CAJA Z").bold(false)
            b.textLine("Fecha: " + d.optString("date", ""))
            b.separator('-')

            b.leftRight("Periodo:", san(d.optString("period", "Hoy")))
            b.leftRight("Pedidos Totales:", d.optString("total_orders", "0"))
            b.leftRight("Ticket Promedio:", fmt(d.optDouble("average_ticket", 0.0).toLong()))
            b.separator('-')

            b.alignCenter().bold(true).textLine("ORIGEN DE VENTAS").bold(false)
            b.leftRight("Caja (POS):", fmt(d.optDouble("origin_pos", 0.0).toLong()))
            b.leftRight("Kiosko:", fmt(d.optDouble("origin_kiosk", 0.0).toLong()))
            b.leftRight("Menu QR:", fmt(d.optDouble("origin_qr", 0.0).toLong()))
            b.separator('-')

            // Products sold
            b.alignCenter().bold(true).textLine("PRODUCTOS VENDIDOS").bold(false)
            val ps = d.optJSONObject("productsSold")
            if (ps != null && ps.length() > 0) {
                val keys = ps.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val item = ps.getJSONObject(key)
                    val qty = item.optInt("qty", 0)
                    val total = item.optDouble("total", 0.0)
                    var dn = key
                    if (dn.length > 20) dn = dn.substring(0, 20) + "..."
                    b.leftRight(qty.toString() + "x " + san(dn).uppercase(), fmt(total.toLong()))
                }
            } else {
                b.alignCenter().textLine("Sin productos").alignLeft()
            }
            b.separator('-')

            b.alignCenter().bold(true).textLine("DESGLOSE DE PAGOS").bold(false)
            b.leftRight("Efectivo:", fmt(d.optDouble("payment_cash", 0.0).toLong()))
            b.leftRight("NEQUI:", fmt(d.optDouble("payment_nequi", 0.0).toLong()))
            b.leftRight("Transferencia:", fmt(d.optDouble("payment_transfer", 0.0).toLong()))
            b.separator('-')
            
            b.bold(true).leftRight("TOTAL VENTAS:", fmt(d.optDouble("total_sales", 0.0).toLong())).bold(false)
            b.separator('-')

            b.alignCenter().bold(true).textLine("FLUJO DE EFECTIVO").bold(false)
            b.leftRight("Fondo Apertura:", "+" + fmt(d.optDouble("opening_amount", 0.0).toLong()))
            b.leftRight("Ventas Efectivo:", "+" + fmt(d.optDouble("payment_cash", 0.0).toLong()))
            b.leftRight("Entradas Extra:", "+" + fmt(d.optDouble("cash_in", 0.0).toLong()))
            b.leftRight("Gastos/Retiros:", "-" + fmt(d.optDouble("cash_out", 0.0).toLong()))
            b.separator('-')

            val expected = d.optDouble("expected_cash", 0.0)
            b.bold(true).doubleHeight(true).leftRight("EFECTIVO ESPERADO:", fmt(expected.toLong())).normalSize().bold(false)
            
            if (d.has("declared_cash")) {
                b.separator('-')
                val declared = d.optDouble("declared_cash", 0.0)
                b.bold(true).leftRight("Efectivo Declarado:", fmt(declared.toLong())).bold(false)
                
                val diff = d.optDouble("difference", 0.0)
                val diffStr = if (diff > 0) "+" + fmt(diff.toLong()) else if (diff < 0) "-" + fmt(Math.abs(diff).toLong()) else "$0"
                b.bold(true).leftRight(if (diff >= 0) "Sobrante:" else "Faltante:", diffStr).bold(false)
            }

            b.separator('-')
            b.newline().alignCenter().textLine("FIN DEL REPORTE").newline()
            
            if (config.getBeepOnPrint()) b.beep(2, 4)
            if (config.getAutoCut()) b.cut()
            
            return b.build()
        }
    }

    // ===== Instance members =====
    private val buf = mutableListOf<Int>()

    private fun p(vararg bytes: Int): EscPosBuilder {
        buf.addAll(bytes.toList())
        return this
    }

    private fun t(s: String): EscPosBuilder {
        for (ch in s) {
            val c = ch.code
            buf.add(if (c > 255) 63 else c) // Replace non-ASCII with '?'
        }
        return this
    }

    fun init(): EscPosBuilder = p(ESC, 0x40)
    fun alignLeft(): EscPosBuilder = p(ESC, 0x61, 0)
    fun alignCenter(): EscPosBuilder = p(ESC, 0x61, 1)

    fun bold(on: Boolean): EscPosBuilder = p(ESC, 0x45, if (on) 1 else 0)
    fun doubleSize(on: Boolean): EscPosBuilder = p(GS, 0x21, if (on) 0x11 else 0)
    fun doubleHeight(on: Boolean): EscPosBuilder = p(GS, 0x21, if (on) 0x01 else 0)
    fun normalSize(): EscPosBuilder = p(GS, 0x21, 0)

    fun text(s: String): EscPosBuilder = t(s)
    fun textLine(s: String): EscPosBuilder = t(s).p(LF)

    fun newline(n: Int = 1): EscPosBuilder {
        repeat(n) { p(LF) }
        return this
    }

    fun separator(c: Char = '-'): EscPosBuilder = textLine(c.toString().repeat(w))
    fun doubleSep(): EscPosBuilder = textLine("=".repeat(w))

    fun leftRight(left: String, right: String): EscPosBuilder {
        val mx = w - right.length - 1
        if (left.length > mx) {
            var remaining = left
            while (remaining.length > mx) {
                textLine(remaining.substring(0, w))
                remaining = remaining.substring(w)
            }
            if (remaining.isNotEmpty()) {
                val sp = maxOf(w - remaining.length - right.length, 1)
                textLine(remaining + " ".repeat(sp) + right)
            }
            return this
        }
        val sp = maxOf(w - left.length - right.length, 1)
        return textLine(left + " ".repeat(sp) + right)
    }

    fun beep(n: Int = 1, d: Int = 3): EscPosBuilder = p(ESC, 0x42, n, d)

    fun cut(): EscPosBuilder {
        newline(3)
        return p(GS, 0x56, 0)
    }

    fun qrCode(url: String?): EscPosBuilder {
        if (url.isNullOrEmpty()) return this
        val storeLen = url.length + 3
        val pL = storeLen and 0xFF
        val pH = (storeLen shr 8) and 0xFF

        alignCenter()
        // Model 2
        p(GS, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00)
        // Size 6
        p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x06)
        // Error Correction L (48)
        p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x30)
        // Store Data
        p(GS, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30)
        t(url)
        // Print
        p(GS, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30)
        newline(2)
        return this
    }

    fun build(): ByteArray = ByteArray(buf.size) { buf[it].toByte() }
}
