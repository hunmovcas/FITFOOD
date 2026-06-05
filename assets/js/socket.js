/* ============================================================
   SOCKET.JS - WebSocket client cho realtime
   KDS nhận đơn & Shipper tracking
   ============================================================ */

const SocketManager = (() => {
    let socket = null;
    const listeners = {};

    /* --- Kết nối WebSocket --- */
    function connect(serverUrl) {
        // Dùng Socket.io nếu có, fallback về native WebSocket
        if (typeof io !== 'undefined') {
            socket = io(serverUrl || window.FF_API_URL || 'http://localhost:3000', {
                auth: { token: typeof Auth !== 'undefined' ? Auth.getToken() : null },
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 5,
                reconnectionDelay: 2000,
            });

            socket.on('connect', () => {
                console.log('[Socket] Kết nối thành công:', socket.id);
                emit('connected', { id: socket.id });
            });

            socket.on('disconnect', (reason) => {
                console.warn('[Socket] Mất kết nối:', reason);
                emit('disconnected', { reason });
            });

            socket.on('connect_error', (err) => {
                console.error('[Socket] Lỗi kết nối:', err.message);
                // Fallback: dùng polling nếu WebSocket fail
                startPollingFallback();
            });

            // Lắng nghe các sự kiện từ server
            ['new_order', 'order_status_update', 'inventory_alert',
                'shipper_location', 'kitchen_notification'].forEach(event => {
                    socket.on(event, (data) => emit(event, data));
                });

        } else {
            // Fallback: polling mỗi 5 giây nếu không có Socket.io
            console.warn('[Socket] Socket.io không khả dụng, dùng polling');
            startPollingFallback();
        }
    }

    /* --- Polling fallback khi WebSocket không khả dụng --- */
    let pollInterval = null;
    function startPollingFallback() {
        if (pollInterval) return;
        pollInterval = setInterval(async () => {
            try {
                const data = await API.get('/api/realtime/poll');
                if (data?.events) {
                    data.events.forEach(({ type, payload }) => emit(type, payload));
                }
            } catch { /* im lặng khi lỗi */ }
        }, 5000);
    }

    /* --- Ngắt kết nối --- */
    function disconnect() {
        if (socket) { socket.disconnect(); socket = null; }
        if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }

    /* --- Gửi sự kiện lên server --- */
    function send(event, data) {
        if (socket?.connected) {
            socket.emit(event, data);
        }
    }

    /* --- Đăng ký listener --- */
    function on(event, cb) {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(cb);
        return () => off(event, cb); // trả về hàm unsubscribe
    }

    /* --- Hủy listener --- */
    function off(event, cb) {
        if (listeners[event]) {
            listeners[event] = listeners[event].filter(fn => fn !== cb);
        }
    }

    /* --- Phát sự kiện nội bộ --- */
    function emit(event, data) {
        (listeners[event] || []).forEach(cb => {
            try { cb(data); } catch (e) { console.error('[Socket] Listener error:', e); }
        });
    }

    /* --- Tham gia phòng (kitchen / shipper / customer) --- */
    function joinRoom(room) {
        send('join_room', { room });
    }

    return { connect, disconnect, send, on, off, joinRoom };
})();