/* ============================================================
   AUTH.JS - Xử lý xác thực người dùng
   Đăng nhập / Đăng xuất / Phân quyền điều hướng
   ============================================================ */

const Auth = (() => {
    const TOKEN_KEY = 'ff_token';
    const USER_KEY = 'ff_user';
    const EXPIRY_KEY = 'ff_token_exp';

    function saveSession(token, user, expiresIn = 86400) {
        const expiry = Date.now() + expiresIn * 1000;
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
        localStorage.setItem(EXPIRY_KEY, expiry.toString());
    }

    function getToken() {
        if (isExpired()) {
            logout();
            return null;
        }
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            const raw = localStorage.getItem(USER_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    function isExpired() {
        const expiry = localStorage.getItem(EXPIRY_KEY);
        if (!expiry) return true;
        return Date.now() > parseInt(expiry);
    }

    function isLoggedIn() {
        return !!getToken() && !!getUser();
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        localStorage.removeItem(EXPIRY_KEY);
        localStorage.removeItem('ff_cart');
    }

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

    function hasRole(role) {
        const user = getUser();
        if (!user) return false;
        if (Array.isArray(role)) return role.includes(user.role);
        return user.role === role;
    }

    // Bảo vệ các trang nội bộ
    function requireAuth(redirectTo = '/index.html') {
        if (!isLoggedIn()) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    function requireRole(role, redirectTo = '/index.html') {
        if (!requireAuth(redirectTo)) return false;
        if (!hasRole(role)) {
            window.location.href = redirectTo;
            return false;
        }
        return true;
    }

    return {
        login, logout, getToken, getUser,
        isLoggedIn, isExpired, hasRole,
        requireAuth, requireRole
    };
})();

/* --- Xử lý sự kiện Submit Form Đăng nhập tại index.html --- */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('[name="email"]').value.trim();
        const password = loginForm.querySelector('[name="password"]').value;
        const btn = loginForm.querySelector('[type="submit"]');

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner" style="width:20px;height:20px;border-width:2px;border-top-color:white;border-color:rgba(255,255,255,0.3)"></span>';

        const result = await Auth.login(email, password);

        if (result.success) {
            // Lấy Toast object nếu có, nếu không thì dùng alert (đề phòng DOM index.html chưa init toast)
            if (typeof Toast !== 'undefined') Toast.show('Đăng nhập thành công! Đang chuyển hướng...', 'success');

            setTimeout(() => {
                const role = result.user.role;
                // TÁCH BIỆT LUỒNG CHÍNH XÁC NHƯ YÊU CẦU
                if (role === 'admin') {
                    window.location.href = 'src/admin/dashboard.html';
                } else if (role === 'kitchen') {
                    window.location.href = 'src/kitchen/kds.html';
                } else {
                    // Mặc định là customer
                    window.location.href = 'src/customer/home.html';
                }
            }, 800);
        } else {
            if (typeof Toast !== 'undefined') {
                Toast.show(result.message || 'Email hoặc mật khẩu không đúng', 'error');
            } else {
                alert(result.message || 'Đăng nhập thất bại');
            }
            btn.disabled = false;
            btn.textContent = 'Truy cập hệ thống';
        }
    });
});