// admin-supplies.js
let suppliesList = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners if needed
});

async function renderSupplies(categoryFilter = null) {
    const container = document.getElementById('suppliesListContainer');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-8 text-gray-400">Cargando insumos...</div>';

    const businessId = localStorage.getItem('business_id');
    if (!businessId) return;

    try {
        let query = window.supabaseClient.from('supplies').select('*').eq('business_id', businessId).order('name');
        if (categoryFilter && categoryFilter !== 'Todos') {
            query = query.eq('category', categoryFilter);
        }

        const { data, error } = await query;
        if (error) throw error;

        suppliesList = data || [];
        
        if (suppliesList.length === 0) {
            container.innerHTML = `
                <div class="bg-white rounded-xl p-8 text-center shadow-sm border border-gray-100">
                    <span class="text-4xl block mb-2">🧊</span>
                    <h3 class="font-bold text-gray-800 mb-1">No hay insumos</h3>
                    <p class="text-sm text-gray-500 mb-4">Agrega ingredientes o materia prima a tu inventario.</p>
                </div>`;
            return;
        }

        let html = '';
        suppliesList.forEach(s => {
            html += `
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
                <input type="checkbox" class="w-5 h-5 text-[#00c875] rounded border-gray-300 focus:ring-[#00c875]">
                <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 flex-shrink-0">
                    🏷️
                </div>
                <div class="flex-1">
                    <h4 class="font-bold text-gray-800">${s.name}</h4>
                    <div class="flex items-center gap-3 mt-1 text-sm">
                        <span class="font-medium text-gray-800">Stock: ${s.stock} ${s.unit}</span>
                        <span class="font-medium text-gray-800">Costo: $${s.cost_price} <span class="text-yellow-500 text-xs">💲</span></span>
                    </div>
                </div>
                <button onclick="editSupply('${s.id}')" class="w-10 h-10 bg-[#1a3636] text-white rounded-xl flex items-center justify-center hover:bg-[#112323] transition-colors flex-shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                </button>
            </div>
            `;
        });
        
        container.innerHTML = html;
        updateSuppliesCategories();
        
    } catch (err) {
        console.error('Error fetching supplies:', err);
        container.innerHTML = '<div class="text-center py-4 text-red-500">Error cargando insumos</div>';
        if (typeof showToast === 'function') showToast('Error al cargar insumos', 'error');
    }
}

function updateSuppliesCategories() {
    const businessId = localStorage.getItem('business_id');
    if (!businessId) return;
    
    // Fetch distinct categories from supabase or just use the loaded suppliesList
    window.supabaseClient.from('supplies').select('category').eq('business_id', businessId)
        .then(({ data }) => {
            if (data) {
                const categories = [...new Set(data.map(d => d.category))].filter(Boolean);
                const container = document.getElementById('suppliesCategoriesFilter');
                if (container) {
                    let html = `<button onclick="renderSupplies('Todos')" class="px-4 py-1.5 rounded-lg border border-gray-200 bg-[#1a3636] text-white text-xs font-bold whitespace-nowrap uppercase">Todos</button>`;
                    categories.forEach(cat => {
                        html += `<button onclick="renderSupplies('${cat}')" class="px-4 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-700 whitespace-nowrap uppercase hover:bg-gray-50">${cat}</button>`;
                    });
                    container.innerHTML = html;
                }
            }
        });
}

function openSupplyModal(id = null) {
    document.getElementById('supplyModal').classList.remove('hidden');
    document.getElementById('supplyModalTitle').innerText = id ? 'Editar Insumo' : 'Nuevo Insumo';
    
    if (id) {
        const supply = suppliesList.find(s => s.id === id);
        if (supply) {
            document.getElementById('supplyId').value = supply.id;
            document.getElementById('supplyName').value = supply.name;
            document.getElementById('supplyCategory').value = supply.category || '';
            document.getElementById('supplyUnit').value = supply.unit || 'unidad';
            document.getElementById('supplyStock').value = supply.stock || 0;
            document.getElementById('supplyCost').value = supply.cost_price || 0;
        }
    } else {
        document.getElementById('supplyId').value = '';
        document.getElementById('supplyName').value = '';
        document.getElementById('supplyCategory').value = '';
        document.getElementById('supplyUnit').value = 'unidad';
        document.getElementById('supplyStock').value = '';
        document.getElementById('supplyCost').value = '';
    }
}

function closeSupplyModal() {
    document.getElementById('supplyModal').classList.add('hidden');
}

async function saveSupply() {
    const businessId = localStorage.getItem('business_id');
    if (!businessId) return;

    const id = document.getElementById('supplyId').value;
    const name = document.getElementById('supplyName').value.trim();
    const category = document.getElementById('supplyCategory').value.trim() || 'Sin Categoría';
    const unit = document.getElementById('supplyUnit').value;
    const stock = parseFloat(document.getElementById('supplyStock').value) || 0;
    const cost_price = parseFloat(document.getElementById('supplyCost').value) || 0;

    if (!name) {
        if (typeof showToast === 'function') showToast('El nombre es obligatorio', 'error');
        return;
    }

    const payload = {
        business_id: businessId,
        name,
        category,
        unit,
        stock,
        cost_price
    };

    try {
        if (id) {
            const { error } = await window.supabaseClient.from('supplies').update(payload).eq('id', id);
            if (error) throw error;
            if (typeof showToast === 'function') showToast('✅ Insumo actualizado');
        } else {
            const { error } = await window.supabaseClient.from('supplies').insert([payload]);
            if (error) throw error;
            if (typeof showToast === 'function') showToast('✅ Insumo guardado');
        }
        closeSupplyModal();
        renderSupplies();
    } catch (err) {
        console.error('Error saving supply:', err);
        if (typeof showToast === 'function') showToast('❌ Error al guardar', 'error');
    }
}

function editSupply(id) {
    openSupplyModal(id);
}

// Hook into showSection to auto-load supplies
const originalShowSection = window.showSection;
if (originalShowSection) {
    window.showSection = function(sectionId, event) {
        originalShowSection(sectionId, event);
        if (sectionId === 'supplies') {
            renderSupplies();
        }
    };
} else {
    // Fallback if defined differently
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[onclick^="showSection(\'supplies\'"]');
        if (btn) renderSupplies();
    });
}
