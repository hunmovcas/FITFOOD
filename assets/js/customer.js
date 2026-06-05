// ── customer.js ── Logic dành riêng cho Customer Portal ─────────────────────

// ── KHỞI TẠO TRANG ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    updateCartBadge();
    initUserDropdown();
    highlightActiveNav();
});

// ── CART BADGE ───────────────────────────────────────────────────────────────
function updateCartBadge() {
    const cart = getCart();
    const total = cart.reduce((s, i) => s + (i.qty || 1), 0);
    document.querySelectorAll('.cart-count').forEach(el => {
        el.textContent = total;
        el.style.display = total ? 'flex' : 'none';
    });
}

// ── NAV ACTIVE STATE ─────────────────────────────────────────────────────────
function highlightActiveNav() {
    const page = location.pathname.split('/').pop();
    document.querySelectorAll('.nav-link').forEach(el => {
        el.classList.toggle('active', el.getAttribute('href') === page);
    });
}

// ── USER DROPDOWN ─────────────────────────────────────────────────────────────
function initUserDropdown() {
    const user = getAuth();
    const btn = document.getElementById('avatarBtn');
    if (!btn || !user) return;
    btn.textContent = user.avatar;

    // Dropdown menu
    const menu = document.createElement('div');
    menu.id = 'userDropdown';
    menu.style.cssText = `
    position:absolute; top:calc(100% + .5rem); right:0; width:220px;
    background:#fff; border-radius:var(--radius-lg);
    box-shadow:var(--shadow-lg); border:1px solid #f0f0ed;
    overflow:hidden; z-index:200; display:none;
    animation:fadeIn .15s ease;
  `;
    menu.innerHTML = `
    <div style="padding:1rem;background:var(--green-50);border-bottom:1px solid var(--green-100)">
      <div style="font-weight:700;font-size:.9rem">${user.name}</div>
      <div style="font-size:.75rem;color:var(--gray-600)">${user.email}</div>
      <div class="badge badge-green mt-1" style="font-size:.72rem">⭐ ${formatNumber(user.points)} điểm</div>
    </div>
    <div style="padding:.5rem 0">
      <a href="profile.html" class="dropdown-item" style="display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;font-size:.88rem;color:var(--gray-800);cursor:pointer;transition:var(--transition)">
        👤 Hồ sơ cá nhân
      </a>
      <a href="orders.html" class="dropdown-item" style="display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;font-size:.88rem;color:var(--gray-800);cursor:pointer;transition:var(--transition)">
        📦 Lịch sử đơn hàng
      </a>
      <a href="subscription.html" class="dropdown-item" style="display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;font-size:.88rem;color:var(--gray-800);cursor:pointer;transition:var(--transition)">
        🔄 Gói ăn của tôi
      </a>
      <hr style="margin:.25rem 0;border-color:#f0f0ed">
      <div class="dropdown-item" onclick="logout()" style="display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;font-size:.88rem;color:var(--accent-red);cursor:pointer;transition:var(--transition)">
        🚪 Đăng xuất
      </div>
    </div>
  `;
    // Style hover
    menu.querySelectorAll('.dropdown-item').forEach(el => {
        el.addEventListener('mouseenter', () => el.style.background = 'var(--gray-100)');
        el.addEventListener('mouseleave', () => el.style.background = '');
    });

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative;display:inline-block';
    btn.parentNode.insertBefore(wrap, btn);
    wrap.appendChild(btn);
    wrap.appendChild(menu);

    btn.addEventListener('click', e => {
        e.stopPropagation();
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });
    document.addEventListener('click', () => { menu.style.display = 'none'; });
}

