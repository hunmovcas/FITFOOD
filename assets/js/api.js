// ── api.js ── Wrapper gọi API trung tâm ─────────────────────────────────────
// Ưu tiên: gọi backend thật → nếu lỗi dùng MOCK data (demo offline)

const API_BASE_URL = (() => {
    if (typeof window === 'undefined') return 'http://localhost:3000/api';
    return window.API_BASE || 'http://localhost:3000/api';
})();

// ── Lấy token xác thực từ session ───────────────────────────────────────────
function getAuthToken() {
    try {
        const user = JSON.parse(localStorage.getItem('hfp_auth'));
        if (!user) return null;
        return btoa(JSON.stringify({ id: user.id, role: user.role, ts: Date.now() }));
    } catch { return null; }
}

// ── Request thô ─────────────────────────────────────────────────────────────
async function request(method, path, body = null, signal = null) {
    const token = getAuthToken();
    const opts = {
        method: method.toUpperCase(),
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        ...(signal ? { signal } : {})
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const response = await fetch(`${API_BASE_URL}${path}`, opts);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
}

// ── Retry wrapper ────────────────────────────────────────────────────────────
async function callWithFallback(method, path, body = null, mockFn = null) {
    try {
        return await request(method, path, body);
    } catch (err) {
        if (mockFn) {
            console.warn(`[API] ${method} ${path} → dùng mock data (${err.message})`);
            return mockFn(method, path, body);
        }
        throw err;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── PRODUCTS ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const ProductsAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return callWithFallback('GET', `/products${qs ? '?' + qs : ''}`, null,
            () => ({ success: true, data: MOCK_PRODUCTS })
        );
    },
    getById: (id) => callWithFallback('GET', `/products/${id}`, null,
        () => ({ success: true, data: MOCK_PRODUCTS.find(p => p.id === +id) || null })
    ),
    create: (data) => callWithFallback('POST', '/products', data,
        () => ({ success: true, message: 'Thêm món thành công (demo)', id: Date.now() })
    ),
    update: (id, data) => callWithFallback('PUT', `/products/${id}`, data,
        () => ({ success: true, message: 'Cập nhật thành công (demo)' })
    ),
    delete: (id) => callWithFallback('DELETE', `/products/${id}`, null,
        () => ({ success: true, message: 'Đã xoá (demo)' })
    ),
    toggleAvailable: (id, available) => callWithFallback('PATCH', `/products/${id}/available`, { available },
        () => ({ success: true })
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── ORDERS ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const OrdersAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return callWithFallback('GET', `/orders${qs ? '?' + qs : ''}`, null,
            () => ({ success: true, data: MOCK_ORDERS })
        );
    },
    getById: (id) => callWithFallback('GET', `/orders/${id}`, null,
        () => ({ success: true, data: MOCK_ORDERS.find(o => o.id === id) || null })
    ),
    create: (data) => callWithFallback('POST', '/orders', data,
        () => ({
            success: true,
            message: 'Đặt hàng thành công',
            order_id: '#' + (2400 + Math.floor(Math.random() * 100))
        })
    ),
    updateStatus: (id, status) => callWithFallback('PATCH', `/orders/${id}/status`, { status },
        () => ({ success: true, message: 'Cập nhật trạng thái (demo)' })
    ),
    getMyOrders: () => callWithFallback('GET', '/orders/my', null,
        () => ({ success: true, data: MOCK_ORDERS.slice(0, 3) })
    ),
    getKitchenQueue: () => callWithFallback('GET', '/orders/kitchen-queue', null,
        () => ({
            success: true,
            data: MOCK_ORDERS.filter(o => ['pending', 'confirmed', 'preparing'].includes(o.status))
        })
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── INVENTORY ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const InventoryAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return callWithFallback('GET', `/inventory${qs ? '?' + qs : ''}`, null,
            () => ({ success: true, data: MOCK_INVENTORY })
        );
    },
    getById: (id) => callWithFallback('GET', `/inventory/${id}`, null,
        () => ({ success: true, data: MOCK_INVENTORY.find(i => i.id === id) || null })
    ),
    create: (data) => callWithFallback('POST', '/inventory', data,
        () => ({ success: true, message: 'Thêm nguyên liệu (demo)', id: Date.now() })
    ),
    update: (id, data) => callWithFallback('PUT', `/inventory/${id}`, data,
        () => ({ success: true, message: 'Cập nhật kho (demo)' })
    ),
    adjustStock: (id, delta, reason) => callWithFallback('PATCH', `/inventory/${id}/adjust`,
        { delta, reason },
        () => ({ success: true, message: `Điều chỉnh tồn kho (demo): ${delta > 0 ? '+' : ''}${delta}` })
    ),
    getLowStock: () => callWithFallback('GET', '/inventory/alerts/low-stock', null,
        () => ({
            success: true,
            data: MOCK_INVENTORY.filter(i => i.qty <= i.minQty)
        })
    ),
    getExpiringSoon: (days = 3) => callWithFallback('GET', `/inventory/alerts/expiring?days=${days}`, null,
        () => {
            const today = new Date();
            return {
                success: true,
                data: MOCK_INVENTORY.filter(i => {
                    const diff = (new Date(i.expire) - today) / 86400000;
                    return diff >= 0 && diff <= days;
                })
            };
        }
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── SUPPLIERS ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const SuppliersAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return callWithFallback('GET', `/suppliers${qs ? '?' + qs : ''}`, null,
            () => ({ success: true, data: MOCK_SUPPLIERS })
        );
    },
    getById: (id) => callWithFallback('GET', `/suppliers/${id}`, null,
        () => ({ success: true, data: MOCK_SUPPLIERS.find(s => s.id === +id) || null })
    ),
    create: (data) => callWithFallback('POST', '/suppliers', data,
        () => ({ success: true, message: 'Thêm nhà cung cấp (demo)', id: Date.now() })
    ),
    update: (id, data) => callWithFallback('PUT', `/suppliers/${id}`, data,
        () => ({ success: true, message: 'Cập nhật (demo)' })
    ),
    delete: (id) => callWithFallback('DELETE', `/suppliers/${id}`, null,
        () => ({ success: true, message: 'Đã xoá (demo)' })
    ),
    createPO: (supplierId, data) => callWithFallback('POST', `/suppliers/${supplierId}/purchase-order`, data,
        () => ({ success: true, message: 'Tạo đơn nhập (demo)', purchase_order_id: Date.now() })
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── STAFF ─────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const StaffAPI = {
    getAll: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return callWithFallback('GET', `/users${qs ? '?' + qs : ''}`, null,
            () => ({ success: true, data: MOCK_STAFF })
        );
    },
    getById: (id) => callWithFallback('GET', `/users/${id}`, null,
        () => ({ success: true, data: MOCK_STAFF.find(s => s.id === +id) || null })
    ),
    create: (data) => callWithFallback('POST', '/users', data,
        () => ({ success: true, message: 'Thêm nhân sự (demo)', id: Date.now() })
    ),
    update: (id, data) => callWithFallback('PUT', `/users/${id}`, data,
        () => ({ success: true, message: 'Cập nhật (demo)' })
    ),
    toggleStatus: (id, active) => callWithFallback('PATCH', `/users/${id}/status`, { active },
        () => ({ success: true })
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── AUTH ──────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const AuthAPI = {
    login: (email, password) => callWithFallback('POST', '/auth/login', { email, password },
        (_m, _p, b) => {
            const u = USERS.find(x => x.email === b.email && x.password === b.password);
            if (!u) throw new Error('Sai email hoặc mật khẩu');
            return { success: true, user: u };
        }
    ),
    changePassword: (oldPw, newPw) => callWithFallback('POST', '/auth/change-password', { oldPw, newPw },
        () => ({ success: true, message: 'Đổi mật khẩu thành công (demo)' })
    )
};

// ═══════════════════════════════════════════════════════════════════════════════
// ── ANALYTICS (Admin) ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const AnalyticsAPI = {
    getDashboard: () => callWithFallback('GET', '/analytics/dashboard', null,
        () => ({
            success: true,
            data: {
                revenue_today: 2_850_000,
                revenue_week: 18_420_000,
                revenue_month: 72_300_000,
                orders_today: 34,
                orders_pending: 7,
                active_subs: 48,
                new_customers: 12,
                top_items: MOCK_PRODUCTS.slice(0, 5),
                food_waste_pct: 4.2,
                retention_rate: 78.5,
                revenue_chart: [3.2, 4.1, 2.8, 5.2, 4.8, 6.1, 5.5, 7.2, 6.8, 8.1, 7.4, 9.2].map((v, i) => ({ day: i + 1, value: v * 100000 }))
            }
        })
    ),
    getTopProducts: (limit = 10) => callWithFallback('GET', `/analytics/top-products?limit=${limit}`, null,
        () => ({
            success: true,
            data: MOCK_PRODUCTS.map((p, i) => ({
                ...p,
                orders_count: Math.floor(Math.random() * 200) + 50,
                revenue: Math.floor(Math.random() * 5000000) + 500000
            })).sort((a, b) => b.orders_count - a.orders_count).slice(0, limit)
        })
    ),
    getFoodWaste: () => callWithFallback('GET', '/analytics/food-waste', null,
        () => ({
            success: true,
            data: MOCK_INVENTORY.map(i => ({
                name: i.name,
                category: i.category,
                waste_kg: +(Math.random() * 1.5).toFixed(2),
                waste_pct: +(Math.random() * 8).toFixed(1),
                waste_cost: Math.floor(Math.random() * 50000)
            }))
        })
    ),
    getRetentionRate: () => callWithFallback('GET', '/analytics/retention', null,
        () => ({
            success: true,
            data: { rate: 78.5, renewed: 94, total: 120, churned: 26 }
        })
    )
};

// ── Export global ────────────────────────────────────────────────────────────
window.API = {
    products: ProductsAPI,
    orders: OrdersAPI,
    inventory: InventoryAPI,
    suppliers: SuppliersAPI,
    staff: StaffAPI,
    auth: AuthAPI,
    analytics: AnalyticsAPI
};