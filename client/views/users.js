/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { openModal, confirmModal } from '../components/modal.js';
import { AREA_LABEL } from '../utils/format.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { ROLES, AREAS } from '../utils/permissions.js';
import { emptyState, EMPTY_STATES } from '../components/empty-state.js';

export async function renderUsers({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Usuarios'),
      h('p.text-sm.text-slate-500', {}, 'Crea, edita y activa cuentas del sistema.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload, user) }, '+ Nuevo usuario'),
    ]),
  ]));

  const tableWrap = h('div.table-wrap', {});
  root.appendChild(tableWrap);

  async function reload() {
    tableWrap.innerHTML = '<div class="card flex items-center justify-center gap-2 py-10 text-sm text-slate-600" role="status" aria-live="polite"><svg class="animate-spin w-4 h-4 text-brand-ocean" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg><span>Cargando usuarios…</span></div>';
    try {
      const { users } = await api.users.list();
      draw(users);
    } catch (e) {
      tableWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
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
        <td><span class="badge bg-brand/10 text-brand">${escapeHtml(getRoleLabel(u.role))}</span></td>
        <td>${escapeHtml(AREA_LABEL[u.area] || u.area || '—')}</td>
        <td>${u.active ? '<span class="badge bg-emerald-100 text-emerald-800">Activo</span>' : '<span class="badge bg-slate-200 text-slate-700">Inactivo</span>'}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm" data-edit="${u.id}">Editar</button>
          <button class="btn btn-ghost btn-sm text-accent hover:bg-accent/10" data-toggle="${u.id}">${u.active ? 'Desactivar' : 'Activar'}</button>
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
        try {
          const res = await api.users.get(id);
          openEditModal(res.user, reload, user);
        } catch (e) {
          toast(e.message, 'error');
        }
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

  // Realtime: refresca la lista cuando otro SAC crea/edita/desactiva usuarios.
  const onRealtime = (e) => {
    const t = e.detail?.event;
    if (t === 'user:created' || t === 'user:updated' || t === 'user:deactivated') {
      reload();
    }
  };
  window.addEventListener('gcm:realtime', onRealtime);

  root._gcmCleanup = () => {
    window.removeEventListener('gcm:realtime', onRealtime);
  };

  return root;
}

// Límites espejo del backend (auth.service.js → LIMITS). El cliente valida
// para dar feedback inmediato, pero el backend sigue siendo la fuente de verdad.
const VALIDATION = {
  username: { min: 3, max: 50, pattern: /^[a-zA-Z0-9._-]+$/ },
  fullName: { max: 200 },
  password: { min: 4, max: 200 },
};

// Marca/limpia el error de un campo. A11y: usa aria-invalid + aria-describedby
// para que el screen reader anuncie el mensaje al tabular al campo.
function setFieldError(input, errorEl, message) {
  if (message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorEl.id);
  } else {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
    input.removeAttribute('aria-invalid');
  }
}

function clearFieldError(input, errorEl) {
  setFieldError(input, errorEl, null);
}

