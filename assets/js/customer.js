/* ============================================================
   CUSTOMER.JS - Logic frontend portal khách hàng
   Bộ lọc món, giỏ hàng, theo dõi đơn realtime
   ============================================================ */

/* ======================== GIỎ HÀNG ======================== */
const Cart = (() => {
    const CART_KEY = 'ff_cart';

    /* --- Lấy giỏ hàng từ localStorage --- */
    function getItems() {
        try {
            return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
        } catch { return []; }
    }

    /* --- Lưu giỏ hàng --- */
    function save(items) {
        localStorage.setItem(CART_KEY, JSON.stringify(items));
        updateCartUI();
    }

    /* --- Thêm món vào giỏ --- */
    function addItem(product, qty = 1, notes = '') {
        const items = getItems();
        const existing = items.find(i => i.id === product.id);

        if (existing) {
            existing.qty += qty;
        } else {
            items.push({
                id: product.id,
                name: product.name,
                price: product.price,
                calories: product.calories,
                image: product.image,
                qty,
                notes
            });
        }

        save(items);
        Toast.show(`Đã thêm "${product.name}" vào giỏ 🛒`, 'success');
        return true;
    }

    /* --- Xóa món khỏi giỏ --- */
    function removeItem(productId) {
        const items = getItems().filter(i => i.id !== productId);
        save(items);
    }

    /* --- Cập nhật số lượng --- */
    function updateQty(productId, qty) {
        if (qty <= 0) { removeItem(productId); return; }
        const items = getItems();
        const item = items.find(i => i.id === productId);
        if (item) { item.qty = qty; save(items); }
    }

    /* --- Cập nhật ghi chú --- */
    function updateNotes(productId, notes) {
        const items = getItems();
        const item = items.find(i => i.id === productId);
        if (item) { item.notes = notes; save(items); }
    }

    /* --- Tính tổng tiền --- */
    function getTotal() {
        return getItems().reduce((sum, i) => sum + i.price * i.qty, 0);
    }

    /* --- Tính tổng calo --- */
    function getTotalCalories() {
        return getItems().reduce((sum, i) => sum + (i.calories || 0) * i.qty, 0);
    }

    /* --- Số lượng sản phẩm --- */
    function getCount() {
        return getItems().reduce((sum, i) => sum + i.qty, 0);
    }

    /* --- Xóa toàn bộ giỏ --- */
    function clear() {
        save([]);
    }

    /* --- Cập nhật badge đếm trên UI --- */
    function updateCartUI() {
        const count = getCount();
        document.querySelectorAll('.cart-count').forEach(el => {
            el.textContent = count;
            el.style.display = count > 0 ? 'flex' : 'none';
        });
    }

    return { getItems, addItem, removeItem, updateQty, updateNotes, getTotal, getTotalCalories, getCount, clear, updateCartUI };
})();

