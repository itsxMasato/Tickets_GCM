/* Documentado por: Miguel Flores */
/**
 * Escapa caracteres especiales de HTML (&, <, >, ", ') en un valor para insertarlo de forma segura como texto.
 * @param {*} value - valor a escapar (se convierte a string)
 * @returns {string} texto con los caracteres especiales escapados
 */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Helper tipo "hyperscript" usado en todo el frontend para crear elementos DOM sin plantillas HTML.
 * El `selector` es un string estilo CSS ("tag#id.clase1.clase2") que define la etiqueta, el id y las clases
 * iniciales del elemento (crea nodos SVG automáticamente para tags SVG conocidos, como 'svg' o 'path').
 * `props` es un objeto de atributos/propiedades: 'class'/'className' agrega clases (acepta string o array),
 * 'style' asigna un objeto de estilos, 'dataset' asigna atributos data-*, cualquier clave que empiece con 'on'
 * seguida de una función se registra como event listener (ej. onclick), 'html' asigna innerHTML directamente,
 * 'value' asigna el value de inputs/textarea/select, y las claves booleanas (checked/disabled/selected/autofocus)
 * se aplican como atributos solo si son truthy. El resto de las claves se setean con setAttribute.
 * `children` puede ser un nodo, un string/número, o un array (anidado) de cualquiera de esos, y se agrega
 * recursivamente al elemento vía appendChildren.
 * @param {string} selector - selector estilo CSS "tag#id.clase1.clase2" (tag por defecto: 'div')
 * @param {Object} [props] - atributos, propiedades y listeners a aplicar al elemento
 * @param {*} [children] - nodo, texto, o array (anidado) de nodos/texto a agregar como hijos
 * @returns {HTMLElement|SVGElement} elemento DOM creado y configurado
 */
export function h(selector, props = {}, children = []) {
  const idMatch = selector.match(/#([\w-]+)/);
  const classMatch = selector.match(/\.([\w-]+)/g) || [];
  const tag = selector.split(/[.#]/)[0] || 'div';
  const svgTags = new Set(['svg','path','circle','rect','line','polyline','polygon','g','defs','linearGradient','stop','mask','ellipse','text']);

  const el = svgTags.has(tag)
    ? document.createElementNS('http://www.w3.org/2000/svg', tag)
    : document.createElement(tag);
  if (idMatch) el.id = idMatch[1];
  for (const c of classMatch) el.classList.add(c.slice(1));

  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class' || k === 'className') {
        (Array.isArray(v) ? v : [v]).forEach((c) => c && el.classList.add(...String(c).split(/\s+/).filter(Boolean)));
      } else if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'dataset' && typeof v === 'object') {
        for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
      } else if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === 'html') {
        el.innerHTML = v;
      } else if (k === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) {
        el.value = v;
      } else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'autofocus') {
        if (v || v === '')
          el.setAttribute(k, '');
      } else {
        el.setAttribute(k, v);
      }
    }
  }

  appendChildren(el, children);
  return el;
}

/**
 * Agrega hijos a un elemento DOM de forma recursiva, soportando arrays anidados, nodos y texto plano.
 * Usada internamente por h(). Ignora valores null/undefined/false.
 * @param {HTMLElement|SVGElement} el - elemento al que se le agregan los hijos
 * @param {*} children - nodo, texto, o array (anidado) de nodos/texto
 * @returns {void}
 */
function appendChildren(el, children) {
  if (children === null || children === undefined || children === false) return;
  if (Array.isArray(children)) {
    for (const c of children) appendChildren(el, c);
    return;
  }
  if (children instanceof Node) {
    el.appendChild(children);
  } else {
    el.appendChild(document.createTextNode(String(children)));
  }
}

/**
 * Vacía un contenedor y monta en él un único nodo, reemplazando cualquier contenido previo.
 * @param {HTMLElement} container - elemento contenedor a limpiar y montar
 * @param {Node} node - nodo a insertar dentro del contenedor
 * @returns {void}
 */
export function mount(container, node) {
  container.innerHTML = '';
  if (node) container.appendChild(node);
}

/**
 * Template literal tag que construye un elemento DOM a partir de una plantilla HTML,
 * escapando automáticamente los valores interpolados para evitar inyección de HTML.
 * @param {TemplateStringsArray} strings - partes literales de la plantilla
 * @param {...*} values - valores interpolados (se escapan con escapeHtml)
 * @returns {Element} primer elemento hijo del HTML generado
 */
export function html(strings, ...values) {
  const tpl = document.createElement('template');
  tpl.innerHTML = strings.reduce((acc, s, i) => acc + s + (i < values.length ? escapeHtml(values[i] ?? '') : ''), '').trim();
  return tpl.content.firstElementChild;
}

