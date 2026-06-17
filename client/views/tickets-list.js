import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { relativeFromNow, STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, canViewAllTickets, canCreateTicket } from '../utils/permissions.js';
import { exportToExcel, fetchAllForExport } from '../utils/exports.js';
import { toast } from '../utils/toast.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

export async function renderTicketsList({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  // Header
  let exportBtn;
  const header = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Tickets'),
      h('p.text-sm.text-slate-500', {}, canViewAllTickets(user) ? 'Todos los tickets del sistema.' : 'Tickets que puedes ver.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      exportBtn = exportButton({ label: 'Exportar', format: 'excel', kind: 'secondary', onclick: doExport }),
      canCreateTicket(user) ? h('button.btn.btn-primary', { onclick: () => go('/tickets/new') }, '+ Nuevo ticket') : null,
    ]),
  ]);
  root.appendChild(header);

  // Filtros
  const filters = {
    status: query.status || '',
    priority: query.priority || '',
    search: query.search || '',
    assigned_to: query.assigned_to || '',
    area: query.area || '',
    page: parseInt(query.page || '1', 10) || 1,
    limit: 20,
  };
  const state = { filters, result: { tickets: [], total: 0, page: 1 } };
  const filtersBar = h('div.card.flex.flex-wrap.items-end.gap-3', {});
  const searchInput = h('input.input', { type: 'search', placeholder: 'Buscar código, título, descripción…', value: filters.search });
  const statusSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todos los estados'),
    ...STATUS.map((s) => h('option', { value: s, selected: filters.status === s ? '' : null }, STATUS_LABEL[s])),
  ]);
  const prioSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las prioridades'),
    ...PRIORITIES.map((p) => h('option', { value: p, selected: filters.priority === p ? '' : null }, PRIORITY_LABEL[p])),
  ]);
  const areaSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las áreas'),
    ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k, selected: filters.area === k ? '' : null }, v)),
  ]);
  const applyBtn = h('button.btn.btn-primary', { onclick: () => apply(1) }, 'Filtrar');
  const resetBtn = h('button.btn.btn-ghost', { onclick: () => { Object.assign(filters, { status: '', priority: '', search: '', area: '', assigned_to: '', page: 1 }); render(); } }, 'Limpiar');

  filtersBar.appendChild(h('div.flex-1.min-w-\\[200px\\]', {}, [h('label.label', {}, 'Búsqueda'), searchInput]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.flex.gap-2', {}, [applyBtn, resetBtn]));
  root.appendChild(filtersBar);

  // Tabla + paginación
  const tableWrap = h('div.table-wrap', {});
  const pagWrap = h('div.flex.items-center.justify-between.mt-3.text-sm.text-slate-600', {});
  root.appendChild(tableWrap);
  root.appendChild(pagWrap);

  async function apply(newPage) {
    filters.page = newPage || 1;
    filters.search = searchInput.value.trim();
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = areaSel.value;
    render();
  }

  async function render() {
    tableWrap.innerHTML = `
      <table class="table" aria-busy="true">
        <thead>
          <tr>
            <th scope="col">Código</th><th scope="col">Título</th><th scope="col">Categoría</th>
            <th scope="col">Área</th><th scope="col">Asignado a</th><th scope="col">Estado</th>
            <th scope="col">Prioridad</th><th scope="col">Creado</th>
          </tr>
        </thead>
        <tbody>${skeletonRows()}</tbody>
      </table>
    `;
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
      const data = await api.tickets.list(Object.fromEntries(params));
      state.result = data;
      draw();
    } catch (e) {
      tableWrap.innerHTML = `<div class="p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  function skeletonRows() {
    const cell = () => `<div class="h-3 bg-slate-200 rounded animate-pulse w-3/4"></div>`;
    return Array.from({ length: 5 }, () =>
      `<tr aria-hidden="true">${Array.from({ length: 8 }, () => `<td class="py-3">${cell()}</td>`).join('')}</tr>`
    ).join('');
  }

  function draw() {
    const { tickets, total, page, limit } = state.result;
    if (tickets.length === 0) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(emptyState(EMPTY_STATES.tickets));
      pagWrap.innerHTML = '';
      return;
    }
    const rows = tickets.map((t) => `
      <tr class="cursor-pointer" data-id="${t.id}">
        <td class="font-mono text-xs text-slate-500">${escapeHtml(t.code)}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title)}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${escapeHtml(t.category_name || '—')}</td>
        <td>${escapeHtml(AREA_LABEL[t.area] || t.area || '—')}</td>
        <td>${escapeHtml(t.assigned_to_name || '—')}</td>
        <td>${statusBadge(t.status).outerHTML}</td>
        <td>${priorityBadge(t.priority).outerHTML}</td>
        <td class="text-xs text-slate-500">${escapeHtml(relativeFromNow(t.created_at))}</td>
      </tr>
    `).join('');

    tableWrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th scope="col">Código</th><th scope="col">Título</th><th scope="col">Categoría</th>
            <th scope="col">Área</th><th scope="col">Asignado a</th><th scope="col">Estado</th>
            <th scope="col">Prioridad</th><th scope="col">Creado</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    tableWrap.querySelectorAll('tr[data-id]').forEach((tr) => {
      tr.addEventListener('click', () => go(`/tickets/${tr.dataset.id}`));
    });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    pagWrap.innerHTML = `
      <div>Mostrando <span class="font-medium">${tickets.length}</span> de <span class="font-medium">${total}</span></div>
      <div class="flex items-center gap-2">
        <button class="btn btn-secondary btn-sm" id="prev" ${page <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span>Página ${page} de ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" id="next" ${page >= totalPages ? 'disabled' : ''}>Siguiente →</button>
      </div>
    `;
    pagWrap.querySelector('#prev')?.addEventListener('click', () => apply(page - 1));
    pagWrap.querySelector('#next')?.addEventListener('click', () => apply(page + 1));
  }

  async function doExport() {
    const setBusy = (busy) => {
      if (!exportBtn) return;
      exportBtn.disabled = busy;
      const label = exportBtn.querySelector('span');
      if (label) label.textContent = busy ? 'Exportando…' : 'Exportar Excel';
    };
    setBusy(true);
    try {
      const rows = await fetchAllForExport(filters);
      if (!rows.length) { toast('No hay tickets para exportar con los filtros actuales.', 'info'); return; }
      exportToExcel(rows, `tickets-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast(`Exportadas ${rows.length} filas a Excel.`, 'success');
    } catch (e) {
      toast(e.message || 'Error al exportar', 'error');
    } finally {
      setBusy(false);
    }
  }

  await render();

  // ── Tiempo real: refrescar la tabla cuando algo cambia ─────────────────────
  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = new AbortController();
  window.addEventListener('gcm:realtime', (e) => {
    if (evs.includes(e.detail?.event)) render();
  }, { signal: ac.signal });

  return { view: root, cleanup: () => ac.abort() };
}
