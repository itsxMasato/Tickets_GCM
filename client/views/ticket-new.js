import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';

export async function renderTicketNew({ user }) {
  const root = h('div.flex.flex-col.gap-4.max-w-2xl', {});

  root.appendChild(h('button.flex.items-center.gap-1.text-sm.font-medium.text-brand-ink.hover\\:text-brand.min-h-\\[44px\\].-ml-1.px-1.rounded', { onclick: () => go('/tickets') }, [
    h('svg.w-4.h-4', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 12H5M12 19l-7-7 7-7" />' }),
    'Tickets',
  ]));
  root.appendChild(h('h1.text-2xl.font-bold.text-slate-800', {}, 'Nuevo ticket'));

  const { categories } = await api.categories.list().catch(() => ({ categories: [] }));

  const form = h('form.card.flex.flex-col.gap-4', { onsubmit: onSubmit });
  const titleInput = h('input.input', { type: 'text', maxlength: '200', required: true, placeholder: 'Resumen breve del problema' });
  const descInput = h('textarea.input', { rows: '6', maxlength: '5000', required: true, placeholder: 'Describe con detalle el problema, contexto, lugar, hora…' });
  const catSel = h('select.input', {}, [
    h('option', { value: '' }, '— Selecciona una categoría —'),
    ...categories.map((c) => h('option', { value: String(c.id) }, c.name)),
  ]);
  const prioSel = h('select.input', {}, [
    h('option', { value: 'baja' }, 'Baja'),
    h('option', { value: 'media', selected: '' }, 'Media'),
    h('option', { value: 'alta' }, 'Alta'),
    h('option', { value: 'urgente' }, 'Urgente'),
  ]);
  const error = h('div.hidden.text-sm.text-red-600.bg-red-50.px-3.py-2.rounded-md', {});
  const submit = h('button.btn.btn-primary.w-fit', { type: 'submit' }, 'Crear ticket');

  form.appendChild(h('div', {}, [h('label.label', {}, 'Título *'), titleInput]));
  form.appendChild(h('div', {}, [h('label.label', {}, 'Descripción *'), descInput]));
  form.appendChild(h('div.grid.grid-cols-1.md\\:grid-cols-2.gap-3', {}, [
    h('div', {}, [h('label.label', {}, 'Categoría'), catSel]),
    h('div', {}, [h('label.label', {}, 'Prioridad'), prioSel]),
  ]));
  form.appendChild(error);
  form.appendChild(submit);

  root.appendChild(form);

  async function onSubmit(e) {
    e.preventDefault();
    error.classList.add('hidden');
    submit.disabled = true;
    submit.textContent = 'Creando…';
    try {
      const { ticket } = await api.tickets.create({
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        category_id: catSel.value ? parseInt(catSel.value, 10) : null,
        priority: prioSel.value,
      });
      toast(`Ticket ${ticket.code} creado.`, 'success');
      go(`/tickets/${ticket.id}`);
    } catch (e) {
      error.textContent = e.message;
      error.classList.remove('hidden');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Crear ticket';
    }
  }

  return root;
}
