<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# UX Guidelines — GCM Tickets

> Cómo se comporta el producto con el usuario. Voz, microcopy, motion, estados, accesibilidad, error/empty/loading. Inspirado en la disciplina de Emil Kowalski (motion + craft), la honestidad compositiva de Linear y la transparencia de Stripe.

**Referencia dura:** `DESIGN_SYSTEM.md` (tokens, componentes, principios). Este documento es la **capa de comportamiento** que vive sobre el sistema visual.

---

## 1. Principios de UX

1. **Seriedad operativa.** El producto se lee como una herramienta, no como un producto de consumo. El usuario está trabajando — 8+ horas al día, en operaciones. Cada elemento de UI está justificado por su función.
2. **Una decisión por superficie.** Cada pantalla, en cada momento, le pide al usuario **una** cosa. Si una vista pide tres decisiones a la vez, está mal diseñada.
3. **Inmediatez honesta.** Si algo cambió, lo veo. Si está cargando, lo sé. Si falló, me lo dice y me da cómo salir. Nunca un spinner infinito, nunca un estado silencioso.
4. **La historia es el producto.** El chat del ticket es el sistema de registro. Cualquier cosa que pase en el ciclo (cambio de estado, comentario, adjunto, reasignación) tiene que ser visible en orden cronológico.
5. **Visibilidad como seguridad.** Cada rol ve solo lo que le toca. Fugas son bugs de UX.
6. **Densidad calmada.** Mucha información por pantalla, una sola voz de acento, aire generoso entre bloques. Nunca el "wall of cards" ni el "white space desert".

---

## 2. Voz y copy

### 2.1 Voz

- **Directa.** Decimos lo que pasa, no adornamos.
- **Imperativa en acciones.** Botones en infinitivo: "Asignar", "Cerrar", "Reabrir", "Filtrar", "Limpiar", "Crear ticket".
- **Informativa en estados.** "Ticket creado", "Asignación actualizada", "No hay tickets que coincidan con los filtros". No "¡Listo! 🎉".
- **Español neutro.** Sin localismos ("vos", "tú"), sin anglicismos innecesarios.

### 2.2 Reglas de copy

- **No signos de exclamación.** Salvo que la palabra sea genuinamente exclamativa (no aplica en este producto).
- **No emoji en UI.** Emoji inconsistente entre plataformas; reemplazado por SVG icons.
- **No "Welcome back!" / "Get started!" / "Supercharge your workflow".** Tells genéricos de SaaS consumer.
- **No segunda persona en copy estructural.** Decimos "El ticket está cerrado", no "Tu ticket está cerrado". La segunda persona es para microcopy dirigido ("Hola, Juan" en el dashboard, "Marcar todas como leídas").
- **No copy redundante con la UI.** El subtítulo del dashboard no repite lo que ya dicen los KPIs.
- **Fechas relativas, después absolutas.** En listados y chat: "hace 3 h". En títulos `title`: "22 jun 2026 · 14:32". En exports: `formatDateTime()` siempre.
- **Longitud de línea:** correr texto entre 65 y 75 caracteres. Chat bubble `max-w-[80%]` ya lo cuida; en párrafos de la descripción, mantener el wrap natural.
- **Vacíos con substance.** Un empty state dice **qué pasa** y, si aplica, **cómo salir**. Nunca un "No data" pelado.

### 2.3 Glosario canónico

| Término correcto | Evitar |
|---|---|
| "Ticket" | "caso", "incidencia" (solos), "solicitud" (es otra cosa en el dominio) |
| "Asignado a" | "responsable", "encargado" (ambiguos) |
| "Estado" | "status" (anglicismo), "etapa" |
| "Prioridad" | "urgencia" (la urgencia es la `urgente` específicamente) |
| "Categoría" | "tipo" |
| "Área" | "departamento", "team" |
| "Cerrar ticket" | "Finalizar", "Completar" (cerrar es el término del dominio) |
| "Reabrir" | "Reactivar" (reabrir tiene implicación legal/operativa) |
| "Reasignar" | "Transferir" (transferir sugiere ownership completo) |
| "Bandeja" | "Inbox" |
| "Notificaciones" | "Alertas" (alertas es solo lo crítico) |

### 2.4 Microcopy por contexto

#### Botones

