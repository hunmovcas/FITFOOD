/* ============================================================
   ADMIN.JS - Logic frontend admin dashboard
   Biểu đồ BI, form cấu hình, xuất báo cáo
   ============================================================ */

const AdminDashboard = (() => {

    /* --- Tải KPI tổng quan --- */
    async function loadKPI() {
        try {
            const res = await API.get('/api/admin/kpi');
            const kpi = res.data || MOCK.kpi;
            renderKPI(kpi);
        } catch {
            renderKPI(MOCK.kpi);
        }
    }

    /* --- Render các thẻ KPI --- */
    function renderKPI(kpi) {
        setKPICard('kpi-revenue', formatPrice(kpi.revenue_today), kpi.revenue_change);
        setKPICard('kpi-orders', `${kpi.orders_today} đơn`, kpi.orders_change);
        setKPICard('kpi-waste', `${kpi.food_waste_pct}%`, kpi.waste_change, true);
        setKPICard('kpi-retention', `${kpi.retention_rate}%`, kpi.retention_change);

        // Render biểu đồ doanh thu
        if (kpi.chart_revenue) renderRevenueChart(kpi.chart_revenue, kpi.chart_labels);
    }

    function setKPICard(id, value, change, invertColor = false) {
        const valueEl = document.getElementById(`${id}-value`);
        const changeEl = document.getElementById(`${id}-change`);
        if (valueEl) valueEl.textContent = value;
        if (changeEl) {
            const isPositive = change > 0;
            const isGood = invertColor ? !isPositive : isPositive;
            changeEl.className = `kpi-change ${isGood ? 'up' : 'down'}`;
            changeEl.textContent = `${isPositive ? '↑' : '↓'} ${Math.abs(change)}${typeof change === 'number' && !Number.isInteger(change) ? '%' : ''}`;
        }
    }

    /* --- Biểu đồ doanh thu dạng bar (CSS thuần) --- */
    function renderRevenueChart(data, labels) {
        const chartEl = document.getElementById('revenue-chart');
        if (!chartEl) return;

        const max = Math.max(...data);

        chartEl.innerHTML = data.map((val, i) => `
      <div class="bar-item">
        <div class="bar-fill" style="height:${(val / max) * 100}%"
          title="${labels[i]}: ${formatPrice(val * 1000000)}"></div>
        <span class="bar-label">${labels?.[i] || i + 1}</span>
      </div>`).join('');
    }

    /* --- Biểu đồ donut (SVG thuần) --- */
    function renderDonutChart(data, colors, canvasId) {
        const el = document.getElementById(canvasId);
        if (!el) return;

        const total = data.reduce((s, v) => s + v, 0);
        const cx = 80, cy = 80, r = 60, strokeW = 20;
        const circumference = 2 * Math.PI * r;

        let offset = 0;
        const segments = data.map((val, i) => {
            const pct = val / total;
            const dash = pct * circumference;
            const gap = circumference - dash;
            const seg = `<circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="${colors[i]}" stroke-width="${strokeW}"
        stroke-dasharray="${dash} ${gap}"
        stroke-dashoffset="${-offset * circumference}"
        transform="rotate(-90 ${cx} ${cy})"
        style="transition:stroke-dasharray .6s var(--ease-out)"/>`;
            offset += pct;
            return seg;
        }).join('');

        el.innerHTML = `
      <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
        ${segments}
        <text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central"
          font-family="var(--font-display)" font-size="16" font-weight="700" fill="var(--neutral-800)">
          ${total}%
        </text>
      </svg>`;
    }

    /* --- Tải dữ liệu trang reports --- */
    async function loadReports(period = '7days') {
        try {
            const res = await API.get(`/api/admin/reports?period=${period}`);
            return res.data;
        } catch {
            return null;
        }
    }

    /* --- Xuất báo cáo CSV --- */
    function exportCSV(data, filename = 'report') {
        if (!data || data.length === 0) {
            Toast.show('Không có dữ liệu để xuất', 'warning');
            return;
        }
        const headers = Object.keys(data[0]);
        const rows = data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${filename}-${Date.now()}.csv`;
        a.click(); URL.revokeObjectURL(url);
        Toast.show('✅ Đã xuất báo cáo thành công', 'success');
    }

    return { loadKPI, renderRevenueChart, renderDonutChart, loadReports, exportCSV };
})();

/* ======================== SIDEBAR ======================== */
function initSidebar() {
    // Highlight link active dựa theo URL hiện tại
    const currentPath = window.location.pathname;
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') && currentPath.endsWith(link.getAttribute('href')));
    });

    // Toggle sidebar trên mobile
    const toggleBtn = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.admin-sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    if (toggleBtn && sidebar) {
        toggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay?.classList.toggle('visible');
        });
    }

    if (overlay && sidebar) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('visible');
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    if (document.getElementById('kpi-revenue-value')) AdminDashboard.loadKPI();
});