/* ============================================================
   JWTAUTH.JS - Middleware xác thực JWT
   ============================================================ */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fitfood-dev-secret-change-in-prod';

/* --- Middleware xác thực token --- */
function jwtAuth(req, res, next) {
    const authHeader = req.headers['authorization'];

    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Yêu cầu đăng nhập để tiếp tục'
        });
    }

    const token = authHeader.substring(7);

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;  // { user_id, email, role, full_name }
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Phiên đăng nhập đã hết hạn' });
        }
        return res.status(401).json({ success: false, message: 'Token không hợp lệ' });
    }
}

/* --- Tạo JWT token --- */
function signToken(payload, expiresIn = '24h') {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

/* --- Middleware cho phép không cần auth (optional auth) --- */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        req.user = null;
        return next();
    }
    const token = authHeader.substring(7);
    try {
        req.user = jwt.verify(token, JWT_SECRET);
    } catch {
        req.user = null;
    }
    next();
}

module.exports = { jwtAuth, signToken, optionalAuth };