- Acción única dominante: imperativo directo. "Asignar", "Cerrar", "Reabrir", "Crear ticket".
- Acción destructiva o crítica: imperativo directo, sin adornos. "Cerrar ticket", "Desactivar usuario". El color del botón (`btn-accent`) lleva la urgencia, no el copy.
- Confirmación: mismo verbo que la acción. "Cancelar" / "Crear ticket" — no "Sí, crear" / "No, volver".
- Cancelar: siempre "Cancelar", nunca "Volver" ni "Atrás".

#### Toasts

- Confirmación de éxito: estado en pasado. "Ticket creado", "Asignación actualizada", "Exportadas 142 filas a Excel".
- Error: qué falló y (si se sabe) por qué. "Error al subir foto-evidencia.jpg: archivo demasiado grande". Sin disculpas.
- Info: contexto neutro. "Conexión restaurada", "Nueva notificación: TCK-0042 cambió a En proceso".
- Duración: 4s default. Errores críticos: 6s. Info: 3s.

#### Empty states

Estructura: **qué pasa** + **por qué** + **qué hacer** (opcional).

```
[ticket icon]
Sin tickets que coincidan con los filtros seleccionados.
Ajusta los filtros o crea uno nuevo.
[Limpiar filtros]  [Crear ticket]
```

No "¡Ups! No hay nada aquí". No "Parece que no tienes tickets...". No copy de disculpa.

#### Confirmaciones modales

- Título: imperativo. "Cerrar ticket", "Desactivar usuario", "Eliminar archivo".
- Body: una línea con la consecuencia. "¿Cerrar TCK-0042? El equipo podrá reabrirlo después si es necesario."
- Botón de confirmación: el verbo de la acción, en el color correcto (`btn-accent` para crítico, `btn-primary` para normal).

#### Errores de formulario

- Inline al campo cuando es posible. Rojo translúcido (no `text-red-600` sobre blanco — contraste WCAG justo).
- Mensaje: qué está mal y cómo arreglarlo. "Selecciona un encargado" no "Campo requerido".
- `aria-live="polite"` para anunciar a screen readers.

---

## 3. Estados de UI

Cada bloque de UI pasa por tres estados observables: **loading**, **loaded**, **error**. Algunos bloques tienen **empty** como cuarto estado (loaded con colección vacía).

### 3.1 Loading

| Tipo | Cuándo | Cómo |
|---|---|---|
| **Skeleton de bloque** | Carga inicial de una vista | Placeholder con `animate-pulse` que ocupa el mismo espacio que el contenido real. |
| **Spinner inline** | Acción puntual (submit, refresh) | Spinner `brand-ocean` de 16px al lado del label. |
| **Botón en estado de envío** | Submit de formulario | Botón disabled + label "Creando…" / "Enviando…" / "Exportando…". |
| **Barra de progreso** | Export grande (no usado hoy) | No inventar para un export de < 5s. |

**Regla:**
- El skeleton **debe tener las mismas dimensiones** que el contenido que reemplaza, para que no haya reflow cuando llegan los datos.
- Nunca un spinner global encima de la pantalla. El contenido se ve mientras carga.
- `prefers-reduced-motion: reduce` colapsa los pulses y spinners a estados estáticos.

### 3.2 Loaded (con datos)

Render normal. Sin estados adicionales.

### 3.3 Empty

Cuando una colección viene vacía. El `EmptyState` component es la única sanctioned way de mostrarlo.

```js
emptyState({
  icon: 'ticket',  // 'ticket' | 'bell' | 'users' | 'tag' | 'chart' | 'search' | 'inbox'
  title: 'Sin tickets',
  message: 'No hay tickets que coincidan con los filtros seleccionados. Ajusta los filtros o crea uno nuevo.',
  action: { label: 'Crear ticket', onclick: ... },  // opcional
})
```

**Por qué icono, no emoji:** consistente entre plataformas, no rompe con fuentes faltantes (Windows sin fuentes de emoji mostraba "fallo en blanco").

**Por qué el subtítulo ofrece salida:** un empty state sin acción es un dead end. Si no podés salir, no es UX, es un cartel.

### 3.4 Error

**Capa aplicación** (la API falló, no se puede cargar la lista):
- Inline, en el contenedor. No toast, no alert rojo chillón.
- Texto brand-aware: `text-brand-ink` sobre `bg-white border-surface-border`, con un dot `accent` y label de acción.
- Botón ghost "Reintentar" cuando es recuperable.

