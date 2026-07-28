/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { ICON, svg } from '../utils/icons.js';

// Mismo patrón que kpiCard en views/users.js — no se comparte como componente
// porque cada vista lo ajusta ligeramente (tonos/labels propios).
function kpiCard({ label, value, hint = '', icon = null, tone = '' }) {
  const TONE = {
    '':      { border: 'border-l-4 border-l-surface-border-strong', icon: 'bg-surface-alt text-brand' },
    good:    { border: 'border-l-4 border-l-emerald-500',           icon: 'bg-emerald-100 text-emerald-700' },
    accent:  { border: 'border-l-4 border-l-accent',                icon: 'bg-accent/10 text-accent' },
  }[tone] || {};
  return h('div.card.flex.flex-col.gap-3', { class: TONE.border }, [
    icon ? h('div.w-9.h-9.rounded-lg.flex.items-center.justify-center', { class: TONE.icon }, [svg(h, icon, 'w-4 h-4')]) : null,
    h('div', {}, [
      h('div.text-2xl.font-bold.text-brand-ink', {}, String(value ?? 0)),
      h('div.text-xs.uppercase.tracking-wider.text-slate-500.font-medium', {}, label),
    ]),
    hint ? h('div.text-xs.text-slate-500', {}, hint) : null,
  ]);
}

export async function renderCategories({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Categorías'),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Grupos lógicos para clasificar los tickets del sistema.'),
    ]),
    h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload) }, [svg(h, ICON.plus, 'w-4 h-4'), h('span', {}, 'Nueva categoría')]),
  ]));

  const kpis = h('div.grid.grid-cols-1.gap-3', { class: 'sm:grid-cols-3' });
  root.appendChild(kpis);

  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  function drawKpis(cats) {
    const total = cats.length;
    const active = cats.filter((c) => c.active).length;
    const inactive = total - active;
    kpis.innerHTML = '';
    kpis.appendChild(kpiCard({ label: 'Total categorías', value: total, icon: ICON.tag, tone: '' }));
    kpis.appendChild(kpiCard({ label: 'Activas', value: active, hint: 'Disponibles al crear tickets', icon: ICON.check, tone: 'good' }));
    kpis.appendChild(kpiCard({ label: 'Inactivas', value: inactive, hint: 'Ocultas del formulario', icon: ICON.eyeOff, tone: 'accent' }));
  }

  async function reload() {
    kpis.innerHTML = '';
    tableWrap.innerHTML = '';
    tableWrap.appendChild(h('div.card.flex.items-center.justify-center.gap-2.py-10.text-sm.text-slate-600', { role: 'status', 'aria-live': 'polite' }, [
      svg(h, ICON.spinner, 'animate-spin w-4 h-4 text-brand-ocean'),
      h('span', {}, 'Cargando categorías…'),
    ]));
    try {
      const { categories } = await api.categories.list(true);
      draw(categories);
    } catch (e) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(h('div.card.p-8.text-center.text-sm.text-red-600', {}, e.message));
    }
  }

  function draw(cats) {
    drawKpis(cats);
    tableWrap.innerHTML = '';

    if (!cats.length) {
      tableWrap.appendChild(emptyState({
        ...EMPTY_STATES.categories,
        action: { label: '+ Nueva categoría', onclick: () => openEditModal(null, reload) },
      }));
      return;
    }

    const table = h('table.table', {}, [
      h('thead', {}, [
        h('tr', {}, [
          h('th', {}, 'Nombre'),
          h('th', {}, 'Estado'),
          h('th.text-right', {}, 'Acciones'),
        ]),
      ]),
      h('tbody', {}, cats.map((c) => h('tr', {}, [
        h('td', {}, [
          h('div.flex.items-center.gap-2', {}, [
            svg(h, ICON.tag, 'w-4 h-4 text-brand-ocean flex-none'),
            h('span.font-medium.text-brand-ink', {}, c.name),
          ]),
        ]),
        h('td', {}, [
          c.active
            ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activa')
            : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactiva'),
        ]),
        h('td.text-right', {}, [
          h('div.flex.items-center.justify-end.gap-1', {}, [
            h('button.btn-icon-sm', {
              title: 'Editar', 'aria-label': `Editar ${c.name}`,
              onclick: () => openEditModal(c, reload),
            }, [svg(h, ICON.edit, 'w-4 h-4')]),
            h('button.btn-icon-sm', {
              title: c.active ? 'Desactivar' : 'Activar',
              'aria-label': `${c.active ? 'Desactivar' : 'Activar'} ${c.name}`,
              onclick: () => confirmModal({
                title: c.active ? 'Desactivar categoría' : 'Activar categoría',
                message: `¿${c.active ? 'Desactivar' : 'Activar'} "${c.name}"?`,
                confirmText: c.active ? 'Desactivar' : 'Activar',
                onConfirm: async () => {
                  try {
                    await api.categories.update(c.id, { active: !c.active });
                    toast('Categoría actualizada', 'success');
                    reload();
                  } catch (e) { toast(e.message, 'error'); }
                },
              }),
            }, [svg(h, c.active ? ICON.eyeOff : ICON.eye, 'w-4 h-4')]),
          ]),
        ]),
      ]))),
    ]);
    tableWrap.appendChild(table);
  }

  await reload();

  // Realtime: refresca cuando otro SAC crea/edita categorías.
  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (t === 'category:created' || t === 'category:updated') reload();
  };
  window.addEventListener('gcm:realtime', onRealtime);

  root._gcmCleanup = () => {
    window.removeEventListener('gcm:realtime', onRealtime);
  };

  return root;
}

function openEditModal(c, onSaved) {
  const name = h('input.input', { type: 'text', value: c?.name || '', maxlength: '100' });
  const err = h('div.hidden.text-sm.text-red-600', {});
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Nombre *'), name]),
    err,
  ]);
  const actions = (close) => [
    h('button.btn.btn-secondary', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      try {
        if (c) await api.categories.update(c.id, { name: name.value.trim() });
        else await api.categories.create({ name: name.value.trim() });
        toast('Categoría guardada', 'success');
        close(); onSaved?.();
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    } }, 'Guardar'),
  ];
  openModal({ title: c ? 'Editar categoría' : 'Nueva categoría', body, actions });
}
