// ── admin.js ── Logic Admin Dashboard ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    const user = requireAuth(['admin']);
    if (!user) return;
    initAdminSidebar(user);
    highlightAdminNav();
    startClock('.kds-time, .topbar-time');
});

// ── SIDEBAR ──────────────────────────────────────────────────────────────────
function initAdminSidebar(user) {
    const nameEl = document.getElementById('sidebarUserName');
    const roleEl = document.getElementById('sidebarUserRole');
    const avaEl = document.getElementById('sidebarAvatar');
    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = 'Quản trị viên';
    if (avaEl) avaEl.textContent = user.avatar;
}

function highlightAdminNav() {
    const page = location.pathname.split('/').pop();
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}

// ── SIDEBAR HTML COMPONENT (nhúng vào các trang admin) ──────────────────────
function renderAdminSidebar(activePage) {
    const nav = [
        { page: 'dashboard.html', icon: '📊', label: 'Tổng quan' },
        { page: 'menu-plan.html', icon: '📅', label: 'Lịch thực đơn' },
        { page: 'suppliers.html', icon: '🚚', label: 'Nhà cung cấp' },
        { page: 'marketing.html', icon: '🎁', label: 'Marketing / Voucher' },
        { page: 'staff.html', icon: '👥', label: 'Nhân sự' },
        { page: 'reports.html', icon: '📈', label: 'Báo cáo BI' },
    ];
    return `
    <div class="sidebar">
      <div class="sidebar-brand">
        <div class="logo-icon">🌿</div>
        <div><div class="brand-name">GreenBite</div><div class="brand-tagline">Admin Portal</div></div>
      </div>
      <nav class="sidebar-nav">
        <div class="nav-section-label">Quản trị</div>
        ${nav.map(n => `
          <a class="nav-item ${n.page === activePage ? 'active' : ''}" href="${n.page}" data-page="${n.page}">
            <span class="nav-icon">${n.icon}</span>${n.label}
          </a>
        `).join('')}
        <div class="nav-section-label mt-2">Hệ thống</div>
        <a class="nav-item" href="../kitchen/pos.html">
          <span class="nav-icon">🧾</span>POS / Thu ngân
        </a>
        <a class="nav-item" href="../kitchen/kds.html">
          <span class="nav-icon">👨‍🍳</span>Màn hình bếp
        </a>
        <a class="nav-item" href="../kitchen/inventory.html">
          <span class="nav-icon">📦</span>Kho nguyên liệu
        </a>
      </nav>
      <div class="sidebar-user">
        <div class="avatar" id="sidebarAvatar">AD</div>
        <div class="user-info">
          <div class="name" id="sidebarUserName">Admin</div>
          <div class="role" id="sidebarUserRole">Quản trị viên</div>
        </div>
        <button class="logout-btn" onclick="logout()" title="Đăng xuất">🚪</button>
      </div>
    </div>
  `;
}

// ── DASHBOARD STATS ───────────────────────────────────────────────────────────
async function loadDashboardStats() {
    try {
        const res = await API.analytics.getDashboard();
        const d = res.data;
        setStatVal('statRevToday', formatCurrency(d.revenue_today));
        setStatVal('statOrders', d.orders_today);
        setStatVal('statPending', d.orders_pending);
        setStatVal('statSubs', d.active_subs);
        setStatVal('statNewCust', d.new_customers);
        setStatVal('statWaste', d.food_waste_pct + '%');
        setStatVal('statRetention', d.retention_rate + '%');
        renderMiniBarChart('revenueChart', d.revenue_chart);
        renderTopItems(d.top_items);
    } catch (e) {
        console.error('Dashboard stats error:', e);
    }
}

function setStatVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── MINI BAR CHART ────────────────────────────────────────────────────────────
function renderMiniBarChart(containerId, data) {
    const el = document.getElementById(containerId);
    if (!el || !data?.length) return;
    const max = Math.max(...data.map(d => d.value || d));
    el.className = 'mini-bar-chart';
    el.innerHTML = data.map((d, i) => {
        const val = d.value ?? d;
        const pct = Math.round((val / max) * 100);
        const isLast = i === data.length - 1;
        return `<div class="mini-bar ${isLast ? 'highlight' : ''}" style="height:${pct}%" title="${formatCurrency(val)}"></div>`;
    }).join('');
}

