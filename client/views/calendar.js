import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];

export async function renderCalendar({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  const header = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Calendario Gantt'),
      h('p.text-sm.text-slate-500', {}, 'Organiza y visualiza el trabajo por ticket en una vista de planificación.'),
    ]),
  ]);
  root.appendChild(header);

  const panel = h('div.card.p-4', {});
  root.appendChild(panel);

  async function load() {
    panel.innerHTML = '<div class="text-sm text-slate-500">Cargando calendario…</div>';
    try {
      const data = await api.tickets.list({ page: 1, limit: 100 });
      const tickets = (data.tickets || []).filter((t) => t.created_at);
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
      return h('div.grid.grid-cols-[minmax(200px,220px)_1fr_70px] items-center gap-3.py-2.border-b.border-slate-100', {}, [
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

  await load();
  return { view: root };
}
