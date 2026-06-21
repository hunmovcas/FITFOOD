/* ============================================================
   API.JS - Module gọi API trung tâm
   Wrapper fetch với auth header, xử lý lỗi tập trung
   ============================================================ */

const API = (() => {
    /* --- Cấu hình base URL --- */
    // Đổi thành URL backend thực tế khi deploy
    const BASE_URL = window.FF_API_URL || 'http://localhost:3000';

    /* --- Tạo headers chuẩn kèm JWT --- */
    function buildHeaders(extra = {}) {
        const token = typeof Auth !== 'undefined' ? Auth.getToken() : null;
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...extra
        };
    }

    /* --- Hàm fetch wrapper chính --- */
    async function request(method, endpoint, body = null, extraHeaders = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

        const options = {
            method,
            headers: buildHeaders(extraHeaders),
        };

        if (body && method !== 'GET') {
            options.body = JSON.stringify(body);
        }

        try {
            const res = await fetch(url, options);

            // Xử lý 401 - token hết hạn
            if (res.status === 401) {
                if (typeof Auth !== 'undefined') Auth.logout();
                window.location.href = '/index.html';
                return;
            }

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || `Lỗi HTTP ${res.status}`);
            }

            return data;
        } catch (err) {
            // Nếu không kết nối được server → dùng mock data
            if (err instanceof TypeError && err.message.includes('fetch')) {
                console.warn('[API] Không kết nối được server, dùng mock data');
                return getMockData(method, endpoint, body);
            }
            throw err;
        }
    }

    /* --- Các method tiện ích --- */
    const get = (ep) => request('GET', ep);
    const post = (ep, body) => request('POST', ep, body);
    const put = (ep, body) => request('PUT', ep, body);
    const patch = (ep, body) => request('PATCH', ep, body);
    const del = (ep) => request('DELETE', ep);

    /* ===================================================
       MOCK DATA - dùng khi backend chưa kết nối
       Xóa/thay thế khi deploy thực tế
       =================================================== */
    function getMockData(method, endpoint, body) {
        // Danh sách món ăn mẫu
        if (endpoint.includes('/api/products')) {
            return { success: true, data: MOCK.products, total: MOCK.products.length };
        }
        // Đơn hàng mẫu
        if (endpoint.includes('/api/orders')) {
            if (method === 'GET') return { success: true, data: MOCK.orders };
            if (method === 'POST') return { success: true, data: { ...body, id: Date.now(), status: 'pending' }, message: 'Đặt hàng thành công' };
        }
        // Kho nguyên liệu
        if (endpoint.includes('/api/inventory')) {
            return { success: true, data: MOCK.inventory };
        }
        // Đăng nhập
        if (endpoint.includes('/api/auth/login')) {
            const email = body?.email || '';
            let assignedRole = 'customer'; // Mặc định là khách hàng
            
            // Phân loại role dựa trên email nhập vào
            if (email.includes('admin')) assignedRole = 'admin';
            else if (email.includes('kitchen')) assignedRole = 'kitchen';

            return {
                success: true,
                token: 'mock-jwt-token',
                user: { 
                    id: Date.now(), 
                    full_name: 'Người dùng Demo', 
                    email: email, 
                    role: assignedRole 
                },
                expiresIn: 86400
            };
        }
        // Dashboard KPI
        if (endpoint.includes('/api/admin/kpi')) {
            return { success: true, data: MOCK.kpi };
        }
        return { success: true, data: [] };
    }

    return { get, post, put, patch, delete: del, request };
})();

/* ============================================================
   MOCK DATA - Dữ liệu giả lập để demo giao diện
   ============================================================ */