// ── DONUT CHART (SVG) ─────────────────────────────────────────────────────────
function renderDonutChart(containerId, segments) {
    // segments: [{ label, value, color }]
    const el = document.getElementById(containerId);
    if (!el) return;
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    const r = 45; const cx = 60; const cy = 60;
    let angle = -Math.PI / 2;
    const paths = segments.map(seg => {
        const sweep = (seg.value / total) * Math.PI * 2;
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        angle += sweep;
        const x2 = cx + r * Math.cos(angle);
        const y2 = cy + r * Math.sin(angle);
        const large = sweep > Math.PI ? 1 : 0;
        return `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z"
              fill="${seg.color}" opacity=".85">
              <title>${seg.label}: ${seg.value}</title></path>`;
    });
    el.innerHTML = `
    <svg width="120" height="120" viewBox="0 0 120 120">
      ${paths.join('')}
      <circle cx="60" cy="60" r="30" fill="white"/>
    </svg>`;
}

// ── TOP ITEMS TABLE ───────────────────────────────────────────────────────────
function renderTopItems(items, containerId = 'topItemsTable') {
    const el = document.getElementById(containerId);
    if (!el || !items?.length) return;
    el.innerHTML = items.map((item, i) => `
    <tr ${i === 0 ? 'class="report-highlight"' : ''}>
      <td>
        <div class="rank-badge rank-${i + 1}">${i + 1}</div>
      </td>
      <td><span style="font-size:1.3rem">${item.emoji}</span></td>
      <td><strong>${item.name}</strong></td>
      <td><span class="badge badge-green">${item.category}</span></td>
      <td style="font-weight:700">${item.orders_count ?? '-'}</td>
      <td style="color:var(--green-700);font-weight:700">${formatCurrency(item.revenue ?? item.price * (item.orders_count ?? 1))}</td>
    </tr>
  `).join('');
}

// ── MENU PLANNER ──────────────────────────────────────────────────────────────
const MenuPlanner = {
    _plan: {},   // { 'Mon-breakfast': productId, ... }
    DAYS: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'],
    MEALS: ['Sáng', 'Trưa', 'Chiều'],

    load() {
        try { this._plan = JSON.parse(localStorage.getItem('hfp_menu_plan')) || {}; } catch { this._plan = {}; }
    },
    save() { localStorage.setItem('hfp_menu_plan', JSON.stringify(this._plan)); },

    set(dayIdx, meal, productId) {
        const key = `${dayIdx}-${meal}`;
        if (productId) this._plan[key] = productId;
        else delete this._plan[key];
        this.save();
    },

    get(dayIdx, meal) {
        const pid = this._plan[`${dayIdx}-${meal}`];
        return pid ? MOCK_PRODUCTS.find(p => p.id === +pid) : null;
    },

    // Tính tổng nguyên liệu cần theo gói đăng ký
    calcIngredients(subscriberCount = 48) {
        const needed = {};
        Object.values(this._plan).forEach(pid => {
            const p = MOCK_PRODUCTS.find(x => x.id === +pid);
            if (!p) return;
            // Giả sử mỗi món cần nguyên liệu tương ứng (demo đơn giản)
            const key = p.name;
            needed[key] = (needed[key] || 0) + subscriberCount;
        });
        return needed;
    },

    renderWeekGrid(containerId) {
        const el = document.getElementById(containerId);
        if (!el) return;
        this.load();
        el.innerHTML = `
      <div class="week-grid">
        ${this.DAYS.map((day, di) => `
          <div class="day-col">
            <div class="day-header">${day}</div>
            ${this.MEALS.map(meal => {
            const product = this.get(di, meal);
            return `
                <div class="meal-type-label">${meal}</div>
                <div class="meal-slot ${product ? 'filled' : ''}"
                     onclick="openMealPicker(${di},'${meal}')">
                  ${product
                    ? `<span class="slot-emoji">${product.emoji}</span>
                       <span class="slot-name">${product.name}</span>
                       <span class="slot-cal">🔥 ${product.calories} kcal</span>`
                    : `<span style="font-size:1.5rem">＋</span><span>Thêm món</span>`
                }
                </div>
              `;
        }).join('')}
          </div>
        `).join('')}
      </div>
    `;
    }
};

let _mealPickerDay = null;
let _mealPickerMeal = null;

