/* Documentado por: Miguel Flores */
import { h, escapeHtml } from '../utils/dom.js';
import { api } from '../api.js';
import { go } from '../router.js';
import { toast } from '../utils/toast.js';
import { backButton } from '../components/back-button.js';
import { PRIORITY_LABEL } from '../utils/format.js';
import { attachmentsDropzone } from '../components/attachments-dropzone.js';

const LIMITS = {
  title:       { min: 4,  max: 200 },
  description: { min: 8,  max: 5000 },
};

const PRIORITIES = ['baja', 'media', 'alta', 'urgente'];

/**
 * Muestra u oculta el mensaje de error de un campo del formulario y actualiza sus atributos ARIA de accesibilidad.
 * @param {HTMLElement} input - campo del formulario asociado al error
 * @param {HTMLElement} errorEl - elemento donde se muestra el mensaje de error
 * @param {string|null} message - mensaje de error a mostrar, o null/vacío para limpiarlo
 * @returns {void}
 */
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

/**
 * Arma el formulario de creación de un nuevo ticket, con validación de campos, selector de categoría/prioridad, adjuntos y panel de ayuda lateral.
 * @param {Object} params - parámetros de la ruta
 * @param {Object} params.user - usuario autenticado
 * @returns {Promise<HTMLElement>} nodo raíz de la vista
 */