// ── CART MANAGER ─────────────────────────────────────────────────────────────
const CartManager = {
    add(product, qty = 1, note = '') {
        const cart = getCart();
        const existing = cart.find(i => i.id === product.id && i.note === note);
        if (existing) existing.qty = (existing.qty || 1) + qty;
        else cart.push({ id: product.id, name: product.name, emoji: product.emoji, price: product.price, calories: product.calories || 0, qty, note });
        saveCart(cart);
        updateCartBadge();
        showToast(`Đã thêm ${product.name} vào giỏ 🛒`);
    },

    remove(id, note = '') {
        const cart = getCart().filter(i => !(i.id === id && i.note === note));
        saveCart(cart); updateCartBadge();
    },

    setQty(id, qty, note = '') {
        const cart = getCart();
        const item = cart.find(i => i.id === id && i.note === note);
        if (!item) return;
        if (qty <= 0) this.remove(id, note);
        else { item.qty = qty; saveCart(cart); updateCartBadge(); }
    },

    clear() { saveCart([]); updateCartBadge(); },

    getSubtotal() { return getCart().reduce((s, i) => s + i.price * (i.qty || 1), 0); },
    getTotalCal() { return getCart().reduce((s, i) => s + (i.calories || 0) * (i.qty || 1), 0); },
    getItemCount() { return getCart().reduce((s, i) => s + (i.qty || 1), 0); }
};

