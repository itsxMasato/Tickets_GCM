/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { renderChat } from '../components/chat.js';
import { chatComposer } from '../components/chat-composer.js';
import { openModal, confirmModal } from '../components/modal.js';
import { canAssign, canEditMeta, canComment, canUpload, nextStates } from '../utils/permissions.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime, relativeFromNow } from '../utils/format.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { exportTicketToPDF } from '../utils/exports.js';
import { on as onSocket } from '../socket.js';
import { backButton } from '../components/back-button.js';
import { exportButton } from '../components/export-button.js';
import { ICON, svg } from '../utils/icons.js';
import { attachmentThumb } from '../components/attachments.js';

// Almacena el cleanup de listeners del ticket actual para limpiar cuando se desmonta
let currentSocketCleanup = null;

export async function renderTicketDetail({ params, user }) {
  const root = h('div.flex.flex-col.gap-4', {});
  const id = parseInt(params.id, 10);
  if (!id) { go('/tickets'); return root; }

  let ticket;
  try {
    const data = await api.tickets.get(id);
    ticket = data.ticket;
  } catch (e) {
    root.appendChild(h('div.card.text-red-600', {}, e.message));
    return root;
  }

  if (currentSocketCleanup) { try { currentSocketCleanup(); } catch {} }

  const offs = [];
  offs.push(onSocket('ticket:commented', async (p) => { if (p.ticketId === id) await reload(); }));
  offs.push(onSocket('attachment:added', async (p) => { if (p.ticketId === id) await reload(); }));
  offs.push(onSocket('ticket:status_changed', async (p) => { if (p.ticketId === id) await reload(); }));
  offs.push(onSocket('ticket:assigned', async (p) => { if (p.ticketId === id) await reload(); }));
  offs.push(onSocket('ticket:updated', async (p) => { if (p.ticketId === id) await reload(); }));

  currentSocketCleanup = () => { offs.forEach((f) => f()); };

  const header = h('div.flex.flex-col.gap-4', {}, [
    h('div.flex.items-start.justify-between.gap-3.flex-wrap', {}, [
      h('div.min-w-0.flex-1', {}, [
        h('div.flex.items-center.gap-2.text-sm.text-slate-500', {}, [
          backButton({ href: '/tickets', label: 'Volver a tickets' }),
          h('span.text-slate-300', {}, '·'),
          h('span.font-mono.text-slate-600', {}, ticket.code),
        ]),
        h('h1.text-2xl.md\\:text-3xl.font-bold.text-slate-900.mt-2.line-clamp-2', {}, ticket.title),
      ]),
      h('div.flex.flex-wrap.items-center.gap-2', {}, [
        exportButton({
          label: 'Exportar',
          format: 'pdf',
          kind: 'secondary',
          onclick: () => exportTicketToPDF(ticket),
        }),
        h('button.btn.btn-ghost', { onclick: reload, 'aria-label': 'Recargar', title: 'Recargar' }, [
          svg(h, ICON.refresh),
        ]),
      ]),
    ]),
    h('div.grid.grid-cols-1.md:grid-cols-2.gap-3', {}, [
      h('div.card.bg-slate-50.p-5', {}, [
        h('h2.text-sm.font-semibold.text-brand-ink.mb-3', {}, 'Resumen del ticket'),
        h('div.grid.grid-cols-2.gap-4', {}, [
          h('div.space-y-3', {}, [
            h('div.text-sm.text-slate-500', {}, 'Categoría'),
            h('div.text-sm.font-semibold.text-slate-900', {}, ticket.category_name || 'Sin categoría'),
          ]),
          h('div.space-y-3', {}, [
            h('div.text-sm.text-slate-500', {}, 'Área'),
            h('div.text-sm.font-semibold.text-slate-900', {}, AREA_LABEL[ticket.area] || 'Sin área'),
          ]),
          h('div.space-y-3', {}, [
            h('div.text-sm.text-slate-500', {}, 'Creado por'),
            h('div.text-sm.font-semibold.text-slate-900', {}, `${ticket.created_by_name || '—'}${ticket.created_by_role ? ` (${getRoleLabel(ticket.created_by_role)})` : ''}`),
          ]),
          h('div.space-y-3', {}, [
            h('div.text-sm.text-slate-500', {}, 'Asignado a'),
            h('div.text-sm.font-semibold.text-slate-900', {}, ticket.assigned_to_name || '—'),
          ]),
        ]),
      ]),
      h('div.card.bg-slate-50.p-5', {}, [
        h('h2.text-sm.font-semibold.text-brand-ink.mb-3', {}, 'Estado'),
        h('div.flex.flex-wrap.items-center.gap-2', {}, [
          statusBadge(ticket.status),
          priorityBadge(ticket.priority),
          h('span.badge.bg-slate-100.text-slate-700', {}, ticket.category_name || 'Sin categoría'),
          h('span.badge.bg-slate-100.text-slate-700', {}, AREA_LABEL[ticket.area] || 'Sin área'),
        ]),
        h('div.mt-3.grid.grid-cols-2.gap-3.text-sm', {}, [
          h('div', {}, [
            h('div.text-xs.text-slate-500', {}, 'Código'),
            h('div.font-mono.text-sm.font-semibold.text-slate-900', {}, ticket.code),
          ]),
          h('div', {}, [
            h('div.text-xs.text-slate-500', {}, 'Prioridad'),
            h('div.text-sm.font-semibold.text-slate-900', {}, PRIORITY_LABEL[ticket.priority] || ticket.priority),
          ]),
        ]),
        h('div.mt-4.grid.grid-cols-1.gap-3.text-sm', {}, [
          h('div', {}, [h('div.text-xs.text-slate-500', {}, 'Creado'), h('div.text-sm.font-semibold.text-slate-900', {}, `${formatDateTime(ticket.created_at)}`)]),
          h('div', {}, [h('div.text-xs.text-slate-500', {}, 'Actualizado'), h('div.text-sm.font-semibold.text-slate-900', {}, relativeFromNow(ticket.updated_at))]),
        ]),
      ]),
    ]),
  ]);
  root.appendChild(header);

  const layout = h('div.grid.grid-cols-1.lg\\:grid-cols-3.gap-4', {});
  const center = h('div.lg\\:col-span-2.flex.flex-col.gap-3', {});
  const right = h('div.flex.flex-col.gap-3', {});

  const descCard = h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Descripción del reporte'),
    h('p.text-sm.text-slate-800.whitespace-pre-wrap.leading-relaxed', {}, ticket.description || '—'),
  ]);
  center.appendChild(descCard);

  const chat = h('div.card', {});
  chat.appendChild(h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Historial · chat del ticket'));
  const chatBox = h('div.max-h-\\[60vh\\].overflow-y-auto.rounded-md.bg-slate-50.p-2', {});
  chat.appendChild(chatBox);
  chatBox.appendChild(renderChat({ ticket, user }));

  if (canComment(user, ticket) || canUpload(user, ticket)) {
    chat.appendChild(chatComposer({
      ticketId: ticket.id,
      onSent: async () => { await reload(); },
      disabled: ticket.status === 'cerrado',
    }));
  } else if (ticket.status === 'cerrado') {
    chat.appendChild(h('p.text-xs.text-slate-500.text-center.py-2', {}, 'El ticket está cerrado. No se pueden enviar nuevos mensajes.'));
  } else {
    chat.appendChild(h('p.text-xs.text-slate-500.text-center.py-2', {}, 'No tienes permisos para comentar.'));
  }
  center.appendChild(chat);

  right.appendChild(renderSidebarInfo(ticket, user));
  right.appendChild(renderActions(ticket, user, reload));

  layout.appendChild(center);
  layout.appendChild(right);
  root.appendChild(layout);

  async function reload() {
    try {
      const data = await api.tickets.get(id);
      Object.assign(ticket, data.ticket);
      if (typeof root._gcmCleanup === 'function') {
        try { root._gcmCleanup(); } catch {}
      }
      const fresh = await renderTicketDetail({ params, user });
      const parent = root.parentNode;
      if (parent) {
        parent.innerHTML = '';
        parent.appendChild(fresh);
      }
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  root._gcmCleanup = () => {
    if (currentSocketCleanup) {
      try { currentSocketCleanup(); } catch {}
      currentSocketCleanup = null;
    }
  };

  return root;
}

function renderSidebarInfo(ticket) {
  const row = (label, value, isCode = false) => h('div.flex.items-start.justify-between.gap-3.py-2.border-b.border-slate-100.last\\:border-0', {}, [
    h('span.text-xs.text-slate-500.uppercase.tracking-wide', {}, label),
    h('span.text-sm.text-slate-800.text-right', isCode ? { class: 'font-mono text-xs' } : {}, value || '—'),
  ]);
  const info = h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Información'),
    row('Código', ticket.code, true),
    row('Creado por', `${ticket.created_by_name || '—'}${ticket.created_by_role ? ` — ${getRoleLabel(ticket.created_by_role)}` : ''}`),
    row('Asignado a', ticket.assigned_to_name || '—'),
    row('Categoría', ticket.category_name || '—'),
    row('Área', AREA_LABEL[ticket.area] || '—'),
    row('Creado', `${formatDateTime(ticket.created_at)} (${relativeFromNow(ticket.created_at)})`),
    row('Actualizado', relativeFromNow(ticket.updated_at)),
    row('Cerrado', ticket.closed_at ? formatDateTime(ticket.closed_at) : '—'),
  ]);
  if (ticket.attachments?.length > 0) {
    info.appendChild(h('h4.text-xs.font-semibold.text-slate-700.mt-3.mb-2.uppercase.tracking-wider', {}, 'Adjuntos'));
    const list = h('ul.flex.flex-col.gap-1\\.5', {});
    for (const att of ticket.attachments) {
      list.appendChild(h('li', {}, attachmentThumb(att, ticket.id)));
    }
    info.appendChild(list);
  }
  return info;
}