function openMealPicker(dayIdx, meal) {
    _mealPickerDay = dayIdx;
    _mealPickerMeal = meal;
    const list = document.getElementById('mealPickerList');
    if (list) {
        list.innerHTML = MOCK_PRODUCTS.map(p => `
      <div style="display:flex;align-items:center;gap:1rem;padding:.75rem;border-radius:var(--radius-md);
                  cursor:pointer;border:1.5px solid transparent;transition:var(--transition)"
           onmouseenter="this.style.background='var(--green-50)';this.style.borderColor='var(--green-300)'"
           onmouseleave="this.style.background='';this.style.borderColor='transparent'"
           onclick="selectMeal(${p.id})">
        <span style="font-size:1.8rem">${p.emoji}</span>
        <div style="flex:1">
          <div style="font-weight:600;font-size:.9rem">${p.name}</div>
          <div style="font-size:.75rem;color:var(--gray-600)">🔥 ${p.calories} kcal · ${formatCurrency(p.price)}</div>
        </div>
        <span class="badge badge-green">${p.category}</span>
      </div>
    `).join('');
    }
    openModal('mealPickerModal');
}

function selectMeal(productId) {
    if (_mealPickerDay === null) return;
    MenuPlanner.set(_mealPickerDay, _mealPickerMeal, productId);
    closeModal('mealPickerModal');
    MenuPlanner.renderWeekGrid('weekGridContainer');
    showToast('Đã cập nhật thực đơn ✅');
}

// ── STAFF HELPERS ─────────────────────────────────────────────────────────────
const ROLE_LABELS = {
    admin: { label: 'Admin', class: 'role-admin' },
    kitchen: { label: 'Bếp trưởng', class: 'role-kitchen' },
    cashier: { label: 'Thu ngân', class: 'role-cashier' },
    shipper: { label: 'Shipper', class: 'role-shipper' },
};

