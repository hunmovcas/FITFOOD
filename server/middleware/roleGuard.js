/* ============================================================
   ROLEGUARD.JS - Phân quyền theo role
   Chặn truy cập sai cấp bậc
   ============================================================ */

/* --- Factory tạo middleware kiểm tra role --- */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Tính năng này yêu cầu quyền: ${allowedRoles.join(' hoặc ')}`
            });
        }

        next();
    };
}

/* --- Shortcut middlewares hay dùng --- */
const adminOnly = requireRole('admin');
const kitchenOnly = requireRole('kitchen', 'admin');
const staffOnly = requireRole('kitchen', 'admin');

module.exports = { requireRole, adminOnly, kitchenOnly, staffOnly };