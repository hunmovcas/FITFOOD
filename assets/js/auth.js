// ── Auth & Routing ──────────────────────────────────────────────────────────
const AUTH_KEY = 'hfp_auth';
const CART_KEY = 'hfp_cart';

const USERS = [
    { id: 1, name: 'Nguyễn Minh Anh', email: 'customer@demo.com', password: '123456', role: 'customer', points: 1250, avatar: 'MA' },
    { id: 2, name: 'Trần Văn Bếp', email: 'kitchen@demo.com', password: '123456', role: 'kitchen', points: 0, avatar: 'TB' },
    { id: 3, name: 'Lê Thu Hoa', email: 'cashier@demo.com', password: '123456', role: 'cashier', points: 0, avatar: 'TH' },
    { id: 4, name: 'Admin System', email: 'admin@demo.com', password: '123456', role: 'admin', points: 0, avatar: 'AD' },
];

function getAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
}
function setAuth(user) {
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
}
function clearAuth() {
    localStorage.removeItem(AUTH_KEY);
}
function requireAuth(allowedRoles) {
    const user = getAuth();
    if (!user) { window.location.href = '/index.html'; return null; }
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        window.location.href = '/index.html'; return null;
    }
    return user;
}
function logout() {
    clearAuth();
    window.location.href = '/index.html';
}