function renderStaffTable(staff, tbodyId = 'staffTbody') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.innerHTML = staff.map(s => {
        const r = ROLE_LABELS[s.role] || { label: s.role, class: 'role-cashier' };
        return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:.75rem">
            <div class="staff-avatar">${s.name.split(' ').pop()[0]}</div>
            <div>
              <div style="font-weight:600">${s.name}</div>
              <div style="font-size:.75rem;color:var(--gray-600)">${s.email}</div>
            </div>
          </div>
        </td>
        <td><span class="role-chip ${r.class}">${r.label}</span></td>
        <td>${s.phone}</td>
        <td>${s.shift}</td>
        <td>${formatCurrency(s.salary)}</td>
        <td><span class="badge ${s.status === 'active' ? 'badge-green' : 'badge-gray'}">${s.status === 'active' ? '🟢 Đang làm' : '⚪ Nghỉ'}</span></td>
        <td>
          <div style="display:flex;gap:.4rem">
            <button class="btn btn-secondary btn-sm" onclick="editStaff(${s.id})">✏️</button>
            <button class="btn btn-sm ${s.status === 'active' ? 'btn-danger' : 'btn-secondary'}"
              onclick="toggleStaffStatus(${s.id},'${s.status}')">
              ${s.status === 'active' ? '🚫' : '✅'}
            </button>
          </div>
        </td>
      </tr>
    `;
    }).join('');
}

async function toggleStaffStatus(id, currentStatus) {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const label = newStatus === 'active' ? 'kích hoạt' : 'vô hiệu hoá';
    if (!confirm(`Xác nhận ${label} nhân viên?`)) return;
    try {
        await API.staff.toggleStatus(id, newStatus === 'active');
        showToast(`Đã ${label} nhân viên ✅`);
        loadStaffPage?.();
    } catch (e) { showToast(e.message, 'error'); }
}

// ── SUPPLIER HELPERS ──────────────────────────────────────────────────────────
function renderSupplierCard(s) {
    const stars = '⭐'.repeat(Math.round(s.rating || 5));
    return `
    <div class="supplier-card">
      <div class="supplier-header">
        <div class="supplier-avatar">🚚</div>
        <div style="flex:1">
          <div style="font-weight:700">${s.name}</div>
          <div style="font-size:.8rem;color:var(--gray-600)">${s.category}</div>
        </div>
        ${s.is_certified || s.certified ? '<span class="badge badge-green" title="Đã kiểm định">✅ Chứng nhận</span>' : ''}
      </div>
      <div style="font-size:.85rem;color:var(--gray-600);display:flex;flex-direction:column;gap:.35rem">
        <div>📞 ${s.phone || s.contact}</div>
        <div>📧 ${s.email}</div>
        ${s.lastOrder || s.last_order_date ? `<div>🗓 Nhập gần nhất: ${s.lastOrder || formatDate(s.last_order_date)}</div>` : ''}
      </div>
      <div class="supplier-rating mt-1">${stars} <span style="color:var(--gray-800)">${s.rating}</span></div>
      <div class="supplier-tags">
        ${(s.tags || []).map(t => `<span class="badge badge-lime">${t}</span>`).join('')}
      </div>
      <div style="display:flex;gap:.5rem;margin-top:1rem">
        <button class="btn btn-secondary btn-sm" onclick="editSupplier(${s.id})">✏️ Sửa</button>
        <button class="btn btn-primary btn-sm" onclick="openPurchaseOrder(${s.id},'${s.name}')">📋 Đặt hàng</button>
        <button class="btn btn-danger btn-sm" onclick="deleteSupplier(${s.id})">🗑</button>
      </div>
    </div>
  `;
}

async function deleteSupplier(id) {
    if (!confirm('Xoá nhà cung cấp này? (Không thể hoàn tác)')) return;
    try {
        await API.suppliers.delete(id);
        showToast('Đã xoá nhà cung cấp');
        loadSuppliersPage?.();
    } catch (e) { showToast(e.message, 'error'); }
}

// ── PURCHASE ORDER MODAL ──────────────────────────────────────────────────────
function openPurchaseOrder(supplierId, supplierName) {
    const modal = document.getElementById('poModal');
    const title = document.getElementById('poSupplierName');
    if (title) title.textContent = supplierName;
    if (modal) {
        renderPOItems();
        modal.dataset.supplierId = supplierId;
    }
    openModal('poModal');
}

let _poItems = [];
function renderPOItems() {
    _poItems = [];
    const container = document.getElementById('poItemsContainer');
    if (!container) return;
    addPOItem();
}

function addPOItem() {
    const id = Date.now();
    _poItems.push(id);
    const container = document.getElementById('poItemsContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.id = `poi-${id}`;
    row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr 1fr auto;gap:.5rem;margin-bottom:.5rem;align-items:center';
    row.innerHTML = `
    <input class="form-control" placeholder="Tên nguyên liệu" data-field="name">
    <input class="form-control" placeholder="Số lượng" type="number" min="0" data-field="qty">
    <input class="form-control" placeholder="ĐVT (kg/quả...)" data-field="unit">
    <input class="form-control" placeholder="Đơn giá (VNĐ)" type="number" data-field="price">
    <button class="btn btn-danger btn-sm" onclick="removePOItem(${id})">✕</button>
  `;
    container.appendChild(row);
}

function removePOItem(id) {
    document.getElementById(`poi-${id}`)?.remove();
    _poItems = _poItems.filter(i => i !== id);
}

async function submitPurchaseOrder() {
    const modal = document.getElementById('poModal');
    const supplierId = modal?.dataset.supplierId;
    const items = _poItems.map(id => {
        const row = document.getElementById(`poi-${id}`);
        if (!row) return null;
        const name = row.querySelector('[data-field="name"]')?.value;
        const qty = parseFloat(row.querySelector('[data-field="qty"]')?.value);
        const unit = row.querySelector('[data-field="unit"]')?.value;
        const price = parseFloat(row.querySelector('[data-field="price"]')?.value);
        if (!name || !qty || !price) return null;
        return { ingredient_name: name, quantity: qty, unit: unit || 'kg', unit_price: price };
    }).filter(Boolean);

    if (!items.length) { showToast('Thêm ít nhất 1 sản phẩm vào đơn nhập', 'warning'); return; }

    try {
        await API.suppliers.createPO(supplierId, {
            items,
            expected_delivery: document.getElementById('poDelivery')?.value,
            notes: document.getElementById('poNotes')?.value
        });
        showToast('Tạo đơn nhập hàng thành công! 📦');
        closeModal('poModal');
    } catch (e) { showToast(e.message, 'error'); }
}

// ── VOUCHER HELPERS ───────────────────────────────────────────────────────────
function renderVoucherCard(v) {
    const statusMap = {
        active: { badge: 'badge-green', label: 'Đang chạy' },
        expiring: { badge: 'badge-orange', label: 'Sắp hết hạn' },
        scheduled: { badge: 'badge-blue', label: 'Lên lịch' },
        expired: { badge: 'badge-gray', label: 'Hết hạn' },
    };
    const st = statusMap[v.status] || statusMap.expired;
    const usedPct = v.limit ? Math.round((v.used / v.limit) * 100) : 0;
    return `
    <div class="voucher-card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:.75rem">
        <div class="voucher-code">${v.code}</div>
        <span class="badge ${st.badge}">${st.label}</span>
      </div>
      <div class="voucher-discount">${v.type === 'percent' ? v.discount + '%' : formatCurrency(v.discount)} OFF</div>
      <p style="font-size:.8rem;opacity:.75;margin-top:.35rem">${v.description}</p>
      <div class="voucher-stats">
        <div class="voucher-stat"><div class="val">${v.used}</div><div class="lbl">Đã dùng</div></div>
        <div class="voucher-stat"><div class="val">${v.limit}</div><div class="lbl">Giới hạn</div></div>
        <div class="voucher-stat"><div class="val">${usedPct}%</div><div class="lbl">Tỷ lệ</div></div>
      </div>
      <div class="progress-bar-wrap mt-2" style="background:rgba(255,255,255,.2)">
        <div class="progress-bar-fill" style="width:${usedPct}%;background:var(--accent-lime)"></div>
      </div>
      <div style="font-size:.72rem;opacity:.6;margin-top:.4rem">Hết hạn: ${v.expire}</div>
      <div style="display:flex;gap:.5rem;margin-top:1rem">
        <button class="btn btn-sm" style="background:rgba(255,255,255,.15);color:#fff;border:none" onclick="editVoucher(${v.id})">✏️</button>
        <button class="btn btn-sm btn-danger" onclick="deleteVoucher(${v.id})">🗑</button>
      </div>
    </div>
  `;
}

// ── FOOD WASTE CHART ──────────────────────────────────────────────────────────
function renderWasteChart(data, containerId = 'wasteChart') {
    const el = document.getElementById(containerId);
    if (!el || !data?.length) return;
    const maxPct = Math.max(...data.map(d => d.waste_pct));
    el.innerHTML = data.slice(0, 8).map(d => `
    <div class="waste-bar" style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
      <div class="waste-label" style="width:120px;font-size:.82rem;color:var(--gray-600);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</div>
      <div class="waste-track" style="flex:1;height:10px;background:var(--gray-100);border-radius:99px;overflow:hidden">
        <div class="waste-fill" style="width:${(d.waste_pct / maxPct) * 100}%;height:100%;background:${d.waste_pct > 5 ? 'var(--accent-red)' : d.waste_pct > 3 ? 'var(--accent-orange)' : 'var(--green-400)'};border-radius:99px"></div>
      </div>
      <div class="waste-pct" style="min-width:40px;font-size:.78rem;font-weight:700;text-align:right">${d.waste_pct}%</div>
    </div>
  `).join('');
}

// ── EXPORT REPORT ─────────────────────────────────────────────────────────────
function exportTableCSV(tableId, filename = 'report.csv') {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = [...table.querySelectorAll('tr')];
    const csv = rows.map(row =>
        [...row.querySelectorAll('th,td')]
            .map(cell => `"${cell.textContent.trim().replace(/"/g, '""')}"`)
            .join(',')
    ).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
    showToast('Xuất CSV thành công! 📄');
}