function renderActions(ticket, user, onChange) {
  const actions = h('div.card.flex.flex-col.gap-2', {});
  actions.appendChild(h('h3.text-sm.font-semibold.text-slate-700', {}, 'Acciones'));
  const wrap = h('div.flex.flex-col.gap-2', {});

  if (canAssign(user)) {
    wrap.appendChild(h('button.btn.btn-secondary.btn-sm.justify-start.gap-2', { onclick: () => openAssignModal(ticket, onChange) }, [
      svg(h, ICON.user, 'w-4 h-4'),
      'Asignar / Reasignar',
    ]));
  }

  wrap.appendChild(h('button.btn.btn-secondary.btn-sm.justify-start.gap-2', { onclick: () => addToMyCalendar(ticket, onChange) }, [
    svg(h, ICON.calendar, 'w-4 h-4'),
    'Agregar a mi calendario',
  ]));

  const nexts = nextStates(user, ticket);
  for (const s of nexts) {
    const label = STATUS_LABEL[s] || s;
    const cls = s === 'cerrado' ? 'btn-accent btn-sm justify-start gap-2' : s === 'reabierto' ? 'btn-secondary btn-sm justify-start gap-2' : 'btn-primary btn-sm justify-start gap-2';
    wrap.appendChild(h('button.btn', { class: cls, onclick: () => changeStatus(ticket, s, onChange) }, [
      svg(h, ICON.arrow, 'w-4 h-4'),
      `Marcar como ${label}`,
    ]));
  }

  if (canEditMeta(user, ticket)) {
    wrap.appendChild(h('button.btn.btn-ghost.btn-sm.justify-start.gap-2', { onclick: () => openEditModal(ticket, onChange) }, [
      svg(h, ICON.edit, 'w-4 h-4'),
      'Editar detalles',
    ]));
  }

  if (wrap.children.length === 0) {
    wrap.appendChild(h('p.text-xs.text-slate-500', {}, 'No hay acciones disponibles para tu rol en este estado.'));
  }
  actions.appendChild(wrap);
  return actions;
}

