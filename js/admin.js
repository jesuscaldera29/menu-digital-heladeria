// ===== ADMIN.JS - MULTI-TENANT =====
let allProducts = [];
let allOrders = [];
let currentOrderFilter = 'Todos';
let currentTimeFilter = 'all';
let businessId = null;
let businessSlug = null;
let lastPendingCount = 0;
let salesChartInstance = null;
let currentReportData = [];

// Toast notification
let notificationsEnabled = false;

async function enableNotifications() {
    if ("Notification" in window) {
        const perm = await Notification.requestPermission();
        if (perm === "granted") {
            notificationsEnabled = true;
            showToast('✅ Notificaciones de escritorio activadas');
            const audio = document.getElementById('notificationSound');
            if (audio) {
                audio.volume = 0;
                audio.play().catch(e => console.log('Unlock failed:', e));
                setTimeout(() => audio.volume = 1, 1000);
            }
            const btn = document.getElementById('btnEnableNotifications');
            if (btn) btn.classList.add('hidden');
        } else {
            showToast('⚠️ Permiso de notificaciones denegado', 'error');
        }
    } else {
        showToast('❌ Tu navegador no soporta notificaciones', 'error');
    }
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return console.log('Toast:', msg);
    t.textContent = msg;
    t.className = 'toast show ' + type;
    setTimeout(() => t.className = 'toast', 3000);
}

async function logout() {
    localStorage.clear();
    await supabaseClient.auth.signOut();
    window.location.href = 'login.html';
}

// AUTH GUARD: Check session and load business
async function initAdmin() {
    const session = await getCurrentSession();
    if (!session) { window.location.href = 'login.html'; return false; }
    const biz = await getCurrentBusiness();
    if (!biz) { alert('No se encontró un negocio asociado a tu cuenta.'); await supabaseClient.auth.signOut(); window.location.href = 'login.html'; return false; }

    if (biz.is_active === false) {
        alert('⚠️ Tu cuenta ha sido SUSPENDIDA. Contacta al administrador.');
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
        return false;
    }

    businessId = biz.id;
    businessSlug = biz.slug;
    
    // Enforce Staff Role routing and views
    const staffRole = localStorage.getItem('staff_role');
    if (staffRole === 'Repartidor') {
        window.location.href = 'driver.html';
        return false;
    } else if (staffRole === 'Cajero') {
        // Hide tabs Cajero has no access to
        const restrictedTabs = ['tab-products', 'tab-staff', 'tab-coupons', 'tab-recipes', 'tab-reports'];
        restrictedTabs.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });

        // Set default view to Orders (since Products is restricted)
        document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

        const secOrders = document.getElementById('section-orders');
        if (secOrders) secOrders.classList.add('active');
        const tabOrders = document.getElementById('tab-orders');
        if (tabOrders) tabOrders.classList.add('active');
    }

    // Update header with business info
    const h1 = document.querySelector('header h1');
    if (h1) h1.textContent = '👨‍🍳 ' + biz.business_name + (staffRole ? ` (${staffRole})` : ' (Admin)');
    // Update menu link
    const menuLink = document.querySelector('a[href="index.html"]');
    if (menuLink) { menuLink.href = '/' + biz.slug; menuLink.innerHTML = '📱 Ver Menú'; }

    // Iniciar auto-polling de pedidos cada 15 segundos
    setInterval(pollNewOrders, 15000);
    pollNewOrders(); // Primera carga silenciosa

    return true;
}

// Polling for new orders
async function pollNewOrders() {
    if (!businessId) return;
    try {
        const { data, error } = await supabaseClient.from('orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false });
        if (error) return;

        allOrders = data || [];
        const currentPending = allOrders.filter(o => !o.status || o.status === 'Pendiente').length;

        if (currentPending > lastPendingCount) {
            // ¡Nuevo pedido!
            const audio = document.getElementById('notificationSound');
            if (audio) {
                audio.play().catch(e => console.warn('Audio auto-play bloqueado por el navegador', e));
            }

            if (notificationsEnabled && Notification.permission === "granted") {
                new Notification("🛎️ ¡Nuevo Pedido Recibido!", {
                    body: "Tienes pedidos pendientes por revisar en MenuPro.",
                    icon: "https://ui-avatars.com/api/?name=Menu&background=ea580c&color=fff"
                });
            }
            showToast('🔔 ¡NUEVO PEDIDO RECIBIDO!', 'success');
        }
        lastPendingCount = currentPending;

        // Si estamos en la pestaña de pedidos, actualizamos visualmente
        const sectionOrders = document.getElementById('section-orders');
        if (sectionOrders && sectionOrders.classList.contains('active')) {
            renderOrders();
        }
    } catch (err) {
        console.error('Error polling:', err);
    }
}

// PREVIEW IMAGE
function previewImage(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const preview = document.getElementById("prodPreview");
            if (preview) {
                preview.src = e.target.result;
                preview.style.display = "block";
            }
        }
        reader.readAsDataURL(file);
    }
}

// ADD NEW CATEGORY
function addNewCategory() {
    const input = document.getElementById("newCategory");
    const value = input.value.trim();
    if (!value) return showToast("⚠️ Escribe una categoría", "error");

    const select = document.getElementById("prodCategory");
    const exists = [...select.options].some(option => option.value.toLowerCase() === value.toLowerCase());
    if (exists) return showToast("⚠️ Ya existe", "error");

    const option = document.createElement("option");
    option.value = value;
    option.textContent = "📂 " + value;
    select.appendChild(option);
    select.value = value;
    input.value = "";
    showToast("✅ Categoría agregada");
}