export async function renderTicketNew({ user }) {
  const root = h('div.flex.flex-col.gap-4.max-w-5xl', {});

  root.appendChild(backButton({ href: '/tickets', label: 'Volver a tickets' }));
  root.appendChild(h('h1.text-2xl.font-bold.text-slate-800', {}, 'Nuevo ticket'));
  root.appendChild(h('p.text-sm.text-slate-500', {},
    'Reporta una incidencia. Adjunta fotos, videos o documentos — el contexto acelera la solución.'
  ));

  
  const { categories } = await api.categories.list().catch(() => ({ categories: [] }));

  const grid = h('div.grid.grid-cols-1.gap-4', { class: 'lg:grid-cols-3' });
  const formCol = h('form.card.flex.flex-col.gap-4', { class: 'lg:col-span-2', onsubmit: onSubmit, novalidate: 'true' });
  const sideCol = h('aside.flex.flex-col.gap-3', {});
  grid.appendChild(formCol);
  grid.appendChild(sideCol);
  root.appendChild(grid);

  const titleInput = h('input.input', {
    type: 'text',
    maxlength: String(LIMITS.title.max),
    required: 'required',
    placeholder: 'Resumen breve del problema',
    'aria-required': 'true',
  });
  const descInput = h('textarea.input', {
    rows: '6',
    maxlength: String(LIMITS.description.max),
    required: 'required',
    placeholder: 'Describe con detalle el problema, contexto, lugar, hora…',
    'aria-required': 'true',
  });
  const catSel = h('select.input', {
    'aria-label': 'Categoría',
  }, [
    h('option', { value: '' }, '— Sin categoría —'),
    ...categories.map((c) => h('option', { value: String(c.id) }, c.name)),
  ]);
  const prioSel = h('select.input', { 'aria-label': 'Prioridad' },
    PRIORITIES.map((p) => h('option', { value: p, selected: p === 'media' ? '' : null }, PRIORITY_LABEL[p]))
  );

  const titleErr = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-new-title-err', role: 'alert' });
  const descErr  = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-new-desc-err',  role: 'alert' });
  const catErr   = h('p.text-xs.text-red-600.mt-1.hidden', { id: 'gcm-new-cat-err',   role: 'alert' });
  const banner   = h('div.hidden.p-3.rounded-md.bg-red-50.border.border-red-200.text-sm.text-red-700', { role: 'alert' });

  const titleHelper = h('p.text-xs.text-slate-500.mt-1', {},
    `Mínimo ${LIMITS.title.min} caracteres. Resume el problema en una frase.`);
  const descHelper = h('p.text-xs.text-slate-500.mt-1', {},
    'Contexto, ubicación, hora. Mientras más detalle, más rápido se asigna.');

  const titleField = h('div', {}, [
    h('label.label', {}, 'Título *'),
    titleInput,
    titleHelper,
    titleErr,
  ]);
  const descField = h('div', {}, [
    h('div.flex.items-baseline.justify-between', {}, [
      h('label.label', {}, 'Descripción *'),
      h('span.text-slate-500.tabular-nums', { class: 'text-[10px]', 'data-counter': 'desc' }, `0/${LIMITS.description.max}`),
    ]),
    descInput,
    descHelper,
    descErr,
  ]);
  descInput.addEventListener('input', () => {
    formCol.querySelector('[data-counter="desc"]').textContent = `${descInput.value.length}/${LIMITS.description.max}`;
  });

  const catField = h('div', {}, [
    h('label.label', {}, 'Categoría'),
    catSel,
    h('p.text-xs.text-slate-500.mt-1', {}, 'Opcional. Si no la ves, créala en Administración → Categorías.'),
    catErr,
  ]);
  const prioField = h('div', {}, [
    h('label.label', {}, 'Prioridad'),
    prioSel,
    h('p.text-xs.text-slate-500.mt-1', {}, 'Si no la tocas, queda como Media.'),
  ]);

  formCol.appendChild(titleField);
  formCol.appendChild(descField);
  formCol.appendChild(h('div.grid.grid-cols-1.gap-3', { class: 'md:grid-cols-2' }, [catField, prioField]));

  const dropzoneSection = h('div.flex.flex-col.gap-2', {}, [
    h('div.flex.items-baseline.justify-between', {}, [
      h('label.label', {}, 'Adjuntos'),
      h('span.text-slate-500', { class: 'text-[10px]' }, 'Opcional'),
    ]),
  ]);
  const dz = attachmentsDropzone({
    onChange: () => {},
  });
  dropzoneSection.appendChild(dz.root);
  formCol.appendChild(dropzoneSection);

  formCol.appendChild(banner);

  const submitBtn = h('button.btn.btn-primary.w-fit.gap-2', { type: 'submit' }, [
    h('span', {}, 'Crear ticket'),
  ]);
  const cancelBtn = h('button.btn.btn-ghost', { type: 'button', onclick: () => go('/tickets') }, 'Cancelar');
  const formActions = h('div.flex.items-center.gap-2.pt-2.border-t.border-surface-border', {}, [
    submitBtn,
    cancelBtn,
  ]);
  formCol.appendChild(formActions);

  const tipTitle = h('div.text-sm.font-semibold.text-brand-ink.mb-2', {}, 'Antes de enviar');
  const tips = [
    { d: 'M7 11V7a5 5 0 0110 0v4M5 11h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2z', t: 'Adjunta evidencia', s: 'Fotos del error, capturas, archivos relacionados.' },
    { d: 'M12 8v4l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z', t: 'Sé específico', s: 'Lugar, hora, qué estabas haciendo al momento del fallo.' },
    { d: 'M3 7h18M3 12h18M3 17h12', t: 'Una incidencia por ticket', s: 'Si son problemas distintos, crea varios tickets.' },
  ];
  const tipList = h('ul.flex.flex-col.gap-3', {});
  tips.forEach((t) => {
    tipList.appendChild(h('li.flex.items-start.gap-3', {}, [
      h('span.flex-none.w-7.h-7.rounded-md.text-brand-ocean.flex.items-center.justify-center', { class: 'bg-brand-ocean/10' }, [
        h('svg.w-4.h-4', { fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', viewBox: '0 0 24 24', 'aria-hidden': 'true', html: `<path stroke-linecap="round" stroke-linejoin="round" d="${t.d}"/>` }),
      ]),
      h('div.min-w-0', {}, [
        h('div.text-sm.font-medium.text-brand-ink', {}, t.t),
        h('div.text-xs.text-slate-500', { class: 'mt-0.5' }, t.s),
      ]),
    ]));
  });
  sideCol.appendChild(h('div.card', {}, [tipTitle, tipList]));

  const prioItems = [
    { key: 'urgente', cls: 'text-red-700', label: 'Urgente', desc: 'Detiene la operación.' },
    { key: 'alta',    cls: 'text-amber-700', label: 'Alta',    desc: 'Impacto material en el servicio.' },
    { key: 'media',   cls: 'text-blue-700',  label: 'Media',   desc: 'Trabajo normal, sin bloqueo.' },
    { key: 'baja',    cls: 'text-slate-700', label: 'Baja',    desc: 'Mejora, no incidente.' },
  ];
  const prioList = h('ul.flex.flex-col.gap-2.text-sm', {});
  prioItems.forEach((p) => {
    prioList.appendChild(h('li.flex.items-start.gap-2', {}, [
      h('span.flex-none.rounded-full', {
        class: `w-1.5 h-1.5 mt-1.5 ${p.key === 'urgente' ? 'bg-accent' : p.key === 'alta' ? 'bg-amber-500' : p.key === 'media' ? 'bg-blue-500' : 'bg-slate-400'}`,
      }),
      h('div.min-w-0', {}, [
        h('span.font-medium.text-brand-ink', {}, p.label),
        h('span.text-slate-500', {}, ` — ${p.desc}`),
      ]),
    ]));
  });
  sideCol.appendChild(h('div.card', {}, [
    h('div.text-sm.font-semibold.text-brand-ink.mb-2', {}, 'Guía de prioridad'),
    prioList,
  ]));

  /**
   * Oculta todos los mensajes de error de campo y el banner general del formulario.
   * @returns {void}
   */
  function clearAllErrors() {
    [titleErr, descErr, catErr].forEach((e) => e.classList.add('hidden'));
    banner.classList.add('hidden'); banner.textContent = '';
  }

  /**
   * Valida los campos obligatorios del formulario (título y descripción) y arma el payload a enviar si son válidos.
   * @returns {{ok: boolean, firstInvalid?: HTMLElement, payload?: Object}} resultado de la validación
   */
  function validate() {
    let firstInvalid = null;
    const title = titleInput.value.trim();
    const desc = descInput.value.trim();

    if (!title) {
      setFieldError(titleInput, titleErr, 'El título es obligatorio.');
      firstInvalid = firstInvalid || titleInput;
    } else if (title.length < LIMITS.title.min) {
      setFieldError(titleInput, titleErr, `Mínimo ${LIMITS.title.min} caracteres.`);
      firstInvalid = firstInvalid || titleInput;
    } else if (title.length > LIMITS.title.max) {
      setFieldError(titleInput, titleErr, `Máximo ${LIMITS.title.max} caracteres.`);
      firstInvalid = firstInvalid || titleInput;
    } else {
      setFieldError(titleInput, titleErr, null);
    }

    if (!desc) {
      setFieldError(descInput, descErr, 'La descripción es obligatoria.');
      firstInvalid = firstInvalid || descInput;
    } else if (desc.length < LIMITS.description.min) {
      setFieldError(descInput, descErr, `Mínimo ${LIMITS.description.min} caracteres.`);
      firstInvalid = firstInvalid || descInput;
    } else if (desc.length > LIMITS.description.max) {
      setFieldError(descInput, descErr, `Máximo ${LIMITS.description.max} caracteres.`);
      firstInvalid = firstInvalid || descInput;
    } else {
      setFieldError(descInput, descErr, null);
    }

    if (firstInvalid) return { ok: false, firstInvalid };
    return {
      ok: true,
      payload: {
        title,
        description: desc,
        category_id: catSel.value ? parseInt(catSel.value, 10) : null,
        priority: prioSel.value,
      },
    };
  }

  /**
   * Muestra el banner de error general del formulario con el mensaje dado.
   * @param {string} msg - mensaje a mostrar
   * @returns {void}
   */
  function showBanner(msg) {
    banner.textContent = msg;
    banner.classList.remove('hidden');
  }

  titleInput.addEventListener('input', () => setFieldError(titleInput, titleErr, null));
  descInput.addEventListener('input', () => setFieldError(descInput, descErr, null));
  catSel.addEventListener('change', () => setFieldError(catSel, catErr, null));

  let submitting = false;
  /**
   * Maneja el envío del formulario: valida los campos, crea el ticket vía API, sube los adjuntos pendientes y navega al detalle del ticket creado.
   * @param {Event} e - evento de submit del formulario
   * @returns {Promise<void>}
   */
  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    clearAllErrors();
    const v = validate();
    if (!v.ok) { v.firstInvalid.focus(); return; }

    submitting = true;
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Creando…';
    submitBtn.setAttribute('aria-busy', 'true');

    try {
      const { ticket } = await api.tickets.create(v.payload);
      const pending = dz.getFiles();
      if (pending.length > 0) {
        submitBtn.querySelector('span').textContent = `Subiendo 0/${pending.length}…`;
        const results = await Promise.allSettled(pending.map((file, i) => {
          return new Promise((resolve, reject) => {
            const fd = new FormData();
            fd.append('file', file);
            api.tickets.upload(ticket.id, fd)
              .then((r) => { resolve(r.attachment); })
              .catch((err) => { reject(err); })
              .finally(() => {
                submitBtn.querySelector('span').textContent = `Subiendo ${i + 1}/${pending.length}…`;
              });
          });
        }));
        const ok = results.filter((r) => r.status === 'fulfilled').length;
        const fail = results.length - ok;
        if (fail > 0) {
          toast(`Ticket ${ticket.code} creado. ${ok} adjuntos subidos, ${fail} fallaron.`, 'warn');
        } else {
          toast(`Ticket ${ticket.code} creado con ${ok} adjunto(s).`, 'success');
        }
      } else {
        toast(`Ticket ${ticket.code} creado.`, 'success');
      }
      go(`/tickets/${ticket.id}`);
    } catch (err) {
      showBanner(err.message || 'No se pudo crear el ticket.');
      submitting = false;
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Crear ticket';
      submitBtn.removeAttribute('aria-busy');
    }
  }

  root._gcmCleanup = () => {
    try { dz.destroy(); } catch {}
  };

  return root;
}

