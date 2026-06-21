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

    /* --- Tải đơn hàng từ API --- */
    async function loadOrders() {
        const grid = document.getElementById('kds-grid');
        if (!grid) return;

        try {
            const res = await API.get('/api/orders?status=pending,preparing&limit=20');
            orders = res.data || MOCK.orders;
        } catch {
            orders = MOCK.orders;
        }
        renderOrders();
    }

    /* --- Kết nối realtime --- */
    function connectRealtime() {
        SocketManager.connect();
        SocketManager.joinRoom('kitchen');

        // Đơn hàng mới từ website
        SocketManager.on('new_order', (order) => {
            orders.unshift({ ...order, arrivedAt: Date.now() });
            renderOrders();
            playNotificationSound();
            Toast.show(`🔔 Đơn mới: ${order.id} (${order.items?.length || 0} món)`, 'info');
        });

        // Cập nhật trạng thái
        SocketManager.on('order_status_update', (update) => {
            const o = orders.find(x => x.id === update.id);
            if (o) { o.status = update.status; renderOrders(); }
        });
    }

    /* --- Render danh sách ticket --- */
    function renderOrders() {
        const grid = document.getElementById('kds-grid');
        if (!grid) return;

        let filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);

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
          ${(order.items || [{ name: order.items || 'Xem chi tiết', qty: 1, notes: '' }]).map(item => `
            <div class="kds-item">
              <span class="kds-item-qty">${item.qty || 1}</span>
              <div>
                <div class="kds-item-name">${item.name || item}</div>
                ${item.notes ? `<div class="kds-item-notes">⚠️ ${item.notes}</div>` : ''}
              </div>
            </div>`).join('')}
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

        try {
            await API.patch(`/api/orders/${orderId}/status`, { status: nextStatus });
            order.status = nextStatus;
            renderOrders();

            if (nextStatus === 'done') {
                SocketManager.send('order_completed', { id: orderId });
                Toast.show(`✅ Đơn ${orderId} đã hoàn thành`, 'success');
            } else {
                Toast.show(`🍳 Đang chế biến đơn ${orderId}`, 'info');
            }
        } catch (err) {
            Toast.show('Lỗi cập nhật trạng thái', 'error');
        }
    }

    /* --- In tem nhãn cho đơn hàng --- */
    function printLabel(orderId) {
        const order = orders.find(o => o.id === orderId);
        if (!order) return;
        window.location.href = `/src/kitchen/label-print.html?order=${orderId}`;
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
        }, 30000); // cập nhật mỗi 30 giây
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
    // Khởi tạo KDS nếu đang ở trang KDS
    if (document.getElementById('kds-grid')) KDS.init();
});