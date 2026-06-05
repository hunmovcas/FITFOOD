/* ============================================================
   SOCKET.JS - WebSocket server (Socket.io)
   Xử lý realtime cho KDS & shipper tracking
   ============================================================ */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');

module.exports = function initSocket(httpServer) {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    /* --- Middleware xác thực JWT cho socket --- */
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            // Cho phép kết nối không cần auth (guest tracking)
            socket.user = null;
            return next();
        }

        try {
            socket.user = jwt.verify(token, process.env.JWT_SECRET || 'fitfood-secret-key');
            next();
        } catch {
            next(new Error('Token không hợp lệ'));
        }
    });

    /* --- Xử lý kết nối --- */
    io.on('connection', (socket) => {
        const userId = socket.user?.user_id || 'guest';
        console.log(`[Socket] Kết nối mới: ${socket.id} (user: ${userId})`);

        /* --- Tham gia phòng theo role --- */
        socket.on('join_room', ({ room }) => {
            socket.join(room);
            console.log(`[Socket] ${socket.id} tham gia phòng: ${room}`);
        });

        /* --- Bếp đánh dấu hoàn thành đơn --- */
        socket.on('order_completed', async ({ id }) => {
            try {
                // Thông báo khách hàng đơn đã sẵn sàng
                io.to('customer').emit('order_status_update', {
                    id, status: 'ready', message: 'Đơn của bạn đã sẵn sàng giao!'
                });
                // Thông báo shipper có đơn cần lấy
                io.to('shipper').emit('pickup_ready', { orderId: id });
            } catch (err) {
                console.error('[Socket] order_completed error:', err);
            }
        });

        /* --- Shipper cập nhật vị trí realtime --- */
        socket.on('location_update', async ({ order_id, lat, lng }) => {
            try {
                // Lưu vào DB
                if (db.isConnected) {
                    await db.query(`
            UPDATE Shippers SET last_lat = @lat, last_lng = @lng, last_location_at = GETDATE()
            WHERE user_id = @uid`,
                        {
                            lat: { type: db.sql.Decimal(10, 7), value: lat },
                            lng: { type: db.sql.Decimal(10, 7), value: lng },
                            uid: { type: db.sql.Int, value: socket.user?.user_id }
                        }
                    );
                }

                // Broadcast cho khách hàng của đơn hàng đó
                io.to(`order-${order_id}`).emit('shipper_location', {
                    order_id, lat, lng, timestamp: Date.now()
                });
            } catch (err) {
                console.error('[Socket] location_update error:', err);
            }
        });

        /* --- Đơn hàng mới (từ server → bếp) --- */
        // Được gọi từ route orders.js sau khi tạo đơn thành công
        socket.on('notify_kitchen', (orderData) => {
            io.to('kitchen').emit('new_order', orderData);
        });

        /* --- Khách hàng theo dõi đơn cụ thể --- */
        socket.on('track_order', ({ order_id }) => {
            socket.join(`order-${order_id}`);
        });

        /* --- Xử lý ngắt kết nối --- */
        socket.on('disconnect', (reason) => {
            console.log(`[Socket] Ngắt kết nối: ${socket.id} (${reason})`);
        });
    });

    /* --- Helper: phát sự kiện từ routes --- */
    global.emitToRoom = (room, event, data) => {
        io.to(room).emit(event, data);
    };

    return io;
};