function openEditModal(u, onSaved, currentUser) {
  const isEdit = !!u;

  const username = h('input.input', {
    type: 'text',
    value: u?.username || '',
    maxlength: String(VALIDATION.username.max),
    disabled: isEdit,
  });
  const fullname = h('input.input', {
    type: 'text',
    value: u?.full_name || '',
    maxlength: String(VALIDATION.fullName.max),
    required: 'required',
  });
  const role = h('select.input', {},
    ROLES.map((r) => h('option', { value: r, selected: u?.role === r ? '' : null }, getRoleLabel(r)))
  );
  const area = h('select.input', {}, [
    h('option', { value: '' }, '— Sin área —'),
    ...AREAS.map((a) => h('option', { value: a, selected: u?.area === a ? '' : null }, AREA_LABEL[a])),
  ]);
  const password = h('input.input', {
    type: 'password',
    maxlength: String(VALIDATION.password.max),
    autocomplete: isEdit ? 'new-password' : 'new-password',
  });

  // Bloques con field-level error
  const usernameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-username-err', role: 'alert' });
  const fullnameErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-fullname-err', role: 'alert' });
  const roleErr     = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-role-err',     role: 'alert' });
  const passwordErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-edit-password-err', role: 'alert' });

  const usernameField = h('div', {}, [
    h('label.label', {}, 'Usuario *'),
    username,
    h('p.text-xs.text-slate-500.mt-1', {}, 'Letras, dígitos, puntos, guiones y guiones bajos. No se puede cambiar.'),
    usernameErr,
  ]);
  const fullnameField = h('div', {}, [
    h('label.label', {}, 'Nombre completo *'),
    fullname,
    fullnameErr,
  ]);
  const roleField = h('div', {}, [
    h('label.label', {}, 'Rol *'),
    role,
    roleErr,
  ]);
  const areaField = h('div', {}, [
    h('label.label', {}, 'Área'),
    area,
  ]);
  const passwordField = h('div', {}, [
    h('label.label', {}, isEdit ? 'Nueva contraseña — opcional' : 'Contraseña *'),
    password,
    h('p.text-xs.text-slate-500.mt-1', {}, isEdit
      ? 'Déjala en blanco para mantener la contraseña actual.'
      : `Mínimo ${VALIDATION.password.min} caracteres.`),
    passwordErr,
  ]);

  // Estado (solo en edición)
  const activeCheckbox = h('input', {
    type: 'checkbox',
    id: 'gcm-edit-active',
    checked: u?.active ? '' : null,
    disabled: isEdit && currentUser && Number(currentUser.id) === Number(u?.id) ? 'disabled' : null,
  });
  const activeField = h('div', {}, [
    h('label.label', {}, 'Estado'),
    h('div.flex.items-center.gap-2', {}, [
      activeCheckbox,
      h('label.text-sm', { for: 'gcm-edit-active' }, u?.active ? 'Activo' : 'Inactivo'),
    ]),
  ]);

  // Banner de error de servidor (no es field-level; aparece abajo del form).
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', {
    role: 'alert',
  });

  const body = h('div.flex.flex-col.gap-3', {}, [
    usernameField,
    fullnameField,
    h('div.grid.grid-cols-2.gap-3', {}, [roleField, areaField]),
    passwordField,
    isEdit ? activeField : null,
    banner,
  ]);

  // Limpia error del campo apenas el usuario edita — el mensaje stale es
  // peor que ningún mensaje.
  const wireClear = (input, errorEl) => {
    const ev = input.tagName === 'SELECT' ? 'change' : 'input';
    input.addEventListener(ev, () => clearFieldError(input, errorEl));
  };
  wireClear(username, usernameErr);
  wireClear(fullname, fullnameErr);
  wireClear(role, roleErr);
  wireClear(password, passwordErr);

  // Valida el formulario completo. Devuelve { ok, firstInvalid, payload }.
  function validate() {
    const fullnameVal = fullname.value.trim();
    const roleVal = role.value;
    const passwordVal = password.value;
    let firstInvalid = null;

    if (!isEdit) {
      const usernameVal = username.value.trim();
      if (!usernameVal) {
        setFieldError(username, usernameErr, 'El usuario es obligatorio.');
        firstInvalid = firstInvalid || username;
      } else if (usernameVal.length < VALIDATION.username.min) {
        setFieldError(username, usernameErr, `Mínimo ${VALIDATION.username.min} caracteres.`);
        firstInvalid = firstInvalid || username;
      } else if (usernameVal.length > VALIDATION.username.max) {
        setFieldError(username, usernameErr, `Máximo ${VALIDATION.username.max} caracteres.`);
        firstInvalid = firstInvalid || username;
      } else if (!VALIDATION.username.pattern.test(usernameVal)) {
        setFieldError(username, usernameErr, 'Sólo letras, dígitos, puntos, guiones y guiones bajos.');
        firstInvalid = firstInvalid || username;
      }
    }

    if (!fullnameVal) {
      setFieldError(fullname, fullnameErr, 'El nombre completo es obligatorio.');
      firstInvalid = firstInvalid || fullname;
    } else if (fullnameVal.length > VALIDATION.fullName.max) {
      setFieldError(fullname, fullnameErr, `Máximo ${VALIDATION.fullName.max} caracteres.`);
      firstInvalid = firstInvalid || fullname;
    }

    if (!ROLES.includes(roleVal)) {
      setFieldError(role, roleErr, 'Selecciona un rol.');
      firstInvalid = firstInvalid || role;
    }

    if (passwordVal) {
      if (passwordVal.length < VALIDATION.password.min) {
        setFieldError(password, passwordErr, `La contraseña debe tener al menos ${VALIDATION.password.min} caracteres.`);
        firstInvalid = firstInvalid || password;
      } else if (passwordVal.length > VALIDATION.password.max) {
        setFieldError(password, passwordErr, `La contraseña no puede superar los ${VALIDATION.password.max} caracteres.`);
        firstInvalid = firstInvalid || password;
      }
    } else if (!isEdit) {
      setFieldError(password, passwordErr, 'La contraseña es obligatoria al crear un usuario.');
      firstInvalid = firstInvalid || password;
    }

    if (firstInvalid) return { ok: false, firstInvalid };

    const payload = isEdit
      ? { full_name: fullnameVal, role: roleVal, area: area.value || null }
      : {
          username: username.value.trim(),
          full_name: fullnameVal,
          role: roleVal,
          area: area.value || null,
          password: passwordVal,
        };
    if (isEdit && passwordVal) payload.password = passwordVal;
    if (isEdit) {
      // include active when editing; backend will validate anti-self-demote
      payload.active = !!activeCheckbox.checked;
    }
    return { ok: true, payload };
  }

  function showBanner(message) {
    banner.textContent = message;
    banner.classList.remove('hidden');
  }
  function hideBanner() {
    banner.textContent = '';
    banner.classList.add('hidden');
  }

  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close, type: 'button' }, 'Cancelar'),
    h('button.btn.btn-primary', { type: 'button', onclick: async () => {
      // Limpia errores previos antes de revalidar
      [usernameErr, fullnameErr, roleErr, passwordErr].forEach((el) => el.classList.add('hidden'));
      hideBanner();
      const v = validate();
      if (!v.ok) {
        v.firstInvalid.focus();
        return;
      }
      try {
        if (isEdit) {
          await api.users.update(u.id, v.payload);
          toast('Usuario actualizado', 'success');
        } else {
          await api.users.create(v.payload);
          toast('Usuario creado', 'success');
        }
        close(); onSaved?.();
      } catch (e) {
        showBanner(e.message || 'No se pudo guardar el usuario.');
      }
    } }, 'Guardar'),
  ];
  openModal({ title: isEdit ? 'Editar usuario' : 'Nuevo usuario', body, actions });
}
