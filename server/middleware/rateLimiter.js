/* ============================================================
   RATELIMITER.JS - Giới hạn request chống spam
   ============================================================ */

/* Map lưu trữ số request theo IP (đơn giản, không cần Redis) */
const requestCounts = new Map();

/* --- Factory tạo middleware rate limiter --- */
function rateLimiter({ windowMs = 60000, max = 100, message = 'Quá nhiều yêu cầu, thử lại sau' } = {}) {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const key = `${ip}:${req.path}`;
        const now = Date.now();

        const record = requestCounts.get(key) || { count: 0, resetTime: now + windowMs };

        // Reset nếu đã qua window
        if (now > record.resetTime) {
            record.count = 0;
            record.resetTime = now + windowMs;
        }

        record.count++;
        requestCounts.set(key, record);

        // Thêm headers thông tin rate limit
        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
        res.setHeader('X-RateLimit-Reset', Math.ceil(record.resetTime / 1000));

        if (record.count > max) {
            return res.status(429).json({ success: false, message });
        }

        next();
    };
}

/* Dọn dẹp entries cũ mỗi 5 phút để tránh memory leak */
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of requestCounts.entries()) {
        if (now > record.resetTime) requestCounts.delete(key);
    }
}, 300000);

module.exports = { rateLimiter };