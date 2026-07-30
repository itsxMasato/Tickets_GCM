/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { openModal } from '../components/modal.js';
import { ICON, svg } from '../utils/icons.js';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const TICKETS_PER_PAGE = 8;
const PRIORITY_ORDER = ['baja', 'media', 'alta', 'urgente'];
const PRIORITY_COLOR_MAP = {
  baja: 'ocean',
  media: 'brand',
  alta: 'deep',
  urgente: 'accent',
};
const PRIORITY_COLOR_META = {
  baja: { label: 'Baja', hex: '#0ea5e9' },
  media: { label: 'Media', hex: '#0f172a' },
  alta: { label: 'Alta', hex: '#344e86' },
  urgente: { label: 'Urgente', hex: '#cf301d' },
};
const COLOR_OPTIONS = [
  { key: 'ocean', label: 'Ocean', hex: '#0ea5e9', className: 'bg-brand-ocean/15 text-brand-ocean border border-brand-ocean/20' },
  { key: 'brand', label: 'Brand', hex: '#0f172a', className: 'bg-brand/15 text-brand border border-brand/20' },
  { key: 'deep', label: 'Deep', hex: '#344e86', className: 'bg-brand-deep/15 text-brand-deep border border-brand-deep/20' },
  { key: 'accent', label: 'Accent', hex: '#cf301d', className: 'bg-accent/15 text-accent border border-accent/20' },
];
const EVENT_COLORS = Object.fromEntries(COLOR_OPTIONS.map((option) => [option.key, option.className]));

function getTicketColorByPriority(priority) {
  return PRIORITY_COLOR_MAP[priority] || 'ocean';
}

