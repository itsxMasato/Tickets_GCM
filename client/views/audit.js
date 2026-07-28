/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { formatDateTime, fileSize, STATUS_LABEL, PRIORITY_LABEL, ROLE_LABEL, AREA_LABEL } from '../utils/format.js';
import { emptyState } from '../components/empty-state.js';
import { exportButton } from '../components/export-button.js';
import { passwordConfirmModal, openModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { exportToExcel, exportListToPDF } from '../utils/exports.js';
import { toast } from '../utils/toast.js';
import { setFilterInUrl, clearFiltersInUrl } from '../utils/url-filters.js';
import { activeFiltersChips } from '../components/active-filters-chips.js';
import { ICON, svg } from '../utils/icons.js';
import { go } from '../router.js';

const PAGE_SIZE = 20;

const spinnerHtml = '<svg class="animate-spin w-5 h-5 text-brand-navy" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';

// Espejo de los `action_type` que realmente emite el backend (grep sobre
// auditService.log/logAsync en src/services/*.js). Antes esta lista tenía
// user_created/user_modified/user_deleted/category_created/category_modified/
// category_deleted — ninguno de los cuales el backend emite hoy (auth.service.js
// y categories.service.js no llaman a auditService todavía) — y le faltaban
// los de calendario, empresas, membresías y roles, que sí ocurren y se
// mostraban con la key cruda ("calendar_event_created") en vez de una
// etiqueta legible.
const ACTION_LABELS = {
  ticket_created:            'Ticket creado',
  ticket_assigned:           'Ticket asignado',
  ticket_status_changed:     'Estado cambiado',
  comment_added:             'Comentario añadido',
  attachment_added:          'Archivo subido',
  calendar_event_created:    'Evento programado',
  calendar_event_updated:    'Evento reprogramado',
  calendar_event_deleted:    'Evento eliminado',
  'company:create':          'Empresa creada',
  'company:update':          'Empresa actualizada',
  'company:delete':          'Empresa eliminada',
  'membership:create':       'Miembro agregado',
  'membership:update':       'Miembro actualizado',
  'membership:delete':       'Miembro eliminado',
  role_label_updated:        'Nombre de rol actualizado',
  role_permissions_updated:  'Permisos de rol actualizados',
  role_deleted:               'Rol eliminado',
  permission_deleted:        'Permiso eliminado',
};

// Fallback para cualquier action_type no listado arriba: en vez de mostrar
// la key cruda ("some_new_action"), la convierte a texto legible.
function humanizeActionType(actionType) {
  return String(actionType).replace(/[:_]/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

function formatActionType(actionType) {
  if (!actionType) return '—';
  return ACTION_LABELS[actionType] || humanizeActionType(actionType);
}

const ACTION_COLORS = {
  ticket_created:            'bg-blue-100 text-blue-700 border-blue-200',
  ticket_assigned:           'bg-purple-100 text-purple-700 border-purple-200',
  ticket_status_changed:     'bg-amber-100 text-amber-700 border-amber-200',
  comment_added:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  attachment_added:          'bg-cyan-100 text-cyan-700 border-cyan-200',
  calendar_event_created:    'bg-sky-100 text-sky-700 border-sky-200',
  calendar_event_updated:    'bg-amber-100 text-amber-700 border-amber-200',
  calendar_event_deleted:    'bg-red-100 text-red-700 border-red-200',
  'company:create':          'bg-indigo-100 text-indigo-700 border-indigo-200',
  'company:update':          'bg-yellow-100 text-yellow-700 border-yellow-200',
  'company:delete':          'bg-red-100 text-red-700 border-red-200',
  'membership:create':       'bg-lime-100 text-lime-700 border-lime-200',
  'membership:update':       'bg-yellow-100 text-yellow-700 border-yellow-200',
  'membership:delete':       'bg-rose-100 text-rose-700 border-rose-200',
  role_label_updated:        'bg-teal-100 text-teal-700 border-teal-200',
  role_permissions_updated:  'bg-violet-100 text-violet-700 border-violet-200',
  role_deleted:               'bg-red-100 text-red-700 border-red-200',
  permission_deleted:        'bg-rose-100 text-rose-700 border-rose-200',
};

function badgeColor(actionType) {
  return ACTION_COLORS[actionType] || 'bg-slate-100 text-slate-700 border-slate-200';
}

const TARGET_TYPE_LABELS = {
  ticket: 'Ticket',
  role: 'Rol',
  membership: 'Membresía',
  calendar_event: 'Evento',
  company: 'Empresa',
  user: 'Usuario',
};

function formatTargetType(targetType) {
  return TARGET_TYPE_LABELS[targetType] || humanizeActionType(targetType);
}

// Etiquetas legibles para las claves más comunes que aparecen en
// old_value/new_value. Fallback: convierte snake_case/camelCase a texto
// natural para cualquier clave no listada (nueva acción, campo agregado).
const FIELD_LABELS = {
  code: 'Código', title: 'Título', priority: 'Prioridad', status: 'Estado',
  assigned_to: 'Asignado a', ticket_id: 'Ticket', start_at: 'Inicio', end_at: 'Fin',
  comment: 'Comentario', filename: 'Archivo', size: 'Tamaño', mime_type: 'Tipo de archivo',
  role: 'Rol', area: 'Área', active: 'Activo', is_default: 'Predeterminada',
  company_id: 'Empresa', username: 'Usuario', full_name: 'Nombre',
  manageUsers: 'Gestionar usuarios', manageCategories: 'Gestionar categorías',
  viewReports: 'Ver reportes', viewAllTickets: 'Ver todos los tickets',
  createTicket: 'Crear tickets', assign: 'Asignar tickets',
  fields_changed: 'Campos modificados', context: 'Contexto',
};

function prettifyKey(key) {
  return FIELD_LABELS[key] || String(key)
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

// Convierte un valor crudo (booleano, fecha, código de status/prioridad/rol,
// bytes, arreglo…) al texto que un usuario no técnico puede leer, en vez de
// dejar que el JSON crudo hable por sí mismo.
function humanizeValue(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (key === 'status') return STATUS_LABEL[value] || String(value);
  if (key === 'priority') return PRIORITY_LABEL[value] || String(value);
  if (key === 'role') return ROLE_LABEL[value] || String(value);
  if (key === 'area') return AREA_LABEL[value] || String(value);
  if (key === 'size' && typeof value === 'number') return fileSize(value);
  if (/_at$/.test(key) && typeof value === 'string') return formatDateTime(value) || value;
  if (Array.isArray(value)) return value.length ? value.map((v) => String(v)).join(', ') : '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// Reduce old_value/new_value (objetos planos) a filas de "campo: antes → después",
// omitiendo los campos que no cambiaron. Reemplaza el volcado de JSON crudo,
// que un usuario no técnico lee como "no hay diseño, esto es un error".
function buildChangeRows(oldValue, newValue) {
  const oldObj = oldValue && typeof oldValue === 'object' ? oldValue : {};
  const newObj = newValue && typeof newValue === 'object' ? newValue : {};
  const keys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));
  return keys
    .map((key) => {
      const hasOld = Object.prototype.hasOwnProperty.call(oldObj, key);
      const hasNew = Object.prototype.hasOwnProperty.call(newObj, key);
      if (hasOld && hasNew && JSON.stringify(oldObj[key]) === JSON.stringify(newObj[key])) return null;
      return { key, hasOld, hasNew, oldRaw: oldObj[key], newRaw: newObj[key] };
    })
    .filter(Boolean);
}

// KPI con ícono en badge circular — estilo específico de esta pantalla
// (distinto del kpi-card de borde lateral que usan otras vistas), tal como
// lo pidió el mock.
function kpiCard({ label, value, hint = '', icon, tone = '' }) {
  const TONE = {
    '':     'bg-brand/10 text-brand',
    ocean:  'bg-brand-ocean/10 text-brand-ocean',
    good:   'bg-emerald-100 text-emerald-700',
  }[tone] || 'bg-brand/10 text-brand';
  return h('div.card.flex.items-center.gap-3', {}, [
    h('div.w-12.h-12.rounded-full.flex.items-center.justify-center.flex-none', { class: TONE }, [svg(h, icon, 'w-5 h-5')]),
    h('div.min-w-0', {}, [
      h('p.text-xs.font-semibold.text-slate-500.uppercase.tracking-wider', {}, label),
      h('p.text-2xl.font-bold.text-brand.truncate', {}, [
        value,
        hint ? h('span.text-xs.font-normal.text-slate-500.ml-1', {}, hint) : null,
      ]),
    ]),
  ]);
}

export async function renderAudit({ query, user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  // Paginación por cursor — mismo patrón que tickets-list.js (ver la nota
  // grande en firestoreData.listTickets sobre por qué offset/page no
  // escala). `cursors[i]` es el cursor de la página i; `cursors[0]` es
  // siempre null.
  let cursors = [null];
  let pageIndex = 0;
  let lastResult = { data: [], total: 0, limit: PAGE_SIZE, hasMore: false };

  // ── Header ────────────────────────────────────────────────────────────
  let exportBtn;
  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Bitácora de auditoría'),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Registro detallado de acciones administrativas y operativas del sistema.'),
    ]),
    exportBtn = exportButton({ label: 'Exportar', kind: 'secondary', onExport: (format) => doExport(format) }),
  ]));

  // ── Filtros ───────────────────────────────────────────────────────────
  const filterCard = h('div.card', {});

  const filters = {
    search: query?.search || '',
    user_id: query?.user_id || '',
    action_type: query?.action_type || '',
    date_from: query?.date_from || '',
    date_to: query?.date_to || '',
  };

  const search = h('input.input', {
    type: 'search',
    placeholder: 'ID de ticket, palabra clave…',
    value: filters.search,
  });

  const userSelect = h('select.input', {}, [
    h('option', { value: '' }, 'Todos los usuarios'),
  ]);
  userSelect.value = filters.user_id;

  const actionSelect = h('select.input', {}, [
    h('option', { value: '' }, 'Todos los tipos'),
  ]);
  actionSelect.value = filters.action_type;

  const dateFrom = h('input.input', { type: 'date', value: filters.date_from });
  const dateTo = h('input.input', { type: 'date', value: filters.date_to });
  const applyBtn = h('button.btn.btn-primary', {}, 'Aplicar filtros');
  const clearBtn = h('button.btn.btn-ghost', {}, 'Limpiar');

  filterCard.appendChild(h('div.grid.grid-cols-1.gap-4.items-end', { class: 'md:grid-cols-2 lg:grid-cols-4' }, [
    h('div.space-y-1', {}, [h('label.label', {}, 'Buscar texto'), search]),
    h('div.space-y-1', {}, [h('label.label', {}, 'Usuario'), userSelect]),
    h('div.space-y-1', {}, [h('label.label', {}, 'Acción'), actionSelect]),
    h('div.grid.grid-cols-2.gap-2', {}, [
      h('div.space-y-1', {}, [h('label.label', {}, 'Desde'), dateFrom]),
      h('div.space-y-1', {}, [h('label.label', {}, 'Hasta'), dateTo]),
    ]),
  ]));

  filterCard.appendChild(h('div.flex.justify-end.gap-2.mt-4', {}, [clearBtn, applyBtn]));
  root.appendChild(filterCard);

  // Mostrar filtros activos como chips
  const filtersChipsWrap = h('div.flex.gap-2.items-center.flex-wrap', {});
  root.appendChild(filtersChipsWrap);

  // ── KPI Cards ─────────────────────────────────────────────────────────
  const kpiContainer = h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-3' });
  root.appendChild(kpiContainer);

  // ── Tabla + paginación ───────────────────────────────────────────────
  const tableContainer = h('div', {});
  const pagerInfo = h('div.text-xs.text-slate-500', {}, '');
  const pagerPageLabel = h('div.text-xs.text-slate-500.font-medium', {}, '');
  const prevBtn = h('button.btn-icon-sm', {
    'aria-label': 'Página anterior',
    onclick: () => { if (pageIndex > 0) { pageIndex -= 1; loadAudit(); } },
  }, [svg(h, ICON.chevronL, 'w-4 h-4')]);
  const nextBtn = h('button.btn-icon-sm', {
    'aria-label': 'Página siguiente',
    onclick: () => {
      if (!lastResult.hasMore || !lastResult.nextCursor) return;
      if (pageIndex + 1 >= cursors.length) cursors.push(lastResult.nextCursor);
      pageIndex += 1;
      loadAudit();
    },
  }, [svg(h, ICON.chevronR, 'w-4 h-4')]);
  const pager = h('div.px-4.py-3.bg-surface.flex.items-center.justify-between.gap-3.flex-wrap.rounded-b-xl', {}, [
    pagerInfo,
    h('div.flex.items-center.gap-2', {}, [prevBtn, pagerPageLabel, nextBtn]),
  ]);
  root.appendChild(h('div.flex.flex-col', {}, [tableContainer, pager]));

  // Helpers
  function renderKpis(data = {}) {
    kpiContainer.innerHTML = '';
    // total llega null cuando hay búsqueda de texto activa (contar coincidencias
    // exactas sin escanear todo el log no es barato — ver firestoreData.listAudit).
    // Mostrar "0" ahí sugiere "sin resultados" cuando puede haber varios; "—" es honesto.
    const totalValue = data.total == null ? '—' : data.total.toLocaleString('es-ES');
    kpiContainer.appendChild(kpiCard({ label: 'Total de acciones', value: totalValue, icon: ICON.report, tone: '' }));
    kpiContainer.appendChild(kpiCard({ label: 'Tipo más frecuente', value: formatActionType(data.mostFrequentAction), icon: ICON.tag, tone: 'ocean' }));
    kpiContainer.appendChild(kpiCard({ label: 'Usuarios con actividad', value: data.activeUserCount || 0, hint: 'según el filtro actual', icon: ICON.users, tone: 'good' }));
  }

  function openDetailModal(record) {
    const rows = [
      ['Fecha', formatDateTime(record.created_at)],
      ['Usuario', record.user_name || '—'],
      ['Acción', formatActionType(record.action_type)],
      ['Objetivo', record.target_type ? `${formatTargetType(record.target_type)}${record.target_code ? ` · ${record.target_code}` : ''}` : '—'],
      ['Descripción', record.description || '—'],
    ];
    const changeRows = buildChangeRows(record.old_value, record.new_value);
    const body = h('div.flex.flex-col.gap-4', {}, [
      h('div.flex.flex-col.gap-2', {}, rows.map(([label, value]) => h('div.flex.gap-3.text-sm', {}, [
        h('div.w-24.flex-none.text-slate-500', {}, label),
        h('div.flex-1.text-brand-ink.break-words', {}, value),
      ]))),
      changeRows.length ? h('div', {}, [
        h('p.text-xs.font-semibold.text-slate-500.uppercase.tracking-wider.mb-2', {}, 'Cambios'),
        h('div.flex.flex-col.divide-y.divide-surface-border.rounded-lg.border.border-surface-border.overflow-hidden', {},
          changeRows.map(({ key, hasOld, hasNew, oldRaw, newRaw }) => {
            const newDisplay = hasNew ? humanizeValue(key, newRaw) : null;
            const oldDisplay = hasOld ? humanizeValue(key, oldRaw) : null;
            const value = hasOld && hasNew ? `${oldDisplay} → ${newDisplay}` : (newDisplay ?? oldDisplay);
            return h('div.flex.items-center.justify-between.gap-3.px-3.py-2.text-sm.bg-white', {}, [
              h('span.text-slate-500.flex-none', {}, prettifyKey(key)),
              h('span.text-brand-ink.text-right.break-words', {}, value),
            ]);
          })),
      ]) : null,
    ]);
    openModal({
      title: `Detalle de la acción #${record.id}`,
      body,
      actions: (close) => [h('button.btn.btn-secondary', { onclick: close, type: 'button' }, 'Cerrar')],
      size: 'lg',
    });
  }

  function renderTable(records = []) {
    tableContainer.innerHTML = '';

    if (!records || records.length === 0) {
      tableContainer.appendChild(h('div.card', {}, [emptyState({
        icon: 'search',
        title: 'Sin registros',
        message: 'No se encontraron acciones con los filtros aplicados. Intenta modificar los criterios de búsqueda.',
      })]));
      return;
    }

    const table = h('div.card-tight.overflow-hidden', {}, [
      h('div.overflow-x-auto', {}, [
        h('table.table.table-zebra', {}, [
          h('thead', {}, [
            h('tr', {}, [
              h('th', {}, 'Fecha y hora'),
              h('th', {}, 'Usuario'),
              h('th', {}, 'Acción'),
              h('th', {}, 'Ticket'),
              h('th', {}, 'Descripción'),
              h('th', {}, ''),
            ]),
          ]),
          h('tbody', {}, records.map((record) => {
            const isTicket = record.target_type === 'ticket' && record.target_id;
            return h('tr', {}, [
              h('td.text-xs.font-mono.text-slate-500.whitespace-nowrap', {}, formatDateTime(record.created_at)),
              h('td.font-medium.text-brand-ink.text-sm', {}, record.user_name || '—'),
              h('td', {}, [
                h('span.inline-flex.items-center.px-2.py-1.rounded-full.text-xs.font-medium.border', { class: badgeColor(record.action_type) }, formatActionType(record.action_type)),
              ]),
              isTicket
                ? h('td.font-mono.text-xs.font-bold.text-brand.cursor-pointer', { class: 'hover:underline', onclick: () => go(`/tickets/${record.target_id}`) }, `#${record.target_code || record.target_id}`)
                : h('td.text-xs.text-slate-400.italic', {}, '—'),
              h('td.text-xs.text-slate-600.truncate', { style: { maxWidth: '280px' }, title: record.description || '' }, record.description || '—'),
              h('td.text-right', {}, [
                h('button.btn-icon-sm', { 'aria-label': 'Ver detalle', title: 'Ver detalle', onclick: () => openDetailModal(record) }, [svg(h, ICON.eye, 'w-4 h-4')]),
              ]),
            ]);
          })),
        ]),
      ]),
    ]);

    tableContainer.appendChild(table);
  }

  function renderPager() {
    const { total, data, hasMore } = lastResult;
    // total puede ser null con búsqueda de texto activa (no hay forma
    // barata de contar coincidencias sin escanear todo — ver la nota en
    // firestoreData.listAudit).
    pagerInfo.textContent = total == null
      ? `${(data || []).length} entradas en esta página`
      : `Mostrando ${(data || []).length} de ${total.toLocaleString('es-ES')} entradas`;
    pagerPageLabel.textContent = `Página ${pageIndex + 1}`;
    prevBtn.disabled = pageIndex <= 0;
    nextBtn.disabled = !hasMore;
  }

  async function loadAudit() {
    tableContainer.innerHTML = `
      <div class="card flex items-center justify-center gap-3 py-12 text-slate-600">
        ${spinnerHtml}
        <span class="text-sm">Cargando auditoría…</span>
      </div>
    `;
    kpiContainer.innerHTML = '';
    pagerInfo.textContent = '';
    pagerPageLabel.textContent = '';

    try {
      // Actualizar objeto de filtros
      filters.search = search.value.trim();
      filters.user_id = userSelect.value;
      filters.action_type = actionSelect.value;
      filters.date_from = dateFrom.value;
      filters.date_to = dateTo.value;

      // Guardar filtros en URL
      setFilterInUrl('search', filters.search);
      setFilterInUrl('user_id', filters.user_id);
      setFilterInUrl('action_type', filters.action_type);
      setFilterInUrl('date_from', filters.date_from);
      setFilterInUrl('date_to', filters.date_to);

      const params = {
        search: filters.search,
        user_id: filters.user_id,
        action_type: filters.action_type,
        date_from: filters.date_from,
        date_to: filters.date_to,
        limit: PAGE_SIZE,
      };
      const cursor = cursors[pageIndex];
      if (cursor) params.cursor = cursor;

      Object.keys(params).forEach(k => !params[k] && delete params[k]);

      const result = await api.audit.list(params);
      lastResult = {
        data: result.data || [],
        total: result.total ?? null,
        limit: result.limit || PAGE_SIZE,
        hasMore: !!result.hasMore,
        nextCursor: result.nextCursor || null,
      };

      renderKpis({
        total: lastResult.total,
        mostFrequentAction: result.mostFrequentAction || '',
        activeUserCount: result.activeUserCount || 0,
      });

      renderTable(lastResult.data);
      renderPager();

      // Actualizar chips de filtros activos
      filtersChipsWrap.innerHTML = '';
      const chips = activeFiltersChips(filters, (filterKey) => {
        filters[filterKey] = '';
        const inputMap = {
          'search': search,
          'user_id': userSelect,
          'action_type': actionSelect,
          'date_from': dateFrom,
          'date_to': dateTo,
        };
        if (inputMap[filterKey]) inputMap[filterKey].value = '';
        setFilterInUrl(filterKey, '');
        pageIndex = 0; cursors = [null];
        loadAudit();
      });
      if (chips) filtersChipsWrap.appendChild(chips);
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="card bg-red-50 border border-red-200 rounded-xl p-5 text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar auditoría</h3>
          <p class="text-xs">${escapeHtml(err.message || 'No se pudo cargar el registro. Intenta de nuevo.')}</p>
        </div>
      `;
    }
  }

  function clearFilters() {
    clearFiltersInUrl();
    search.value = '';
    userSelect.value = '';
    actionSelect.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    Object.assign(filters, { search: '', user_id: '', action_type: '', date_from: '', date_to: '' });
    filtersChipsWrap.innerHTML = '';
    pageIndex = 0; cursors = [null];
    loadAudit();
  }

  async function doExport(format) {
    const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
    const setBusy = (busy, label = 'Exportar') => {
      exportBtn.disabled = busy;
      exportBtn.setLabel(label);
    };
    try {
      setBusy(true, 'Verificando…');
      await passwordConfirmModal({
        title: 'Confirmar exportación',
        message: `Ingresa tu contraseña para exportar la bitácora de auditoría a ${formatLabel}.`,
        confirmText: 'Exportar',
        onConfirm: async (password) => { await verifyCurrentPassword(password); },
      });
      setBusy(true, 'Exportando…');
      // Trae todas las páginas del filtro actual (no sólo la visible) por
      // cursor, no por offset — igual que fetchAllTickets en exports.js:
      // paginar con `page` volvía a leer todo desde el principio en cada
      // vuelta (O(página²)) y cortaba en silencio a las 50 páginas.
      const EXPORT_MAX_ROWS = 20000;
      const all = [];
      let cursor = null;
      let truncated = false;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const params = { ...filters, limit: 200 };
        if (cursor) params.cursor = cursor;
        Object.keys(params).forEach((k) => { if (!params[k]) delete params[k]; });
        const res = await api.audit.list(params);
        all.push(...(res.data || []));
        if (all.length >= EXPORT_MAX_ROWS) { truncated = !!res.hasMore; break; }
        if (!res.hasMore || !(res.data || []).length) break;
        cursor = res.nextCursor;
      }
      if (!all.length) { toast('No hay registros para exportar con los filtros actuales.', 'info'); return; }
      if (truncated) {
        toast('Hay más registros de los que se exportaron — sólo se incluyen los primeros 20,000. Achica el rango de fechas para exportar el resto.', 'warn', 6000);
      }
      const rows = all.map((r) => ({
        fecha: formatDateTime(r.created_at),
        usuario: r.user_name || '—',
        accion: formatActionType(r.action_type),
        ticket: r.target_code || '',
        descripcion: r.description || '',
      }));
      const columns = [
        { key: 'fecha', label: 'Fecha y hora' },
        { key: 'usuario', label: 'Usuario' },
        { key: 'accion', label: 'Acción' },
        { key: 'ticket', label: 'Ticket' },
        { key: 'descripcion', label: 'Descripción' },
      ];
      const stamp = new Date().toISOString().slice(0, 10);
      const exportOpts = {
        columns,
        title: 'Bitácora de auditoría',
        subtitle: `${rows.length} registro${rows.length === 1 ? '' : 's'} · filtros aplicados desde /audit`,
        sheetName: 'Auditoría',
        summaryField: 'accion',
        summaryLabel: 'Acción más frecuente',
        generatedByName: user.full_name || user.username,
        generatedByRole: 'SAC',
      };
      if (format === 'pdf') {
        await exportListToPDF(rows, columns, `auditoria-${stamp}.pdf`, exportOpts);
      } else {
        await exportToExcel(rows, `auditoria-${stamp}.xlsx`, exportOpts);
      }
      toast(`Exportados ${rows.length} registros a ${formatLabel}.`, 'success');
    } catch (e) {
      if (e && e.message !== 'Modal closed') toast(e.message || 'Error al exportar', 'error');
    } finally {
      setBusy(false);
    }
  }

  // Inicializar filtros
  async function initializeFilters() {
    try {
      // Cargar usuarios: primero intenta audit.activeUsers(), luego api.users.list()
      let users = [];
      try {
        const activeUsersResult = await api.audit.activeUsers();
        users = activeUsersResult?.users || [];
      } catch (e) {
        // Fallback: cargar desde api.users.list()
        const usersResult = await api.users.list({ active: true });
        users = usersResult?.users || [];
      }

      // Cargar tipos de acción
      let actions = [];
      try {
        const actionTypesResult = await api.audit.actionTypes();
        actions = actionTypesResult?.types || [];
      } catch (e) {
        // Fallback: tipos que el backend realmente emite hoy (ver ACTION_LABELS).
        actions = Object.keys(ACTION_LABELS);
      }

      // Poblar select de usuarios
      if (users && users.length > 0) {
        users
          .sort((a, b) => (a.full_name || a.name || '').localeCompare(b.full_name || b.name || ''))
          .forEach(u => {
            userSelect.appendChild(h('option', { value: u.id }, u.full_name || u.name || u.username));
          });
      }

      // Poblar select de tipos de acción
      if (actions && actions.length > 0) {
        actions.forEach(a => {
          actionSelect.appendChild(h('option', { value: a }, formatActionType(a)));
        });
      }

      // Restaurar valores de URL si existen
      if (filters.user_id) userSelect.value = filters.user_id;
      if (filters.action_type) actionSelect.value = filters.action_type;

      await loadAudit();
    } catch (err) {
      console.error('Error inicializando filtros de auditoría:', err);
      tableContainer.innerHTML = `
        <div class="card bg-red-50 border border-red-200 rounded-xl p-5 text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar datos</h3>
          <p class="text-xs">${escapeHtml(err.message || 'No se pudieron cargar los usuarios y tipos de acción.')}</p>
        </div>
      `;
    }
  }

  // Event listeners
  applyBtn.addEventListener('click', () => { pageIndex = 0; cursors = [null]; loadAudit(); });
  clearBtn.addEventListener('click', clearFilters);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); pageIndex = 0; cursors = [null]; loadAudit(); }
  });
  userSelect.addEventListener('change', () => { pageIndex = 0; cursors = [null]; loadAudit(); });
  actionSelect.addEventListener('change', () => { pageIndex = 0; cursors = [null]; loadAudit(); });
  dateFrom.addEventListener('change', () => { pageIndex = 0; cursors = [null]; loadAudit(); });
  dateTo.addEventListener('change', () => { pageIndex = 0; cursors = [null]; loadAudit(); });

  initializeFilters();

  return { view: root };
}