// ── Toast notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'success', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast ${type !== 'success' ? type : ''}`;
    toast.innerHTML = `<span>${icons[type] || '✅'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── Modal helpers ────────────────────────────────────────────────────────────
function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}
function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
}
document.addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
    if (e.target.classList.contains('modal-close')) {
        e.target.closest('.modal-overlay')?.classList.remove('active');
    }
});

// ── Format helpers ───────────────────────────────────────────────────────────
function formatCurrency(n) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n);
}
function formatNumber(n) {
    return new Intl.NumberFormat('vi-VN').format(n);
}
function formatDate(d) {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatTime(d) {
    const dt = typeof d === 'string' ? new Date(d) : d;
    return dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function daysDiff(date1, date2) {
    return Math.ceil((new Date(date2) - new Date(date1)) / 86400000);
}

// ── Cart ─────────────────────────────────────────────────────────────────────
function getCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function saveCart(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
}
function addToCart(item) {
    const cart = getCart();
    const existing = cart.find(c => c.id === item.id);
    if (existing) existing.qty = (existing.qty || 1) + 1;
    else cart.push({ ...item, qty: 1 });
    saveCart(cart);
    updateCartCount();
}
function updateCartCount() {
    const cart = getCart();
    const total = cart.reduce((s, c) => s + (c.qty || 1), 0);
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = total);
}

// ── Sidebar active nav ───────────────────────────────────────────────────────
function setActiveNav(page) {
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
}

// ── Clock ────────────────────────────────────────────────────────────────────
function startClock(selector) {
    const el = document.querySelector(selector);
    if (!el) return;
    const update = () => {
        const now = new Date();
        el.textContent = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };
    update();
    setInterval(update, 1000);
}

// ── Confirm dialog ───────────────────────────────────────────────────────────
function confirmAction(message, onConfirm) {
    if (confirm(message)) onConfirm();
}

// ── API wrapper ───────────────────────────────────────────────────────────────
const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'http://localhost:3000/api';

async function apiCall(method, path, body = null) {
    const user = getAuth();
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(user ? { Authorization: `Bearer ${btoa(JSON.stringify({ id: user.id, role: user.role }))}` } : {})
        }
    };
    if (body) opts.body = JSON.stringify(body);
    try {
        const res = await fetch(`${API_BASE}${path}`, opts);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Lỗi máy chủ');
        return data;
    } catch (err) {
        // Fallback to mock data for demo
        return mockFallback(method, path, body);
    }
}

// ── Mock data fallback (for demo without backend) ────────────────────────────
function mockFallback(method, path, body) {
    // Products
    if (path.includes('/products')) return { data: MOCK_PRODUCTS };
    if (path.includes('/orders')) return { data: MOCK_ORDERS };
    if (path.includes('/inventory')) return { data: MOCK_INVENTORY };
    if (path.includes('/suppliers')) return { data: MOCK_SUPPLIERS };
    if (path.includes('/staff')) return { data: MOCK_STAFF };
    return { data: [], success: true };
}

// ── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_PRODUCTS = [
    { id: 1, name: 'Gà nướng Keto', emoji: '🍗', price: 89000, calories: 320, protein: 42, fat: 12, carb: 5, category: 'Keto', tags: ['Keto', 'High Protein'], desc: 'Ức gà thảo mộc nướng than hoa, ăn kèm salad xanh', available: true },
    { id: 2, name: 'Bát Buddha Eat Clean', emoji: '🥗', price: 79000, calories: 420, protein: 18, fat: 14, carb: 52, category: 'EatClean', tags: ['Eat Clean', 'Vegan'], desc: 'Gạo lứt, đậu hũ sốt tamari, rau củ nướng, sốt tahini', available: true },
    { id: 3, name: 'Cá hồi áp chảo', emoji: '🐟', price: 145000, calories: 380, protein: 35, fat: 18, carb: 8, category: 'HighPro', tags: ['High Protein', 'Omega-3'], desc: 'Cá hồi Na Uy với rau củ mùa vụ và sốt chanh dây', available: true },
    { id: 4, name: 'Salad Low-carb', emoji: '🥬', price: 65000, calories: 180, protein: 12, fat: 10, carb: 12, category: 'LowCarb', tags: ['Low Carb', 'Vegan'], desc: 'Xà lách romaine, dưa leo, cà chua bi, sốt mù tạt mật ong', available: true },
    { id: 5, name: 'Smoothie Bowl Acai', emoji: '🫐', price: 75000, calories: 290, protein: 8, fat: 6, carb: 48, category: 'EatClean', tags: ['Eat Clean'], desc: 'Acai, chuối, granola, hạt chia, trái cây tươi', available: true },
    { id: 6, name: 'Yến mạch Protein', emoji: '🥣', price: 55000, calories: 350, protein: 22, fat: 9, carb: 42, category: 'TangCo', tags: ['Tăng cơ', 'High Protein'], desc: 'Yến mạch, protein whey, hạt lanh, chuối, sữa hạnh nhân', available: true },
    { id: 7, name: 'Wrap Tôm Cuộn', emoji: '🌯', price: 95000, calories: 410, protein: 28, fat: 11, carb: 45, category: 'EatClean', tags: ['Eat Clean'], desc: 'Bánh mì nguyên cám, tôm sú, rau xanh, sốt Greek yogurt', available: true },
    { id: 8, name: 'Bò Keto Salad', emoji: '🥩', price: 115000, calories: 290, protein: 38, fat: 15, carb: 4, category: 'Keto', tags: ['Keto', 'Giảm cân'], desc: 'Thịt bò thảo mộc, trứng luộc, dưa leo, sốt MCT', available: true },
    { id: 9, name: 'Cơm gạo lứt gà', emoji: '🍚', price: 72000, calories: 450, protein: 30, fat: 8, carb: 58, category: 'GiamCan', tags: ['Giảm cân'], desc: 'Cơm gạo lứt, ức gà hấp, rau củ luộc, tương ít muối', available: true },
    { id: 10, name: 'Sinh tố xanh', emoji: '🥤', price: 45000, calories: 130, protein: 4, fat: 2, carb: 22, category: 'EatClean', tags: ['Eat Clean', 'Vegan'], desc: 'Cải xoăn, táo xanh, gừng, chanh, dưa leo', available: true },
    { id: 11, name: 'Súp miso rau củ', emoji: '🍜', price: 58000, calories: 160, protein: 8, fat: 3, carb: 24, category: 'LowCarb', tags: ['Low Carb', 'Vegan'], desc: 'Dashi, đậu hũ non, rong biển, nấm, hành lá', available: true },
    { id: 12, name: 'Bánh mì nguyên cám', emoji: '🥪', price: 49000, calories: 280, protein: 16, fat: 7, carb: 38, category: 'EatClean', tags: ['Eat Clean'], desc: 'Bánh mì nguyên cám, trứng bác, bơ, cà chua', available: true },
];

const MOCK_ORDERS = [
    { id: '#2401', customer: 'Nguyễn Minh Anh', items: ['Gà nướng Keto', 'Salad Low-carb'], total: 154000, status: 'delivering', time: '10:30', date: '2024-01-15', payment: 'online' },
    { id: '#2402', customer: 'Trần Thị Bình', items: ['Cá hồi áp chảo', 'Sinh tố xanh'], total: 190000, status: 'done', time: '11:05', date: '2024-01-15', payment: 'cash' },
    { id: '#2403', customer: 'Lê Quang Minh', items: ['Bát Buddha x2'], total: 158000, status: 'preparing', time: '11:20', date: '2024-01-15', payment: 'online' },
    { id: '#2404', customer: 'Phạm Thu Hà', items: ['Bò Keto Salad', 'Sinh tố xanh'], total: 160000, status: 'pending', time: '11:35', date: '2024-01-15', payment: 'online' },
    { id: '#2405', customer: 'Vũ Đức Long', items: ['Gói tuần 5 ngày'], total: 875000, status: 'confirmed', time: '09:00', date: '2024-01-15', payment: 'online' },
];

const MOCK_INVENTORY = [
    { id: '#01001', name: 'Ức gà', category: 'Thịt', unit: 'kg', qty: 15.5, minQty: 5, expire: '2024-01-17', supplier: 'Trang trại Hữu Cơ Xanh', cost: 95000 },
    { id: '#01002', name: 'Cá hồi', category: 'Hải sản', unit: 'kg', qty: 3.2, minQty: 2, expire: '2024-01-16', supplier: 'Hải sản Tươi Ngon', cost: 280000 },
    { id: '#01003', name: 'Xà lách', category: 'Rau củ', unit: 'kg', qty: 8.0, minQty: 3, expire: '2024-01-18', supplier: 'Rau Sạch Dalat', cost: 35000 },
    { id: '#01004', name: 'Củ cải', category: 'Rau củ', unit: 'kg', qty: 6.5, minQty: 3, expire: '2024-01-20', supplier: 'Rau Sạch Dalat', cost: 28000 },
    { id: '#01005', name: 'Cà chua bi', category: 'Rau củ', unit: 'kg', qty: 4.1, minQty: 2, expire: '2024-01-19', supplier: 'Rau Sạch Dalat', cost: 45000 },
    { id: '#01006', name: 'Thịt bò', category: 'Thịt', unit: 'kg', qty: 2.8, minQty: 3, expire: '2024-01-17', supplier: 'Trang trại Hữu Cơ Xanh', cost: 250000 },
    { id: '#01007', name: 'Trứng gà', category: 'Trứng', unit: 'quả', qty: 48, minQty: 24, expire: '2024-01-22', supplier: 'Trại Gà Sạch', cost: 4000 },
    { id: '#01008', name: 'Gạo lứt', category: 'Ngũ cốc', unit: 'kg', qty: 25.0, minQty: 10, expire: '2024-06-01', supplier: 'Gạo Sạch Việt', cost: 32000 },
    { id: '#01009', name: 'Đậu hũ', category: 'Đạm', unit: 'kg', qty: 5.5, minQty: 2, expire: '2024-01-18', supplier: 'Đậu Hũ Tươi', cost: 22000 },
    { id: '#01010', name: 'Tôm sú', category: 'Hải sản', unit: 'kg', qty: 1.5, minQty: 2, expire: '2024-01-16', supplier: 'Hải sản Tươi Ngon', cost: 180000 },
];

const MOCK_SUPPLIERS = [
    { id: 1, name: 'Trang trại Hữu Cơ Xanh', category: 'Thịt & Gia cầm', contact: '0901234567', email: 'order@huucoxanh.vn', rating: 4.8, certified: true, lastOrder: '2024-01-13', tags: ['Hữu cơ', 'VietGAP'] },
    { id: 2, name: 'Rau Sạch Dalat', category: 'Rau củ quả', contact: '0912345678', email: 'sales@rausachdalat.vn', rating: 4.9, certified: true, lastOrder: '2024-01-14', tags: ['GlobalGAP', 'Organic'] },
    { id: 3, name: 'Hải sản Tươi Ngon', category: 'Hải sản', contact: '0923456789', email: 'info@haisantuoi.vn', rating: 4.6, certified: false, lastOrder: '2024-01-12', tags: ['Tươi sống'] },
    { id: 4, name: 'Gạo Sạch Việt', category: 'Ngũ cốc', contact: '0934567890', email: 'gao@sachwiet.vn', rating: 4.7, certified: true, lastOrder: '2024-01-10', tags: ['Hữu cơ', 'HACCP'] },
    { id: 5, name: 'Trại Gà Sạch', category: 'Trứng & Gia cầm', contact: '0945678901', email: 'trai@gasach.vn', rating: 4.5, certified: true, lastOrder: '2024-01-14', tags: ['VietGAP'] },
];

const MOCK_STAFF = [
    { id: 1, name: 'Trần Văn Bếp', role: 'kitchen', phone: '0901111111', email: 'bep@hfp.vn', shift: 'Sáng 6-14h', status: 'active', salary: 8500000, startDate: '2023-03-01' },
    { id: 2, name: 'Lê Thu Hoa', role: 'cashier', phone: '0902222222', email: 'hoa@hfp.vn', shift: 'Sáng 8-17h', status: 'active', salary: 7500000, startDate: '2023-05-15' },
    { id: 3, name: 'Phạm Đức Khoa', role: 'kitchen', phone: '0903333333', email: 'khoa@hfp.vn', shift: 'Chiều 14-22h', status: 'active', salary: 8500000, startDate: '2023-06-01' },
    { id: 4, name: 'Nguyễn Thị Mai', role: 'shipper', phone: '0904444444', email: 'mai@hfp.vn', shift: 'Toàn ngày', status: 'active', salary: 6500000, startDate: '2023-07-20' },
    { id: 5, name: 'Vũ Minh Tuấn', role: 'cashier', phone: '0905555555', email: 'tuan@hfp.vn', shift: 'Chiều 11-20h', status: 'inactive', salary: 7500000, startDate: '2023-08-10' },
    { id: 6, name: 'Đỗ Lan Anh', role: 'kitchen', phone: '0906666666', email: 'lan@hfp.vn', shift: 'Sáng 6-14h', status: 'active', salary: 8500000, startDate: '2023-09-05' },
];

const MOCK_VOUCHERS = [
    { id: 1, code: 'HEALTHY20', discount: 20, type: 'percent', minOrder: 200000, used: 145, limit: 500, expire: '2024-02-29', status: 'active', description: 'Giảm 20% cho đơn từ 200k' },
    { id: 2, code: 'NEWUSER50K', discount: 50000, type: 'fixed', minOrder: 100000, used: 89, limit: 200, expire: '2024-01-31', status: 'active', description: 'Giảm 50k cho khách mới' },
    { id: 3, code: 'KETOFAN', discount: 15, type: 'percent', minOrder: 150000, used: 220, limit: 300, expire: '2024-01-20', status: 'expiring', description: 'Dành cho hội viên Keto' },
    { id: 4, code: 'TET2024', discount: 30, type: 'percent', minOrder: 300000, used: 0, limit: 1000, expire: '2024-02-10', status: 'scheduled', description: 'Khuyến mãi Tết Nguyên Đán' },
];