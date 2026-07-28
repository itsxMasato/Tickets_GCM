/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { statusBadge, priorityBadge } from '../components/badge.js';
import { renderChat } from '../components/chat.js';
import { chatComposer } from '../components/chat-composer.js';
import { openModal, confirmModal, passwordConfirmModal } from '../components/modal.js';
import { verifyCurrentPassword } from '../firebase.js';
import { canAssign, canEditMeta, canComment, canUpload, canSeeTicket, nextStates } from '../utils/permissions.js';
import { STATUS_LABEL, PRIORITY_LABEL, AREA_LABEL, formatDateTime, relativeFromNow } from '../utils/format.js';
import { getRoleLabel } from '../utils/role-labels.js';
import { exportTicketToPDF, exportToExcel, TICKET_EXPORT_COLUMNS } from '../utils/exports.js';
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
    // Header del ticket: en mobile (default flex-col) el título va arriba
    // y los botones abajo; en >=768px vuelve a fila horizontal.
    h('div.flex.flex-col.gap-3', { class: 'md:flex-row md:items-start md:justify-between md:gap-3' }, [
      h('div.min-w-0.flex-1', {}, [
        h('div.flex.items-center.gap-2.text-sm.text-slate-500', {}, [
          backButton({ href: '/tickets', label: 'Volver a tickets' }),
          h('span.text-slate-300', {}, '·'),
          h('span.font-mono.text-slate-600', {}, ticket.code),
        ]),
        h('h1.text-2xl.font-bold.text-slate-900.mt-2.line-clamp-2', { class: 'md:text-3xl' }, ticket.title),
      ]),
      h('div.flex.flex-wrap.items-center.gap-2', {}, [
        exportButton({
          label: 'Exportar',
          kind: 'secondary',
          onExport: async (format) => {
            const formatLabel = format === 'pdf' ? 'PDF' : 'Excel';
            try {
              await passwordConfirmModal({
                title: 'Confirmar exportación',
                message: `Ingresa tu contraseña para exportar el ticket a ${formatLabel}.`,
                confirmText: 'Exportar',
                onConfirm: async (password) => {
                  await verifyCurrentPassword(password);
                },
              });
              if (format === 'pdf') {
                exportTicketToPDF(ticket);
              } else {
                const row = {
                  ...ticket,
                  status: STATUS_LABEL[ticket.status] || ticket.status,
                  priority: PRIORITY_LABEL[ticket.priority] || ticket.priority,
                  area: AREA_LABEL[ticket.area] || ticket.area || '',
                  created_at: formatDateTime(ticket.created_at),
                  updated_at: formatDateTime(ticket.updated_at),
                  closed_at: ticket.closed_at ? formatDateTime(ticket.closed_at) : '',
                };
                exportToExcel([row], `${ticket.code || 'ticket'}.xlsx`, {
                  columns: TICKET_EXPORT_COLUMNS,
                  title: `Ticket ${ticket.code || ''}`,
                  subtitle: ticket.title,
                  sheetName: 'Ticket',
                  summaryField: 'status',
                  summaryLabel: 'Estado',
                  generatedByName: user.full_name || user.username,
                  generatedByRole: getRoleLabel(user.role) || user.role,
                });
              }
            } catch (e) {
              if (e && e.message !== 'Modal closed') {
                toast(e.message || 'Error al exportar', 'error');
              }
            }
          },
        }),
        h('button.btn.btn-ghost', { onclick: reload, 'aria-label': 'Recargar', title: 'Recargar' }, [
          svg(h, ICON.refresh),
        ]),
      ]),
    ]),
    h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-2' }, [
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

  const layout = h('div.grid.grid-cols-1.gap-4', { class: 'lg:grid-cols-3' });
  const center = h('div.flex.flex-col.gap-3', { class: 'lg:col-span-2' });
  const right = h('div.flex.flex-col.gap-3', {});

  const descCard = h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Descripción del reporte'),
    h('p.text-sm.text-slate-800.whitespace-pre-wrap.leading-relaxed', {}, ticket.description || '—'),
  ]);
  center.appendChild(descCard);

  // Trazabilidad: siempre visible para quien puede ver el ticket (no solo
  // cuando no hay chat) — es lo que le permite a quien lo creó seguir su
  // avance sin depender de tener acceso a comentar.
  center.appendChild(renderTimeline(ticket));

  // canSeeChatHistory (ver) y canWriteChat (comentar/adjuntar) se separan a
  // proposito: antes ambos dependian de canComment/canUpload, que exigen
  // status !== 'cerrado' — un ticket cerrado ocultaba TODO el chat (mensajes
  // y adjuntos incluidos) para todos los roles, hasta para SAC y quien lo
  // creo. Ahora el historial sigue visible siempre que el usuario pueda ver
  // el ticket; solo se bloquea poder escribir.
  const canSeeChatHistory = canSeeTicket(user, ticket);
  const canWriteChat = canComment(user, ticket) || canUpload(user, ticket);
  if (canSeeChatHistory) {
    const chat = h('div.card', {});
    chat.appendChild(h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Historial · chat del ticket'));
    // chat-scroll-internal: overscroll-behavior:contain evita que el scroll
    // del chat se propague al body en iOS (rebote contra el header). El
    // max-h se mantiene en 60vh para que el header del ticket siga visible
    // en desktop; en mobile, el shell del modal/lista provee su propio scroll.
    const chatBox = h('div.chat-scroll-internal.overflow-y-auto.rounded-md.bg-slate-50.p-2', { class: 'max-h-[60vh]' });
    chat.appendChild(chatBox);
    chatBox.appendChild(renderChat({ ticket, user }));

    if (canWriteChat) {
      chat.appendChild(chatComposer({
        ticketId: ticket.id,
        onSent: async () => { await reload(); },
        disabled: ticket.status === 'cerrado',
      }));
    } else if (ticket.status === 'cerrado') {
      chat.appendChild(h('p.text-xs.text-slate-500.mt-2.px-1', {}, 'Este ticket está cerrado. Podés ver todo el historial, pero ya no se puede comentar ni adjuntar archivos.'));
    }
    center.appendChild(chat);
  } else {
    center.appendChild(h('div.card', {}, [
      h('h3.text-sm.font-semibold.text-slate-700.mb-2', {}, 'Comentarios'),
      h('p.text-sm.text-slate-500', {}, 'No tenés acceso para ver los comentarios de este ticket.'),
    ]));
  }

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

// ── Línea de tiempo ─────────────────────────────────────────────────────────
// Reconstruye la trazabilidad del ticket a partir de audit_log (creación,
// asignaciones, cambios de estado, comentarios) — mismo dato que alimenta
// /audit, filtrado por este ticket (ver firestoreData.getTicketDetail →
// history). Fallback vacío para tickets creados antes de que el audit log
// quedara bien enganchado (no todos los tickets viejos tienen historial).
const HISTORY_ICON = {
  ticket_created: ICON.ticket_created,
  ticket_assigned: ICON.ticket_assigned,
  ticket_status_changed: ICON.ticket_status_changed,
  comment_added: ICON.ticket_commented,
  attachment_added: ICON.attach,
};
const HISTORY_TONE = {
  ticket_created: 'bg-brand-ocean/10 text-brand-ocean border-brand-ocean/20',
  ticket_assigned: 'bg-brand/10 text-brand border-brand/20',
  ticket_status_changed: 'bg-amber-100 text-amber-800 border-amber-200',
  comment_added: 'bg-slate-100 text-slate-600 border-slate-200',
  attachment_added: 'bg-slate-100 text-slate-600 border-slate-200',
};

function renderTimeline(ticket) {
  const entries = Array.isArray(ticket.history) ? ticket.history : [];
  const card = h('div.card', {}, [
    h('h3.text-sm.font-semibold.text-slate-700.mb-1', {}, 'Línea de tiempo'),
    h('p.text-xs.text-slate-500.mb-4', {}, 'Todo lo que pasó con este ticket, en orden.'),
  ]);

  if (!entries.length) {
    card.appendChild(h('p.text-sm.text-slate-500', {}, 'Sin eventos registrados todavía.'));
    return card;
  }

  const list = h('div.flex.flex-col', {});
  entries.forEach((entry, i) => {
    const isLast = i === entries.length - 1;
    const iconPath = HISTORY_ICON[entry.action_type] || ICON.ticket_commented;
    const tone = HISTORY_TONE[entry.action_type] || 'bg-slate-100 text-slate-600 border-slate-200';
    const row = h('div.relative.flex.gap-3', { class: isLast ? '' : 'pb-5' }, [
      h('div.relative.flex-none.flex.flex-col.items-center', {}, [
        h('div.w-7.h-7.rounded-full.border.flex.items-center.justify-center.flex-none', {
          class: tone + (isLast ? ' ring-4 ring-brand-ocean/15' : ''),
        }, [
          svg(h, iconPath, 'w-3.5 h-3.5'),
        ]),
        isLast ? null : h('div.w-px.flex-1.bg-slate-200.mt-1', { 'aria-hidden': 'true' }),
      ]),
      h('div.flex-1.min-w-0', { class: 'pt-0.5' }, [
        h('div.flex.items-baseline.justify-between.gap-2.flex-wrap', {}, [
          h('p.text-sm.text-slate-800', {}, entry.description || entry.action_type),
          h('span.text-xs.text-slate-400.flex-none', { title: formatDateTime(entry.created_at) }, relativeFromNow(entry.created_at)),
        ]),
        h('p.text-xs.text-slate-500', { class: 'mt-0.5' }, entry.user_name || 'Sistema'),
      ]),
    ]);
    list.appendChild(row);
  });
  card.appendChild(list);
  return card;
}

function renderSidebarInfo(ticket) {
  const row = (label, value, isCode = false) => h('div.flex.items-start.justify-between.gap-3.py-2.border-b.border-slate-100', { class: 'last:border-0' }, [
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
    const list = h('ul.flex.flex-col', { class: 'gap-1.5' });
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
    h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-2' }, [
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
