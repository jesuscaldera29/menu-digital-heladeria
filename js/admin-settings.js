// ==========================================
// ADMIN SETTINGS LOGIC
// Manejo de pantallas de ajustes, impresoras y recibos
// ==========================================

// Load configurations when settings section opens
document.addEventListener('DOMContentLoaded', () => {
    loadPrinterSettings();
    loadReceiptSettings();
    loadKdsReceiptSettings();
});

// --- PRINTER SETTINGS ---
function loadPrinterSettings() {
    const autoPrint = localStorage.getItem('printer_auto_print') === 'true';
    const printLogo = localStorage.getItem('printer_logo') === 'true';
    const cashDrawer = localStorage.getItem('printer_cash_drawer') === 'true';
    const kdsEnabled = localStorage.getItem('printer_kds_enabled') === 'true';
    const retryPrint = localStorage.getItem('printer_retry') === 'true';

    const tAuto = document.getElementById('toggleAutoPrint');
    const tLogo = document.getElementById('togglePrintLogo');
    const tCash = document.getElementById('toggleCashDrawer');
    const tKds = document.getElementById('toggleKDS');
    const tRetry = document.getElementById('toggleRetryPrint');

    if (tAuto) tAuto.checked = autoPrint;
    if (tLogo) tLogo.checked = printLogo;
    if (tCash) tCash.checked = cashDrawer;
    if (tKds) {
        tKds.checked = kdsEnabled;
        toggleKdsOptions();
    }
    if (tRetry) tRetry.checked = retryPrint;
}

function savePrinterSettings() {
    const tAuto = document.getElementById('toggleAutoPrint');
    const tLogo = document.getElementById('togglePrintLogo');
    const tCash = document.getElementById('toggleCashDrawer');
    const tKds = document.getElementById('toggleKDS');
    const tRetry = document.getElementById('toggleRetryPrint');

    if (tAuto) localStorage.setItem('printer_auto_print', tAuto.checked);
    if (tLogo) localStorage.setItem('printer_logo', tLogo.checked);
    if (tCash) localStorage.setItem('printer_cash_drawer', tCash.checked);
    if (tKds) localStorage.setItem('printer_kds_enabled', tKds.checked);
    if (tRetry) localStorage.setItem('printer_retry', tRetry.checked);
}

function toggleKdsOptions() {
    const tKds = document.getElementById('toggleKDS');
    const btnLanPos = document.getElementById('btnLanPos');
    if (tKds && btnLanPos) {
        if (tKds.checked) {
            btnLanPos.classList.remove('hidden');
        } else {
            btnLanPos.classList.add('hidden');
        }
        savePrinterSettings();
    }
}

function openCashDrawer() {
    // Send ESC/POS command to open drawer
    // For web printing, it's usually handled by raw print or a native app.
    // We simulate it with a toast.
    if (typeof showToast === 'function') {
        showToast('🔓 Enviando comando de apertura al cajón...');
    }
}

function scanLanDevices() {
    if (typeof showToast === 'function') {
        showToast('🔍 Escaneando red local...', 'info');
    }
    const btn = document.querySelector('button[onclick="scanLanDevices()"]');
    if (btn) {
        const ogHTML = btn.innerHTML;
        btn.innerHTML = '⏳ Buscando POS...';
        btn.disabled = true;
        setTimeout(() => {
            btn.innerHTML = ogHTML;
            btn.disabled = false;
            // Simulate found devices
            const count = document.getElementById('lanCount');
            const list = document.getElementById('lanDevicesList');
            if (count) count.textContent = '1/1';
            if (list) {
                list.innerHTML = `
                    <div class="w-full flex items-center justify-between p-4 border border-green-200 bg-green-50 rounded-xl">
                        <div class="flex items-center gap-3">
                            <span class="text-2xl">📱</span>
                            <div class="text-left">
                                <div class="font-bold text-gray-800">Caja Principal (192.168.1.5)</div>
                                <div class="text-xs text-green-600 font-semibold">Conectado</div>
                            </div>
                        </div>
                        <button class="px-3 py-1 bg-red-100 text-red-600 text-xs font-bold rounded-lg hover:bg-red-200">Desconectar</button>
                    </div>
                `;
            }
            if (typeof showToast === 'function') showToast('✅ 1 POS encontrado');
        }, 2000);
    }
}

// --- RECEIPTS SETTINGS ---
function loadReceiptSettings() {
    const logo = localStorage.getItem('receipt_cash_logo') === 'true';
    const header = localStorage.getItem('receipt_cash_header') || '';
    const footer = localStorage.getItem('receipt_cash_footer') || 'Gracias por visitarnos !!';
    const taxes = localStorage.getItem('receipt_cash_taxes') === 'true';
    const discounts = localStorage.getItem('receipt_cash_discounts') === 'true';

    const tLogo = document.getElementById('toggleReceiptLogo');
    const txtHead = document.getElementById('receiptHeader');
    const txtFoot = document.getElementById('receiptFooter');
    const tTaxes = document.getElementById('toggleReceiptTaxes');
    const tDisc = document.getElementById('toggleReceiptDiscounts');

    if (tLogo) tLogo.checked = logo;
    if (txtHead) txtHead.value = header;
    if (txtFoot) txtFoot.value = footer;
    if (tTaxes) tTaxes.checked = taxes;
    if (tDisc) tDisc.checked = discounts;
}

function loadKdsReceiptSettings() {
    const table = localStorage.getItem('receipt_kds_table') !== 'false'; // default true
    const waiter = localStorage.getItem('receipt_kds_waiter') !== 'false';
    const client = localStorage.getItem('receipt_kds_client') !== 'false';

    const tTable = document.getElementById('kdsShowTable');
    const tWaiter = document.getElementById('kdsShowWaiter');
    const tClient = document.getElementById('kdsShowClient');

    if (tTable) tTable.checked = table;
    if (tWaiter) tWaiter.checked = waiter;
    if (tClient) tClient.checked = client;
}