async function addToMyCalendar(ticket, onChange) {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  try {
    await api.calendar.create({
      title: `${ticket.code || 'Ticket'} · ${ticket.title}`,
      notes: ticket.description || null,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      ticket_id: ticket.id,
      color: 'ocean',
    });
    toast('Evento agregado a tu calendario.', 'success');
    onChange?.();
  } catch (e) {
    toast(e.message || 'No se pudo agregar el ticket al calendario.', 'error');
  }
}

async function openAssignModal(ticket, onChange) {
  let users = [];
  try { users = (await api.users.list({ active: true })).users.filter((u) => u.role === 'admin_area' || u.role === 'jefe_inmediato'); } catch {}
  const sel = h('select.input', {}, [
    h('option', { value: '' }, '— Selecciona un encargado —'),
    ...users.map((u) => h('option', { value: String(u.id) }, `${u.full_name} — ${getRoleLabel(u.role)}${u.area ? ` · ${AREA_LABEL[u.area] || u.area}` : ''}`)),
  ]);
  const notes = h('textarea.input', { rows: '3', placeholder: 'Notas para el encargado — opcional' });
  const error = h('div.hidden.text-sm.text-red-600', {});
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Asignar a'), sel]),
    h('div', {}, [h('label.label', {}, 'Notas'), notes]),
    error,
  ]);
  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      if (!sel.value) { error.textContent = 'Selecciona un encargado.'; error.classList.remove('hidden'); return; }
      try {
        await api.tickets.assign(ticket.id, { to_user_id: parseInt(sel.value, 10), notes: notes.value.trim() || null });
        toast('Asignación actualizada.', 'success');
        close();
        onChange?.();
      } catch (e) {
        error.textContent = e.message;
        error.classList.remove('hidden');
      }
    } }, 'Asignar'),
  ];
  openModal({ title: `Asignar ${ticket.code}`, body, actions });
}

