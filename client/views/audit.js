import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { formatDateTime } from '../utils/format.js';
import { emptyState } from '../components/empty-state.js';

const spinnerHtml = '<svg class="animate-spin w-5 h-5 text-brand-navy" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>';

function formatActionType(actionType) {
  const labels = {
    ticket_created:       'Ticket creado',
    ticket_assigned:      'Ticket asignado',
    ticket_status_changed: 'Estado cambiado',
    comment_added:        'Comentario añadido',
    attachment_added:     'Archivo subido',
    user_created:         'Usuario creado',
    user_modified:        'Usuario modificado',
    user_deleted:         'Usuario eliminado',
    category_created:     'Categoría creada',
    category_modified:    'Categoría modificada',
    category_deleted:     'Categoría eliminada',
  };
  return labels[actionType] || actionType;
}

function badgeColor(actionType) {
  const colors = {
    ticket_created:       'bg-blue-100 text-blue-700',
    ticket_assigned:      'bg-purple-100 text-purple-700',
    ticket_status_changed: 'bg-amber-100 text-amber-700',
    comment_added:        'bg-emerald-100 text-emerald-700',
    attachment_added:     'bg-cyan-100 text-cyan-700',
    user_created:         'bg-indigo-100 text-indigo-700',
    user_modified:        'bg-yellow-100 text-yellow-700',
    user_deleted:         'bg-red-100 text-red-700',
    category_created:     'bg-lime-100 text-lime-700',
    category_modified:    'bg-pink-100 text-pink-700',
    category_deleted:     'bg-rose-100 text-rose-700',
  };
  return colors[actionType] || 'bg-slate-100 text-slate-700';
}