// ── RENDER CART SIDEBAR (dùng lại nhiều trang) ───────────────────────────────
function renderCartSidebar(sidebarId = 'cartSidebar') {
    const sidebar = document.getElementById(sidebarId);
    if (!sidebar) return;

    const cart = getCart();
    const listEl = sidebar.querySelector('#cartItemList');
    const sumEl = sidebar.querySelector('#cartSummary');

    if (!cart.length) {
        if (listEl) listEl.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--gray-400)">
        <div style="font-size:3.5rem;margin-bottom:.75rem">🛒</div>
        <p style="font-weight:600">Giỏ hàng đang trống</p>
        <p style="font-size:.8rem;margin-top:.3rem">Thêm vài món để bắt đầu nhé!</p>
      </div>`;
        if (sumEl) sumEl.innerHTML = '';
        return;
    }

    if (listEl) {
        listEl.innerHTML = cart.map(item => `
      <div class="cart-item">
        <span class="cart-item-emoji">${item.emoji}</span>
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatCurrency(item.price * (item.qty || 1))}</div>
          ${item.note ? `<div style="font-size:.7rem;color:var(--accent-orange)">📝 ${item.note}</div>` : ''}
          <div style="font-size:.7rem;color:var(--gray-400)">🔥 ${(item.calories || 0) * (item.qty || 1)} kcal</div>
        </div>
        <div class="qty-ctrl">
          <button class="qty-btn" onclick="CartManager.setQty(${item.id},${(item.qty || 1) - 1},'${item.note || ''}');renderCartSidebar()">−</button>
          <span class="qty-num">${item.qty || 1}</span>
          <button class="qty-btn" onclick="CartManager.setQty(${item.id},${(item.qty || 1) + 1},'${item.note || ''}');renderCartSidebar()">+</button>
        </div>
      </div>
    `).join('');
    }

    if (sumEl) {
        const sub = CartManager.getSubtotal();
        const ship = 25000;
        sumEl.innerHTML = `
      <div class="cart-row"><span>Tạm tính</span><span>${formatCurrency(sub)}</span></div>
      <div class="cart-row"><span>Phí giao hàng</span><span>${formatCurrency(ship)}</span></div>
      <div class="cart-row cart-total"><span>Tổng cộng</span><span style="color:var(--green-700)">${formatCurrency(sub + ship)}</span></div>
      <div class="badge badge-orange mt-1" style="font-size:.72rem">🔥 ${CartManager.getTotalCal()} kcal</div>
    `;
    }
}

// ── FOOD CARD RENDERER ───────────────────────────────────────────────────────
function renderFoodCard(p, opts = {}) {
    const { showDetail = true, compact = false } = opts;
    return `
    <div class="food-card animate-in" ${showDetail ? `onclick="openFoodDetail(${p.id})"` : ''}>
      <div class="food-img">
        <div class="food-tags">
          ${p.tags.slice(0, 2).map(t => `<span class="badge badge-green">${t}</span>`).join('')}
        </div>
        <span style="font-size:${compact ? '3rem' : '4rem'}">${p.emoji}</span>
        <button class="fav-btn" onclick="event.stopPropagation();toggleFavourite(this,${p.id})"
          data-fav="${isFavourite(p.id)}">
          ${isFavourite(p.id) ? '❤️' : '🤍'}
        </button>
      </div>
      <div class="food-info">
        <div class="food-name">${p.name}</div>
        ${!compact ? `<div class="food-desc">${p.desc}</div>` : ''}
        <div class="nutrition-chips mb-1">
          <span class="nutr-chip cal">🔥 ${p.calories} kcal</span>
          <span class="nutr-chip pro">💪 ${p.protein}g</span>
          <span class="nutr-chip carb">🌾 ${p.carb}g</span>
        </div>
        <div class="food-meta">
          <span class="food-price">${formatCurrency(p.price)}</span>
          <button class="food-add-btn" onclick="event.stopPropagation();CartManager.add({id:${p.id},name:'${p.name.replace(/'/g, "\\'")}',emoji:'${p.emoji}',price:${p.price},calories:${p.calories}});updateCartBadge()">
            + Thêm
          </button>
        </div>
      </div>
    </div>
  `;
}

// ── FAVOURITES ───────────────────────────────────────────────────────────────
function getFavourites() {
    try { return JSON.parse(localStorage.getItem('hfp_favs')) || []; } catch { return []; }
}
function isFavourite(id) { return getFavourites().includes(+id); }
function toggleFavourite(btn, id) {
    const favs = getFavourites();
    const idx = favs.indexOf(+id);
    if (idx >= 0) { favs.splice(idx, 1); btn.textContent = '🤍'; }
    else { favs.push(+id); btn.textContent = '❤️'; }
    localStorage.setItem('hfp_favs', JSON.stringify(favs));
}

// ── FOOD DETAIL MODAL ─────────────────────────────────────────────────────────
let _detailProduct = null;
let _detailQty = 1;

function openFoodDetail(id) {
    _detailProduct = MOCK_PRODUCTS.find(p => p.id === +id);
    if (!_detailProduct) return;
    _detailQty = 1;

    const setField = (sel, val, prop = 'textContent') => {
        const el = document.querySelector(sel);
        if (el) el[prop] = val;
    };

    setField('#dName', _detailProduct.name);
    setField('#dEmoji', _detailProduct.emoji);
    setField('#dDesc', _detailProduct.desc);

    const chips = document.getElementById('dChips');
    if (chips) chips.innerHTML = `
    <span class="nutr-chip cal">🔥 ${_detailProduct.calories} kcal</span>
    <span class="nutr-chip pro">💪 ${_detailProduct.protein}g protein</span>
    <span class="nutr-chip fat">🥑 ${_detailProduct.fat}g chất béo</span>
    <span class="nutr-chip carb">🌾 ${_detailProduct.carb}g carbs</span>
  `;

    const nutr = document.getElementById('dNutr');
    if (nutr) nutr.innerHTML = [
        ['Calories', 'kcal', _detailProduct.calories],
        ['Protein', 'g', _detailProduct.protein],
        ['Carbs', 'g', _detailProduct.carb],
        ['Chất béo', 'g', _detailProduct.fat],
    ].map(([l, u, v]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid #f5f5f2;font-size:.85rem">
      <span style="color:var(--gray-600)">${l}</span>
      <span style="font-weight:700">${v} ${u}</span>
    </div>
  `).join('');

    const noteEl = document.getElementById('dNote');
    if (noteEl) noteEl.value = '';
    updateDetailQty();

    const addBtn = document.getElementById('dAddBtn');
    if (addBtn) {
        addBtn.onclick = () => {
            const note = noteEl?.value || '';
            CartManager.add(_detailProduct, _detailQty, note);
            closeModal('detailModal');
            renderCartSidebar();
        };
    }
    openModal('detailModal');
}

