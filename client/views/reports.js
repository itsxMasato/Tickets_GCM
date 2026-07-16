import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { exportToExcel, fetchAllForExport } from '../utils/exports.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { toast } from '../utils/toast.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

export async function renderReports({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Reportes de Tickets'),
      h('p.text-sm.text-slate-500', {}, 'Analiza y visualiza el estado de todos los tickets.'),
    ]),
  ]));

  // Filtros
  const filters = { status: query?.status || '', priority: query?.priority || '', area: query?.area || '', assigned_to: query?.assigned_to || '', date_from: query?.date_from || '', date_to: query?.date_to || '', search: query?.search || '' };
  const filtersBar = h('div.card.flex.flex-wrap.items-end.gap-3', {});
  const search = h('input.input', { type: 'search', placeholder: 'Buscar…' });
  const statusSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los estados'), ...STATUS.map((s) => h('option', { value: s }, STATUS_LABEL[s]))]);
  const prioSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las prioridades'), ...PRIORITIES.map((p) => h('option', { value: p }, PRIORITY_LABEL[p]))]);
  const areaSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las áreas'), ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k }, v))]);
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const from = h('input.input', { type: 'date', value: filters.date_from });
  const to = h('input.input', { type: 'date', value: filters.date_to });
  const apply = h('button.btn.btn-primary', { onclick: () => render() }, 'Aplicar');
  const clearBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', area: '', assigned_to: '', date_from: '', date_to: '', search: '' }); search.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; from.value=''; to.value=''; render(); } }, 'Limpiar');

  filtersBar.appendChild(h('div.flex-1.min-w-\\[200px\\]', {}, [h('label.label', {}, 'Búsqueda'), search]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-40', {}, [h('label.label', {}, 'Desde'), from]));
  filtersBar.appendChild(h('div.w-40', {}, [h('label.label', {}, 'Hasta'), to]));
  filtersBar.appendChild(h('div.flex.gap-2', {}, [apply, clearBtn]));
  root.appendChild(filtersBar);

  // Botón de export
  root.appendChild(h('div.flex.items-center.gap-2', {}, [
    exportButton({ label: 'Exportar', format: 'excel', kind: 'secondary', onclick: doExportExcel }),
  ]));

  // KPIs
  const kpis = h('div.grid.grid-cols-2.md\\:grid-cols-5.gap-3', {});
  root.appendChild(kpis);

  // Tabla
  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  // Charts
  const charts = h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {});
  root.appendChild(charts);

  const spinnerSvg = '<svg class="animate-spin w-4 h-4 text-brand-ocean" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';

  async function populateAssignedUsers() {
    try {
      const users = await api.users.list({ active: true });
      const options = (users.users || []).sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '')).map((u) => h('option', { value: u.id, selected: String(filters.assigned_to) === String(u.id) ? '' : null }, u.full_name || u.username));
      assignedSel.innerHTML = '<option value="">Todos los responsables</option>';
      options.forEach((opt) => assignedSel.appendChild(opt));
    } catch {
      assignedSel.innerHTML = '<option value="">Todos los responsables</option>';
    }
  }

  async function render() {
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.search = search.value.trim();
    filters.date_from = from.value;
    filters.date_to = to.value;
    
    // Guardar filtros en la URL
    setFilterInUrl('search', filters.search);
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);
    
    tableWrap.innerHTML = `<div class="card flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status" aria-live="polite">${spinnerSvg}<span>Cargando reportes…</span></div>`;
    charts.innerHTML = '';
    kpis.innerHTML = '';
    try {
      const params = { ...filters, page: 1, limit: 25 };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const data = await api.tickets.list(params);
      drawTable(data);
      drawChartsAndKpis(data);
    } catch (e) {
      tableWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  function drawTable({ tickets, total }) {
    if (!tickets.length) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(emptyState(EMPTY_STATES.reports));
      return;
    }
    const rows = tickets.map((t) => `
      <tr>
        <td class="font-mono text-xs">${escapeHtml(t.code)}</td>
        <td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(AREA_LABEL[t.area] || '—')}</td>
        <td>${escapeHtml(t.assigned_to_name || '—')}</td>
        <td>${statusBadge(t.status).outerHTML}</td>
        <td>${priorityBadge(t.priority).outerHTML}</td>
        <td>${escapeHtml(t.created_at)}</td>
      </tr>
    `).join('');
    tableWrap.innerHTML = `<table class="table"><thead><tr><th>Código</th><th>Título</th><th>Área</th><th>Asignado</th><th>Estado</th><th>Prioridad</th><th>Creado</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="p-3 text-xs text-slate-500 text-right">Total filtrado: ${total}</div>`;
  }

  function drawChartsAndKpis({ tickets, total }) {
    const byStatus = STATUS.map((s) => ({ key: s, c: tickets.filter((t) => t.status === s).length }));
    const byPrio = PRIORITIES.map((p) => ({ key: p, c: tickets.filter((t) => t.priority === p).length }));
    const open = byStatus.filter((x) => x.key !== 'cerrado').reduce((a, b) => a + b.c, 0);
    const closed = byStatus.find((x) => x.key === 'cerrado')?.c || 0;
    const reopened = byStatus.find((x) => x.key === 'reabierto')?.c || 0;

    kpis.appendChild(kpiCard('Total', total));
    kpis.appendChild(kpiCard('Abiertos', open));
    kpis.appendChild(kpiCard('Cerrados', closed));
    kpis.appendChild(kpiCard('Reabiertos', reopened));
    kpis.appendChild(kpiCard('Urgentes', byPrio.find((x) => x.key === 'urgente')?.c || 0));

    charts.appendChild(barChart('Por estado', byStatus, 'key', STATUS));
    charts.appendChild(barChart('Por prioridad', byPrio, 'key', PRIORITIES));
  }

  function kpiCard(label, value) {
    return h('div.kpi-card', {}, [
      h('div.kpi-label', {}, label),
      h('div.kpi-value', {}, String(value ?? 0)),
    ]);
  }

  function barChart(title, data, keyField, order) {
    const max = Math.max(1, ...data.map((d) => d.c));
    return h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-3', {}, title),
      h('div.flex.flex-col.gap-2', {}, order.map((k) => {
        const v = data.find((d) => d.key === k)?.c || 0;
        const pct = Math.round((v / max) * 100);
        return h('div', {}, [
          h('div.flex.items-center.justify-between.text-xs.mb-1', {}, [
            h('span', {}, (STATUS_LABEL[k] || PRIORITY_LABEL[k] || k)),
            h('span.text-slate-500', {}, String(v)),
          ]),
          h('div.w-full.h-2.bg-slate-100.rounded.overflow-hidden', {}, [h('div.h-2.bg-brand-ocean.rounded.transition-all', { style: { width: `${pct}%` } })]),
        ]);
      })),
    ]);
  }

  async function doExportExcel() {
    try {
      const rows = await fetchAllForExport(filters);
      if (!rows.length) {
        toast('No hay datos para exportar con los filtros seleccionados.', 'info');
        return;
      }
      exportToExcel(rows, `reporte-tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast(`Exportadas ${rows.length} filas a Excel.`, 'success');
    } catch (e) {
      toast(e.message || 'Error al exportar', 'error');
    }
  }

  await populateAssignedUsers();
  await render();
  return root;
}