// Load settings on page load
async function loadSettings() {
    if (!businessId) return;
    try {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('business_id', businessId).single();
        if (error) throw error;
        if (data) {
            const whatsappInput = document.getElementById('whatsappInput');
            if (whatsappInput) whatsappInput.value = data.whatsapp || '';

            const menuUrlInput = document.getElementById('menuUrlInput');
            if (menuUrlInput) menuUrlInput.value = data.menu_url || '';

            const tableCountInput = document.getElementById('tableCountInput');
            if (tableCountInput) tableCountInput.value = data.table_count || 1;

            const brandColorInput = document.getElementById('brandColorInput');
            const brandColorHex = document.getElementById('brandColorHex');
            if (brandColorInput && data.brand_color) {
                brandColorInput.value = data.brand_color;
                if (brandColorHex) brandColorHex.textContent = data.brand_color;
            }

            const nequiInfoInput = document.getElementById('nequiInfoInput');
            if (nequiInfoInput) nequiInfoInput.value = data.nequi_info || '';

            const bankInfoInput = document.getElementById('bankInfoInput');
            if (bankInfoInput) {
                bankInfoInput.value = data.bank_info || '';
                try {
                    if (data.bank_info && data.bank_info.trim().startsWith('[')) {
                        window.bankAccountsList = JSON.parse(data.bank_info);
                    } else {
                        window.bankAccountsList = [];
                    }
                } catch(e) {
                    window.bankAccountsList = [];
                }
                if (typeof renderBankAccounts === 'function') renderBankAccounts();
            }

            const deliveryFeeInput = document.getElementById('deliveryFeeInput');
            if (deliveryFeeInput) {
                deliveryFeeInput.value = data.delivery_fee || 0;
            }

            const logoPreview = document.getElementById('logoPreview');
            const logoPlaceholder = document.getElementById('logoPlaceholder');
            if (logoPreview && data.logo_url) {
                logoPreview.src = data.logo_url;
                logoPreview.style.display = 'block';
                if (logoPlaceholder) logoPlaceholder.style.display = 'none';
            }
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }
}

// Upload logo
async function uploadLogo(event) {
    const fileInput = document.getElementById('logoFile');
    const file = fileInput.files[0];
    if (!file) return showToast('⚠️ Selecciona una imagen primero', 'error');

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '⏳ Subiendo...';
    btn.disabled = true;

    const ext = file.name.split('.').pop();
    const fileName = 'logo_' + Date.now() + '.' + ext;

    try {
        const { error: uploadErr } = await supabaseClient.storage.from('images').upload(fileName, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        const { data: urlData } = supabaseClient.storage.from('images').getPublicUrl(fileName);
        const { error: updateErr } = await supabaseClient.from('settings').update({ logo_url: urlData.publicUrl }).eq('business_id', businessId);
        if (updateErr) throw updateErr;

        const logoPreview = document.getElementById('logoPreview');
        const logoPlaceholder = document.getElementById('logoPlaceholder');
        if (logoPreview) {
            logoPreview.src = urlData.publicUrl;
            logoPreview.style.display = 'block';
            if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        }

        showToast('✅ Logo actualizado correctamente');
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Save WhatsApp
async function saveWhatsApp(event) {
    const phone = document.getElementById('whatsappInput').value.trim();
    if (!phone) return showToast('⚠️ Ingresa un número', 'error');

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '⏳ Guardando...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('settings').update({ whatsapp: phone }).eq('business_id', businessId);
        if (error) throw error;
        showToast('✅ Teléfono guardado');
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Save Menu Config (Tables & URL)
async function saveMenuConfig(event) {
    const menuUrl = document.getElementById('menuUrlInput').value.trim();
    const tableCount = parseInt(document.getElementById('tableCountInput').value) || 1;
    const brandColor = document.getElementById('brandColorInput')?.value || '#f97316';
    const nequiInfo = document.getElementById('nequiInfoInput')?.value || '';
    const bankInfo = document.getElementById('bankInfoInput')?.value || '';
    const deliveryFee = parseFloat(document.getElementById('deliveryFeeInput')?.value) || 0;

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '⏳ Guardando...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('settings').update({
            menu_url: menuUrl,
            table_count: tableCount,
            brand_color: brandColor,
            nequi_info: nequiInfo,
            bank_info: bankInfo,
            delivery_fee: deliveryFee
        }).eq('business_id', businessId);

        if (error) throw error;
        showToast('✅ Configuración guardada');
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Funciones para gestionar Cuentas Bancarias
window.bankAccountsList = [];

window.renderBankAccounts = function() {
    const container = document.getElementById('bankAccountsContainer');
    const hiddenInput = document.getElementById('bankInfoInput');
    if (!container || !hiddenInput) return;

    hiddenInput.value = JSON.stringify(window.bankAccountsList);

    if (window.bankAccountsList.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 italic">No hay cuentas bancarias configuradas.</p>';
        return;
    }

    container.innerHTML = window.bankAccountsList.map((acc, index) => `
        <div class="flex justify-between items-center bg-white border border-gray-200 p-3 rounded-xl shadow-sm">
            <div>
                <p class="font-bold text-sm">🏦 ${acc.bank_name} <span class="text-xs font-normal text-gray-500">(${acc.account_type})</span></p>
                <p class="text-gray-800 font-mono text-sm mt-1">${acc.account_number}</p>
            </div>
            <button type="button" onclick="removeBankAccount(${index})" class="text-red-500 hover:text-red-700 bg-red-50 p-2 rounded-lg transition-colors">🗑️</button>
        </div>
    `).join('');
}

window.addBankAccount = function() {
    const nameInput = document.getElementById('newBankName');
    const typeInput = document.getElementById('newBankType');
    const numInput = document.getElementById('newBankNum');

    if (!nameInput.value || !typeInput.value || !numInput.value) {
        showToast('⚠️ Llena todos los campos del banco', 'error');
        return;
    }

    window.bankAccountsList.push({
        bank_name: nameInput.value.trim(),
        account_type: typeInput.value.trim(),
        account_number: numInput.value.trim()
    });

    nameInput.value = '';
    typeInput.value = '';
    numInput.value = '';

    renderBankAccounts();
}

window.removeBankAccount = function(index) {
    window.bankAccountsList.splice(index, 1);
    renderBankAccounts();
}

// Generate QR Codes
function generateQRs() {
    const menuUrl = document.getElementById('menuUrlInput').value.trim();
    const tableCount = parseInt(document.getElementById('tableCountInput').value) || 0;

    if (!menuUrl) {
        return showToast('⚠️ Primero debes guardar la URL de tu menú', 'error');
    }

    if (tableCount < 1) {
        return showToast('⚠️ La cantidad de mesas debe ser mayor a 0', 'error');
    }

    const container = document.getElementById('qrContainer');
    container.innerHTML = ''; // Limpiar anteriores

    // Plantilla base HTML del diseño de tarjeta
    const createCardHTML = (id, labelText) => `
      <div id="${id}-wrapper" class="bg-[#2a2d34] text-white p-6 flex flex-col items-center justify-between relative overflow-hidden shrink-0 mx-auto w-[280px]" style="border-radius: 12px; font-family: 'Outfit', sans-serif; aspect-ratio: 1/1.6; box-shadow: 0 10px 30px rgba(0,0,0,0.15);">
        <div class="text-center mt-6 w-full">
          <p class="text-[17px] font-medium tracking-[0.1em] leading-tight text-gray-200">MENÚ DIGITAL:</p>
          <h2 class="text-[22px] font-bold tracking-wider leading-tight mt-1">PIDA SU PEDIDO</h2>
        </div>
        
        <div class="bg-white p-3 rounded-xl shadow-inner my-6 flex items-center justify-center" id="${id}"></div>
        
        <div class="text-center w-full mb-4">
          <p class="text-[10px] tracking-[0.15em] font-medium uppercase mb-6 opacity-90 text-center">Pida su pedido: Escanee el código</p>
          
          <div class="flex justify-center gap-7 opacity-80">
            <div class="flex flex-col items-center gap-1.5">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
              <span class="text-[10px]">Phone</span>
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
              <span class="text-[10px]">QR</span>
            </div>
            <div class="flex flex-col items-center gap-1.5">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path></svg>
              <span class="text-[10px]">WiFi</span>
            </div>
          </div>
        </div>
        
        <div class="absolute bottom-3 right-3 opacity-30">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0l2 9 9 2-9 2-2 9-2-9-9-2 9-2z"/></svg>
        </div>
        <div class="absolute top-3 left-4 opacity-40 text-[10px] font-bold tracking-widest">
           ${labelText}
        </div>
      </div>
      <!-- Buttons -->
      <div class="mt-4 flex justify-center w-[280px] print:hidden">
        <button class="bg-[#2a2d34] text-white px-4 py-3 w-full rounded-xl text-xs font-bold shadow-md hover:bg-black transition flex items-center justify-center gap-2" onclick="downloadQRImage('${id}-wrapper', '${labelText.replace(' ', '-')}')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
          Descargar QR ${labelText}
        </button>
      </div>
    `;

    // 1. QR General (Directo a la página del cliente)
    const qrGeneralCard = document.createElement('div');
    qrGeneralCard.className = 'flex flex-col items-center break-inside-avoid mb-6';
    qrGeneralCard.innerHTML = createCardHTML('qr-general', 'GENERAL');
    container.appendChild(qrGeneralCard);

    new QRCode(document.getElementById('qr-general'), {
        text: menuUrl,
        width: 170,
        height: 170,
        colorDark: "#1a1a1a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    // 2. QRs por cada mesa
    for (let i = 1; i <= tableCount; i++) {
        const qrCard = document.createElement('div');
        qrCard.className = 'flex flex-col items-center break-inside-avoid mb-6';

        const qrId = 'qr-mesa-' + i;
        qrCard.innerHTML = createCardHTML(qrId, `MESA ${i}`);
        container.appendChild(qrCard);

        // Si la URL ya tiene parámetros (ej ?id=1), usamos &mesa=i, si no ?mesa=i
        const separator = menuUrl.includes('?') ? '&' : '?';
        const tableUrl = `${menuUrl}${separator}mesa=${i}`;

        new QRCode(document.getElementById(qrId), {
            text: tableUrl,
            width: 170,
            height: 170,
            colorDark: "#1a1a1a",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    document.getElementById('qrModal').classList.remove('hidden');
}

// Download QR Card as Image
function downloadQRImage(elementId, label) {
    const el = document.getElementById(elementId);
    if (!el) return;

    // Save original transform/styles just in case
    const originalTransform = el.style.transform;
    el.style.transform = "none";

    // Small toast notification
    showToast('⏳ Generando imagen...', 'success');

    html2canvas(el, {
        scale: 3, // High resolution for printing
        backgroundColor: null,
        useCORS: true,
        logging: false
    }).then(canvas => {
        el.style.transform = originalTransform;
        const link = document.createElement('a');
        link.download = `MenuPro-QR-${label}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        showToast('✅ Descarga completada');
    }).catch(err => {
        console.error('Error generando imagen QR:', err);
        showToast('❌ Error al descargar la imagen', 'error');
    });
}

// Upload product image
async function uploadImage(file) {
    const ext = file.name.split('.').pop();
    const fileName = 'prod_' + Date.now() + '.' + ext;
    try {
        const { error } = await supabaseClient.storage.from('images').upload(fileName, file, { upsert: true });
        if (error) throw error;
        const { data } = supabaseClient.storage.from('images').getPublicUrl(fileName);
        return data.publicUrl;
    } catch (err) {
        showToast('❌ Error subiendo imagen: ' + err.message, 'error');
        return null;
    }
}

// Add product
window.copyAccompaniments = function() {
    const select = document.getElementById('copyAccompanimentsFrom');
    if (!select || !select.value) return showToast('⚠️ Selecciona un producto origen', 'error');
    
    const p = allProducts.find(x => String(x.id) === String(select.value));
    if (!p) return;
    
    document.getElementById('prodAccompaniments').value = p.accompaniments || '';
    if (p.accompaniments_limit) {
        document.getElementById('prodAccompanimentsLimit').value = p.accompaniments_limit;
    } else {
        document.getElementById('prodAccompanimentsLimit').value = '';
    }
    
    showToast('✅ Acompañamientos copiados');
};

window.editCopyAccompaniments = function() {
    const select = document.getElementById('editCopyAccompanimentsFrom');
    if (!select || !select.value) return showToast('⚠️ Selecciona un producto origen', 'error');
    
    const p = allProducts.find(x => String(x.id) === String(select.value));
    if (!p) return;
    
    document.getElementById('editAccompaniments').value = p.accompaniments || '';
    if (p.accompaniments_limit) {
        document.getElementById('editAccompanimentsLimit').value = p.accompaniments_limit;
    } else {
        document.getElementById('editAccompanimentsLimit').value = '';
    }
    
    showToast('✅ Acompañamientos copiados');
};

async function addProduct(event) {
    const name = document.getElementById('prodName').value.trim();
    const price = parseFloat(document.getElementById('prodPrice').value);
    const category = document.getElementById('prodCategory').value.trim();
    const description = document.getElementById('prodDescription').value.trim();
    const accompaniments = document.getElementById('prodAccompaniments').value.trim();
    const accompanimentsLimit = parseInt(document.getElementById('prodAccompanimentsLimit').value) || null;
    const file = document.getElementById('prodImage').files[0];

    if (!name || isNaN(price) || !category) return showToast('⚠️ Completa nombre, precio y categoría', 'error');

    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = '⏳ Agregando...';
    btn.disabled = true;

    let image_url = '';
    if (file) {
        image_url = await uploadImage(file);
        if (!image_url) {
            btn.innerText = originalText;
            btn.disabled = false;
            return;
        }
    }

    try {
        const isFeatured = document.getElementById('prodFeatured')?.checked || false;
        const isPosOnly = document.getElementById('prodPosOnly')?.checked || false;
        const { error } = await supabaseClient.from('products').insert([{
            name,
            price,
            category,
            description,
            accompaniments,
            accompaniments_limit: accompanimentsLimit,
            image_url,
            business_id: businessId,
            is_featured: isFeatured,
            pos_only: isPosOnly
        }]);
        if (error) throw error;

        showToast('✅ Producto agregado correctamente');

        // Clear fields
        document.getElementById('prodName').value = '';
        document.getElementById('prodPrice').value = '';
        document.getElementById('prodCategory').value = '';
        document.getElementById('prodDescription').value = '';
        document.getElementById('prodAccompaniments').value = '';
        document.getElementById('prodAccompanimentsLimit').value = '';
        document.getElementById('prodImage').value = '';
        document.getElementById('prodFeatured').checked = false;
        if(document.getElementById('prodPosOnly')) document.getElementById('prodPosOnly').checked = false;
        document.getElementById('prodPreview').src = '';
        document.getElementById('prodPreview').style.display = 'none';

        loadProducts();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Load products
async function loadProducts() {
    if (!businessId) return;
    try {
        const { data, error } = await supabaseClient.from('products').select('*').eq('business_id', businessId).order('id', { ascending: false });
        if (error) throw error;
        allProducts = data || [];
        renderProducts();
    } catch (err) {
        showToast('Error cargando: ' + (err.message || 'Desconocido'), 'error');
        console.error(err);
    }
}

// Render products grouped by category
function renderProducts() {
    const container = document.getElementById('productsList');
    const totalEl = document.getElementById('totalProducts');
    if (!container) return;

    if (totalEl) {
        totalEl.innerText = `${allProducts.length} productos en total`;
    }

    // Populate accompaniments copy dropdowns
    const copySelect = document.getElementById('copyAccompanimentsFrom');
    if (copySelect) {
        copySelect.innerHTML = '<option value="">📋 Copiar acompañamientos de otro producto...</option>' + 
            allProducts.filter(p => p.accompaniments).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
    const editCopySelect = document.getElementById('editCopyAccompanimentsFrom');
    if (editCopySelect) {
        editCopySelect.innerHTML = '<option value="">📋 Copiar acompañamientos de otro producto...</option>' + 
            allProducts.filter(p => p.accompaniments).map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }

    if (!allProducts.length) {
        container.innerHTML = '<div class="col-span-full py-20 text-center text-gray-400 font-bold">No hay productos aún. Empieza agregando uno. 🍟</div>';
        return;
    }

    // Group by category
    const categories = [...new Set(allProducts.map(p => p.category))];

    let html = '';
    categories.forEach(cat => {
        const catProducts = allProducts.filter(p => p.category === cat);
        const emoji = { 'Desayunos': '🍳', 'Almuerzos': '🍛', 'Comidas Rápidas': '🍔', 'Acompañantes': '🍟', 'Bebidas': '🥤', 'Postres': '🍰' }[cat] || '📂';

        // Add Category Header
        html += `
        <div class="col-span-full flex items-center gap-4 mt-4 mb-2">
            <h2 class="text-2xl font-black text-orange-600 flex items-center gap-2 whitespace-nowrap">
                <span>${emoji}</span> ${(cat || 'Sin Categoría').toUpperCase()}
            </h2>
            <div class="h-[2px] bg-gray-100 w-full rounded-full"></div>
        </div>`;

        // Add Products for this category
        html += catProducts.map(p => `
        <div class="product-card">
          ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}" class="product-img">` : '<div class="product-img flex items-center justify-center bg-gray-100 text-4xl">🍽️</div>'}
          <div class="p-5">
            <div class="flex justify-between items-start">
                <h3 class="text-xl font-black leading-tight">${p.name} ${p.is_featured ? '<span class="text-orange-600 text-[10px] bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full font-black uppercase tracking-wider ml-1">⭐ Destacado</span>' : ''}</h3>
                <span class="w-3 h-3 rounded-full ${p.available ? 'bg-green-500' : 'bg-red-500'} shadow-sm mt-1" title="${p.available ? 'Disponible' : 'No disponible'}"></span>
            </div>
            
            <div class="text-red-600 text-2xl font-black mt-2">
                $${Number(p.price).toLocaleString()}
            </div>
            
            <p class="text-gray-500 text-sm mt-2 line-clamp-2 min-h-[40px]">
                ${p.description || 'Sin descripción disponible.'}
            </p>
            ${p.accompaniments ? `<p class="text-xs text-orange-600 font-bold mt-1">🍟 Acompañamientos: ${p.accompaniments}</p>` : ''}

            <div class="grid grid-cols-2 gap-2 mt-5">
              <button class="col-span-2 ${p.available ? 'bg-gray-800' : 'bg-green-600'} text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all" onclick="toggleAvailable('${p.id}', ${p.available})">
                ${p.available ? '❌ Desactivar' : '✅ Activar'}
              </button>
              <button class="bg-blue-600 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all" onclick="openEdit('${p.id}')">✏️ Editar</button>
              <button class="bg-red-500 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all" onclick="deleteProduct('${p.id}')">🗑️ Eliminar</button>
              <button class="col-span-2 bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2" onclick="openVisualExtrasModal('${p.id}')">
                ✨ Gestor de Opciones del producto
              </button>
              <button class="col-span-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition-all flex items-center justify-center gap-2" onclick="openPostModal('${p.id}')">
                📢 Generar Post de Venta
              </button>
            </div>
          </div>
        </div>
      `).join('');
    });

    container.innerHTML = html;
}

// Toggle availability
async function toggleAvailable(id, current) {
    try {
        const { error } = await supabaseClient.from('products').update({ available: !current }).eq('id', id);
        if (error) throw error;
        showToast(current ? '❌ Producto desactivado' : '✅ Producto activado');
        loadProducts();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// Delete product
async function deleteProduct(id) {
    if (!confirm('¿Eliminar este producto?')) return;
    try {
        const { error } = await supabaseClient.from('products').delete().eq('id', id);
        if (error) throw error;
        showToast('🗑️ Producto eliminado');
        loadProducts();
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

// Open edit modal
function openEdit(id) {
    const p = allProducts.find(x => String(x.id) === String(id));
    if (!p) return;
    document.getElementById('editId').value = p.id;
    document.getElementById('editName').value = p.name;
    document.getElementById('editPrice').value = p.price;
    document.getElementById('editCategory').value = p.category;
    document.getElementById('editDescription').value = p.description || '';
    document.getElementById('editAccompaniments').value = p.accompaniments || '';
    document.getElementById('editAccompanimentsLimit').value = p.accompaniments_limit || '';
    document.getElementById('editFeatured').checked = p.is_featured || false;
    if(document.getElementById('editPosOnly')) document.getElementById('editPosOnly').checked = p.pos_only || false;
    document.getElementById('editImage').value = '';

    const preview = document.getElementById('editPreview');
    if (p.image_url) {
        preview.src = p.image_url;
        preview.style.display = 'block';
    } else {
        preview.src = '';
        preview.style.display = 'none';
    }
    document.getElementById('editModal').style.display = 'flex';
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
}

// Save edit
async function saveEdit() {
    const id = document.getElementById('editId').value;
    const name = document.getElementById('editName').value.trim();
    const price = parseFloat(document.getElementById('editPrice').value);
    const category = document.getElementById('editCategory').value.trim();
    const description = document.getElementById('editDescription').value.trim();
    const accompaniments = document.getElementById('editAccompaniments').value.trim();
    const accompanimentsLimit = parseInt(document.getElementById('editAccompanimentsLimit').value) || null;
    const file = document.getElementById('editImage').files[0];

    if (!name || isNaN(price) || !category) return showToast('⚠️ Completa todos los campos', 'error');

    const isFeatured = document.getElementById('editFeatured')?.checked || false;
    const isPosOnly = document.getElementById('editPosOnly')?.checked || false;
    const updateData = { name, price, category, description, accompaniments, accompaniments_limit: accompanimentsLimit, is_featured: isFeatured, pos_only: isPosOnly };
    if (file) {
        showToast('⏳ Subiendo imagen...');
        const url = await uploadImage(file);
        if (!url) return;
        updateData.image_url = url;
    }

    try {
        const { error } = await supabaseClient.from('products').update(updateData).eq('id', id);
        if (error) throw error;
        showToast('✅ Producto actualizado correctamente');
        closeModal();
        loadProducts();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    }
}

// Tab Management
function showSection(sectionId, event) {
    // Role validation
    const staffRole = localStorage.getItem('staff_role');
    if (staffRole === 'Cajero') {
        const restricted = ['products', 'staff', 'coupons', 'recipes', 'reports'];
        if (restricted.includes(sectionId)) {
            showToast('⚠️ No tienes permisos para acceder a esta sección.', 'error');
            return;
        }
    }

    event = event || window.event;
    document.querySelectorAll('.section-content').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    document.getElementById(`section-${sectionId}`).classList.add('active');
    
    let tabBtn = event && event.target;
    if (!tabBtn) {
        tabBtn = document.getElementById(`tab-${sectionId}`);
    }
    if (tabBtn) tabBtn.classList.add('active');

    if (sectionId === 'orders') loadOrders();
    if (sectionId === 'customers') loadCustomers();
    if (sectionId === 'reports') initReports();
    if (sectionId === 'expenses') { if (typeof loadExpenses === 'function') loadExpenses(); if (typeof loadCashClosings === 'function') loadCashClosings(); }
    if (sectionId === 'staff') { if (typeof loadStaff === 'function') loadStaff(); }
    if (sectionId === 'coupons') { if (typeof loadCoupons === 'function') loadCoupons(); }
    if (sectionId === 'credits') { if (typeof loadCredits === 'function') loadCredits(); }
    if (sectionId === 'recipes') { if (typeof loadRecipes === 'function') loadRecipes(); }
}

// Load orders
async function loadOrders() {
    try {
        const { data, error } = await supabaseClient.from('orders').select('*').eq('business_id', businessId).order('created_at', { ascending: false });
        if (error) throw error;
        allOrders = data || [];
        renderOrders();
    } catch (err) {
        console.error('Error loading orders:', err);
        showToast('Error cargando pedidos', 'error');
    }
}

// Filter orders by time
function filterOrdersByTime(timeRange) {
    currentTimeFilter = timeRange;
    renderOrders();
}

// Render orders with active filter
function renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    let filtered = allOrders;

    if (currentOrderFilter !== 'Todos') {
        filtered = filtered.filter(o => (o.status || 'Pendiente') === currentOrderFilter);
    }

    if (currentTimeFilter !== 'all') {
        const now = new Date();
        filtered = filtered.filter(o => {
            const orderDate = new Date(o.created_at);
            if (currentTimeFilter === 'today') {
                return orderDate.toDateString() === now.toDateString();
            } else if (currentTimeFilter === '7days') {
                const limitDate = new Date();
                limitDate.setDate(now.getDate() - 7);
                return orderDate >= limitDate;
            } else if (currentTimeFilter === '30days') {
                const limitDate = new Date();
                limitDate.setDate(now.getDate() - 30);
                return orderDate >= limitDate;
            }
            return true;
        });
    }

    if (!filtered.length) {
        container.innerHTML = `<tr><td colspan="7" class="text-center py-10 text-gray-400">No hay pedidos registrados para estos filtros</td></tr>`;
        return;
    }

    container.innerHTML = filtered.map(o => {
        const status = o.status || 'Pendiente';
        return `
            <tr>
                <td class="font-bold text-orange-600">#${String(o.id).padStart(4, '0')}</td>
                <td>
                    <div class="font-bold">${o.customer_name}</div>
                    <div class="text-xs text-gray-400">${o.customer_phone}</div>
                </td>
                <td class="text-xs">${new Date(o.created_at).toLocaleString()}</td>
                <td class="font-black">$${Number(o.total).toLocaleString()}</td>
                <td><span class="text-[10px] bg-gray-100 px-2 py-1 rounded-full font-bold uppercase">${o.payment_method}</span></td>
                <td>
                    ${getStatusBadge(status)}
                    <div class="mt-2 w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        ${getProgressBar(status)}
                    </div>
                </td>
                <td>
                    <div class="flex items-center gap-2">
                        <select onchange="updateOrderStatus(${o.id}, this.value)" class="bg-gray-50 border border-gray-250 text-gray-950 text-xs font-bold rounded-lg p-1.5 focus:outline-none focus:ring-1 focus:ring-orange-500">
                            <option value="Pendiente" ${status === 'Pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                            <option value="Confirmado" ${status === 'Confirmado' ? 'selected' : ''}>✅ Confirmado</option>
                            <option value="Preparando" ${status === 'Preparando' ? 'selected' : ''}>👨‍🍳 Preparando</option>
                            <option value="Entregado" ${status === 'Entregado' ? 'selected' : ''}>🚚 Entregado</option>
                            <option value="Cancelado" ${status === 'Cancelado' ? 'selected' : ''}>❌ Cancelado</option>
                        </select>
                        <button onclick="viewOrderDetail(${o.id})" class="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm">Ver detalles</button>
                        <button onclick="deleteOrder(${o.id})" class="bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1.5 rounded-lg text-xs transition-all shadow-sm" title="Eliminar Pedido">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Get status badge HTML
function getStatusBadge(status) {
    status = status || 'Pendiente';
    switch (status) {
        case 'Cancelado':
            return `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">❌ Cancelado</span>`;
        case 'Confirmado':
            return `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800">✅ Confirmado</span>`;
        case 'Preparando':
            return `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800">👨‍🍳 Preparando</span>`;
        case 'Entregado':
            return `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-green-100 text-green-800">🚚 Entregado</span>`;
        case 'Pendiente':
        default:
            return `<span class="px-2.5 py-1 text-xs font-bold rounded-full bg-yellow-100 text-yellow-800">⏳ Pendiente</span>`;
    }
}

// Get progress bar HTML
function getProgressBar(status) {
    status = status || 'Pendiente';
    let width = '25%';
    let color = 'bg-yellow-400';

    if (status === 'Cancelado') { width = '100%'; color = 'bg-red-500'; }
    if (status === 'Confirmado') { width = '50%'; color = 'bg-blue-500'; }
    if (status === 'Preparando') { width = '75%'; color = 'bg-purple-500'; }
    if (status === 'Entregado') { width = '100%'; color = 'bg-green-500'; }

    return `<div class="h-1.5 ${color} transition-all duration-500" style="width: ${width}"></div>`;
}

// Filter orders by status tab
function filterOrdersByStatus(status) {
    currentOrderFilter = status;

    // Toggle active state in buttons
    document.querySelectorAll('.order-filter-btn').forEach(btn => {
        if (btn.getAttribute('onclick').includes(`'${status}'`)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    renderOrders();
}

// Update order status in Supabase
async function updateOrderStatus(orderId, newStatus) {
    try {
        const { error } = await supabaseClient.from('orders').update({ status: newStatus }).eq('id', orderId);
        if (error) throw error;

        // Update local list without re-fetching everything
        const order = allOrders.find(o => o.id === orderId);
        if (order) {
            order.status = newStatus;
            
            // Notification via WhatsApp (if phone exists and status is relevant)
            if (order.customer_phone && ['Confirmado', 'Preparando', 'Entregado'].includes(newStatus)) {
                if (confirm(`Estado cambiado a ${newStatus}. ¿Enviar notificación por WhatsApp al cliente?`)) {
                    let cleanPhone = order.customer_phone.replace(/\D/g, '');
                    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = '57' + cleanPhone;
                    let msg = `Hola *${order.customer_name}*, el estado de tu pedido *#${String(order.id).padStart(4, '0')}* ha sido actualizado a: *${newStatus}*.\n\n`;
                    if (newStatus === 'Confirmado') msg += '¡Estamos preparando todo!';
                    if (newStatus === 'Preparando') msg += '¡Ya casi está listo!';
                    if (newStatus === 'Entregado') msg += '¡Gracias por tu compra, disfrútalo!';
                    
                    const trackingUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/order-status.html?id=' + order.id;
                    msg += `\n\nSigue tu pedido aquí: ${trackingUrl}`;
                    
                    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
                }
            }
        }

        showToast('✅ Estado del pedido actualizado');
        renderOrders();
    } catch (err) {
        console.error('Error updating order status:', err);
        showToast('❌ Error al actualizar estado: ' + err.message, 'error');
    }
}

// Delete Order
async function deleteOrder(orderId) {
    const confirmation = prompt('⚠️ Para eliminar este pedido PERMANENTEMENTE, escribe la palabra ELIMINAR:');
    if (confirmation !== 'ELIMINAR') {
        if (confirmation !== null) showToast('⚠️ Confirmación incorrecta, pedido no eliminado', 'error');
        return;
    }

    try {
        const { error } = await supabaseClient.from('orders').delete().eq('id', orderId);
        if (error) throw error;
        showToast('🗑️ Pedido eliminado correctamente');
        allOrders = allOrders.filter(o => o.id !== orderId);
        renderOrders();
    } catch (err) {
        console.error('Error al eliminar pedido:', err);
        showToast('❌ Error al eliminar pedido: ' + err.message, 'error');
    }
}

function viewOrderDetail(id) {
    const o = allOrders.find(x => x.id === id);
    if (!o) return;

    window.currentActiveDetailOrder = o;

    document.getElementById('detailOrderTitle').textContent = `📋 Pedido #${String(o.id).padStart(4, '0')}`;
    document.getElementById('detailCustomerName').textContent = o.customer_name;
    document.getElementById('detailCustomerPhone').textContent = o.customer_phone;
    document.getElementById('detailDeliveryMethod').textContent = o.delivery_method || 'Domicilio';
    document.getElementById('detailAddress').textContent = o.address || 'Sin dirección';
    let paymentText = o.payment_method || 'Efectivo';
    if (o.payment_method === 'Dividido' && o.split_payments) {
      const parts = [];
      if (o.split_payments.cash) parts.push(`Efe: $${Number(o.split_payments.cash).toLocaleString()}`);
      if (o.split_payments.card) parts.push(`Tarj: $${Number(o.split_payments.card).toLocaleString()}`);
      if (o.split_payments.transfer) parts.push(`Transf: $${Number(o.split_payments.transfer).toLocaleString()}`);
      paymentText = `Dividido (${parts.join(' | ')})`;
    }
    document.getElementById('detailPaymentMethod').textContent = paymentText;
    document.getElementById('detailNotes').textContent = o.notes || 'Ninguna';

    const items = o.items || [];
    const container = document.getElementById('detailProducts');
    container.innerHTML = items.map(item => `
        <div class="flex justify-between py-1 border-b border-gray-50">
            <span>${item.name} <strong class="text-orange-600">x${item.qty}</strong></span>
            <span class="font-bold">$${Number(item.price * item.qty).toLocaleString()}</span>
        </div>
    `).join('');

    document.getElementById('detailTotal').textContent = `$${Number(o.total).toLocaleString()}`;

    // Generar enlace de seguimiento
    const trackingUrl = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '') + '/order-status.html?id=' + o.id;
    document.getElementById('detailTrackingUrl').value = trackingUrl;

    document.getElementById('orderDetailModal').style.display = 'flex';
}

window.printOrderTicket = function() {
    if (!window.currentActiveDetailOrder) return;
    const o = window.currentActiveDetailOrder;
    
    const itemsHtml = o.items.map(item => `
        <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #ccc;padding:4px 0;">
            <span>${item.qty}x ${item.name}</span>
            <span>$${Number(item.price * item.qty).toLocaleString()}</span>
        </div>
    `).join('');

    const discount = Number(o.discount || 0);
    const tip = Number(o.tip || 0);
    let extraRows = '';
    if (discount > 0) extraRows += `<div style="display:flex;justify-content:space-between;color:#2563eb;padding:4px 0;"><span>Descuento:</span><span>-$${discount.toLocaleString()}</span></div>`;
    if (tip > 0) extraRows += `<div style="display:flex;justify-content:space-between;color:#16a34a;padding:4px 0;"><span>Propina:</span><span>+$${tip.toLocaleString()}</span></div>`;

    const html = `
    <html>
      <head>
        <title>Ticket #${o.id}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; font-size: 14px; margin: 0; padding: 10px; width: 80mm; color: #000; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .mb-2 { margin-bottom: 8px; }
          .mb-4 { margin-bottom: 16px; }
          .text-lg { font-size: 18px; }
          .border-b { border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .border-t { border-top: 1px dashed #000; padding-top: 8px; margin-top: 8px; }
          .flex { display: flex; justify-content: space-between; }
          @media print { body { width: 100%; margin:0; padding:0; } }
        </style>
      </head>
      <body>
        <div class="text-center mb-2">
          ${document.getElementById('logoPreview')?.src && document.getElementById('logoPreview').src !== window.location.href ? `<img src="${document.getElementById('logoPreview').src}" style="max-width: 60mm; max-height: 40mm; object-fit: contain; margin-bottom: 10px;">` : ''}
        </div>
        <div class="text-center border-b font-bold text-lg">
          TICKET DE PEDIDO
          <br>#${String(o.id).padStart(4, '0')}
        </div>
        
        <div class="mb-2" style="margin-top:10px;">
          <strong>Fecha:</strong> ${new Date(o.created_at).toLocaleString()}<br>
          <strong>Cliente:</strong> ${o.customer_name}<br>
          <strong>Tel:</strong> ${o.customer_phone}<br>
          <strong>Tipo:</strong> ${o.delivery_method}<br>
          <strong>Dir:</strong> ${o.address || '-'}<br>
          <strong>Pago:</strong> ${o.payment_method}<br>
          <strong>Notas:</strong> ${o.notes || 'Ninguna'}
        </div>
        
        <div class="border-t border-b mb-2" style="margin-top:10px;">
          ${itemsHtml}
        </div>
        
        ${extraRows}

        <div class="flex border-t font-bold text-lg" style="margin-top:10px; padding-top:10px;">
          <span>TOTAL:</span>
          <span>$${Number(o.total).toLocaleString()}</span>
        </div>
        
        <div class="text-center border-t text-sm" style="margin-top:20px; padding-top:10px;">
          ¡Gracias por su compra!
        </div>
        <script>
          setTimeout(() => { window.print(); window.close(); }, 500);
        </script>
      </body>
    </html>`;

    const printWin = window.open('', '_blank', 'width=400,height=600');
    printWin.document.write(html);
    printWin.document.close();
}

function closeOrderDetailModal() {
    document.getElementById('orderDetailModal').style.display = 'none';
    window.currentActiveDetailOrder = null;
}

function sendTrackingLinkWhatsApp() {
    const o = window.currentActiveDetailOrder;
    if (!o) return;

    const trackingUrl = document.getElementById('detailTrackingUrl').value;
    let cleanPhone = o.customer_phone.replace(/\D/g, '');
    if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) cleanPhone = '57' + cleanPhone;

    let msg = `Hola *${o.customer_name}*, el estado de tu pedido *#${String(o.id).padStart(4, '0')}* en *Tronco E' Filo* ha sido actualizado.\n\n`;
    msg += `Puedes ver su progreso en tiempo real aquí (enlace temporal válido por 1 hora):\n${trackingUrl}`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

// Load customers
async function loadCustomers() {
    try {
        const { data, error } = await supabaseClient.from('customers').select('*').eq('business_id', businessId).order('name');
        if (error) throw error;

        const container = document.getElementById('customersList');
        if (!data.length) {
            container.innerHTML = '<tr><td colspan="6" class="text-center py-10 text-gray-400">No hay clientes registrados</td></tr>';
            return;
        }

        container.innerHTML = data.map(c => {
            let cleanP = c.phone.replace(/\D/g, '');
            if (cleanP.length === 10 && cleanP.startsWith('3')) cleanP = '57' + cleanP;
            return `
            <tr>
                <td class="text-center">
                  <input type="checkbox" class="customer-checkbox w-5 h-5 accent-red-500 rounded cursor-pointer" value="${c.id}">
                </td>
                <td class="font-bold">${c.name}</td>
                <td><a href="https://wa.me/${cleanP}" target="_blank" class="text-green-600 font-bold">📱 ${c.phone}</a></td>
                <td class="text-xs text-gray-500">${c.address || 'Sin dirección'}</td>
                <td class="text-xs">${new Date(c.created_at).toLocaleDateString()}</td>
                <td class="text-center">
                  <button onclick="deleteCustomer('${c.id}')" class="text-red-500 hover:text-red-700 font-bold p-2 bg-red-50 hover:bg-red-100 rounded-xl transition-all">🗑️ Eliminar</button>
                </td>
            </tr>
        `;
        }).join('');
    } catch (err) {
        showToast('Error cargando clientes', 'error');
    }
}

// Delete single customer
async function deleteCustomer(id) {
    if (!confirm('¿Estás seguro de eliminar este cliente? Esta acción no se puede deshacer.')) return;
    try {
        const { error } = await supabaseClient.from('customers').delete().eq('id', id);
        if (error) throw error;
        showToast('✅ Cliente eliminado');
        loadCustomers();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    }
}

// Toggle all checkboxes
function toggleAllCustomers(source) {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
}

// Delete selected customers
async function deleteSelectedCustomers() {
    const checkboxes = document.querySelectorAll('.customer-checkbox:checked');
    const ids = Array.from(checkboxes).map(cb => cb.value);

    if (ids.length === 0) return showToast('⚠️ Selecciona al menos un cliente', 'error');
    if (!confirm(`¿Eliminar ${ids.length} clientes seleccionados?`)) return;

    try {
        const { error } = await supabaseClient.from('customers').delete().in('id', ids);
        if (error) throw error;
        showToast(`✅ ${ids.length} clientes eliminados`);

        const selectAll = document.getElementById('selectAllCustomers');
        if (selectAll) selectAll.checked = false;

        loadCustomers();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    }
}

function openNewCustomerModal() {
    document.getElementById('newCustomerName').value = '';
    document.getElementById('newCustomerPhone').value = '';
    document.getElementById('newCustomerAddress').value = '';
    document.getElementById('newCustomerModal').style.display = 'flex';
}

async function createCustomerManual() {
    const name = document.getElementById('newCustomerName').value.trim();
    const phone = document.getElementById('newCustomerPhone').value.trim();
    const address = document.getElementById('newCustomerAddress').value.trim();

    if (!name || !phone) return showToast('⚠️ Nombre y WhatsApp son obligatorios', 'error');

    const btn = document.querySelector('#newCustomerModal .btn-primary');
    const ogText = btn.innerHTML;
    btn.innerHTML = 'Guardando...';
    btn.disabled = true;

    try {
        const { error } = await supabaseClient.from('customers').insert([{
            business_id: businessId,
            name: name,
            phone: phone,
            address: address
        }]);

        if (error) throw error;

        showToast('✅ Cliente creado correctamente');
        document.getElementById('newCustomerModal').style.display = 'none';
        loadCustomers();
    } catch (err) {
        showToast('❌ Error: ' + err.message, 'error');
    } finally {
        btn.innerHTML = ogText;
        btn.disabled = false;
    }
}

// Reports logic
function initReports() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('reportEndDate').value = today;

    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    document.getElementById('reportStartDate').value = lastMonth.toISOString().split('T')[0];

    generateReport();
}

async function generateReport() {
    const start = document.getElementById('reportStartDate').value;
    const end = document.getElementById('reportEndDate').value;

    if (!start || !end) return showToast('Selecciona un rango de fechas', 'error');

    try {
        const endDateTime = end + 'T23:59:59';

        const { data, error } = await supabaseClient.from('orders')
            .select('*')
            .eq('business_id', businessId)
            .gte('created_at', start)
            .lte('created_at', endDateTime);

        if (error) throw error;

        let totalSales = 0;
        let orderCount = data.length;

        currentReportData = data;
        data.forEach(o => totalSales += Number(o.total));

        document.getElementById('reportTotalSales').textContent = `$${totalSales.toLocaleString()}`;
        document.getElementById('reportOrderCount').textContent = orderCount;
        document.getElementById('reportAverageOrder').textContent = `$${(orderCount > 0 ? (totalSales / orderCount) : 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

        const summaryContainer = document.getElementById('reportSummary');
        if (orderCount === 0) {
            summaryContainer.innerHTML = 'No hubo ventas en este período 😕';
            if (salesChartInstance) salesChartInstance.destroy();
        } else {
            summaryContainer.innerHTML = `
                <div class="text-black">
                    <p class="text-lg">Resultados del <span class="font-bold">${new Date(start).toLocaleDateString()}</span> al <span class="font-bold">${new Date(end).toLocaleDateString()}</span></p>
                    <p class="mt-2 text-gray-500">Se han procesado correctamente todos los registros en el sistema.</p>
                </div>
            `;
            renderSalesChart(data);
        }
    } catch (err) {
        showToast('Error generando reporte', 'error');
    }
}

// Renderizar gráfica de Chart.js
function renderSalesChart(data) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    // Agrupar ventas por día
    const salesByDay = {};
    data.forEach(o => {
        const dateStr = o.created_at.split('T')[0];
        if (!salesByDay[dateStr]) salesByDay[dateStr] = 0;
        salesByDay[dateStr] += Number(o.total);
    });

    const sortedDates = Object.keys(salesByDay).sort();
    const labels = sortedDates.map(d => new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
    const values = sortedDates.map(d => salesByDay[d]);

    if (salesChartInstance) {
        salesChartInstance.destroy();
    }

    salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ventas por Día ($)',
                data: values,
                backgroundColor: 'rgba(255, 95, 109, 0.8)',
                borderColor: 'rgba(255, 95, 109, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { borderDash: [5, 5] } },
                x: { grid: { display: false } }
            }
        }
    });
}

// Descargar Reporte CSV
function downloadReportCSV() {
    if (!currentReportData || currentReportData.length === 0) {
        return showToast('⚠️ No hay datos para descargar en el rango actual', 'error');
    }

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Fecha,Cliente,WhatsApp,Metodo Pago,Metodo Entrega,Estado,Total\n";

    currentReportData.forEach(function (row) {
        const id = row.id;
        const fecha = new Date(row.created_at).toLocaleString();
        const cliente = `"${row.customer_name || ''}"`;
        const telefono = row.customer_phone || '';
        const metodoPago = row.payment_method || '';
        const metodoEntrega = row.delivery_method || '';
        const estado = row.status || '';
        const total = row.total || 0;

        csvContent += `${id},${fecha},${cliente},${telefono},${metodoPago},${metodoEntrega},${estado},${total}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `reporte_ventas_${new Date().getTime()}.csv`);
    document.body.appendChild(link); // Required for FF
    link.click();
    document.body.removeChild(link);
}

// SALES POST GENERATOR
function openPostModal(id) {
    const p = allProducts.find(x => String(x.id) === String(id));
    if (!p) return;

    document.getElementById('postName').innerText = p.name;
    document.getElementById('postPrice').innerText = `$${Number(p.price).toLocaleString()}`;
    document.getElementById('postDesc').innerText = p.description || '¡No te quedes sin probarlo! Calidad y sabor garantizado.';

    const postImg = document.getElementById('postImage');
    if (p.image_url) {
        // Para evitar problemas de CORS con html2canvas, intentamos cargar la imagen con crossOrigin
        postImg.crossOrigin = "anonymous";
        postImg.src = p.image_url;
    } else {
        postImg.src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=360&auto=format&fit=crop';
    }

    const whatsapp = document.getElementById('whatsappInput').value || '573001234567';
    document.getElementById('postPhone').innerText = whatsapp;

    // Logo
    const logoUrl = document.getElementById('logoPreview').src;
    const postLogo = document.getElementById('postLogo');
    const postLogoEmoji = document.getElementById('postLogoEmoji');

    if (logoUrl && !logoUrl.includes('hidden')) {
        postLogo.src = logoUrl;
        postLogo.classList.remove('hidden');
        postLogoEmoji.classList.add('hidden');
    } else {
        postLogo.classList.add('hidden');
        postLogoEmoji.classList.remove('hidden');
    }

    document.getElementById('postModal').style.display = 'flex';
}

function closePostModal() {
    document.getElementById('postModal').style.display = 'none';
}

async function downloadPost(e) {
    const btn = e.target;
    const originalText = btn.innerText;
    btn.innerText = '⏳ Procesando...';
    btn.disabled = true;

    try {
        const postElement = document.getElementById('salesPost');
        const canvas = await html2canvas(postElement, {
            useCORS: true,
            scale: 2, // Mejor calidad
            backgroundColor: null,
            logging: false
        });

        const image = canvas.toDataURL("image/png");
        const link = document.createElement('a');
        link.download = `post_${document.getElementById('postName').innerText.toLowerCase().replace(/\s+/g, '_')}.png`;
        link.href = image;
        link.click();

        showToast('✅ Imagen generada y descargada');
    } catch (err) {
        console.error(err);
        showToast('❌ Error al generar imagen', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// Init with auth guard
document.addEventListener('DOMContentLoaded', async () => {
    const ok = await initAdmin();
    if (!ok) return;
    await loadSettings();
    await loadProducts();
});

// logout() is defined at the top of the file

// ==========================================
// GESTOR DE EXTRAS VISUALES
// ==========================================
let currentVeProductId = null;

window.openVisualExtrasModal = function(productId) {
    try {
        currentVeProductId = productId;
        const p = allProducts.find(x => String(x.id) === String(productId));

        const modal = document.getElementById('visualExtrasModal');
        if (!modal) {
            alert('⚠️ ERROR CRÍTICO: El formulario (modal) no existe en la página. Esto ocurre porque tu navegador está usando una versión antigua guardada en la memoria caché.\n\nSOLUCIÓN: Limpia el historial/datos de navegación o presiona Ctrl + F5.');
            return;
        }

        if (document.getElementById('veProductId')) document.getElementById('veProductId').value = productId;
        if (document.getElementById('veName')) document.getElementById('veName').value = '';
        if (document.getElementById('vePrice')) document.getElementById('vePrice').value = '0';
        if (document.getElementById('veImage')) document.getElementById('veImage').value = '';

        if (document.getElementById('veLimit')) {
            document.getElementById('veLimit').value = p && p.accompaniments_limit ? p.accompaniments_limit : '';
        }

        if (typeof cancelEditVisualExtra === 'function') cancelEditVisualExtra();

        const cloneSelect = document.getElementById('cloneTargetProduct');
        if (cloneSelect) {
            cloneSelect.innerHTML = '<option value="">Selecciona un producto destino...</option>' + 
                allProducts.filter(x => String(x.id) !== String(productId)).map(x => `<option value="${x.id}">${x.name}</option>`).join('');
        }

        modal.style.display = 'flex';
        loadVisualExtras(productId);
    } catch(err) {
        alert("Error JS: " + err.message);
        console.error(err);
    }
}

function closeVisualExtrasModal() {
    document.getElementById('visualExtrasModal').style.display = 'none';
    currentVeProductId = null;
}

async function loadVisualExtras(productId) {
    const list = document.getElementById('veList');
    list.innerHTML = '<p class="text-sm text-gray-400 italic">Cargando extras...</p>';

    try {
        const { data, error } = await supabaseClient
            .from('product_extras')
            .select('*')
            .eq('product_id', productId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!data || data.length === 0) {
            list.innerHTML = '<p class="text-sm text-gray-400 italic">No hay extras visuales para este producto. Agrega uno nuevo.</p>';
            return;
        }

        list.innerHTML = data.map(extra => `
            <div class="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-gray-100">
                <div class="flex items-center gap-3">
                    ${extra.image_url ? `<img src="${extra.image_url}" class="w-10 h-10 rounded-full object-cover shadow-sm">` : `<div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">✨</div>`}
                    <div>
                        <p class="font-bold text-sm leading-none">${extra.name}</p>
                        <p class="text-xs text-orange-600 font-bold mt-1">${extra.price > 0 ? '+$' + Number(extra.price).toLocaleString() : 'GRATIS'}</p>
                    </div>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="editVisualExtra('${extra.id}')" class="text-blue-500 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="Editar">✏️</button>
                    <button onclick="deleteVisualExtra('${extra.id}')" class="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors" title="Eliminar">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-sm text-red-500">Error al cargar extras</p>';
        console.error(err);
    }
}

async function saveVisualExtra() {
    const productId = currentVeProductId;
    const name = document.getElementById('veName').value.trim();
    const price = parseFloat(document.getElementById('vePrice').value) || 0;
    const file = document.getElementById('veImage').files[0];
    const editId = document.getElementById('editVeId').value;

    if (!name) return showToast('⚠️ Ingresa el nombre del extra', 'error');

    const btn = document.getElementById('btnSaveVisualExtra');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Guardando...';
    btn.disabled = true;

    let image_url = null;
    if (file) {
        image_url = await uploadImage(file);
    }

    try {
        if (editId) {
            const updateData = { name: name, price: price };
            if (image_url) updateData.image_url = image_url;
            
            const { error } = await supabaseClient.from('product_extras').update(updateData).eq('id', editId);
            if (error) throw error;
            showToast('✅ Extra actualizado correctamente');
        } else {
            const { error } = await supabaseClient.from('product_extras').insert([{
                business_id: businessId,
                product_id: productId,
                name: name,
                price: price,
                image_url: image_url
            }]);
            if (error) throw error;
            showToast('✅ Extra guardado correctamente');
        }

        cancelEditVisualExtra();
        loadVisualExtras(productId);
    } catch (err) {
        console.error(err);
        showToast('❌ Error al guardar', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function deleteVisualExtra(extraId) {
    if (!confirm('¿Eliminar este extra?')) return;

    try {
        const { error } = await supabaseClient.from('product_extras').delete().eq('id', extraId);
        if (error) throw error;

        showToast('🗑️ Extra eliminado');
        if (currentVeProductId) loadVisualExtras(currentVeProductId);
    } catch (err) {
        showToast('Error: ' + err.message, 'error');
    }
}

async function saveVisualExtrasLimit() {
    const limitVal = document.getElementById('veLimit').value;
    const limit = limitVal ? parseInt(limitVal) : null;

    try {
        const { error } = await supabaseClient.from('products').update({
            accompaniments_limit: limit
        }).eq('id', currentVeProductId);

        if (error) throw error;

        // Actualizar array local
        const p = allProducts.find(x => String(x.id) === String(currentVeProductId));
        if (p) p.accompaniments_limit = limit;

        showToast('✅ Límite actualizado exitosamente');
    } catch (err) {
        console.error(err);
        showToast('❌ Error al actualizar el límite', 'error');
    }
}

// Edit and Clone functions
window.editVisualExtra = async function(extraId) {
    try {
        const { data, error } = await supabaseClient.from('product_extras').select('*').eq('id', extraId).single();
        if (error) throw error;
        if (data) {
            document.getElementById('editVeId').value = data.id;
            document.getElementById('veName').value = data.name;
            document.getElementById('vePrice').value = data.price;
            document.getElementById('veFormTitle').innerText = '✏️ Editar Extra';
            document.getElementById('btnSaveVisualExtra').innerHTML = '💾 Guardar Cambios';
            document.getElementById('btnCancelEditVe').classList.remove('hidden');
            
            // Scroll to form
            document.getElementById('veFormTitle').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } catch(e) {
        console.error(e);
        showToast('❌ Error al cargar extra', 'error');
    }
};

window.cancelEditVisualExtra = function() {
    if(document.getElementById('editVeId')) document.getElementById('editVeId').value = '';
    if(document.getElementById('veName')) document.getElementById('veName').value = '';
    if(document.getElementById('vePrice')) document.getElementById('vePrice').value = '0';
    if(document.getElementById('veImage')) document.getElementById('veImage').value = '';
    if(document.getElementById('veFormTitle')) document.getElementById('veFormTitle').innerText = 'Agregar Nuevo Extra';
    if(document.getElementById('btnSaveVisualExtra')) document.getElementById('btnSaveVisualExtra').innerHTML = '➕ Agregar Extra';
    if(document.getElementById('btnCancelEditVe')) document.getElementById('btnCancelEditVe').classList.add('hidden');
};

window.cloneVisualExtras = async function() {
    const targetId = document.getElementById('cloneTargetProduct').value;
    if (!targetId || !currentVeProductId) return showToast('⚠️ Selecciona un producto destino', 'error');

    if (!confirm('¿Copiar todos los extras actuales al producto seleccionado?')) return;

    try {
        const { data: sourceExtras, error: errLoad } = await supabaseClient.from('product_extras').select('*').eq('product_id', currentVeProductId);
        if (errLoad) throw errLoad;
        
        if (!sourceExtras || sourceExtras.length === 0) return showToast('⚠️ No hay extras para copiar', 'error');

        const newExtras = sourceExtras.map(e => ({
            business_id: e.business_id,
            product_id: targetId,
            name: e.name,
            price: e.price,
            image_url: e.image_url
        }));

        const { error: errInsert } = await supabaseClient.from('product_extras').insert(newExtras);
        if (errInsert) throw errInsert;

        showToast('✅ Extras copiados exitosamente');
        document.getElementById('cloneTargetProduct').value = '';
    } catch(e) {
        console.error(e);
        showToast('❌ Error al copiar extras', 'error');
    }
};

// ==========================================
// PWA INSTALL LOGIC
// ==========================================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('btnInstallApp');
    if (btn) {
        btn.classList.remove('hidden');
        btn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('App instalada');
            }
            deferredPrompt = null;
            btn.classList.add('hidden');
        });
    }
});


// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
    const isAuthed = await initAdmin();
    if (isAuthed) {
        loadSettings();
        loadProducts();
        
        // Initial load for all extra sections to have data ready when tabs are clicked
        if (typeof loadStaff === 'function') loadStaff();
        if (typeof loadCoupons === 'function') loadCoupons();
        if (typeof loadCredits === 'function') loadCredits();
        if (typeof loadRecipes === 'function') loadRecipes();
        if (typeof loadExpenses === 'function') loadExpenses();
        if (typeof loadCashClosings === 'function') loadCashClosings();
    }
});