async function changeStatus(ticket, next, onChange) {
  const label = STATUS_LABEL[next] || next;
  if (next === 'cerrado' || next === 'reabierto') {
    confirmModal({
      title: `${label} ticket`,
      message: `¿Confirmas que quieres marcar el ticket como <b>${label}</b>?`,
      confirmText: label,
      danger: next === 'cerrado',
      onConfirm: async () => {
        try {
          await api.tickets.changeStatus(ticket.id, { status: next });
          toast(`Ticket marcado como ${label}.`, 'success');
          onChange?.();
        } catch (e) { toast(e.message, 'error'); }
      },
    });
    return;
  }
  const comment = h('textarea.input', { rows: '3', placeholder: 'Comentario — opcional' });
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('p.text-sm.text-slate-600', { html: `Vas a cambiar el estado a <b>${escapeHtml(label)}</b>.` }),
    h('div', {}, [h('label.label', {}, 'Comentario — opcional'), comment]),
  ]);
  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      try {
        await api.tickets.changeStatus(ticket.id, { status: next, comment: comment.value.trim() || null });
        toast(`Estado actualizado a ${label}.`, 'success');
        close();
        onChange?.();
      } catch (e) { toast(e.message, 'error'); }
    } }, 'Cambiar'),
  ];
  openModal({ title: `Cambiar estado · ${ticket.code}`, body, actions });
}

async function openEditModal(ticket, onChange) {
  const { categories } = await api.categories.list().catch(() => ({ categories: [] }));
  const title = h('input.input', { type: 'text', value: ticket.title, maxlength: '200' });
  const desc  = h('textarea.input', { rows: '5', value: ticket.description, maxlength: '5000' });
  const cat   = h('select.input', {}, [
    h('option', { value: '' }, '— Sin categoría —'),
    ...categories.map((c) => h('option', { value: String(c.id), selected: c.id === ticket.category_id ? '' : null }, c.name)),
  ]);
  const prio  = h('select.input', {}, ['baja','media','alta','urgente'].map((p) => h('option', { value: p, selected: p === ticket.priority ? '' : null }, PRIORITY_LABEL[p])));
  const err = h('div.hidden.text-sm.text-red-600', {});
  const body = h('div.flex.flex-col.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Título'), title]),
    h('div', {}, [h('label.label', {}, 'Descripción'), desc]),
    h('div.grid.grid-cols-1.md\\:grid-cols-2.gap-3', {}, [
      h('div', {}, [h('label.label', {}, 'Categoría'), cat]),
      h('div', {}, [h('label.label', {}, 'Prioridad'), prio]),
    ]),
    err,
  ]);
  const actions = (close) => [
    h('button.btn.btn-ghost', { onclick: close }, 'Cancelar'),
    h('button.btn.btn-primary', { onclick: async () => {
      try {
        await api.tickets.update(ticket.id, {
          title: title.value.trim(),
          description: desc.value.trim(),
          category_id: cat.value ? parseInt(cat.value, 10) : null,
          priority: prio.value,
        });
        toast('Ticket actualizado.', 'success');
        close();
        onChange?.();
      } catch (e) { err.textContent = e.message; err.classList.remove('hidden'); }
    } }, 'Guardar'),
  ];
  openModal({ title: `Editar ${ticket.code}`, body, actions, size: 'lg' });
}
