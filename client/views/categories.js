/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

export async function renderCategories({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Categorías'),
      h('p.text-sm.text-slate-500', {}, 'Gestiona las categorías disponibles para los tickets.'),
    ]),
    h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload) }, '+ Nueva categoría'),
  ]));

  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  async function reload() {
    tableWrap.innerHTML = '<div class="card flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status" aria-live="polite"><svg class="animate-spin w-4 h-4 text-brand-ocean" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg><span>Cargando categorías…</span></div>';
    try {
      const { categories } = await api.categories.list(true);
      draw(categories);
    } catch (e) {
      tableWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }
  function draw(cats) {
    if (!cats.length) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(emptyState(EMPTY_STATES.categories));
      return;
    }

    const rows = cats.map((c) => `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${c.active ? '<span class="badge bg-emerald-100 text-emerald-800">Activa</span>' : '<span class="badge bg-slate-200 text-slate-700">Inactiva</span>'}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm" data-edit="${c.id}">Editar</button>
          <button class="btn btn-ghost btn-sm text-accent hover:bg-accent/10" data-toggle="${c.id}">${c.active ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
    tableWrap.innerHTML = `<table class="table"><thead><tr><th>Nombre</th><th>Estado</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    tableWrap.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      const c = cats.find((x) => x.id === parseInt(b.dataset.edit, 10));
      openEditModal(c, reload);
    }));
    tableWrap.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const id = parseInt(b.dataset.toggle, 10);
      const c = cats.find((x) => x.id === id);
      confirmModal({
        title: c.active ? 'Desactivar categoría' : 'Activar categoría',
        message: `¿${c.active ? 'Desactivar' : 'Activar'} <b>${escapeHtml(c.name)}</b>?`,
        confirmText: c.active ? 'Desactivar' : 'Activar',
        onConfirm: async () => {
          try { await api.categories.update(id, { active: !c.active }); toast('Categoría actualizada', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
        },
      });
    }));
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
    h('button.btn.btn-ghost', { onclick: close }, 'Cancelar'),
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