// ── FORM HELPERS ──────────────────────────────────────────────────────────────
function collectFormData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};
    const data = {};
    form.querySelectorAll('[name]').forEach(el => {
        if (el.type === 'checkbox') data[el.name] = el.checked;
        else data[el.name] = el.value.trim();
    });
    return data;
}

function fillForm(formId, data) {
    const form = document.getElementById(formId);
    if (!form || !data) return;
    Object.entries(data).forEach(([key, val]) => {
        const el = form.querySelector(`[name="${key}"]`);
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!val;
        else el.value = val ?? '';
    });
}

function validateForm(formId, rules) {
    // rules: { fieldName: 'required|min:3|email' }
    const errors = [];
    const data = collectFormData(formId);
    for (const [field, rule] of Object.entries(rules)) {
        const val = data[field] || '';
        const parts = rule.split('|');
        for (const part of parts) {
            if (part === 'required' && !val) { errors.push(`${field} không được để trống`); break; }
            if (part.startsWith('min:') && val.length < +part.split(':')[1]) { errors.push(`${field} quá ngắn`); break; }
            if (part === 'email' && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { errors.push(`${field} không đúng định dạng email`); break; }
            if (part === 'phone' && val && !/^0\d{9}$/.test(val)) { errors.push(`${field} không đúng định dạng SĐT`); break; }
        }
    }
    if (errors.length) { showToast(errors[0], 'warning'); return false; }
    return true;
}