function toggleCheckbox(id) {
    const cb = document.getElementById(id);
    if (cb) {
        cb.checked = !cb.checked;
    }
}

function saveReceiptConfig(type) {
    if (type === 'cash') {
        const tLogo = document.getElementById('toggleReceiptLogo');
        const txtHead = document.getElementById('receiptHeader');
        const txtFoot = document.getElementById('receiptFooter');
        const tTaxes = document.getElementById('toggleReceiptTaxes');
        const tDisc = document.getElementById('toggleReceiptDiscounts');

        if (tLogo) localStorage.setItem('receipt_cash_logo', tLogo.checked);
        if (txtHead) localStorage.setItem('receipt_cash_header', txtHead.value);
        if (txtFoot) localStorage.setItem('receipt_cash_footer', txtFoot.value);
        if (tTaxes) localStorage.setItem('receipt_cash_taxes', tTaxes.checked);
        if (tDisc) localStorage.setItem('receipt_cash_discounts', tDisc.checked);

    } else if (type === 'kds') {
        const tTable = document.getElementById('kdsShowTable');
        const tWaiter = document.getElementById('kdsShowWaiter');
        const tClient = document.getElementById('kdsShowClient');

        if (tTable) localStorage.setItem('receipt_kds_table', tTable.checked);
        if (tWaiter) localStorage.setItem('receipt_kds_waiter', tWaiter.checked);
        if (tClient) localStorage.setItem('receipt_kds_client', tClient.checked);
    }
    
    // Simulate "Guardado con éxito" toast/animation
    if (typeof showToast === 'function') {
        showToast('✅ Guardado con éxito');
    }
}

// --- NEW PRINTER SETTINGS ---
function selectPaperSize(size) {
    const btn58 = document.getElementById('npSize58');
    const btn80 = document.getElementById('npSize80');
    
    // Reset classes
    const activeClasses = ['border-2', 'border-[#00c875]', 'text-[#00c875]'];
    const inactiveClasses = ['border', 'border-gray-200', 'text-gray-400'];
    
    btn58.classList.remove(...activeClasses);
    btn58.classList.add(...inactiveClasses);
    btn80.classList.remove(...activeClasses);
    btn80.classList.add(...inactiveClasses);

    // Apply active to selected
    if (size === '58mm') {
        btn58.classList.remove(...inactiveClasses);
        btn58.classList.add(...activeClasses);
        btn58.dataset.selected = "true";
        btn80.dataset.selected = "false";
    } else {
        btn80.classList.remove(...inactiveClasses);
        btn80.classList.add(...activeClasses);
        btn80.dataset.selected = "true";
        btn58.dataset.selected = "false";
    }
}

function testPrinterConnection() {
    const ip = document.getElementById('npIp').value.trim();
    const port = document.getElementById('npPort').value.trim();
    if (!ip) {
        showToast('❌ Ingrese una dirección IP primero', 'error');
        return;
    }
    
    showToast(`🔄 Conectando a ${ip}:${port}...`);
    setTimeout(() => {
        showToast('✅ Prueba de impresión enviada exitosamente');
        checkNewPrinterForm();
    }, 1500);
}

function checkNewPrinterForm() {
    const name = document.getElementById('newPrinterName').value.trim();
    const ip = document.getElementById('npIp').value.trim();
    const btn = document.getElementById('npSaveBtn');
    
    if (name && ip) {
        btn.disabled = false;
        btn.classList.remove('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
        btn.classList.add('bg-[#00c875]', 'text-white', 'hover:bg-[#00b065]');
        btn.querySelector('span').classList.replace('bg-gray-400', 'bg-white');
    } else {
        btn.disabled = true;
        btn.classList.remove('bg-[#00c875]', 'text-white', 'hover:bg-[#00b065]');
        btn.classList.add('bg-gray-200', 'text-gray-400', 'cursor-not-allowed');
        btn.querySelector('span').classList.replace('bg-white', 'bg-gray-400');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Add input listeners for new printer form
    const newPrinterName = document.getElementById('newPrinterName');
    const npIp = document.getElementById('npIp');
    if (newPrinterName) newPrinterName.addEventListener('input', checkNewPrinterForm);
    if (npIp) npIp.addEventListener('input', checkNewPrinterForm);
});

function saveNewPrinter() {
    const name = document.getElementById('newPrinterName').value.trim();
    const ip = document.getElementById('npIp').value.trim();
    if (!name || !ip) return;
    
    // Simulate saving
    const btn = document.getElementById('npSaveBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = 'GUARDANDO...';
    btn.disabled = true;
    
    setTimeout(() => {
        btn.innerHTML = originalText;
        showToast('✅ Impresora configurada con éxito');
        
        // Return to printers list
        if (typeof showSection === 'function') {
            showSection('settings-printers');
        }
        
        // Add to simulated list if we wanted to
        const listContainer = document.getElementById('printersListContainer'); // Assuming we want to show it there eventually
    }, 1000);
}

// --- GENERAL CONFIG (Business Type) ---
function saveBusinessType(btn) {
    // Reset all buttons visual state
    const container = btn.parentElement;
    const buttons = container.querySelectorAll('button');
    buttons.forEach(b => {
        b.classList.remove('bg-gray-200');
        b.classList.add('hover:bg-gray-50');
    });

    // Highlight selected
    btn.classList.remove('hover:bg-gray-50');
    btn.classList.add('bg-gray-200');

    const type = btn.textContent.trim();
    localStorage.setItem('business_type', type);

    if (typeof showToast === 'function') {
        showToast('✅ Guardado con éxito');
    }
}