export async function renderAudit({ user }) {
  const root = h('div.space-y-6', {});

  // ── Header ────────────────────────────────────────────────────────────
  root.appendChild(h('div', {}, [
    h('h1.text-3xl.font-bold.text-brand-ink', {}, 'Bitácora de Auditoría'),
    h('p.text-sm.text-slate-500.mt-2', {}, 'Registro completo de todas las acciones realizadas en el sistema. Filtra por usuario, tipo de acción y rango de fechas.'),
  ]));

  // ── Filtros ───────────────────────────────────────────────────────────
  const filterCard = h('div.card.bg-white.rounded-xl.border.border-surface-border.p-5', {});

  const search = h('input.input', {
    type: 'search',
    placeholder: 'Buscar por código o descripción…',
  });

  const userSelect = h('select.input', {}, [
    h('option', { value: '' }, '— Todos los usuarios —'),
  ]);

  const actionSelect = h('select.input', {}, [
    h('option', { value: '' }, '— Todos los tipos —'),
  ]);

  const dateFrom = h('input.input', { type: 'date' });
  const dateTo = h('input.input', { type: 'date' });
  const applyBtn = h('button.btn.btn-primary', {}, 'Aplicar');
  const clearBtn = h('button.btn.btn-secondary', {}, 'Limpiar');

  filterCard.appendChild(h('div.grid.grid-cols-1.md:grid-cols-2.lg:grid-cols-3.gap-4', {}, [
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Búsqueda'), search]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Usuario'), userSelect]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Tipo de acción'), actionSelect]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Desde'), dateFrom]),
    h('div', {}, [h('label.label.text-xs.text-slate-600.mb-2.block', {}, 'Hasta'), dateTo]),
  ]));

  filterCard.appendChild(h('div.flex.gap-2.mt-4.flex-wrap', {}, [applyBtn, clearBtn]));
  root.appendChild(filterCard);

  // ── KPI Cards ─────────────────────────────────────────────────────────
  const kpiContainer = h('div.grid.grid-cols-1.md:grid-cols-3.gap-4', {});
  root.appendChild(kpiContainer);

  // ── Tabla ─────────────────────────────────────────────────────────────
  const tableContainer = h('div', {});
  root.appendChild(tableContainer);

  // Helpers
  function renderKpis(data = {}) {
    kpiContainer.innerHTML = '';

    const cards = [
      { label: 'Total de acciones', value: data.total || 0 },
      { label: 'Tipo más frecuente', value: formatActionType(data.mostFrequentAction || '—') },
      { label: 'Usuarios activos', value: data.activeUserCount || 0 },
    ];

    cards.forEach(({ label, value }) => {
      kpiContainer.appendChild(h('div.card.bg-white.rounded-xl.border.border-surface-border.p-5', {}, [
        h('div.text-xs.font-semibold.text-slate-500.uppercase.tracking-wide.mb-3', {}, label),
        h('div.text-3xl.font-bold.text-brand-navy', {}, value),
      ]));
    });
  }

  function renderTable(records = []) {
    tableContainer.innerHTML = '';

    if (!records || records.length === 0) {
      tableContainer.appendChild(emptyState({
        icon: 'search',
        title: 'Sin registros',
        message: 'No se encontraron acciones con los filtros aplicados. Intenta modificar los criterios de búsqueda.',
      }));
      return;
    }

    const table = h('div.card.bg-white.rounded-xl.border.border-surface-border.overflow-hidden', {}, [
      h('div.overflow-x-auto', {}, [
        h('table.w-full.text-sm', {}, [
          h('thead.bg-slate-50.border-b.border-surface-border', {}, [
            h('tr', {}, [
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Fecha y hora'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Usuario'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Acción'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Ticket'),
              h('th.px-5.py-3.text-left.text-xs.font-semibold.text-slate-600.uppercase.tracking-wide', {}, 'Descripción'),
            ]),
          ]),
          h('tbody.divide-y.divide-surface-border', {}, records.map((record) =>
            h('tr.hover:bg-slate-50.transition-colors.duration-150', {}, [
              h('td.px-5.py-3.text-slate-600.text-xs.font-mono', {}, formatDateTime(record.created_at)),
              h('td.px-5.py-3.text-slate-800.font-medium.text-sm', {}, record.user_name || '—'),
              h(`td.px-5.py-3 span.inline-flex.items-center.px-2.py-1.rounded-full.text-xs.font-medium.${badgeColor(record.action_type)}`, {},
                formatActionType(record.action_type)
              ),
              h('td.px-5.py-3.text-brand-navy.font-mono.text-xs.font-medium', {}, record.target_code ? `#${record.target_code}` : '—'),
              h('td.px-5.py-3.text-slate-700.text-xs.max-w-sm.truncate', { title: record.description },
                record.description || '—'
              ),
            ])
          )),
        ]),
      ]),
    ]);

    tableContainer.appendChild(table);
  }

  async function loadAudit() {
    tableContainer.innerHTML = `
      <div class="card bg-white rounded-xl border border-surface-border flex items-center justify-center gap-3 py-12 text-slate-600">
        ${spinnerHtml}
        <span class="text-sm">Cargando auditoría…</span>
      </div>
    `;
    kpiContainer.innerHTML = '';

    try {
      const params = {
        search: search.value.trim(),
        user_id: userSelect.value,
        action_type: actionSelect.value,
        date_from: dateFrom.value,
        date_to: dateTo.value,
        page: 1,
        limit: 100,
      };

      Object.keys(params).forEach(k => !params[k] && delete params[k]);

      const result = await api.audit.list(params);

      renderKpis({
        total: result.total || 0,
        mostFrequentAction: result.mostFrequentAction || '',
        activeUserCount: result.activeUserCount || 0,
      });

      renderTable(result.data || []);
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="card bg-red-50.border.border-red-200.rounded-xl.p-5.text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar auditoría</h3>
          <p class="text-xs">${escapeHtml(err.message || 'No se pudo cargar el registro. Intenta de nuevo.')}</p>
        </div>
      `;
    }
  }

  function clearFilters() {
    search.value = '';
    userSelect.value = '';
    actionSelect.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    loadAudit();
  }

  // Inicializar filtros
  async function initializeFilters() {
    try {
      const [users, actions] = await Promise.all([
        api.audit.activeUsers(),
        api.audit.actionTypes(),
      ]);

      if (users && users.length > 0) {
        users.forEach(u => {
          userSelect.appendChild(h('option', { value: u.id }, u.full_name));
        });
      }

      if (actions && actions.length > 0) {
        actions.forEach(a => {
          actionSelect.appendChild(h('option', { value: a }, formatActionType(a)));
        });
      }

      await loadAudit();
    } catch (err) {
      tableContainer.innerHTML = `
        <div class="card bg-red-50.border.border-red-200.rounded-xl.p-5.text-red-800">
          <h3 class="font-semibold text-sm mb-2">Error al cargar datos</h3>
          <p class="text-xs">No se pudieron cargar los usuarios y tipos de acción.</p>
        </div>
      `;
    }
  }

  // Event listeners
  applyBtn.addEventListener('click', loadAudit);
  clearBtn.addEventListener('click', clearFilters);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadAudit();
  });

  initializeFilters();

  return root;
}

