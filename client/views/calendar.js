import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';
import { go } from '../router.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { instantSearchInput } from '../components/instant-search.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];

export async function renderCalendar({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  const header = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Calendario Gantt'),
      h('p.text-sm.text-slate-500', {}, 'Organiza y visualiza el trabajo por ticket en una vista de planificación.'),
    ]),
  ]);
  root.appendChild(header);

  // Filtros
  const filters = { status: query?.status || '', priority: query?.priority || '', area: query?.area || '', assigned_to: query?.assigned_to || '', date_from: query?.date_from || '', date_to: query?.date_to || '', search: query?.search || '' };
  const filtersBar = h('div.card.flex.flex-wrap.items-end.gap-3', {});
  const statusSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todos los estados'),
    ...STATUS.map((s) => h('option', { value: s, selected: filters.status === s ? '' : null }, STATUS_LABEL[s])),
  ]);
  const prioSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las prioridades'),
    h('option', { value: 'baja', selected: filters.priority === 'baja' ? '' : null }, 'Baja'),
    h('option', { value: 'media', selected: filters.priority === 'media' ? '' : null }, 'Media'),
    h('option', { value: 'alta', selected: filters.priority === 'alta' ? '' : null }, 'Alta'),
    h('option', { value: 'urgente', selected: filters.priority === 'urgente' ? '' : null }, 'Urgente'),
  ]);
  const areaSel = h('select.input', {}, [
    h('option', { value: '' }, 'Todas las áreas'),
    ...Object.entries(AREA_LABEL).map(([k, v]) => h('option', { value: k, selected: filters.area === k ? '' : null }, v)),
  ]);
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const fromInput = h('input.input', { type: 'date', value: filters.date_from });
  const toInput = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', { onclick: () => apply() }, 'Filtrar');
  const resetBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', area: '', assigned_to: '', date_from: '', date_to: '' }); statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; fromInput.value=''; toInput.value=''; render(); } }, 'Limpiar');

  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Prioridad'), prioSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Área'), areaSel]));
  filtersBar.appendChild(h('div.w-44', {}, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-40', {}, [h('label.label', {}, 'Desde'), fromInput]));
  filtersBar.appendChild(h('div.w-40', {}, [h('label.label', {}, 'Hasta'), toInput]));
  filtersBar.appendChild(h('div.flex.gap-2', {}, [applyBtn, resetBtn]));
  root.appendChild(filtersBar);

  const panel = h('div.card.p-4', {});
  root.appendChild(panel);

  async function apply() {
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.date_from = fromInput.value;
    filters.date_to = toInput.value;
    
    // Guardar filtros en la URL
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);
    
    render();
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
    panel.innerHTML = '<div class="text-sm text-slate-500">Cargando calendario…</div>';
    try {
      const data = await api.tickets.list({ page: 1, limit: 100, status: filters.status || undefined, priority: filters.priority || undefined, area: filters.area || undefined, assigned_to: filters.assigned_to || undefined });
      let tickets = (data.tickets || []).filter((t) => t.created_at);
      
      // Filtrar por rango de fechas si está especificado
      if (filters.date_from || filters.date_to) {
        const from = filters.date_from ? new Date(filters.date_from) : new Date('1970-01-01');
        const to = filters.date_to ? new Date(filters.date_to) : new Date('2099-12-31');
        tickets = tickets.filter((t) => {
          const created = new Date(t.created_at);
          return created >= from && created <= to;
        });
      }
      
      panel.innerHTML = '';
      panel.appendChild(renderGantt(tickets));
    } catch (err) {
      panel.innerHTML = `<div class="text-sm text-red-600">${escapeHtml(err.message || 'No se pudo cargar el calendario')}</div>`;
    }
  }

  function renderGantt(tickets) {
    const rows = tickets.slice(0, 20).map((ticket) => {
      const start = new Date(ticket.created_at || Date.now());
      const end = new Date(start.getTime() + Math.max(24 * 60 * 60 * 1000, (ticket.priority === 'urgente' ? 3 : 1) * 24 * 60 * 60 * 1000));
      const totalDays = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
      const statusLabel = STATUS_LABEL[ticket.status] || ticket.status;
      const percent = Math.min(100, Math.round((STATUS.indexOf(ticket.status) + 1) / STATUS.length * 100));
      const barWidth = `${Math.max(18, percent)}%`;
      return h('div.grid.grid-cols-[minmax(200px,220px)_1fr_70px] items-center gap-3.py-2.border-b.border-slate-100.hover\\:bg-slate-50.cursor-pointer.transition-colors', { onclick: () => go(`/tickets/${ticket.id}`) }, [
        h('div.min-w-0', {}, [
          h('div.font-medium.text-sm.text-slate-800.truncate', {}, ticket.title || ticket.code),
          h('div.text-xs.text-slate-500', {}, `${ticket.code} · ${AREA_LABEL[ticket.area] || '—'}`),
        ]),
        h('div', {}, [
          h('div.text-[11px] text-slate-500.mb-1', {}, `${statusLabel} · ${PRIORITY_LABEL[ticket.priority] || ticket.priority}`),
          h('div.relative.h-3.w-full.rounded-full.bg-slate-200.overflow-hidden', {}, [
            h('div.h-3.rounded-full.bg-brand-ocean.transition-all', { style: { width: barWidth } }),
          ]),
        ]),
        h('div.text-xs.text-slate-500.text-right', {}, `${totalDays} d`),
      ]);
    });

    const wrap = h('div.flex.flex-col.gap-1', {});
    wrap.appendChild(h('div.grid.grid-cols-[minmax(200px,220px)_1fr_70px] text-[11px] uppercase tracking-wide text-slate-500 px-2 pb-2', {}, [
      h('span', {}, 'Ticket'),
      h('span', {}, 'Progreso'),
      h('span.text-right', {}, 'Duración'),
    ]));
    rows.forEach((row) => wrap.appendChild(row));
    if (!rows.length) wrap.appendChild(h('div.text-sm.text-slate-500', {}, 'No hay tickets para mostrar en el calendario.'));
    return wrap;
  }

  await populateAssignedUsers();
  await render();

  return { view: root };
}
