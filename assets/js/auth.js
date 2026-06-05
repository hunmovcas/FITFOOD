/* ============================================================
   AUTH.JS - Xử lý xác thực người dùng
   Đăng nhập / Đăng xuất / Kiểm tra JWT token
   ============================================================ */

const Auth = (() => {
    /* --- Hằng số --- */
    const TOKEN_KEY = 'ff_token';
    const USER_KEY = 'ff_user';
    const EXPIRY_KEY = 'ff_token_exp';

    /* --- Lưu thông tin đăng nhập --- */
    function saveSession(token, user, expiresIn = 86400) {
        const expiry = Date.now() + expiresIn * 1000;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        localStorage.setItem(EXPIRY_KEY, expiry.toString());
    }

    /* --- Lấy JWT token hiện tại --- */
    function getToken() {
        if (isExpired()) {
            logout();
            return null;
        }
        return localStorage.getItem(TOKEN_KEY);
    }

    /* --- Lấy thông tin user đang đăng nhập --- */
    function getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    /* --- Kiểm tra token đã hết hạn chưa --- */
    function isExpired() {
        const expiry = localStorage.getItem(EXPIRY_KEY);
        if (!expiry) return true;
        return Date.now() > parseInt(expiry);
    }

    /* --- Kiểm tra đã đăng nhập chưa --- */
    function isLoggedIn() {
        return !!getToken() && !!getUser();
    }

    /* --- Đăng xuất --- */
    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(EXPIRY_KEY);
        // Xóa giỏ hàng khi đăng xuất
        localStorage.removeItem('ff_cart');
    }

    /* --- Đăng nhập qua API --- */
    async function login(email, password) {
        try {
            const res = await API.post('/api/auth/login', { email, password });
            if (res.token && res.user) {
                saveSession(res.token, res.user, res.expiresIn);
                return { success: true, user: res.user };
            }
            return { success: false, message: res.message || 'Đăng nhập thất bại' };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /* --- Đăng ký tài khoản --- */
    async function register(data) {
        try {
            const res = await API.post('/api/auth/register', data);
            if (res.token && res.user) {
                saveSession(res.token, res.user, res.expiresIn);
                return { success: true, user: res.user };
            }
            return { success: false, message: res.message };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    /* --- Kiểm tra phân quyền --- */
    function hasRole(role) {
        const user = getUser();
        if (!user) return false;
        if (Array.isArray(role)) return role.includes(user.role);
        return user.role === role;
    }

    /* --- Bảo vệ trang: redirect nếu chưa đăng nhập --- */
    function requireAuth(redirectTo = '/index.html') {
        if (!isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    /* --- Bảo vệ trang: redirect nếu sai role --- */
    function requireRole(role, redirectTo = '/index.html') {
        if (!requireAuth(redirectTo)) return false;
        if (!hasRole(role)) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    /* --- Hiển thị thông tin user trên UI --- */
    function renderUserInfo(selector) {
        const user = getUser();
        const el = document.querySelector(selector);
        if (!el || !user) return;
        el.textContent = user.full_name || user.email;
    }

    return {
        login, register, logout,
        getToken, getUser,
        isLoggedIn, isExpired, hasRole,
        requireAuth, requireRole,
        renderUserInfo
    };
})();

/* --- Xử lý form đăng nhập (nếu có trên trang) --- */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('[name="email"]').value.trim();
        const password = loginForm.querySelector('[name="password"]').value;
        const btn = loginForm.querySelector('[type="submit"]');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:18px;height:18px;border-width:2px"></span>';

        const result = await Auth.login(email, password);

        if (result.success) {
            Toast.show('Đăng nhập thành công! 🎉', 'success');
            // Redirect theo role
            setTimeout(() => {
                const role = result.user.role;
                if (role === 'admin') window.location.href = '/src/admin/dashboard.html';
                else if (role === 'kitchen' || role === 'cashier')
                    window.location.href = '/src/kitchen/kds.html';
                else window.location.href = '/src/customer/home.html';
            }, 800);
        } else {
            Toast.show(result.message || 'Email hoặc mật khẩu không đúng', 'error');
            btn.disabled = false;
            btn.textContent = 'Đăng nhập';
        }
    });
});