**Capa campo** (validación de formulario, asignación inválida):
- Inline al campo. `aria-live="polite"`.
- Color: `text-red-300 bg-red-900/30 border-red-400/40` sobre superficies oscuras (login), `text-red-700 bg-red-50 border-red-200` sobre superficies claras (resto). Ambos pasan WCAG AA.

**Capa red** (sin conexión, timeout):
- Toast con copy específico. "Sin conexión. Reintentaremos al recuperar."
- Refrescar manualmente con un botón "Reintentar" en el bloque afectado.

**Nunca:**
- "Algo salió mal. Intenta de nuevo." (no dice nada, no ofrece salida específica).
- Alert global rojo de pantalla completa. (Asusta. Es desproporcionado para un fallo de carga.)
- Stack traces en producción. (Ni en desarrollo, en realidad — el dev los ve en consola.)

---

## 4. Motion

Motion está reservada a **transiciones de estado**. Animaciones decorativas están prohibidas (ver `DESIGN_SYSTEM §5`).

### 4.1 Cuándo animar

| Caso | Animación | Duración | Easing |
|---|---|---|---|
| Sidebar drawer mobile | slide-in | 200ms | ease-out |
| Toast enter | translate-y(-4px) + opacity 0→1 | 200ms | linear |
| Toast leave | translate-y(-4px) + opacity 1→0 | 200ms | linear |
| Modal backdrop | fade | 0ms (instantáneo) | — |
| Modal content | fade | 0ms (instantáneo) | — |
| Dropdown / menu | aparecer | 0ms (instantáneo) | — |
| Skeleton | pulse | 1.5s loop | ease-in-out |
| Hover de card | shadow lift | 150ms | ease-out |
| Focus ring | ring 2px | 0ms (instantáneo) | — |

### 4.2 Reglas

- **Una propiedad a la vez.** O `transform`, u `opacity`. Nunca ambas en la misma animación (cuesta perf y no aporta).
- **≤ 200ms.** Si necesitás más, el problema no es de motion, es de diseño.
- **Sin bounce, sin spring.** Esto no es un consumer app. Easing lineal o `ease-out`.
- **`prefers-reduced-motion: reduce` honrado globalmente.** Implementado en `client/styles.css` (línea 310-317): todas las animaciones colapsan a 0.01ms. Los `transition-*` también.
- **No animar al cargar vista.** El contenido aparece, no se "revela". Las animaciones de reveal son un tell; evítalas.
- **No animar al cambiar de tab/route.** El nuevo contenido reemplaza al viejo sin fade.

### 4.3 Anti-patterns de motion

- ❌ Hover que cambia más de 1 propiedad (color + transform + shadow simultáneamente).
- ❌ Animación de carga infinita sin ETA.
- ❌ Páginas que aparecen con stagger (cada card entra 100ms después de la otra).
- ❌ "Pulsing dot" usado como decoración (sólo es válido como señal de "en vivo" en notificaciones).
- ❌ Transición de route con slide horizontal.

---

## 5. Real-time

El sistema usa Socket.io para empujar eventos al cliente. El cliente escucha y actualiza las vistas relevantes.

### 5.1 Eventos

| Evento | Disparado por | Vistas que actualiza |
|---|---|---|
| `ticket:created` | Crear ticket | Dashboard (primary list), Tickets list, Notificaciones (counter) |
| `ticket:updated` | Editar metadatos (título, prioridad, categoría) | Dashboard, Tickets list, Ticket detail |
| `ticket:assigned` | Asignar / reasignar | Dashboard, Tickets list, Ticket detail |
| `ticket:status_changed` | Cambio de estado | Dashboard, Tickets list, Ticket detail, Notificaciones |
| `ticket:commented` | Nuevo comentario | Dashboard (activity feed), Ticket detail, Notificaciones |
| `attachment:added` | Subir archivo | Dashboard (activity feed), Ticket detail, Notificaciones |
| `notification:new` | Cualquier evento que genera notif | Campana del topbar, página Notificaciones |

### 5.2 Patrón de actualización

- **Append-only para listas/feeds.** Un `ticket:commented` en el ticket X actualiza el row de X in-place, no re-monta la lista.
- **Counter-only para KPIs.** La triage strip del dashboard sólo cambia el `.kpi-value`, no re-monta el card.
- **Throttle para charts.** El chart de 30 días no se re-pide en cada `commented` (que es el evento más frecuente). Sólo en `created` y `status_changed → cerrado`.
- **Optimistic update** para acciones del usuario actual: marcar notificación leída, asignar, cambiar estado. La UI refleja la acción antes de la respuesta del servidor. Si falla, se hace rollback y toast de error.