const MOCK = {
    products: [
        {
            id: 1, name: 'Cơm gà nướng Eat Clean',
            description: 'Ức gà nướng mật ong, gạo lứt, rau củ hấp hữu cơ',
            price: 85000, calories: 420, protein: 38, carbs: 45, fat: 8,
            category: 'eat-clean', image: '🍱', tags: ['Eat Clean', 'Tăng cơ'],
            available: true
        },
        {
            id: 2, name: 'Salad Keto Bơ Trứng',
            description: 'Bơ tươi, trứng luộc, rau xà lách, dầu olive extra virgin',
            price: 75000, calories: 380, protein: 18, carbs: 8, fat: 32,
            category: 'keto', image: '🥗', tags: ['Keto', 'Giảm cân'],
            available: true
        },
        {
            id: 3, name: 'Bowl Quinoa Low-Carb',
            description: 'Quinoa, ức gà xé, rau cải bó xôi, hạt chia, sốt tahini',
            price: 92000, calories: 350, protein: 28, carbs: 32, fat: 12,
            category: 'low-carb', image: '🥙', tags: ['Low-carb', 'Eat Clean'],
            available: true
        },
        {
            id: 4, name: 'Cháo yến mạch Detox',
            description: 'Yến mạch hữu cơ, hạt lanh, chuối, mật ong manuka',
            price: 55000, calories: 280, protein: 12, carbs: 52, fat: 6,
            category: 'eat-clean', image: '🥣', tags: ['Eat Clean', 'Giảm cân'],
            available: true
        },
        {
            id: 5, name: 'Bò áp chảo Protein Bowl',
            description: 'Bò thăn nội thăn, khoai lang nướng, bông cải xanh hấp',
            price: 115000, calories: 520, protein: 45, carbs: 38, fat: 18,
            category: 'high-protein', image: '🥩', tags: ['Tăng cơ'],
            available: true
        },
        {
            id: 6, name: 'Cuốn diếp cá hồi',
            description: 'Cá hồi Na Uy, xà lách butter, dưa leo, sốt wasabi nhẹ',
            price: 98000, calories: 310, protein: 24, carbs: 12, fat: 20,
            category: 'keto', image: '🫔', tags: ['Keto', 'Low-carb'],
            available: true
        },
    ],

    inventory: [
        { id: '#01234', category: 'Rau củ', name: 'Củ cải trắng', qty: 5, unit: 'kg', import_date: '17/05', expiry: '20/05', status: 'warning' },
        { id: '#01235', category: 'Thịt', name: 'Ức gà', qty: 12, unit: 'kg', import_date: '17/05', expiry: '19/05', status: 'critical' },
        { id: '#01236', category: 'Rau củ', name: 'Bông cải xanh', qty: 8, unit: 'kg', import_date: '17/05', expiry: '21/05', status: 'ok' },
        { id: '#01237', category: 'Hải sản', name: 'Cá hồi fillet', qty: 3, unit: 'kg', import_date: '17/05', expiry: '18/05', status: 'critical' },
        { id: '#01238', category: 'Ngũ cốc', name: 'Gạo lứt', qty: 20, unit: 'kg', import_date: '15/05', expiry: '15/06', status: 'ok' },
        { id: '#01239', category: 'Rau củ', name: 'Xà lách butter', qty: 2, unit: 'kg', import_date: '17/05', expiry: '19/05', status: 'critical' },
    ],

    orders: [
        { id: '#FF-2401', customer: 'Nguyễn Thị Lan', items: 3, total: 255000, status: 'preparing', time: '14:32', type: 'online' },
        { id: '#FF-2402', customer: 'Trần Văn Minh', items: 1, total: 85000, status: 'ready', time: '14:28', type: 'online' },
        { id: '#FF-2403', customer: 'Lê Hoàng Nam', items: 2, total: 167000, status: 'pending', time: '14:35', type: 'online' },
    ],

    kpi: {
        revenue_today: 8540000,
        orders_today: 47,
        food_waste_pct: 3.2,
        retention_rate: 78.5,
        revenue_change: +12.4,
        orders_change: +5,
        waste_change: -0.8,
        retention_change: +2.1,
        chart_revenue: [6.2, 7.1, 5.8, 8.5, 7.9, 9.2, 8.54],
        chart_labels: ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'],
    }
};