import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { ROLE_LABEL, AREA_LABEL } from '../utils/format.js';
import { ROLES, AREAS } from '../utils/permissions.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

export async function renderUsers({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Usuarios'),
      h('p.text-sm.text-slate-500', {}, 'Gestión de cuentas y roles.'),
    ]),
    h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload) }, '+ Nuevo usuario'),
  ]));

  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  async function reload() {
    tableWrap.innerHTML = '<div class="p-8 text-center text-sm text-slate-500">Cargando…</div>';
    try {
      const { users } = await api.users.list();
      draw(users);
    } catch (e) {
      tableWrap.innerHTML = `<div class="p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
  }

  function draw(users) {
    if (!users.length) {
      tableWrap.innerHTML = '';
      tableWrap.appendChild(emptyState(EMPTY_STATES.users));
      return;
    }

    const rows = users.map((u) => `
      <tr>
        <td class="font-mono text-xs text-slate-500">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td><span class="badge bg-brand/10 text-brand">${escapeHtml(ROLE_LABEL[u.role] || u.role)}</span></td>
        <td>${escapeHtml(AREA_LABEL[u.area] || u.area || '—')}</td>
        <td>${u.active ? '<span class="badge bg-emerald-100 text-emerald-800">Activo</span>' : '<span class="badge bg-slate-200 text-slate-700">Inactivo</span>'}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar</button>
          <button class="btn btn-ghost btn-sm text-red-600" data-toggle="${u.id}">${u.active ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `).join('');
    tableWrap.innerHTML = `
      <table class="table">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Área</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    tableWrap.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', async () => {
      const id = parseInt(b.dataset.edit, 10);
      const u = users.find((x) => x.id === id);
      openEditModal(u, reload);
    }));
    tableWrap.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      const id = parseInt(b.dataset.toggle, 10);
      const u = users.find((x) => x.id === id);
      confirmModal({
        title: u.active ? 'Desactivar usuario' : 'Activar usuario',
        message: `¿${u.active ? 'Desactivar' : 'Activar'} a <b>${escapeHtml(u.full_name)}</b>?`,
        confirmText: u.active ? 'Desactivar' : 'Activar',
        onConfirm: async () => {
          try { await api.users.update(id, { active: !u.active }); toast('Usuario actualizado', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
        },
      });
    }));
  }

  await reload();
  return root;
}

function openEditModal(u, onSaved) {
  const username = h('input.input', { type: 'text', value: u?.username || '', maxlength: '50', disabled: !!u });
  const fullname = h('input.input', { type: 'text', value: u?.full_name || '', maxlength: '200' });
  const role = h('select.input', {}, ROLES.map((r) => h('option', { value: r, selected: u?.role === r ? '' : null }, ROLE_LABEL[r])));
  const area = h('select.input', {}, [
    h('option', { value: '' }, '— Sin área —'),
    ...AREAS.map((a) => h('option', { value: a, selected: u?.area === a ? '' : null }, AREA_LABEL[a])),
  ]);
  const password = h('input.input', { type: 'password', placeholder: u ? 'Dejar en blanco para no cambiar' : 'Contraseña (mín. 4)' });
  const err = h('div.hidden.text-sm.text-red-600', {});
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Usuario *'), username]),
    h('div', {}, [h('label.label', {}, 'Nombre completo *'), fullname]),
    h('div.grid.grid-cols-2.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Rol *'), role]),
      h('div', {}, [h('label.label', {}, 'Área'), area]),
    ]),
    h('div', {}, [h('label.label', {}, u ? 'Nueva contraseña (opcional)' : 'Contraseña *'), password]),
    err,
  ]);
  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      err.classList.add('hidden');
      try {
        if (u) {
          const body = { full_name: fullname.value.trim(), role: role.value, area: area.value || null };
          if (password.value) body.password = password.value;
          await api.users.update(u.id, body);
          toast('Usuario actualizado', 'success');
        } else {
          if (!password.value) { err.textContent = 'La contraseña es obligatoria.'; err.classList.remove('hidden'); return; }
          await api.users.create({ username: username.value.trim(), full_name: fullname.value.trim(), role: role.value, area: area.value || null, password: password.value });
          toast('Usuario creado', 'success');
        }
        close(); onSaved?.();
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    } }, 'Guardar'),
  ];
  openModal({ title: u ? 'Editar usuario' : 'Nuevo usuario', body, actions });
}