### 5.3 Reconexión

- Al reconectar (`socket.connect`), el cliente re-pide el unread count y sincroniza.
- Si la reconexión falla después de N intentos, mostrar un banner discreto: "Reconectando…" con un dot pulsing.
- No silenciar el fallo. El usuario necesita saber que está trabajando offline.

---

## 6. Accesibilidad (WCAG AA — operacional)

`DESIGN_SYSTEM §6` documenta el baseline. Esta sección cubre el **comportamiento accesible**, no los tokens.

### 6.1 Teclado

- **Tab order** sigue el orden visual: header → sidebar (en desktop) → main content → actions.
- **Skip link** oculto pero presente: "Saltar al contenido principal" como primer elemento focusable de la página. (Por agregar en `index.html`.)
- **Atajos descubribles**: `/` enfoca el buscador del topbar (ya implementado). `Esc` cierra modales y dropdowns (ya implementado).
- **`:focus-visible`** en todos los interactivos. Nunca `outline: none` sin reemplazo.
- **Trampa de foco en modales**: `Tab` cyclea dentro del modal, `Esc` lo cierra. (Por reforzar en `modal.js`.)
- **Drag & drop debe tener alternativa por teclado.** El chat composer hoy permite drag & drop para adjuntar; **falta** un botón "Adjuntar archivo" que sea el camino primario de teclado. (El botón ya existe; verificar que sea focusable y anuncie el resultado.)

### 6.2 Screen readers

- Estructura semántica: `<header>`, `<main>`, `<nav>`, `<aside>`, `<section>`, `<article>`.
- `aria-current="page"` en el link activo del sidebar (ya implementado).
- `aria-live="polite"` en toasts, errores de formulario, contador de notificaciones, cambios de estado en chat.
- `role="status"` en spinners de carga inline.
- `<th scope="col">` en headers de tabla (ya implementado en tickets-list, users, categories, reports).
- Iconos decorativos: `aria-hidden="true"`. Iconos con acción: `aria-label` en el botón contenedor.
- Burbujas de chat: el nombre del autor es texto visible (no `aria-label`); el `title` con timestamp absoluto es bonus.
- **No `aria-label` que contradiga el texto visible.** Si el botón dice "Cerrar", su aria-label también dice "Cerrar" (no "Cerrar ticket TCK-0042" — eso lo anuncia el contexto del modal).

### 6.3 Contraste

| Par | Ratio mínimo | Estado |
|---|---|---|
| Body text (`text-brand-ink` `#243447` sobre `bg-surface` `#F7F9FC`) | 4.5:1 | 12.5:1 ✓ |
| Texto login (`text-white/95` sobre glass card) | 4.5:1 | ~6.8:1 ✓ |
| Status badges (texto oscuro sobre tinte claro) | 4.5:1 | varía; validado caso por caso |
| Texto placeholder (`text-slate-500` sobre blanco) | 4.5:1 | 5.7:1 ✓ |
| `text-slate-400` (kpi-hint, microcopy secundario) | 3:1 large / 4.5:1 body | body 3.4:1 ✗ — **corregir a `text-slate-500` o más oscuro** |
| Focus ring (`brand-ocean/40` 2px sobre blanco) | 3:1 | 2.4:1 ✗ — **subir a `brand-ocean` 60% o agregar offset** |

**Acciones pendientes** antes de auditar formalmente:
- Reemplazar todos los `text-slate-400` que están en texto body (no decoration-only) por `text-slate-500`.
- Fortalecer el focus ring. Una opción: ring `brand-ocean` sólido 2px con offset 1px sobre surface.

### 6.4 Motion reducida

`prefers-reduced-motion: reduce` está honrado globalmente en `styles.css`. Pero hay que auditar manualmente:

- Las animaciones de slide-in de la sidebar mobile deben colapsar a instant.
- El `animate-pulse` del skeleton debe colapsar a un estado estático (no opacidad oscilante).
- Los toast enter/leave deben seguir apareciendo (instantáneos), no removidos.

### 6.5 Idioma

- `<html lang="es">` en `index.html` (ya correcto).
- Sin strings en inglés en la UI. `"Loading…"` debe ser `"Cargando…"`. `"No data"` debe ser `"Sin datos"`. Auditar todos los empty states y mensajes de error.

---

