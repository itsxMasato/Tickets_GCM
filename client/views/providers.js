/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';
import { ICON, svg } from '../utils/icons.js';

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

export async function renderProviders({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.flex-col.justify-between.gap-4', { class: 'md:flex-row md:items-end' }, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-brand.tracking-tight', { class: 'md:text-3xl' }, 'Proveedores'),
      h('p.text-sm.text-slate-500.mt-1', {}, 'Proveedores externos (ej. AQ) a los que se puede enviar un ticket por garantía o reparación.'),
    ]),
    h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload) }, [svg(h, ICON.plus, 'w-4 h-4'), h('span', {}, 'Nuevo proveedor')]),
  ]));

  const kpis = h('div.grid.grid-cols-1.gap-3', { class: 'sm:grid-cols-3' });
  root.appendChild(kpis);

  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  function drawKpis(providers) {
    const total = providers.length;
    const active = providers.filter((p) => p.active).length;
    const inactive = total - active;
    kpis.innerHTML = '';
    kpis.appendChild(kpiCard({ label: 'Total proveedores', value: total, icon: ICON.extLink, tone: '' }));
    kpis.appendChild(kpiCard({ label: 'Activos', value: active, hint: 'Disponibles al enviar un ticket', icon: ICON.check, tone: 'good' }));
    kpis.appendChild(kpiCard({ label: 'Inactivos', value: inactive, hint: 'Ocultos del formulario', icon: ICON.eyeOff, tone: 'accent' }));
  }

  async function reload() {
    kpis.innerHTML = '';
    tableWrap.innerHTML = '';
    tableWrap.appendChild(h('div.card.flex.items-center.justify-center.gap-2.py-10.text-sm.text-slate-600', { role: 'status', 'aria-live': 'polite' }, [
      svg(h, ICON.spinner, 'animate-spin w-4 h-4 text-brand-ocean'),
      h('span', {}, 'Cargando proveedores…'),
    ]));
    try {
      const { providers } = await api.providers.list(true);
      draw(providers);
    } catch (e) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(h('div.card.p-8.text-center.text-sm.text-red-600', {}, e.message));
    }
  }

  function draw(providers) {
    drawKpis(providers);
    tableWrap.innerHTML = '';

    if (!providers.length) {
      tableWrap.appendChild(emptyState({
        ...EMPTY_STATES.providers,
        action: { label: '+ Nuevo proveedor', onclick: () => openEditModal(null, reload) },
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
      h('tbody', {}, providers.map((p) => h('tr', {}, [
        h('td', {}, [
          h('div.flex.items-center.gap-2', {}, [
            svg(h, ICON.extLink, 'w-4 h-4 text-brand-ocean flex-none'),
            h('span.font-medium.text-brand-ink', {}, p.name),
          ]),
        ]),
        h('td', {}, [
          p.active
            ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activo')
            : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactivo'),
        ]),
        h('td.text-right', {}, [
          h('div.flex.items-center.justify-end.gap-1', {}, [
            h('button.btn-icon-sm', {
              title: 'Editar', 'aria-label': `Editar ${p.name}`,
              onclick: () => openEditModal(p, reload),
            }, [svg(h, ICON.edit, 'w-4 h-4')]),
            h('button.btn-icon-sm', {
              title: p.active ? 'Desactivar' : 'Activar',
              'aria-label': `${p.active ? 'Desactivar' : 'Activar'} ${p.name}`,
              onclick: () => confirmModal({
                title: p.active ? 'Desactivar proveedor' : 'Activar proveedor',
                message: `¿${p.active ? 'Desactivar' : 'Activar'} "${p.name}"?`,
                confirmText: p.active ? 'Desactivar' : 'Activar',
                onConfirm: async () => {
                  try {
                    await api.providers.update(p.id, { active: !p.active });
                    toast('Proveedor actualizado', 'success');
                    reload();
                  } catch (e) { toast(e.message, 'error'); }
                },
              }),
            }, [svg(h, p.active ? ICON.eyeOff : ICON.eye, 'w-4 h-4')]),
          ]),
        ]),
      ]))),
    ]);
    tableWrap.appendChild(table);
  }

  await reload();

  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (t === 'provider:created' || t === 'provider:updated') reload();
  };
  window.addEventListener('gcm:realtime', onRealtime);

  root._gcmCleanup = () => {
    window.removeEventListener('gcm:realtime', onRealtime);
  };

  return root;
}

function openEditModal(p, onSaved) {
  const name = h('input.input', { type: 'text', value: p?.name || '', maxlength: '100' });
  const err = h('div.hidden.text-sm.text-red-600', {});
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Nombre *'), name]),
    err,
  ]);
  const actions = (close) => [
    h('button.btn.btn-secondary', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      try {
        if (p) await api.providers.update(p.id, { name: name.value.trim() });
        else await api.providers.create({ name: name.value.trim() });
        toast('Proveedor guardado', 'success');
        close(); onSaved?.();
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    } }, 'Guardar'),
  ];
  openModal({ title: p ? 'Editar proveedor' : 'Nuevo proveedor', body, actions });
}