function getPriorityMeta(priority) {
  return PRIORITY_COLOR_META[priority] || { label: String(priority || 'Media'), hex: '#94a3b8' };
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDayLabel(date) {
  return `${DAY_LABELS[(date.getDay() + 6) % 7]} ${date.getDate()}/${date.getMonth() + 1}`;
}

function parseDateTime(value) {
  const iso = String(value);
  return new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
}

function formatTime(value) {
  const d = parseDateTime(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const HOUR_START = 7;
const HOUR_END = 20;
const ROW_HEIGHT = 56;

function formatHourLabel(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function buildWeekTitle(start) {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
}

export async function renderCalendar({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  let weekStart = query?.start ? startOfWeek(new Date(query.start)) : startOfWeek(new Date());
  let events = [];
  let tickets = [];
  let ticketPage = 1;

  const header = h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Planificación semanal'),
      h('p.text-sm.text-slate-500', {}, 'Arrastra tickets al calendario para programarlos y organiza la semana visualmente.'),
    ]),
  ]);
  root.appendChild(header);

  const layout = h('div', { className: 'grid grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] gap-5' });
  const sidebar = h('div', { className: 'min-w-0 md:max-w-[320px] flex flex-col gap-4' });
  const calendarSection = h('div', { className: 'min-w-0 flex flex-col gap-4' });

  const statsCard = h('div.card', {}, [
    h('h2.text-xs.font-semibold.text-slate-500.uppercase.tracking-wider.mb-3', {}, 'Resumen semanal'),
    h('div.grid.grid-cols-2.gap-2', {}, [
      h('div.bg-surface.rounded-lg.p-3', {}, [h('div.text-2xl.font-bold.text-brand.block', {}, '0'), h('div.text-xs.text-slate-500', {}, 'Eventos')]),
      h('div.bg-surface.rounded-lg.p-3', {}, [h('div.text-2xl.font-bold.text-brand.block', {}, '0'), h('div.text-xs.text-slate-500', {}, 'Tickets disponibles')]),
    ]),
  ]);
  sidebar.appendChild(statsCard);

  const ticketCard = h('div', { className: 'card md:sticky md:top-6 flex min-h-0 flex-col gap-3 md:max-h-[calc(100vh-7rem)] overflow-hidden' });
  ticketCard.appendChild(h('div.flex-shrink-0', {}, [
    h('h2.font-bold.text-brand-ink', {}, 'Tickets para agendar'),
    h('p.text-sm.text-slate-500', {}, 'Arrastra tickets al calendario para programarlos'),
  ]));
  const ticketList = h('div.flex.flex-1.flex-col.gap-2.overflow-y-auto.min-h-0.pr-1.mt-2', {});
  ticketCard.appendChild(ticketList);
  sidebar.appendChild(ticketCard);

  const calendarCard = h('div.card.flex.flex-col.gap-3', {});
  const weekInfo = h('div.gantt-board-header', {}, [
    h('div.gantt-board-header-top', {}, [
      h('div.gantt-board-title', {}, [
        h('h2.text-2xl.font-bold.text-slate-900', {}, 'Planificación de activos'),
        h('p.text-sm.text-slate-500', {}, 'Gestión estratégica de mantenimientos preventivos y correctivos semanal.'),
      ]),
      h('div.gantt-board-actions', {}, [
        h('div.flex.items-center.bg-surface.p-1.rounded-lg', {}, [
          h('button.p-2.rounded-md.text-brand-ink.transition-all', { class: 'hover:bg-white', type: 'button', 'aria-label': 'Semana anterior', onclick: () => { weekStart = addDays(weekStart, -7); updateHash(); } }, [svg(h, ICON.chevronL, 'w-4 h-4')]),
          h('button.px-4.py-2.rounded-md.font-medium.text-sm.text-brand.bg-white.shadow-sm', { type: 'button', onclick: () => { weekStart = startOfWeek(new Date()); updateHash(); } }, 'Hoy'),
          h('button.p-2.rounded-md.text-brand-ink.transition-all', { class: 'hover:bg-white', type: 'button', 'aria-label': 'Semana siguiente', onclick: () => { weekStart = addDays(weekStart, 7); updateHash(); } }, [svg(h, ICON.chevronR, 'w-4 h-4')]),
        ]),
        h('button.p-3.bg-surface.rounded-lg.text-brand-ink.transition-all', { class: 'hover:bg-brand-ocean/15', type: 'button', title: 'Recargar', 'aria-label': 'Recargar calendario', onclick: () => load() }, [svg(h, ICON.refresh, 'w-4 h-4')]),
      ]),
    ]),
    h('div.gantt-board-range', {}, [
      h('span.text-lg.font-bold.text-brand-ink', {}, `${buildWeekTitle(weekStart)}`),
    ]),
    h('div.gantt-board-legend', {}, PRIORITY_ORDER.map((priority) => {
      const meta = getPriorityMeta(priority);
      return h('div.gantt-board-legend-item', {}, [
        h('span.gantt-board-legend-bullet', { style: { backgroundColor: meta.hex } }),
        meta.label,
      ]);
    })),
  ]);

  const boardShell = h('div.gantt-board-shell', {});
  boardShell.appendChild(weekInfo);
  const boardGridWrapper = h('div.gantt-board-grid-wrapper.overflow-x-auto', {});
  const headerRow = h('div.gantt-board-header-row', { style: { minWidth: '640px' } });
  const hourGridWrap = h('div.gantt-hour-grid-wrap', { style: { minWidth: '640px' } });
  const boardGrid = h('div.gantt-board-grid', {});
  const eventOverlay = h('div.gantt-event-overlay', {});
  hourGridWrap.appendChild(boardGrid);
  hourGridWrap.appendChild(eventOverlay);
  boardGridWrapper.appendChild(headerRow);
  boardGridWrapper.appendChild(hourGridWrap);
  boardShell.appendChild(boardGridWrapper);
  calendarCard.appendChild(boardShell);
  calendarSection.appendChild(calendarCard);

  layout.appendChild(sidebar);
  layout.appendChild(calendarSection);
  root.appendChild(layout);

  const fab = h('button.gantt-fab', { type: 'button', onclick: () => go('/tickets/new'), 'aria-label': 'Crear nuevo ticket' }, [
    svg(h, ICON.plus, 'w-6 h-6'),
    h('span.gantt-fab-tooltip', {}, 'Nuevo ticket planificado'),
  ]);
  root.appendChild(fab);

  async function load() {
    ticketList.innerHTML = '';
    boardGrid.innerHTML = '';
    headerRow.innerHTML = '';
    eventOverlay.innerHTML = '';
    statsCard.innerHTML = '';
    const loading = h('div.flex.items-center.gap-2.text-slate-500', {}, [svg(h, ICON.spinner, 'animate-spin w-4 h-4 text-brand-ocean'), 'Cargando calendario…']);
    boardGrid.appendChild(loading);

    try {
      [events, tickets] = await Promise.all([
        api.calendar.list({ from: weekStart.toISOString(), to: addDays(weekStart, 6).toISOString() }).then((res) => res.events || []),
        api.calendar.schedulableTickets({ limit: 40 }).then((res) => res.tickets || []),
      ]);
      ticketPage = 1;
    } catch (err) {
      boardGrid.innerHTML = '';
      boardGrid.appendChild(h('div.text-sm.text-red-600', {}, escapeHtml(err.message || 'No se pudo cargar el calendario.')));
      return;
    }

    renderStats();
    renderTickets();
    renderCalendar();
  }

  function updateHash() {
    const params = new URLSearchParams({ start: weekStart.toISOString() });
    go(`/calendar?${params.toString()}`);
  }

  function renderStats() {
    statsCard.innerHTML = '';
    const totalEvents = events.length;
    const totalTickets = tickets.length;
    statsCard.appendChild(h('h2.text-xs.font-semibold.text-slate-500.uppercase.tracking-wider.mb-3', {}, 'Resumen semanal'));
    statsCard.appendChild(h('div.grid.grid-cols-2.gap-2', {}, [
      h('div.bg-surface.rounded-lg.p-3', {}, [h('div.text-2xl.font-bold.text-brand.block', {}, String(totalEvents)), h('div.text-xs.text-slate-500', {}, 'Eventos')]),
      h('div.bg-surface.rounded-lg.p-3', {}, [h('div.text-2xl.font-bold.text-brand.block', {}, String(totalTickets)), h('div.text-xs.text-slate-500', {}, 'Tickets disponibles')]),
    ]));
  }

  function renderTickets() {
    ticketList.innerHTML = '';
    if (!tickets.length) {
      ticketList.appendChild(h('div.text-sm.text-slate-500', {}, 'No hay tickets para arrastrar.'));
      return;
    }

    const totalPages = Math.max(1, Math.ceil(tickets.length / TICKETS_PER_PAGE));
    ticketPage = Math.min(Math.max(1, ticketPage), totalPages);

    const orderedTickets = [...tickets].sort((a, b) => PRIORITY_ORDER.indexOf(b.priority) - PRIORITY_ORDER.indexOf(a.priority));
    const start = (ticketPage - 1) * TICKETS_PER_PAGE;
    const visibleTickets = orderedTickets.slice(start, start + TICKETS_PER_PAGE);

    ticketList.appendChild(h('div.flex.items-center.justify-between.text-slate-500.mb-2', { class: 'text-[11px]' }, [
      h('span', {}, `Página ${ticketPage} de ${totalPages}`),
      h('div.flex.items-center.gap-1', {}, [
        h('button.btn.btn-ghost.btn-xs', {
          type: 'button',
          onclick: () => {
            if (ticketPage > 1) {
              ticketPage -= 1;
              renderTickets();
            }
          },
          disabled: ticketPage <= 1 ? true : null,
        }, '←'),
        h('button.btn.btn-ghost.btn-xs', {
          type: 'button',
          onclick: () => {
            if (ticketPage < totalPages) {
              ticketPage += 1;
              renderTickets();
            }
          },
          disabled: ticketPage >= totalPages ? true : null,
        }, '→'),
      ]),
    ]));

    visibleTickets.forEach((ticket) => {
      const priorityMeta = getPriorityMeta(ticket.priority);
      const card = h('button.flex.items-start.justify-between.gap-2.w-full.rounded-lg.p-3.text-left.bg-white.transition-shadow', {
        class: 'cursor-grab active:cursor-grabbing hover:shadow-md',
        style: { borderLeft: `4px solid ${priorityMeta.hex}`, borderTop: '1px solid #e2e8f0', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' },
        type: 'button',
        draggable: 'true',
        ondragstart: (e) => beginTicketDrag(e, ticket),
      }, [
        h('div.min-w-0', {}, [
          h('div.flex.items-center.justify-between.gap-2', {}, [
            h('div.text-sm.font-semibold.text-brand-ink.truncate', {}, `${ticket.code || 'Ticket'} · ${ticket.title}`),
            h('span.rounded-full', { class: 'w-2.5 h-2.5', style: { backgroundColor: priorityMeta.hex } }),
          ]),
          h('div.text-xs.text-slate-500.mt-2', {}, `${ticket.status ? ticket.status.replace('_', ' ') : 'Sin estado'}`),
        ]),
        h('span.text-slate-500.whitespace-nowrap', { class: 'text-[11px]' }, 'Arrastrar'),
      ]);
      ticketList.appendChild(card);
    });
  }

  function renderCalendar() {
    boardGrid.innerHTML = '';
    headerRow.innerHTML = '';
    eventOverlay.innerHTML = '';

    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

    headerRow.appendChild(h('div.gantt-board-time-head', {}, 'H/D'));
    days.forEach((date) => {
      headerRow.appendChild(h('div.gantt-board-column-head', {}, `${DAY_LABELS[(date.getDay() + 6) % 7]} ${date.getDate()}`));
    });

    for (let hour = HOUR_START; hour <= HOUR_END; hour += 1) {
      boardGrid.appendChild(h('div.gantt-board-time-label', {}, formatHourLabel(hour)));
      days.forEach((date) => {
        const cell = h('div.gantt-board-cell', {
          ondragover: (e) => { e.preventDefault(); cell.classList.add('gantt-day-over'); },
          ondragleave: () => cell.classList.remove('gantt-day-over'),
          ondrop: async (e) => { e.preventDefault(); cell.classList.remove('gantt-day-over'); await handleDrop(e, date, hour); },
        });
        boardGrid.appendChild(cell);
      });
    }

    days.forEach((date, dayIndex) => {
      const key = dayKey(date);
      const dayEvents = events
        .filter((event) => event.start_at && dayKey(parseDateTime(event.start_at)) === key)
        .sort((a, b) => parseDateTime(a.start_at) - parseDateTime(b.start_at));
      layoutDayEvents(dayEvents).forEach(({ event, col, cols }) => {
        eventOverlay.appendChild(renderEventBlock(event, dayIndex, col, cols));
      });
    });
  }

  function layoutDayEvents(dayEvents) {
    const active = [];
    const placed = [];
    for (const event of dayEvents) {
      const start = parseDateTime(event.start_at).getTime();
      const end = parseDateTime(event.end_at || event.start_at).getTime();
      for (let i = active.length - 1; i >= 0; i -= 1) {
        if (active[i].end <= start) active.splice(i, 1);
      }
      const usedCols = new Set(active.map((a) => a.col));
      let col = 0;
      while (usedCols.has(col)) col += 1;
      active.push({ end, col });
      placed.push({ event, col });
    }
    const cols = Math.max(1, ...placed.map((p) => p.col + 1));
    return placed.map((p) => ({ ...p, cols }));
  }

  function hourFraction(date) {
    return date.getHours() + date.getMinutes() / 60;
  }

  function renderEventBlock(event, dayIndex, col, cols) {
    const startDate = parseDateTime(event.start_at);
    const endDate = event.end_at ? parseDateTime(event.end_at) : new Date(startDate.getTime() + 60 * 60 * 1000);
    const startFrac = Math.min(HOUR_END + 1, Math.max(HOUR_START, hourFraction(startDate)));
    const endFrac = Math.min(HOUR_END + 1, Math.max(startFrac + 0.25, hourFraction(endDate)));
    const top = (startFrac - HOUR_START) * ROW_HEIGHT;
    const height = Math.max(26, (endFrac - startFrac) * ROW_HEIGHT - 3);

    const dayWidthPct = 100 / 7;
    const colWidthPct = dayWidthPct / cols;
    const leftPct = dayWidthPct * dayIndex + colWidthPct * col;

    const colorMeta = COLOR_OPTIONS.find((option) => option.key === event.color) || COLOR_OPTIONS[0];
    const colorCls = EVENT_COLORS[event.color] || EVENT_COLORS.ocean;
    const start = formatTime(event.start_at);
    const end = formatTime(event.end_at);
    const title = event.title || (event.ticket_id ? `Ticket ${event.ticket_id}` : 'Evento');

    const block = h('div.gantt-task-bar.text-left', {
      draggable: 'true',
      ondragstart: (e) => beginEventDrag(e, event),
      onclick: () => { if (event.ticket_id) go(`/tickets/${event.ticket_id}`); },
      style: {
        top: `${top}px`,
        height: `${height}px`,
        left: `calc(${leftPct}% + 4px)`,
        width: `calc(${colWidthPct}% - 8px)`,
        borderLeft: `4px solid ${colorMeta.hex}`,
      },
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('span.font-semibold.truncate', { class: 'text-[11px]' }, title),
        h('div.flex.items-center.flex-none', { class: 'gap-0.5' }, [
          h('button.btn.btn-ghost.btn-xs.flex-none', {
            type: 'button',
            title: 'Ajustar duración',
            'aria-label': 'Ajustar duración',
            onclick: (e) => {
              e.stopPropagation();
              openDurationModal(event);
            },
          }, [svg(h, ICON.clock, 'w-3 h-3')]),
          h('button.btn.btn-ghost.btn-xs.flex-none', {
            type: 'button',
            title: 'Quitar del calendario',
            'aria-label': 'Quitar del calendario',
            onclick: async (e) => {
              e.stopPropagation();
              await removeScheduledEvent(event.id);
            },
          }, [svg(h, ICON.trash, 'w-3 h-3')]),
        ]),
      ]),
      h('div.text-slate-500', { class: 'text-[10px]' }, `${start}–${end}`),
    ]);
    colorCls.split(' ').forEach((cls) => block.classList.add(cls));
    return block;
  }

  function beginTicketDrag(e, ticket) {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-gcm-ticket', String(ticket.id));
  }

  function beginEventDrag(e, event) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-gcm-event', String(event.id));
  }

  async function handleDrop(e, day, hour = 10) {
    const ticketId = e.dataTransfer.getData('application/x-gcm-ticket');
    const eventId = e.dataTransfer.getData('application/x-gcm-event');
    if (ticketId) {
      const ticket = tickets.find((t) => String(t.id) === ticketId);
      if (!ticket) return;
      await createEventFromTicket(ticket, day, hour);
      return;
    }
    if (eventId) {
      const event = events.find((item) => String(item.id) === eventId);
      if (!event) return;
      await moveEventToDay(event, day, hour);
      return;
    }
  }

  async function createEventFromTicket(ticket, day, hour = 10, color = null) {
    const start = new Date(day);
    start.setHours(hour, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const eventColor = color || getTicketColorByPriority(ticket.priority);
    try {
      await api.calendar.create({
        title: `${ticket.code || 'Ticket'} · ${ticket.title}`,
        notes: ticket.description || null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        ticket_id: ticket.id,
        color: eventColor,
      });
      toast('Ticket programado en el calendario.', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'No se pudo crear el evento.', 'error');
    }
  }

  const DURATION_QUICK_OPTIONS = [1, 2, 3, 4, 8];
  const DURATION_MIN = 0.5;
  const DURATION_MAX = 12;

  function openDurationModal(event) {
    const startDate = parseDateTime(event.start_at);
    const endDate = parseDateTime(event.end_at || event.start_at);
    let hours = Math.max(DURATION_MIN, Math.round(((endDate - startDate) / (60 * 60 * 1000)) * 2) / 2);

    const display = h('div.text-3xl.font-bold.text-brand-ink.text-center.tabular-nums', {}, formatHours(hours));
    const step = (delta) => {
      hours = Math.min(DURATION_MAX, Math.max(DURATION_MIN, hours + delta));
      display.textContent = formatHours(hours);
    };
    const stepper = h('div.flex.items-center.justify-center.gap-4', {}, [
      h('button.btn.btn-secondary.btn-sm', { type: 'button', onclick: () => step(-0.5) }, '−'),
      display,
      h('button.btn.btn-secondary.btn-sm', { type: 'button', onclick: () => step(0.5) }, '+'),
    ]);
    const quick = h('div.flex.items-center.justify-center.flex-wrap', { class: 'gap-1.5' }, DURATION_QUICK_OPTIONS.map((n) => h('button.btn.btn-ghost.btn-xs', {
      type: 'button',
      onclick: () => { hours = n; display.textContent = formatHours(hours); },
    }, `${n}h`)));

    const body = h('div.flex.flex-col.gap-4', {}, [
      h('p.text-sm.text-slate-600', {}, `¿Cuántas horas trabajará en "${event.title}"?`),
      stepper,
      quick,
    ]);
    const actions = (close) => [
      h('button.btn.btn-secondary', { type: 'button', onclick: close }, 'Cancelar'),
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: async () => {
          close();
          await updateEventDuration(event, hours);
        },
      }, 'Guardar'),
    ];
    openModal({ title: 'Ajustar duración', body, actions, size: 'sm' });
  }

  function formatHours(hours) {
    return Number.isInteger(hours) ? `${hours}h` : `${hours}h30`;
  }

  async function updateEventDuration(event, hours) {
    const startDate = parseDateTime(event.start_at);
    const endDate = new Date(startDate.getTime() + hours * 60 * 60 * 1000);
    try {
      await api.calendar.update(event.id, { end_at: endDate.toISOString() });
      toast('Duración actualizada.', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'No se pudo actualizar la duración.', 'error');
    }
  }

  function openAssignTicketModal(date) {
    if (!tickets.length) {
      toast('No hay tickets disponibles para asignar.', 'warning');
      return;
    }

    const body = h('div.flex.flex-col.gap-4', {}, [
      h('p.text-sm.text-slate-600', {}, `Selecciona el ticket que quieras agendar para ${formatDayLabel(date)}.`),
      h('p.text-xs.text-slate-500', {}, 'El color del bloque ya viene automático según prioridad.'),
      h('div.flex.flex-col.gap-2.max-h-80.overflow-y-auto', {}, tickets.map((ticket) => {
        const priorityMeta = getPriorityMeta(ticket.priority);
        return h('button.text-left.w-full.border.border-slate-200.rounded-xl.p-3.bg-white', {
          class: 'hover:bg-slate-50',
          type: 'button',
          onclick: async () => {
            await createEventFromTicket(ticket, date);
            cleanup();
          },
        }, [
          h('div.flex.items-center.justify-between.gap-2', {}, [
            h('div.font-semibold.text-slate-900', {}, `${ticket.code || 'Ticket'} · ${ticket.title}`),
            h('span.rounded-full.border.border-slate-200', { class: 'w-2.5 h-2.5', style: { backgroundColor: priorityMeta.hex } }),
          ]),
          h('div.text-xs.text-slate-500.mt-1', {}, `${ticket.status ? ticket.status.replace('_', ' ') : 'Sin estado'}`),
        ]);
      })),
    ]);

    const actions = (cleanup) => [
      h('button.btn.btn-secondary', { type: 'button', onclick: cleanup }, 'Cerrar'),
    ];

    const { cleanup } = openModal({ title: 'Agregar ticket al calendario', body, actions });
  }

  async function moveEventToDay(event, day, hour = null) {
    const originalStart = parseDateTime(event.start_at);
    const originalEnd = parseDateTime(event.end_at);
    const duration = originalEnd.getTime() - originalStart.getTime();
    const nextStart = new Date(day);
    const hourToUse = hour === null ? originalStart.getHours() : hour;
    nextStart.setHours(hourToUse, originalStart.getMinutes(), 0, 0);
    const nextEnd = new Date(nextStart.getTime() + duration);
    try {
      await api.calendar.update(event.id, {
        start_at: nextStart.toISOString(),
        end_at: nextEnd.toISOString(),
      });
      toast('Evento reprogramado.', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'No se pudo mover el evento.', 'error');
    }
  }

  async function updateEventColor(eventId, color) {
    try {
      await api.calendar.update(eventId, { color });
      toast('Color actualizado.', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'No se pudo actualizar el color.', 'error');
    }
  }

  async function removeScheduledEvent(eventId) {
    try {
      await api.calendar.remove(eventId);
      toast('Evento eliminado del calendario.', 'success');
      await load();
    } catch (err) {
      toast(err.message || 'No se pudo quitar el evento.', 'error');
    }
  }

  await load();
  return { view: root };
}