## 7. Estados de formulario

### 7.1 Default

Label visible arriba del campo. Placeholder slate-400 con ejemplo, no con label.

```
Título *
[ Resumen breve del problema                          ]
```

### 7.2 Focus

Border `brand-ocean` sólido, ring 2px `brand-ocean/40`. Sin cambio de color de texto.

### 7.3 Filled

Texto `text-brand-ink`. Sin background change.

### 7.4 Error

Border `red-300`, background `red-50`, mensaje `text-red-700` debajo. `aria-invalid="true"` en el input, `aria-describedby` apuntando al mensaje, mensaje con `aria-live="polite"`.

```
Título *
[ Resumen breve del problema                          ]  ← red-300 border, red-50 bg
El título es obligatorio.
```

### 7.5 Disabled

`opacity-50`, `cursor-not-allowed`. Sin background change. Usado raramente — sólo en carga de envío.

### 7.6 Disabled-by-role (no por estado)

Un campo que el usuario actual no puede editar no se "deshabilita" — se **oculta**. El brief del producto dice que cada rol ve lo que le toca; mostrar un campo en gris sugiere "podrías editarlo pero no puedes", que es confuso.

Excepción: campos con valor que el rol no puede cambiar pero necesita ver (ej. estado de un ticket para un supervisor) se renderizan como **texto plano** en el bloque de información, no como input deshabilitado.

---

## 8. Feedback inmediato

Toda acción del usuario tiene que tener un feedback visible en ≤ 100ms.

| Acción | Feedback |
|---|---|
| Click en botón | Cambio de estado visual (hover, pressed) instantáneo. |
| Submit de formulario | Botón se pone disabled + label "Creando…". |
| Submit exitoso | Toast + redirección o actualización de la vista. |
| Submit fallido | Toast de error + campo en error state. |
| Marcar notificación leída | El card se mueve a "leída" con animación de fade (200ms) o reordenado. |
| Asignar ticket | El card de acciones refleja la nueva asignación sin recargar la página. |
| Subir archivo en chat | Preview inmediato + barra de progreso. |
| Cambiar tab/filtro | La vista se actualiza con skeleton inline + contenido. |
| Buscar (`/`) | Foco al input. El usuario ya sabe qué va a pasar. |

**Sin feedback = bug.** Si el usuario hace click y no pasa nada visible en 100ms, va a clickar de nuevo. Doble submit, doble asignación, doble cierre. Ruina operacional.

---

## 9. Navegación y wayfinding

### 9.1 Jerarquía de tres niveles

- **Sección** (visible en sidebar): Operación, Administración, Notificaciones.
- **Pantalla** (link en sidebar): Inicio, Tickets, Reportes, Usuarios, etc.
- **Detalle** (link contextual dentro de pantalla): un ticket, un usuario, una categoría.

La sidebar es el único mapa. La topbar muestra **dónde estoy** en el mapa (título + subtítulo), no provee navegación adicional excepto acciones rápidas y cuenta.

### 9.2 Breadcrumbs

No hay breadcrumbs hoy. Para el detalle del ticket, "Volver a tickets" funciona como crumb. ParaUsers/Categories (vistas planas), no se necesita.

**Cuándo agregar breadcrumbs:** si alguna vista gana un nivel de profundidad (ej. "Detalle de usuario" con sub-página "Tickets de este usuario"). Hoy no hace falta.

### 9.3 Active state

- En el sidebar, el link activo tiene `bg-white/15 text-white` + un dot `brand-ocean` de 6px a la derecha.
- En el topbar, el título de la sección actual es `text-brand-ink` bold; el subtítulo es `text-slate-500` regular.
- En la tab bar de Notificaciones ("Todas" / "No leídas"), la activa tiene `bg-brand text-white`.

**Una sola señal de "estás aquí"** por ubicación. No combines bg, border, color, weight, e icon — una combinación de máximo dos basta.

---

## 10. Búsqueda

### 10.1 Comportamiento

- Atajo `/` enfoca el input del topbar (ya implementado).
- `Enter` en el input navega a `/tickets?q=...` (ya implementado).
- `Esc` limpia y desenfoca.
- Sin búsqueda predictiva, sin resultados inline. La página de tickets muestra los resultados. Esto mantiene el topbar como utilidad, no como mini-search-engine.

### 10.2 Alcance

Busca en: código, título, descripción. No busca en comentarios ni en adjuntos (decisión de scope: demasiado costoso de indexar y rara vez útil).