/* ======================== MENU / BỘ LỌC ======================== */
const MenuFilter = (() => {
    let allProducts = [];
    let activeFilter = 'all';
    let searchQuery = '';

    /* --- Tải danh sách món --- */
    async function loadProducts() {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        grid.innerHTML = '<div class="empty-state"><div class="spinner" style="width:32px;height:32px;border-width:3px"></div><p>Đang tải thực đơn...</p></div>';

        try {
            const res = await API.get('/api/products?available=true');
            allProducts = res.data || MOCK.products;
            renderProducts(allProducts);
        } catch {
            allProducts = MOCK.products;
            renderProducts(allProducts);
        }
    }

    /* --- Lọc sản phẩm --- */
    function filter(tag) {
        activeFilter = tag;

        // Cập nhật UI chip
        document.querySelectorAll('.filter-chip').forEach(el => {
            el.classList.toggle('active', el.dataset.filter === tag);
        });

        applyFilters();
    }

    /* --- Tìm kiếm --- */
    function search(query) {
        searchQuery = query.toLowerCase().trim();
        applyFilters();
    }

    function applyFilters() {
        let filtered = [...allProducts];

        // Lọc theo tag
        if (activeFilter !== 'all') {
            filtered = filtered.filter(p =>
                p.category === activeFilter ||
                (p.tags || []).some(t => t.toLowerCase().includes(activeFilter))
            );
        }

        // Lọc theo tìm kiếm
        if (searchQuery) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchQuery) ||
                (p.description || '').toLowerCase().includes(searchQuery)
            );
        }

        renderProducts(filtered);
    }

    /* --- Render danh sách sản phẩm --- */
    function renderProducts(products) {
        const grid = document.getElementById('products-grid');
        if (!grid) return;

        if (products.length === 0) {
            grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-state-icon">🥗</div>
          <h3>Không tìm thấy món phù hợp</h3>
          <p>Thử bộ lọc khác hoặc xóa từ khóa tìm kiếm</p>
        </div>`;
            return;
        }

        grid.innerHTML = products.map(p => `
      <div class="food-card card-hover" onclick="MenuFilter.openDetail(${p.id})">
        <div class="food-card-img">
          ${p.image_url
                ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy">`
                : `<span style="font-size:3rem">${p.image || '🍱'}</span>`}
          <div class="food-card-badges">
            ${(p.tags || []).map(t => `<span class="badge badge-green">${t}</span>`).join('')}
          </div>
        </div>
        <div class="food-card-body">
          <h4 class="food-card-name">${p.name}</h4>
          <p class="food-card-desc">${p.description || ''}</p>
          <div class="food-card-nutrition">
            <div class="nutrition-item">
              <div class="nutrition-value">${p.calories}</div>
              <div class="nutrition-label">kcal</div>
            </div>
            <div class="nutrition-item">
              <div class="nutrition-value">${p.protein}g</div>
              <div class="nutrition-label">Protein</div>
            </div>
            <div class="nutrition-item">
              <div class="nutrition-value">${p.carbs}g</div>
              <div class="nutrition-label">Carbs</div>
            </div>
            <div class="nutrition-item">
              <div class="nutrition-value">${p.fat}g</div>
              <div class="nutrition-label">Fat</div>
            </div>
          </div>
          <div class="food-card-footer">
            <span class="food-price">${formatPrice(p.price)}</span>
            <button class="add-to-cart-btn" 
              onclick="event.stopPropagation(); Cart.addItem(${JSON.stringify(p).replace(/"/g, "'")})"
              title="Thêm vào giỏ">+</button>
          </div>
        </div>
      </div>
    `).join('');
    }

    /* --- Mở popup chi tiết món --- */
    function openDetail(productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h3 style="font-family:var(--font-display)">${product.name}</h3>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div style="font-size:5rem;text-align:center;margin-bottom:var(--space-4)">${product.image || '🍱'}</div>
        <p style="margin-bottom:var(--space-5)">${product.description || ''}</p>
        
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-3);
          background:var(--neutral-50);border-radius:var(--radius-lg);padding:var(--space-4);margin-bottom:var(--space-6)">
          ${[['Calories', 'kcal', product.calories], ['Protein', 'g', product.protein],
            ['Carbs', 'g', product.carbs], ['Fat', 'g', product.fat]].map(([label, unit, val]) => `
            <div class="nutrition-item">
              <div class="nutrition-value">${val}${unit}</div>
              <div class="nutrition-label">${label}</div>
            </div>`).join('')}
        </div>

        <div class="form-group" style="margin-bottom:var(--space-5)">
          <label class="form-label">Ghi chú cá nhân hóa</label>
          <textarea class="form-textarea" id="detail-notes" placeholder="VD: Không hành, bớt muối, không cay..."></textarea>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-5)">
          <span class="food-price" style="font-size:1.5rem">${formatPrice(product.price)}</span>
          <div style="display:flex;align-items:center;gap:var(--space-3)">
            <button onclick="changeQty(-1)" style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--neutral-200);background:white;font-size:1.1rem;cursor:pointer">-</button>
            <span id="detail-qty" style="font-weight:700;min-width:24px;text-align:center">1</span>
            <button onclick="changeQty(1)"  style="width:36px;height:36px;border-radius:50%;border:1.5px solid var(--neutral-200);background:white;font-size:1.1rem;cursor:pointer">+</button>
          </div>
        </div>

        <button class="btn btn-primary w-full btn-lg" onclick="addToCartFromDetail(${product.id})">
          🛒 Thêm vào giỏ hàng
        </button>
      </div>`;

        document.body.appendChild(modal);

        // Đóng modal khi click nền
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        // Hàm thay đổi số lượng trong modal
        window.changeQty = (delta) => {
            const el = document.getElementById('detail-qty');
            const current = parseInt(el.textContent);
            const newVal = Math.max(1, current + delta);
            el.textContent = newVal;
        };

        window.addToCartFromDetail = (id) => {
            const p = allProducts.find(x => x.id === id);
            const qty = parseInt(document.getElementById('detail-qty').textContent);
            const notes = document.getElementById('detail-notes').value;
            Cart.addItem(p, qty, notes);
            modal.remove();
        };
    }

    return { loadProducts, filter, search, openDetail, renderProducts };
})();

/* ======================== UTILITIES ======================== */
/* --- Format tiền VNĐ --- */
function formatPrice(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

/* --- Format ngày giờ --- */
function formatDate(dateStr) {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

/* --- Toast notification --- */
const Toast = (() => {
    // Tạo container nếu chưa có
    function getContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    function show(message, type = 'info', duration = 3500) {
        const container = getContainer();
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 320);
        }, duration);
    }

    return { show };
})();

/* --- Khởi tạo khi DOM sẵn sàng --- */
document.addEventListener('DOMContentLoaded', () => {
    // Cập nhật số đếm giỏ hàng
    Cart.updateCartUI();

    // Navbar scroll effect
    const nav = document.querySelector('.customer-nav');
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 20);
        }, { passive: true });
    }

    // Bộ lọc chip
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', () => MenuFilter.filter(chip.dataset.filter));
    });

    // Ô tìm kiếm
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => MenuFilter.search(e.target.value));
    }

    // Hamburger menu mobile
    const hamburger = document.getElementById('hamburger-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    if (hamburger && mobileMenu) {
        hamburger.addEventListener('click', () => mobileMenu.classList.toggle('open'));
    }
});