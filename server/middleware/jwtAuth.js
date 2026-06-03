// ============================================================
// middleware/auth.js - Middleware kiểm tra JWT token
// Dùng chung cho tất cả các route cần xác thực
// ============================================================

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'greenbite_secret_key_2024';

/**
 * Middleware xác thực token
 * Đọc token từ header Authorization: Bearer <token>
 * Gắn thông tin user vào req.user nếu hợp lệ
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Lấy phần sau "Bearer "

    if (!token) {
        return res.status(401).json({ success: false, message: 'Không có token xác thực' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Gắn payload vào request: { userId, email, roleId, roleName }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token đã hết hạn, vui lòng đăng nhập lại' });
        }
        return res.status(403).json({ success: false, message: 'Token không hợp lệ' });
    }
}

/**
 * Middleware kiểm tra quyền theo role
 * @param {...string} roles - Danh sách role được phép truy cập
 * Ví dụ: requireRole('admin'), requireRole('admin', 'staff')
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Chưa xác thực' });
        }
        if (!roles.includes(req.user.roleName)) {
            return res.status(403).json({
                success: false,
                message: `Bạn không có quyền truy cập. Yêu cầu role: ${roles.join(', ')}`,
            });
        }
        next();
    };
}

module.exports = { authenticateToken, requireRole };