---

## 11. Errores y recuperabilidad

### 11.1 Tipos de error y respuesta

| Tipo | Respuesta |
|---|---|
| Validación cliente (campo vacío, formato) | Error inline, no se hace submit. |
| Validación servidor (permisos, estado inválido) | Toast de error + rollback optimistic update. |
| Red / timeout | Toast "Sin conexión" + retry automático. |
| 401 (sesión expirada) | Toast + redirect a `/login`. |
| 403 (no autorizado) | Toast "No tienes permisos para esta acción". |
| 404 (recurso no existe) | Pantalla vacía con copy y link de vuelta. |
| 5xx (error servidor) | Toast genérico + log a consola. No mostrar detalles al usuario. |

### 11.2 Destructivos con confirmación

Acciones que **no se pueden deshacer** (cambiar estado a `cerrado`, desactivar usuario, desactivar categoría) requieren modal de confirmación. Acciones reversibles (reasignar, agregar comentario) no.

### 11.3 "Reintentable" vs "no reintentable"

- **Reintentable** (mostrar botón "Reintentar"): carga de lista, fetch de detalle, export.
- **No reintentable** (sólo mensaje): validación servidor (el usuario tiene que cambiar algo), 401 (sesión expirada).

---

## 12. Densidad y ritmo

### 12.1 Ritmo vertical

Una página tiene **tres niveles de separación**:

| Nivel | Espaciado | Uso |
|---|---|---|
| Dentro de un bloque | `gap-2` (8px) | Entre items de una lista, entre label e input. |
| Entre bloques de un view | `gap-6` (24px) | Entre KPIs, charts, listas. |
| Entre vistas | `p-6` page padding | El edge del contenedor. |

Si un view no respeta esta jerarquía, está mal. "Tres espacios distintos" es la disciplina.

### 12.2 Densidad por contexto

| Contexto | Densidad | Justificación |
|---|---|---|
| Tabla (lista de tickets, usuarios) | Alta | Muchas filas por pantalla. Filas de `py-3` con celdas `px-4`. |
| Chat del ticket | Alta-muy alta | Líneas de timeline. `py-2.5` por row, gap-1 entre eventos. |
| Dashboard (primary list) | Alta | Decisión por scan rápido, no por lectura. |
| Dashboard (supporting) | Media | Charts que se miran, no se leen fila por fila. |
| Detalle de ticket (resumen) | Baja | Información que se lee. Más aire, `p-5`. |
| Login | Muy baja | Un solo momento. `p-8`, mucho aire. |
| Modal | Media | Información densa pero efímera. `p-5`. |

### 12.3 Anchos

- Page container: `max-w-7xl mx-auto`. En pantallas grandes, no llenar todo el ancho — el ojo pierde el hilo.
- Lectura de texto: 65-75ch (`max-w-prose` o similar). Aplicar a la descripción del ticket y a la línea de tiempo cuando se hace export a PDF.
- Tablas: `min-w-full` dentro de un wrapper con `overflow-x-auto` para scroll horizontal en mobile.

---

## 13. Performance como UX

Performance es UX. Un dashboard que tarda 3s en pintar ya perdió al usuario.

- **TTI (Time to Interactive) del dashboard < 1.5s** en cable. La mayoría de los datos se piden en paralelo.
- **Skeleton visible en ≤ 200ms** desde el route change. Si tarda más, la transición se siente rota.
- **Charts progresivos:** el chart de 30 días puede llegar 200ms después que los KPIs. No bloquea el primary surface.
- **Realtime no debe re-pintar el DOM entero.** Append / update in-place / counter-only.
- **Imágenes con `loading="lazy"`** (ya implementado en attachments). Nunca bloquear el fold.
- **Sin librerías de animación pesadas.** Lo que hay son transitions CSS nativas. Si en el futuro hace falta más, Framer Motion o GSAP son overhead que no se justifica.

---

## 14. Patrones específicos del dominio

### 14.1 Chat del ticket

- **Orden cronológico ascendente.** El más viejo arriba, el más nuevo abajo. El composer abajo del todo. El usuario está leyendo una conversación.
- **Eventos como separadores.** "Ticket creado", "Asignado a X", "Reasignado de A → B" como pills centradas con líneas extendidas a los costados. No son mensajes — son anotaciones.
- **Adjuntos como mensajes especiales.** Con preview (imagen) o icono + nombre (archivo). No como mensaje aparte — están en línea con el comentario que los acompañó, o solos si no hubo comentario.
- **Composer al final.** Siempre visible si el usuario puede comentar. Si no puede (ticket cerrado, sin permisos), texto explicativo de por qué.

