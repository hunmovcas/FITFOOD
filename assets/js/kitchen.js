/* ============================================================
   KITCHEN.JS - Logic frontend bếp
   KDS nhận đơn realtime, cập nhật trạng thái
   ============================================================ */

const KDS = (() => {
    let orders = [];
    let filter = 'all'; // all | pending | preparing | done

    /* --- Khởi tạo KDS --- */
    function init() {
        loadOrders();
        connectRealtime();
        startTimerUpdater();
    }

    /* --- Tải đơn hàng từ API, luôn fallback về MOCK --- */
    async function loadOrders() {
        const grid = document.getElementById('kds-grid');
        if (!grid) return;

        // Gán MOCK trước để đảm bảo luôn có dữ liệu hiển thị
        orders = MOCK.orders.map(o => ({ ...o, arrivedAt: o.arrivedAt || Date.now() - Math.floor(Math.random() * 20) * 60000 }));
        renderOrders(); // render MOCK ngay lập tức, xóa spinner

        // Sau đó thử lấy từ API thật (nếu backend đang chạy)
        try {
            const res = await Promise.race([
                API.get('/api/orders?status=pending,preparing&limit=20'),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
            ]);
            if (res && res.data && res.data.length > 0) {
                orders = res.data;
                renderOrders();
            }
        } catch {
            // Giữ nguyên MOCK đã render, không làm gì thêm
        }
    }

    /* --- Kết nối realtime --- */
    function connectRealtime() {
        if (typeof SocketManager === 'undefined') return;
        try {
            SocketManager.connect();
            SocketManager.joinRoom('kitchen');

            SocketManager.on('new_order', (order) => {
                orders.unshift({ ...order, arrivedAt: Date.now() });
                renderOrders();
                playNotificationSound();
                Toast.show(`🔔 Đơn mới: ${order.id} (${order.items?.length || 0} món)`, 'info');
            });

            SocketManager.on('order_status_update', (update) => {
                const o = orders.find(x => x.id === update.id);
                if (o) { o.status = update.status; renderOrders(); }
            });
        } catch { /* Socket không khả dụng, bỏ qua */ }
    }

    /* --- Render danh sách ticket --- */
    function renderOrders() {
        const grid = document.getElementById('kds-grid');
        if (!grid) return;

        const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

        // Cập nhật stats header
        const pendingCount = orders.filter(o => o.status === 'pending').length;
        const preparingCount = orders.filter(o => o.status === 'preparing').length;
        const pendingEl = document.getElementById('pending-count');
        const preparingEl = document.getElementById('preparing-count');
        if (pendingEl) pendingEl.textContent = pendingCount;
        if (preparingEl) preparingEl.textContent = preparingCount;

        if (filtered.length === 0) {
            grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;color:var(--kitchen-muted)">
          <div style="font-size:3rem">✅</div>
          <h3 style="color:var(--kitchen-muted)">Không có đơn hàng chờ</h3>
          <p style="color:rgba(148,163,184,.6)">Tất cả đơn đã được xử lý</p>
        </div>`;
            return;
        }

        grid.innerHTML = filtered.map(o => renderTicket(o)).join('');
    }

    /* --- Render một ticket --- */
    function renderTicket(order) {
        const elapsed = order.arrivedAt ? Math.floor((Date.now() - order.arrivedAt) / 60000) : 0;
        const isUrgent = elapsed >= 15;
        const priority = elapsed >= 20 ? 'priority-high' : elapsed >= 12 ? 'priority-medium' : '';
        const isDone = order.status === 'done' ? 'done' : '';

        const itemsHtml = Array.isArray(order.items)
            ? order.items.map(item => `
            <div class="kds-item">
              <span class="kds-item-qty">${item.qty || 1}</span>
              <div>
                <div class="kds-item-name">${item.name || item}</div>
                ${item.notes ? `<div class="kds-item-notes">⚠️ ${item.notes}</div>` : ''}
              </div>
            </div>`).join('')
            : `<div class="kds-item"><span class="kds-item-qty">1</span><div><div class="kds-item-name">Xem chi tiết</div></div></div>`;

        return `
      <div class="kds-ticket ${priority} ${isDone}" id="ticket-${order.id}">
        <div class="kds-ticket-header">
          <div>
            <div class="ticket-order-id">${order.id}</div>
            <div style="font-size:.75rem;color:var(--kitchen-muted);margin-top:2px">
              🌐 Online • ${order.customer || 'Khách hàng'}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span class="ticket-timer ${isUrgent ? 'urgent' : ''}"
                  id="timer-${order.id}" data-arrived="${order.arrivedAt || 0}">
              ${elapsed}p
            </span>
            <span class="badge ${order.status === 'pending' ? 'badge-amber' : order.status === 'preparing' ? 'badge-blue' : 'badge-green'}">
              ${statusLabel(order.status)}
            </span>
          </div>
        </div>

        <div class="kds-ticket-items">
          ${itemsHtml}
        </div>

        <div class="kds-ticket-footer">
          ${order.status !== 'done' ? `
            <button class="btn-complete" onclick="KDS.markDone('${order.id}')">
              ${order.status === 'pending' ? '▶ Bắt đầu chế biến' : '✓ Hoàn thành'}
            </button>
            <button class="btn-recall" onclick="KDS.printLabel('${order.id}')" title="In tem nhãn">🏷</button>
          ` : `
            <div style="color:var(--green-400);font-weight:700;font-size:.9rem;text-align:center;width:100%">
              ✓ Đã hoàn thành
            </div>
          `}
        </div>
      </div>`;
    }

    /* --- Đánh dấu hoàn thành / bắt đầu nấu --- */
    async function markDone(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;

        const nextStatus = order.status === 'pending' ? 'preparing' : 'done';

        // Cập nhật UI ngay lập tức (optimistic update)
        order.status = nextStatus;
        renderOrders();

        try {
            await API.patch(`/api/orders/${orderId}/status`, { status: nextStatus });
            if (nextStatus === 'done') {
                if (typeof SocketManager !== 'undefined') SocketManager.send('order_completed', { id: orderId });
                Toast.show(`✅ Đơn ${orderId} đã hoàn thành`, 'success');
            } else {
                Toast.show(`🍳 Đang chế biến đơn ${orderId}`, 'info');
            }
        } catch {
            Toast.show(`✅ Đã cập nhật trạng thái (offline)`, 'info');
        }
    }

    /* --- In tem nhãn cho đơn hàng --- */
    function printLabel(orderId) {
        window.location.href = `label-print.html?order=${orderId}`;
    }

    /* --- Cập nhật timer theo thời gian thực --- */
    function startTimerUpdater() {
        setInterval(() => {
            document.querySelectorAll('[data-arrived]').forEach(el => {
                const arrived = parseInt(el.dataset.arrived);
                if (!arrived) return;
                const elapsed = Math.floor((Date.now() - arrived) / 60000);
                el.textContent = `${elapsed}p`;
                el.classList.toggle('urgent', elapsed >= 15);
            });
        }, 30000);
    }

    /* --- Lọc theo trạng thái --- */
    function setFilter(status) {
        filter = status;
        document.querySelectorAll('.filter-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });
        renderOrders();
    }

    /* --- Âm thanh thông báo đơn mới --- */
    function playNotificationSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.4);
        } catch { /* Bỏ qua nếu trình duyệt không hỗ trợ */ }
    }

    return { init, loadOrders, markDone, printLabel, setFilter, renderOrders };
})();

function statusLabel(status) {
    const map = { pending: 'Chờ nấu', preparing: 'Đang nấu', done: 'Hoàn thành', ready: 'Sẵn sàng' };
    return map[status] || status;
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('kds-grid')) KDS.init();
});