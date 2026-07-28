/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { statusBadge } from '../components/badge.js';
import { relativeFromNow, STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL } from '../utils/format.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { go } from '../router.js';
import { isSAC, isJefe, isAdmin, canViewAllTickets, canCreateTicket } from '../utils/permissions.js';
import { exportToExcel, exportListToPDF, fetchAllForExport, TICKET_EXPORT_COLUMNS } from '../utils/exports.js';
import { toast } from '../utils/toast.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { activeFiltersChips } from '../components/active-filters-chips.js';
import { mountDataList } from '../components/data-list.js';
import { passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { ICON, svg } from '../utils/icons.js';
import { avatarColor, initials } from '../utils/avatar.js';
import { getRoleLabel } from '../utils/role-labels.js';

const STATUS = ['recibido', 'asignado', 'en_proceso', 'solucionado', 'cerrado', 'reabierto'];
const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

// Tono por KPI del bento superior — mismo lenguaje visual que /reports
// (acento lateral + chip de ícono + color del valor) para que ambas vistas
// de datos se sientan del mismo sistema.
const KPI_TONE = {
  '':      { border: 'border-l-4 border-l-surface-border-strong', icon: 'bg-surface-alt text-brand', value: 'text-brand-ink' },
  ocean:   { border: 'border-l-4 border-l-brand-ocean',           icon: 'bg-brand-ocean/10 text-brand-ocean', value: 'text-brand-ocean' },
  good:    { border: 'border-l-4 border-l-emerald-500',           icon: 'bg-emerald-100 text-emerald-700',    value: 'text-emerald-700' },
  warn:    { border: 'border-l-4 border-l-orange-500',            icon: 'bg-orange-100 text-orange-700',      value: 'text-orange-700' },
  accent:  { border: 'border-2 border-accent/25 bg-accent/5',      icon: 'bg-accent/10 text-accent',           value: 'text-accent' },
};

function kpiCard({ label, value, hint = '', tone = '', icon = null }) {
  const t = KPI_TONE[tone] || KPI_TONE[''];
  return h('div.card.flex.flex-col.gap-3', { class: t.border }, [
    icon ? h('div.w-9.h-9.rounded-lg.flex.items-center.justify-center', { class: t.icon }, [svg(h, icon, 'w-4 h-4')]) : null,
    h('div', {}, [
      h('div.text-2xl.font-bold', { class: t.value }, String(value ?? '—')),
      h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
    ]),
    hint ? h('div.text-xs.text-slate-500', {}, hint) : null,
  ]);
}

function formatHours(hours) {
  if (hours == null || isNaN(hours)) return '—';
  if (hours >= 48) return `${(hours / 24).toFixed(1)} d`;
  return `${Number(hours).toFixed(1)} h`;
}

// Ícono de prioridad en vez de badge — alta densidad de la tabla de
// tickets. Urgente/alta llevan ícono de alerta (colores alineados con
// prio-urgente/prio-alta en styles.css); baja/media un punto simple para no
// competir visualmente con las prioridades que sí requieren atención.
// title + aria-label mantienen el dato accesible aunque el color no se perciba.
function priorityIcon(p) {
  const label = PRIORITY_LABEL[p] || p || '—';
  if (p === 'urgente' || p === 'alta') {
    return h('span.inline-flex.items-center.justify-center', { class: p === 'urgente' ? 'text-error' : 'text-amber-600', title: label, 'aria-label': label }, [svg(h, ICON.alert, 'w-5 h-5')]);
  }
  const dotCls = p === 'media' ? 'bg-blue-500' : 'bg-slate-400';
  return h('span.inline-flex.items-center.justify-center', { title: label, 'aria-label': label }, [
    h('span.rounded-full', { class: `w-2.5 h-2.5 ${dotCls}` }),
  ]);
}

export async function renderTicketsList({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  // Header
  let exportBtn;
  const listTitle = h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, isJefe(user) ? 'Tickets listos para cerrar' : 'Tickets');
  const listSub = h('p.text-sm.text-slate-500.mt-1', {}, '');
  const header = h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [listTitle, listSub]),
    h('div.flex.items-center.gap-2', {}, [
      exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: doExport }),
      canCreateTicket(user) ? h('button.btn.btn-primary', { onclick: () => go('/tickets/new') }, [svg(h, ICON.plus, 'w-4 h-4'), h('span', {}, 'Nuevo ticket')]) : null,
    ]),
  ]);
  root.appendChild(header);

  // Bento de KPIs — snapshot operativo (no reactivo a los filtros de la
  // tabla, igual que el resto de la app usa api.stats.*): tiempo promedio de
  // resolución, urgentes, cerrados hoy y reabiertos.
  const statsRow = h('div.grid.grid-cols-2.gap-3', { class: 'md:grid-cols-4' });
  root.appendChild(statsRow);

  // Filtros — apilados en mobile, en fila en desktop.
  const initialStatus = isJefe(user) && !query.status ? 'solucionado' : query.status || '';
  const filters = {
    status: initialStatus,
    priority: query.priority || '',
    search: query.search || '',
    assigned_to: query.assigned_to || '',
    area: isJefe(user) ? '' : query.area || '',
    date_from: query.date_from || '',
    date_to: query.date_to || '',
    limit: 20,
  };
  // Paginación por cursor (ver firestoreData.listTickets): no hay "salto a
  // página N" porque Firestore no soporta offset barato a gran escala.
  // `cursors[i]` es el cursor usado para pedir la página i; `cursors[0]`
  // siempre es null (primera página). Avanzar ("Siguiente") empuja el
  // nextCursor devuelto por el server; retroceder ("Anterior") sólo mueve
  // el índice — el cursor ya lo teníamos, no hay que recordar filas viejas.
  const state = { filters, result: { tickets: [], total: 0, hasMore: false }, cursors: [null], pageIndex: 0 };
  const filtersBar = h('div.card.flex.flex-col.gap-3', { class: 'md:flex-row md:flex-wrap md:items-end' });
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
  const assignedSel = h('select.input', {}, [h('option', { value: '' }, 'Todos los responsables')]);
  const fromInput = h('input.input', { type: 'date', value: filters.date_from });
  const toInput = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', { onclick: () => applyFilters() }, 'Filtrar');
  const resetBtn = h('button.btn.btn-ghost', { onclick: () => { clearFiltersInUrl(); Object.assign(filters, { status: '', priority: '', search: '', area: '', assigned_to: '', date_from: '', date_to: '' }); searchInput.value=''; statusSel.value=''; prioSel.value=''; areaSel.value=''; assignedSel.value=''; fromInput.value=''; toInput.value=''; state.cursors = [null]; state.pageIndex = 0; render(); } }, 'Limpiar');

  // Enter en cualquier input/select de filtro dispara applyFilters() — sin
  // esto el usuario tiene que tabular hasta el botón "Filtrar" para confirmar.
  for (const el of [searchInput, statusSel, prioSel, areaSel, assignedSel, fromInput, toInput]) {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); applyFilters(); }
    });
  }

  filtersBar.appendChild(h('div.w-full', { class: 'md:flex-1 md:min-w-[200px]' }, [h('label.label', {}, 'Búsqueda'), searchInput]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Estado'), statusSel]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Prioridad'), prioSel]));
  if (!isJefe(user)) {
    filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Área'), areaSel]));
  }
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-44' }, [h('label.label', {}, 'Responsable'), assignedSel]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-40' }, [h('label.label', {}, 'Desde'), fromInput]));
  filtersBar.appendChild(h('div.w-full', { class: 'md:w-40' }, [h('label.label', {}, 'Hasta'), toInput]));
  filtersBar.appendChild(h('div.flex.gap-2.w-full', { class: 'md:w-auto' }, [applyBtn, resetBtn]));
  root.appendChild(filtersBar);

  const quickFiltersWrap = h('div.flex.flex-wrap.gap-2', {});
  root.appendChild(quickFiltersWrap);

  // Mostrar filtros activos como chips
  const filtersChipsWrap = h('div.flex.gap-2.items-center.flex-wrap', {});
  root.appendChild(filtersChipsWrap);

  // Lista (tabla desktop / cards mobile) + paginación numerada. `table-zebra`
  // va en el wrapper (no en la tabla): mountDataList reemplaza el <table>
  // interno en cada repaint, pero el wrapper mismo persiste, así que la
  // clase sigue aplicando via selector descendiente en styles.css.
  const listWrap = h('div.table-zebra', {});
  const pagWrap = h('div.px-4.py-3.bg-surface.flex.items-center.justify-between.gap-3.flex-wrap.rounded-b-xl', {});
  const listContainer = h('div.card-tight.overflow-hidden', {}, [listWrap, pagWrap]);
  root.appendChild(listContainer);

  // Columnas para la tabla desktop. "Usuario" = quién reportó el ticket
  // (created_by_name); "Asignado" = quién lo está atendiendo
  // (assigned_to_name) — son personas distintas en el modelo de datos.
  const TABLE_COLUMNS = [
    { key: 'code',          label: 'Ticket' },
    { key: 'title',         label: 'Asunto' },
    { key: 'created_by',    label: 'Usuario' },
    { key: 'status',        label: 'Estado', align: 'center' },
    { key: 'priority',      label: 'Prioridad', align: 'center' },
    { key: 'assigned_to',   label: 'Asignado' },
    { key: 'updated_at',    label: 'Última act.' },
    { key: 'actions',       label: '' },
  ];

  // Cache de badges serializados: statusBadge devuelve HTMLElement y
  // necesitamos su .outerHTML para la tabla. Se cachean por valor para no
  // reconstruir el DOM en cada draw.
  const statusBadgeCache = new Map();
  function statusBadgeHtml(s) {
    if (statusBadgeCache.has(s)) return statusBadgeCache.get(s);
    const html = statusBadge(s).outerHTML;
    statusBadgeCache.set(s, html);
    return html;
  }
  const priorityIconCache = new Map();
  function priorityIconHtml(p) {
    if (priorityIconCache.has(p)) return priorityIconCache.get(p);
    const html = priorityIcon(p).outerHTML;
    priorityIconCache.set(p, html);
    return html;
  }

  function personCellHtml(name, seedId, emptyLabel = 'Sin asignar') {
    if (!name) return `<span class="text-slate-400 italic text-xs">${escapeHtml(emptyLabel)}</span>`;
    return `
      <div class="flex items-center gap-2">
        <span class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-none" style="background-color:${avatarColor(seedId)}">${escapeHtml(initials(name))}</span>
        <span class="text-brand-ink truncate max-w-[140px]">${escapeHtml(name)}</span>
      </div>
    `;
  }

  // Cell mobile por ticket.
  function mobileCard(t) {
    const open = () => go(`/tickets/${t.id}`);
    const card = h('button.card.text-left.flex.flex-col.gap-2.p-3.transition', {
      class: 'hover:border-brand-ocean hover:shadow-card focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: open,
      'aria-label': `Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}`,
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('span.text-xs.font-mono.text-brand.font-medium', {}, escapeHtml(t.code || '')),
        priorityIcon(t.priority),
      ]),
      h('div', {}, [
        h('div.font-medium.text-brand-ink.line-clamp-2', {}, escapeHtml(t.title || '')),
        t.description ? h('div.text-xs.text-slate-500.line-clamp-1', { class: 'mt-0.5' }, escapeHtml(t.description)) : null,
      ]),
      h('div.flex.items-center.gap-2.flex-wrap.text-xs.text-slate-500', {}, [
        statusBadge(t.status),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[t.area] || t.area || '—')),
        h('span', {}, '·'),
        h('span', { title: escapeHtml(t.updated_at || t.created_at || '') }, escapeHtml(relativeFromNow(t.updated_at || t.created_at))),
      ]),
      h('div.flex.items-center.justify-between.gap-2.text-xs.text-slate-500.pt-1.border-t.border-surface-border', {}, [
        h('span', {}, `Reportó: ${escapeHtml(t.created_by_name || '—')}`),
        t.assigned_to_name ? h('span', {}, `Asignado: ${escapeHtml(t.assigned_to_name)}`) : h('span.italic.text-slate-400', {}, 'Sin asignar'),
      ]),
    ]);
    return card;
  }

  // Fila HTML para la tabla desktop. Toda la fila es clickeable (role=link +
  // tabindex) y además lleva un chevron que aparece al hover para reforzar
  // la afordancia — ambos abren el mismo ticket, no hay menú extra fingido.
  function tableRow(t) {
    return `
      <tr class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-inset group" data-id="${escapeHtml(String(t.id))}" tabindex="0" role="link" aria-label="Abrir ticket ${escapeHtml(t.code)}: ${escapeHtml(t.title)}">
        <td class="font-mono text-xs text-brand font-medium">${escapeHtml(t.code || '')}</td>
        <td>
          <div class="font-medium text-slate-800">${escapeHtml(t.title || '')}</div>
          <div class="text-xs text-slate-500 line-clamp-1">${escapeHtml(t.description || '')}</div>
        </td>
        <td>${personCellHtml(t.created_by_name, t.created_by, 'Desconocido')}</td>
        <td class="text-center">${statusBadgeHtml(t.status)}</td>
        <td class="text-center">${priorityIconHtml(t.priority)}</td>
        <td>${personCellHtml(t.assigned_to_name, t.assigned_to)}</td>
        <td class="text-xs text-slate-500 whitespace-nowrap" title="${escapeHtml(t.updated_at || t.created_at || '')}">${escapeHtml(relativeFromNow(t.updated_at || t.created_at))}</td>
        <td class="text-right">
          <span class="inline-flex opacity-0 group-hover:opacity-100 text-slate-400 group-hover:text-brand transition-opacity" aria-hidden="true">${svg(h, ICON.chevronR, 'w-4 h-4').outerHTML}</span>
        </td>
      </tr>
    `;
  }

  let dataList = null;
  let currentTickets = [];
  let currentTotal = 0;
  let currentLimit = 20;

  // Re-engancha los listeners de teclado/click en las filas desktop. Sólo
  // aplica en >= 768px (data-list reemplaza el HTML al cruzar el breakpoint);
  // cada repaint debe re-vincular los handlers porque el DOM es nuevo.
  function wireTableRows() {
    const rows = listWrap.querySelectorAll('tr[data-id]');
    rows.forEach((tr) => {
      const open = () => go(`/tickets/${tr.dataset.id}`);
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          open();
        }
      });
    });
  }

  // data-list llama onMatchMediaChange después de un repaint; re-enganchamos
  // las filas para que el handler de teclado siga funcionando en desktop.
  function onMatchMediaChange(isMobile) {
    if (!isMobile) wireTableRows();
  }

  function renderQuickFilters() {
    quickFiltersWrap.innerHTML = '';
    const options = isJefe(user)
      ? [
          { value: '', label: 'Todos' },
          { value: 'solucionado', label: 'Listos para cerrar' },
          { value: 'cerrado', label: 'Cerrados' },
        ]
      : [
          { value: '', label: 'Todos' },
          { value: 'recibido', label: 'Recibidos' },
          { value: 'en_proceso', label: 'En proceso' },
          { value: 'solucionado', label: 'Solucionados' },
        ];

    const buttons = options.map((option) => {
      const active = filters.status === option.value;
      return h('button', {
        type: 'button',
        class: active ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm',
        onclick: () => {
          filters.status = option.value;
          statusSel.value = option.value;
          applyFilters();
        },
      }, option.label);
    });

    quickFiltersWrap.appendChild(h('div.flex.flex-wrap.gap-2', {}, buttons));
  }

  // applyFilters — lee los inputs de filtro, los guarda en la URL, y
  // siempre vuelve a la primera página: un cursor de la búsqueda anterior
  // no tiene sentido con filtros nuevos.
  async function applyFilters() {
    filters.search = searchInput.value.trim();
    filters.status = statusSel.value;
    filters.priority = prioSel.value;
    filters.area = isJefe(user) ? '' : areaSel.value;
    filters.assigned_to = assignedSel.value;
    filters.date_from = fromInput.value;
    filters.date_to = toInput.value;

    // Guardar filtros en la URL para que sean compartibles
    setFilterInUrl('search', filters.search);
    setFilterInUrl('status', filters.status);
    setFilterInUrl('priority', filters.priority);
    setFilterInUrl('area', filters.area);
    setFilterInUrl('assigned_to', filters.assigned_to);
    setFilterInUrl('date_from', filters.date_from);
    setFilterInUrl('date_to', filters.date_to);

    state.cursors = [null];
    state.pageIndex = 0;
    render();
  }

  // goToPage — 'next'/'prev'. Nunca refetchea desde el principio: 'next'
  // avanza usando el nextCursor que ya trajo el server; 'prev' sólo mueve
  // el índice a un cursor que ya conocíamos (visitado antes en esta
  // sesión de navegación).
  async function goToPage(direction) {
    if (direction === 'next') {
      if (!state.result.hasMore || !state.result.nextCursor) return;
      if (state.pageIndex + 1 >= state.cursors.length) {
        state.cursors.push(state.result.nextCursor);
      }
      state.pageIndex += 1;
    } else if (direction === 'prev') {
      if (state.pageIndex <= 0) return;
      state.pageIndex -= 1;
    }
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

  // Bento de KPIs — snapshot operativo del rol (independiente de los
  // filtros de la tabla), mismos endpoints que /dashboard.
  async function loadStats() {
    try {
      const data = user.role === 'sac' ? await api.stats.dashboard() : await api.stats.me();
      drawStats(data || {});
    } catch {
      statsRow.innerHTML = '';
    }
  }

  function drawStats(data) {
    const totals = data.totals || {};
    statsRow.innerHTML = '';
    statsRow.appendChild(kpiCard({ label: 'Resolución prom.', value: formatHours(data.avg_resolution_hours), hint: 'Creado → cerrado', tone: '', icon: ICON.clock }));
    statsRow.appendChild(kpiCard({ label: 'Urgentes', value: totals.urgent ?? '—', hint: 'Prioridad elevada', tone: 'accent', icon: ICON.alert }));
    statsRow.appendChild(kpiCard({ label: 'Cerrados hoy', value: totals.closed_today ?? '—', hint: 'Últimas 24 h', tone: 'good', icon: ICON.check }));
    statsRow.appendChild(kpiCard({ label: 'Reabiertos', value: totals.reabierto ?? '—', hint: 'Requieren seguimiento', tone: 'warn', icon: ICON.reopen }));
  }

  async function render() {
    // Estado de carga: pintamos skeleton y vaciamos paginación.
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    pagWrap.innerHTML = '';
    try {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) { if (v) params.set(k, v); }
      const cursor = state.cursors[state.pageIndex];
      if (cursor) params.set('cursor', cursor);
      const data = await api.tickets.list(Object.fromEntries(params));
      state.result = data;
      renderQuickFilters();
      draw();
    } catch (e) {
      // En error, mostramos el mensaje dentro del listWrap (no del tableWrap antiguo).
      listWrap.innerHTML = '';
      listWrap.appendChild(h('div.card.p-6.text-center.text-sm.text-red-600', {}, escapeHtml(e.message)));
    }
  }

  // Crea el data-list la primera vez. En repaints, update() reusa la misma
  // instancia y mantiene el listener de matchMedia.
  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard: mobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.tickets, className: 'py-10' }),
      onMatchMediaChange,
    });
  }

  function draw() {
    const { tickets, total, hasMore, limit } = state.result;
    currentTickets = tickets;
    currentTotal = total;
    currentLimit = limit;

    // total puede ser null (búsqueda de texto activa: no hay forma barata
    // de contar coincidencias sin escanear todo, ver firestoreData.listTickets).
    const totalLabel = total == null ? `${tickets.length}+` : String(total);
    listSub.textContent = isJefe(user)
      ? `Mostrando ${totalLabel} ticket${total === 1 ? '' : 's'} en estado solucionado para revisión y cierre.`
      : canViewAllTickets(user) ? `Gestionando ${totalLabel} ticket${total === 1 ? '' : 's'} en el sistema.` : `${totalLabel} ticket${total === 1 ? '' : 's'} que puedes ver.`;

    ensureDataList();
    dataList.update({ loading: false, items: tickets });

    // Si estamos en desktop, enganchamos los handlers de click/teclado en
    // las filas que mountDataList acaba de inyectar.
    if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 767.95px)').matches) {
      // Doble rAF: primero el repaint del data-list, luego enganchamos.
      requestAnimationFrame(() => requestAnimationFrame(wireTableRows));
    }

    drawPager(tickets.length, total, hasMore, state.pageIndex);

    // Actualizar chips de filtros activos
    filtersChipsWrap.innerHTML = '';
    const chips = activeFiltersChips(filters, (filterKey) => {
      // Limpiar filtro individual
      filters[filterKey] = '';
      const inputMap = {
        'search': searchInput,
        'status': statusSel,
        'priority': prioSel,
        'area': areaSel,
        'assigned_to': assignedSel,
        'date_from': fromInput,
        'date_to': toInput,
      };
      if (inputMap[filterKey]) inputMap[filterKey].value = '';
      setFilterInUrl(filterKey, '');
      applyFilters();
    });
    if (chips) filtersChipsWrap.appendChild(chips);
  }

  // Paginación Anterior/Siguiente (no numerada): con paginación por cursor
  // no existe "saltar a la página N" barato a gran escala — ver la nota en
  // firestoreData.listTickets. Muestra "Mostrando N" siempre, y "de M"
  // sólo cuando el total es barato de calcular (no hay búsqueda de texto
  // activa; ver total:null en el resultado).
  function drawPager(shown, total, hasMore, pageIndex) {
    pagWrap.innerHTML = '';
    if (!shown) return;
    const summary = total == null
      ? [h('span.font-medium.text-brand-ink', {}, String(shown)), ' resultados en esta página']
      : ['Mostrando ', h('span.font-medium.text-brand-ink', {}, String(shown)), ' de ', h('span.font-medium.text-brand-ink', {}, String(total))];
    pagWrap.appendChild(h('p.text-xs.text-slate-500', {}, summary));
    pagWrap.appendChild(h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-secondary.btn-sm.gap-1', { disabled: pageIndex <= 0, onclick: () => goToPage('prev') }, [svg(h, ICON.chevronL, 'w-4 h-4'), h('span', {}, 'Anterior')]),
      h('button.btn.btn-secondary.btn-sm.gap-1', { disabled: !hasMore, onclick: () => goToPage('next') }, [h('span', {}, 'Siguiente'), svg(h, ICON.chevronR, 'w-4 h-4')]),
    ]));
  }

  async function doExport(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const setBusy = (busy, labelText = 'Exportar') => {
      if (!exportBtn) return;
      exportBtn.disabled = busy;
      exportBtn.setLabel(labelText);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar los datos de los tickets a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => {
          await verifyCurrentPassword(password);
        },
      });
      setBusy(true, 'Exportando…');
      const { rows, truncated } = await fetchAllForExport(filters);
      if (!rows.length) {
        toast('No hay tickets para exportar con los filtros actuales.', 'info');
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns: TICKET_EXPORT_COLUMNS,
        title: isJefe(user) ? 'Tickets listos para cerrar' : 'Reporte de tickets',
        subtitle: `${rows.length} ticket${rows.length === 1 ? '' : 's'} · filtros aplicados desde /tickets`,
        sheetName: 'Tickets',
        summaryField: 'status',
        summaryLabel: 'Estado más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: getRoleLabel(user.role) || user.role,
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, TICKET_EXPORT_COLUMNS, `tickets-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `tickets-${stamp}.xlsx`, exportOpts);
      }
      toast(
        truncated
          ? `Exportadas ${rows.length} filas (hay más — filtra por fecha para exportar el resto).`
          : `Exportadas ${rows.length} filas a ${formatLabel}.`,
        truncated ? 'warn' : 'success',
      );
    } catch (e) {
      if (e && e.message !== 'Modal closed') {
        toast(e.message || 'Error al exportar', 'error');
      }
    } finally {
      setBusy(false);
    }
  }

  await populateAssignedUsers();
  await Promise.all([render(), loadStats()]);

  // ── Tiempo real: refrescar la tabla y los KPIs cuando algo cambia ──────────
  const evs = ['ticket:created', 'ticket:updated', 'ticket:assigned',
               'ticket:status_changed', 'ticket:commented', 'attachment:added'];
  const ac = new AbortController();
  window.addEventListener('gcm:realtime', (e) => {
    if (evs.includes(e.detail?.event)) { render(); loadStats(); }
  }, { signal: ac.signal });

  return { view: root, cleanup: () => ac.abort() };
}
