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
import { mountDataList } from '../components/data-list.js';

// Dominio sintético de los correos autogenerados al crear un usuario.
// Espejo de src/utils/deriveAuthEmail.js → DOMAIN para que el email que
// se guarda en Firestore coincida con el que el backend deriva para
// Firebase Auth.
const AUTO_EMAIL_DOMAIN = 'gcm.com';

// Sanitiza un username para que sea válido como parte local de un email:
// mismo patrón que LIMITS.username del backend, en minúsculas.
function usernameToLocalPart(username) {
  return String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

const TABLE_COLUMNS = [
  { key: 'username',   label: 'Usuario' },
  { key: 'full_name',  label: 'Nombre' },
  { key: 'role',       label: 'Rol' },
  { key: 'area',       label: 'Área' },
  { key: 'active',     label: 'Estado' },
  { key: 'actions',    label: '' },
];

function isUserActive(value) {
  return value === 0 || value === false || value === '0' || value === 'false' ? false : true;
}

export async function renderUsers({ user }) {
  const root = h('div.flex.flex-col.gap-4', {});

  root.appendChild(h('div.flex.items-center.justify-between.flex-wrap.gap-3', {}, [
    h('div', {}, [
      h('h1.text-2xl.font-bold.text-slate-800', {}, 'Usuarios'),
      h('p.text-sm.text-slate-500', {}, 'Crea, edita y activa cuentas del sistema.'),
    ]),
    h('div.flex.items-center.gap-2', {}, [
      h('button.btn.btn-primary', { onclick: () => openEditModal(null, reload, user) }, '+ Nuevo usuario'),
    ]),
  ]));

  // data-list: tabla en >=768px, card-list en mobile. El wrapper es un div
  // neutro; el componente decide qué inyectar según matchMedia.
  const listWrap = h('div', {});
  root.appendChild(listWrap);

  let dataList = null;
  let currentUsers = [];

  function ensureDataList() {
    if (dataList) return;
    dataList = mountDataList({
      wrapper: listWrap,
      columns: TABLE_COLUMNS,
      renderRow: tableRow,
      renderMobileCard,
      emptyState: emptyState({ ...EMPTY_STATES.users, className: 'py-10' }),
      onMatchMediaChange(isMobile) { if (!isMobile) wireTableRows(); },
    });
  }

  // Re-engancha los listeners de las filas desktop tras cada repaint.
  // Sólo aplica en >=768px; el data-list reemplaza el HTML al cruzar el
  // breakpoint, así que los handlers deben re-vincularse.
  function wireTableRows() {
    const rows = listWrap.querySelectorAll('tr[data-id]');
    rows.forEach((tr) => {
      const id = tr.dataset.id;
      tr.addEventListener('click', () => onEdit(+id));
      tr.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEdit(+id); }
      });
      const editBtn = tr.querySelector('[data-edit]');
      if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); onEdit(+id); });
      const toggleBtn = tr.querySelector('[data-toggle]');
      if (toggleBtn) toggleBtn.addEventListener('click', (e) => { e.stopPropagation(); onToggle(+id); });
    });
  }

  async function onEdit(id) {
    try {
      const res = await api.users.get(id);
      openEditModal(res.user, reload, user);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function onToggle(id) {
    const u = currentUsers.find((x) => x.id === id);
    if (!u) return;
    const isActive = isUserActive(u.active);
    confirmModal({
      title: isActive ? 'Desactivar usuario' : 'Activar usuario',
      message: `¿${isActive ? 'Desactivar' : 'Activar'} a <b>${escapeHtml(u.full_name)}</b>?`,
      confirmText: isActive ? 'Desactivar' : 'Activar',
      onConfirm: async () => {
        try { await api.users.update(id, { active: !isActive }); toast('Usuario actualizado', 'success'); reload(); } catch (e) { toast(e.message, 'error'); }
      },
    });
  }

  // Card mobile por usuario. Toda la card es un <button> principal que
  // abre el detalle; los botones de acción van como <button> hijos con
  // stopPropagation para no disparar el click del card.
  function renderMobileCard(u) {
    const card = h('button.card.text-left.flex.flex-col.gap-2.p-3.hover\\:border-brand-ocean.hover\\:shadow-card.focus\\:outline-none.focus\\:ring-2.focus\\:ring-brand-ocean\\/60.transition', {
      onclick: () => onEdit(u.id),
      'aria-label': `Editar ${escapeHtml(u.full_name || u.username)}`,
    }, [
      h('div.flex.items-center.justify-between.gap-2', {}, [
        h('div.min-w-0', {}, [
          h('div.font-medium.text-brand-ink.truncate', {}, escapeHtml(u.full_name || '—')),
          h('div.text-xs.font-mono.text-slate-500', {}, escapeHtml(u.username || '')),
        ]),
        isUserActive(u.active)
          ? h('span.badge.bg-emerald-100.text-emerald-800', {}, 'Activo')
          : h('span.badge.bg-slate-200.text-slate-700', {}, 'Inactivo'),
      ]),
      h('div.flex.flex-wrap.items-center.gap-2.text-xs.text-slate-500', {}, [
        h('span.badge.bg-brand\\/10.text-brand', {}, escapeHtml(getRoleLabel(u.role))),
        h('span', {}, '·'),
        h('span', {}, escapeHtml(AREA_LABEL[u.area] || u.area || 'Sin área')),
      ]),
      // Acciones: stopPropagation para que no se abra el modal de edición.
      h('div.flex.items-center.gap-2.mt-1', {}, [
        h('button.btn.btn-secondary.btn-sm.flex-1', {
          type: 'button',
          onclick: (e) => { e.stopPropagation(); onEdit(u.id); },
        }, 'Editar'),
        h('button.btn.btn-ghost.btn-sm.flex-1', {
          type: 'button',
          class: isUserActive(u.active) ? 'text-accent hover:bg-accent/10' : '',
          onclick: (e) => { e.stopPropagation(); onToggle(u.id); },
        }, isUserActive(u.active) ? 'Desactivar' : 'Activar'),
      ]),
    ]);
    return card;
  }

  function tableRow(u) {
    return `
      <tr class="cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand-ocean/60 focus:ring-inset" data-id="${escapeHtml(String(u.id))}" tabindex="0" role="link" aria-label="Editar ${escapeHtml(u.full_name || u.username)}">
        <td class="font-mono text-xs text-slate-500">${escapeHtml(u.username)}</td>
        <td>${escapeHtml(u.full_name)}</td>
        <td><span class="badge bg-brand/10 text-brand">${escapeHtml(getRoleLabel(u.role))}</span></td>
        <td>${escapeHtml(AREA_LABEL[u.area] || u.area || '—')}</td>
        <td>${isUserActive(u.active) ? '<span class="badge bg-emerald-100 text-emerald-800">Activo</span>' : '<span class="badge bg-slate-200 text-slate-800">Inactivo</span>'}</td>
        <td class="text-right">
          <button class="btn btn-ghost btn-sm" data-edit>Editar</button>
          <button class="btn btn-ghost btn-sm ${isUserActive(u.active) ? 'text-accent hover:bg-accent/10' : ''}" data-toggle>${isUserActive(u.active) ? 'Desactivar' : 'Activar'}</button>
        </td>
      </tr>
    `;
  }

  async function reload() {
    ensureDataList();
    dataList.update({ loading: true, items: [] });
    try {
      const { users } = await api.users.list();
      currentUsers = users || [];
      dataList.update({ loading: false, items: currentUsers });
      // Doble rAF: primero el repaint del data-list, luego enganchamos.
      if (typeof window !== 'undefined' && window.matchMedia && !window.matchMedia('(max-width: 767.95px)').matches) {
        requestAnimationFrame(() => requestAnimationFrame(wireTableRows));
      }
    } catch (e) {
      dataList.update({ loading: false, items: [] });
      listWrap.innerHTML = `<div class="card p-8 text-center text-sm text-red-600">${escapeHtml(e.message)}</div>`;
    }
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
  email:    { max: 255, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
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
  const area = h('select.input', { value: u?.area || '' }, [
    h('option', { value: '' }, '— Sin área —'),
    ...AREAS.map((a) => h('option', { value: a, selected: u?.area === a ? '' : null }, AREA_LABEL[a])),
  ]);
  if (u?.area) area.value = u.area;
  // Toggle de visibilidad de la contraseña. Devuelve el contenedor (input
  // + botón), no el input solo, para que el caller pueda meterlo en un
  // field. El input resultante queda accesible con su `id` original.
  function makePasswordInput(input) {
    const wrap = h('div.relative', {});
    const eyeBtn = h('button', {
      type: 'button',
      'aria-label': 'Mostrar contraseña',
      'aria-pressed': 'false',
      title: 'Mostrar / ocultar contraseña',
      class: 'absolute inset-y-0 right-0 flex items-center gap-1 rounded-r-md border-l border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-ocean/60',
      onclick: () => {
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        eyeBtn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
        eyeBtn.setAttribute('aria-label', isHidden ? 'Ocultar contraseña' : 'Mostrar contraseña');
        eyeBtn.innerHTML = isHidden
          ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg><span class="sr-only">Mostrar</span>'
          : '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"></path><path d="M10.6 10.6A3 3 0 0 0 13.4 13.4"></path><path d="M9.88 5.08A10.94 10.94 0 0 1 12 5c6.5 0 10 7 10 7a20.7 20.7 0 0 1-4.07 5.03"></path><path d="M6.53 6.53A20.7 20.7 0 0 0 2 12s3.5 6 10 6a10.94 10.94 0 0 0 3.95-.83"></path></svg><span class="sr-only">Ocultar</span>';
      },
    }, [
      h('svg.w-4.h-4', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
        h('path', { d: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z' }),
        h('circle', { cx: '12', cy: '12', r: '3' }),
      ]),
      h('span.sr-only', {}, 'Mostrar'),
    ]);
    input.classList.add('pr-20');
    wrap.appendChild(input);
    wrap.appendChild(eyeBtn);
    return wrap;
  }

  const password = h('input.input', {
    type: 'password',
    maxlength: String(VALIDATION.password.max),
    autocomplete: isEdit ? 'new-password' : 'new-password',
  });
  const passwordWithToggle = makePasswordInput(password);

  // Email — sólo se muestra al crear. Se autogenera como `${username}@${DOMAIN}`
  // (espejo del `deriveAuthEmail` del backend) para que Firebase Auth y
  // Firestore coincidan. El campo es visible pero no editable: se rellena
  // solo a partir del username y el SAC puede copiarlo si lo necesita.
  // `readonly` (no `disabled`) para que siga enfocable y copiable.
  const email = h('input.input', {
    type: 'email',
    value: u?.email || '',
    maxlength: String(VALIDATION.email.max),
    readonly: isEdit ? null : 'readonly',
    tabindex: isEdit ? null : '0',
    'aria-readonly': isEdit ? null : 'true',
    autocomplete: 'off',
    spellcheck: 'false',
    class: isEdit ? '' : 'bg-slate-50 text-slate-600 cursor-default focus:ring-0',
  });
  const emailHelp = h('p.text-xs.text-slate-500.mt-1', {}, 'Se genera automáticamente como nombre+@gcm.com a partir del usuario.');
  const emailField = h('div', {}, [
    h('label.label', {}, 'Correo'),
    email,
    emailHelp,
  ]);

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
    passwordWithToggle,
    h('p.text-xs.text-slate-500.mt-1', {}, isEdit
      ? 'Déjala en blanco para mantener la contraseña actual. Usa el ojo para ver lo que escribes.'
      : `Mínimo ${VALIDATION.password.min} caracteres. Usa el ojo para ver lo que escribes.`),
    passwordErr,
  ]);

  // Banner de error de servidor (no es field-level; aparece abajo del form).
  const banner = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', {
    role: 'alert',
  });

  const body = h('div.flex.flex-col.gap-3', {}, [
    usernameField,
    fullnameField,
    isEdit ? null : emailField,
    h('div.grid.grid-cols-2.gap-3', {}, [roleField, areaField]),
    passwordField,
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

  // Autogenerar email = `${username}@gcm.com` cada vez que cambia el
  // username. El campo es visible pero no editable, así que no necesitamos
  // el flag "dirty". Sólo aplica al crear; en edición el email se persiste
  // y no se toca.
  if (!isEdit) {
    username.addEventListener('input', () => {
      const local = usernameToLocalPart(username.value);
      email.value = local ? `${local}@${AUTO_EMAIL_DOMAIN}` : '';
    });
  }

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

    // Email: siempre se autogenera a partir del username con la nomenclatura
    // ${username}@gcm.com (espejo de deriveAuthEmail en backend). El campo
    // es visible pero no editable en el modal de creación, así que nunca
    // viene un valor escrito a mano. Si el username quedó vacío (no debería,
    // porque validate ya rechazó arriba), caemos a null.
    let emailVal = null;
    if (!isEdit) {
      const local = usernameToLocalPart(username.value.trim());
      emailVal = local ? `${local}@${AUTO_EMAIL_DOMAIN}` : null;
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
          email: emailVal,
        };
    if (isEdit && passwordVal) payload.password = passwordVal;
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
