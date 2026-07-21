<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Dashboard — Overrides

## Por rol

| Rol | KPIs principales | CTAs rápidas | Datos destacados |
|-----|------------------|--------------|------------------|
| **supervisor_campo** | Mis tickets, Abiertos, Cerrados | "+ Nuevo ticket", "Ver todos" | Cards de últimos 5 tickets |
| **sac** | Total, Abiertos, Cerrados, Tiempo prom. cierre | Bandeja recibidos, Reabiertos, Usuarios, Reportes | Chart 30 días, por prioridad, top categorías, ranking encargado |
| **admin_area** | Asignados a mí, En proceso, Solucionados, Reabiertos | "Abrir mi lista" | — |
| **jefe_inmediato** | Total área, Abiertos, Cerrados, Solucionados, Reabiertos | "Ir a tickets en Solucionado" | Carga por administrador |

## KPIs

- Card `kpi-card` con label `text-xs uppercase tracking-wider text-slate-500`, value `text-2xl font-bold text-brand-ink`, hint `text-xs text-slate-400`.
- Hover: `shadow-pop` (ya implementado).
- Loading: tres `--` en gris mientras carga.
- **Click-through opcional:** un KPI clickeable debe tener `cursor-pointer` y ripple sutil.

## Charts

- **Barras 30 días:** altura máxima 128px, color `bg-brand-ocean` (NO `bg-sac-400`), barras con `rounded-t`, valor encima de la barra, fecha debajo (`MM-DD`).
- **Barras de prioridad:** color por prioridad (`urgente` → `bg-accent`, `alta` → `bg-amber-500`, resto → `bg-brand-ocean`).
- **Sin datos:** empty state en cada chart, no axes vacías.

## Acciones rápidas (sólo SAC y supervisor)

- 4 botones `.btn.btn-secondary` en grid `grid-cols-2 sm:grid-cols-4` con icono SVG + label.
- En móvil: 2 columnas, scroll vertical natural.

## Realtime

- Indicador "En vivo" con dot pulsante (igual que en `/notifications`).
- Re-render quirúrgico: sólo reemplazar `root.children[1]` (la zona de datos del rol) — **no re-montar el hero header**.

## Header

- Eyebrow `text-xs uppercase tracking-[0.3em] text-brand-ink/70`: "Resumen ejecutivo".
- H1: `text-3xl font-bold text-slate-900` "Hola, {firstName}".
- Subtítulo `text-sm text-slate-500 mt-3` con copy por rol.
- CTAs a la derecha en desktop, debajo en mobile.