### 14.2 Asignación

- Asignar es **una acción discreta**, no un side-effect de otra. Botón explícito "Asignar / Reasignar" en la card de acciones.
- Modal de asignación: select de usuarios (filtrado a `admin_area` + `jefe_inmediato` con área visible) + notas opcionales.
- Confirmación: toast "Asignación actualizada" + cambio inmediato en el bloque de información.

### 14.3 Cambio de estado

- **Transiciones válidas** dependen del rol (ver `permissions.js nextStates()`). Las acciones inválidas **no se renderizan** — no se muestran en gris, no existen en la UI.
- `cerrado` y `reabierto` requieren confirmación modal (cambios de estado de alto impacto).
- Estados intermedios (`en_proceso`, `solucionado`, `asignado`) piden comentario opcional en un modal chico.

### 14.4 Reasignación

- Caso de uso principal: alguien se va de vacaciones. Cualquier admin/jefe puede cambiar el encargado.
- La reasignación queda registrada como evento en el chat: "Reasignado de A → B (por C)".
- Si el reasignador quiere dejar nota, puede ("sali de vacaciones hasta el 15").

### 14.5 Cierre

- Solo `jefe_inmediato` puede cerrar.
- Cierre pide confirmación. Una vez cerrado, el composer del chat se desactiva con copy: "El ticket está cerrado. No se pueden enviar nuevos mensajes."
- Reabrir es la inversa: jefe puede mover `cerrado → reabierto` (el sistema lo pone en `reabierto` por convención; el siguiente estado lógico es que el admin lo mueva a `en_proceso`).

---

## 15. Anti-patterns de UX (lo que NO se hace)

- ❌ "Welcome back!" / "¡Hola de nuevo!" — microcopy de consumer.
- ❌ Modales con scroll interno infinito — un modal con scroll es un view mal puesto.
- ❌ Toasts para errores recuperables — el usuario pierde el mensaje y la acción.
- ❌ Botones disabled sin copy explicativo — el usuario no sabe por qué no puede hacer click.
- ❌ Filtros que se aplican automáticamente sin confirmación — el usuario quiere ver "Filtrar" como acción explícita.
- ❌ Tablas sin paginación cuando hay > 20 items.
- ❌ Dropdowns con > 7 opciones sin buscador.
- ❌ Inputs sin label visible (placeholder-as-label es WCAG fail).
- ❌ Spinners globales sobre la pantalla — esconde el contenido que ya cargó.
- ❌ Animaciones que se repiten en bucle (excepto skeleton pulse y "live" dot).
- ❌ "Press / to search" como texto inline permanente — es info, va como placeholder + `title` en el kbd chip.
- ❌ Banners de cookies, GDPR, etc. que tapan contenido en el primer load.

---

## 16. Métricas de UX (cómo medimos si esto funciona)

No podemos medir todo, pero algunas señales operativas:

- **Time-to-first-decision**: del login al primer click en una acción. Target: < 30s.
- **Tickets creados sin abandonar el formulario**: > 90%.
- **Tickets que pasan de `recibido` a `asignado` en < 1h**: target por área.
- **Tickets reabiertos sobre el total**: < 10% (señal de que el `solucionado` se está usando mal).
- **Errores 5xx por 1000 acciones**: < 1.
- **% de sesiones sin error de validación**: > 95%.
- **Tiempo medio en dashboard** vs tiempo en `/tickets`. Si el dashboard se usa mucho y `/tickets` poco, el diseño está bien. Si al revés, el dashboard es decoración.

---

## 17. Resumen

- Voz: directa, imperativa, sin adornos.
- Estados: tri-state visible, error recuperable.
- Motion: 200ms max, una propiedad, lineal o ease-out.
- Real-time: append, counter-only, throttle en charts.
- Accesibilidad: WCAG AA, teclado completo, screen reader anunciado, motion reducida.
- Densidad: tres niveles, según contexto.
- Performance: TTI < 1.5s, skeleton en 200ms, no re-mount en realtime.

Esto no es decoración. Es cómo el producto se comporta. Si un PR cambia la voz, la motion, o los estados, es un PR de UX — y necesita revisión de diseño, no sólo de código.