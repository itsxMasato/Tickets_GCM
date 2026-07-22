/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { exportToExcel, fetchAllForExport } from '../utils/exports.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { toast } from '../utils/toast.js';
import { mountDataList } from '../components/data-list.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

const TABLE_COLUMNS = [
  { key: 'code',     label: 'Código' },
  { key: 'title',    label: 'Título' },
  { key: 'area',     label: 'Área' },
  { key: 'assigned', label: 'Asignado' },
  { key: 'status',   label: 'Estado' },
  { key: 'priority', label: 'Prioridad' },
  { key: 'created',  label: 'Creado' },
];

export async function renderReports({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Reportes de Tickets'),
      h('p.text-sm.text-slate-500', {}, 'Analiza y visualiza el estado de todos los tickets.'),
    ]),
  ]));

  // Filtros — apilados en mobile (flex-col), en fila en >=768px (md:flex-row).
  // Cada input va a w-full en mobile y w-* fijo en desktop.
  const filters = { status: query?.status || '', priority: query?.priority || '', area: query?.area || '', assigned_to: query?.assigned_to || '', date_from: query?.date_from || '', date_to: query?.date_to || '', search: query?.search || '' };
  const filtersBar = h('div.card.flex.flex-col.gap-3.md\\:flex-row.md\\:flex-wrap.md\\:items-end', {});
  const search = h('input.input', { type: 'search', placeholder: 'Buscar…' });
  const statusSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los estados'), ...STATUS.map((s) => h('option', { value: s, selected: filters.status === s ? '' : null }, STATUS_LABEL[s]))]);
  const prioSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las prioridades'), ...PRIORITIES.map((p) => h('option', { value: p, selected: filters.priority === p ? '' : null }, PRIORITY_LABEL[p]))]);
  const areaSel = h('select.input', {}, [h('option', { value: '' }, 'Todas las áreas'), ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k, selected: filters.area === k ? '' : null }, v))]);
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const from = h('input.input', { type: 'date', value: filters.date_from });
  const to = h('input.input', { type: 'date', value: filters.date_to });
  const apply = h('button.btn.btn-primary', { onclick: () => render() }, 'Aplicar');
  const clearBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', area: '', assigned_to: '', date_from: '', date_to: '', search: '' }); search.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; from.value=''; to.value=''; render(); } }, 'Limpiar');

  filtersBar.appendChild(h('div.w-full.md\\:flex-1.md\\:min-w-\\[200px\\]', {}, [h('label.label', {}, 'Búsqueda'), search]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-44', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-full.md\\:w-40', {}, [h('label.label', {}, 'Desde'), from]));
  filtersBar.appendChild(h('div.w-full.md\\:w-40', {}, [h('label.label', {}, 'Hasta'), to]));
  filtersBar.appendChild(h('div.flex.gap-2.w-full.md\\:w-auto', {}, [apply, clearBtn]));
  root.appendChild(filtersBar);

  // Botón de export
  root.appendChild(h('div.flex.items-center.gap-2', {}, [
    exportButton({ label: 'Exportar', format: 'excel', kind: 'secondary', onclick: doExportExcel }),
  ]));

  // KPIs
  const kpis = h('div.grid.grid-cols-2.md\\:grid-cols-5.gap-3', {});
  root.appendChild(kpis);

  // Tabla → data-list (tabla desktop / card-list mobile).
  const listWrap = h('div', {});
  const totalLine = h('div.p-3.text-xs.text-slate-500.text-right', {});
  const listContainer = h('div.flex.flex-col', {}, [listWrap, totalLine]);
  root.appendChild(listContainer);

  // Charts
  const charts = h('div.grid.grid-cols-1.lg\\:grid-cols-2.gap-3', {});
  root.appendChild(charts);

  const spinnerSvg = '<svg class="animate-spin w-4 h-4 text-brand-ocean" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';

  let dataList = null;
  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.reports, className: 'py-10' }),
    });
  }

  function tableRow(t) {
    return `
      <tr>
        <td class="font-mono text-xs text-slate-500">${escapeHtml(t.code)}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title)}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${escapeHtml(AREA_LABEL[t.area] || '—')}</td>
        <td>${escapeHtml(t.assigned_to_name || '—')}</td>
        <td>${statusBadge(t.status).outerHTML}</td>
        <td>${priorityBadge(t.priority).outerHTML}</td>
        <td class="text-xs text-slate-500">${escapeHtml(formatDateTime(t.created_at))}</td>
      </tr>
    `;
  }

  function renderMobileCard(t) {
    return h('button.card.text-left.flex.flex-col.gap-2.p-3.hover\\:border-brand-ocean.hover\\:shadow-card.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/60.transition', {
      onclick: () => { window.location.hash = `#/tickets/${t.id}`; },
      'aria-label': `Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}`,
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('div.min-w-0', {}, [
          h('div.text-xs.font-mono.text-slate-500', {}, escapeHtml(t.code || '')),
          h('div.font-medium.text-brand-ink.line-clamp-2', {}, escapeHtml(t.title || '')),
        ]),
        priorityBadge(t.priority),
      ]),
      h('div.flex.items-center.gap-2.flex-wrap.text-xs.text-slate-500', {}, [
        statusBadge(t.status),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[t.area] || '—')),
        t.assigned_to_name ? h('span', {}, `· ${escapeHtml(t.assigned_to_name)}`) : null,
        h('span', {}, '·'),
        h('span', {}, escapeHtml(formatDateTime(t.created_at))),
      ]),
    ]);
  }

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

    ensureDataList();
    dataList.update({ loading: true, items: [] });
    totalLine.innerHTML = '';
    charts.innerHTML = '';
    kpis.innerHTML = '';
    try {
      const params = { ...filters, page: 1, limit: 25 };
      Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
      const data = await api.tickets.list(params);
      drawTable(data);
      drawChartsAndKpis(data);
    } catch (e) {
      dataList.update({ loading: false, items: [] });
      listWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  function drawTable({ tickets, total }) {
    dataList.update({ loading: false, items: tickets });
    totalLine.textContent = tickets.length ? `Total filtrado: ${total}` : '';
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