function changeDetailQty(delta) {
    _detailQty = Math.max(1, _detailQty + delta);
    updateDetailQty();
}
function updateDetailQty() {
    const qEl = document.getElementById('dQty');
    const pEl = document.getElementById('dTotalPrice');
    if (qEl) qEl.textContent = _detailQty;
    if (pEl && _detailProduct) pEl.textContent = formatCurrency(_detailProduct.price * _detailQty);
}

// ── SUBSCRIPTION HELPERS ──────────────────────────────────────────────────────
function subscribePlan(planName, price) {
    const user = getAuth();
    if (!user) { window.location.href = '/index.html'; return; }
    showToast(`Đăng ký gói "${planName}" thành công! 🎉`);
    setTimeout(() => window.location.href = 'orders.html', 1500);
}

// ── CALORIE TRACKER (Profile) ─────────────────────────────────────────────────
function buildCalorieRing(current, goal, canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const pct = Math.min(1, current / goal);
    const r = 50; const cx = 60; const cy = 60;
    ctx.clearRect(0, 0, 120, 120);
    // Track
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#f0f0ed'; ctx.lineWidth = 10; ctx.stroke();
    // Fill
    ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
    ctx.strokeStyle = pct > 0.9 ? '#e84040' : pct > 0.7 ? '#f5813c' : '#3aad68';
    ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
}

// ── ORDER TRACKING ────────────────────────────────────────────────────────────
const ORDER_STATUS_MAP = {
    pending: { label: 'Đang chờ xác nhận', icon: '⏳', step: 0 },
    confirmed: { label: 'Đã xác nhận', icon: '✅', step: 1 },
    preparing: { label: 'Đang chế biến', icon: '👨‍🍳', step: 2 },
    ready: { label: 'Sẵn sàng giao', icon: '📦', step: 3 },
    delivering: { label: 'Đang giao hàng', icon: '🛵', step: 4 },
    done: { label: 'Đã giao xong', icon: '🎉', step: 5 },
    cancelled: { label: 'Đã huỷ', icon: '❌', step: -1 }
};

function renderOrderTracking(status, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const steps = [
        { key: 'confirmed', label: 'Đã xác nhận', icon: '✅' },
        { key: 'preparing', label: 'Đang chế biến', icon: '👨‍🍳' },
        { key: 'ready', label: 'Sẵn sàng giao', icon: '📦' },
        { key: 'delivering', label: 'Đang giao', icon: '🛵' },
        { key: 'done', label: 'Đã giao', icon: '🎉' },
    ];
    const currentStep = ORDER_STATUS_MAP[status]?.step ?? 0;
    container.innerHTML = steps.map((s, i) => {
        const stepNum = i + 1;
        const isDone = currentStep > stepNum;
        const isActive = currentStep === stepNum;
        return `
      ${i > 0 ? `<div class="track-line ${isDone || isActive ? 'done' : ''}"></div>` : ''}
      <div class="track-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}">
        <div class="track-dot">${isDone ? '✓' : s.icon}</div>
        <div class="track-info">
          <div class="track-title">${s.label}</div>
          ${isDone || isActive ? '<div class="track-time">Hoàn thành</div>' : ''}
        </div>
      </div>
    `;
    }).join('');
}

// ── SEARCH DEBOUNCE ───────────────────────────────────────────────────────────
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ── VOUCHER VALIDATION ────────────────────────────────────────────────────────
function validateVoucher(code, subtotal) {
    const voucher = MOCK_VOUCHERS.find(v => v.code === code.toUpperCase() && v.status === 'active');
    if (!voucher) return { valid: false, message: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' };
    if (subtotal < voucher.minOrder) return {
        valid: false,
        message: `Đơn hàng tối thiểu ${formatCurrency(voucher.minOrder)} để dùng mã này`
    };
    const discount = voucher.type === 'percent'
        ? Math.round(subtotal * voucher.discount / 100)
        : voucher.discount;
    return { valid: true, discount, message: `Giảm ${formatCurrency(discount)} thành công! 🎉`, voucher };
}