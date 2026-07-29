<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Historial de autoría — GCM Tickets

Respaldo factual para [`NOTICE.md`](../NOTICE.md), preparado para una eventual consulta legal en Honduras sobre la titularidad de este sistema.

## Resumen

- **Total de commits registrados:** 50
- **Autor único en todo el historial:** Miguel Flores (cuenta de control de versiones: `Masato`)
- **Rango de fechas:** 17 de junio de 2026 → 28 de julio de 2026 (en curso), sin interrupción de más de dos semanas salvo el tramo 2026-06-23 → 2026-07-15.
- **Colaboradores de desarrollo distintos al autor:** ninguno — `git log --format="%an" | sort -u` devuelve un único nombre en la totalidad del repositorio.
- **Empresa:** Grupo Milcien S.A. de C.V. (Honduras).
- **Puesto formal del autor durante este periodo:** asistente de soporte.

## Detalle de commits (orden cronológico)

| Fecha y hora | Commit | Mensaje |
|---|---|---|
| 2026-06-17 10:36 | `b88c3da` | first commit |
| 2026-06-17 10:48 | `311d49d` | test CodeRabbit review |
| 2026-06-17 11:17 | `ab32300` | feat: nueva función |
| 2026-06-17 11:53 | `cff393e` | prueba |
| 2026-06-17 11:58 | `4089c72` | primer commit |
| 2026-06-23 13:24 | `396afcb` | orm: migrate tickets.service to TypeORM (batch 3) |
| 2026-07-15 08:40 | `3adcee9` | chore: housekeeping base (deps, env, ignore public/dist) |
| 2026-07-15 08:41 | `b8e90d5` | feat: firestore migration + new modules + UI refresh |
| 2026-07-15 08:42 | `a5d85a9` | docs: product, design system, modules y .impeccable |
| 2026-07-15 15:59 | `0cb733d` | Actualizar proyecto |
| 2026-07-15 16:17 | `a0f8fcc` | Actualizar README |
| 2026-07-15 16:40 | `5f48505` | Actualizar cambios de UI y mailmap |
| 2026-07-15 16:42 | `4a7ad93` | Quitar seed de usuarios y ajustar mailmap |
| 2026-07-15 16:44 | `ba17745` | Eliminar credenciales de seed del README |
| 2026-07-15 17:16 | `946c8fa` | Ajustar build de Vite para Netlify |
| 2026-07-16 08:38 | `3587d72` | fix: configure Netlify SPA fallback and configurable API base |
| 2026-07-16 08:43 | `f23916c` | feat: add Netlify function API endpoints for auth and app routes |
| 2026-07-16 09:02 | `21161aa` | feat: add calendar view and wire dashboard reports navigation |
| 2026-07-16 09:06 | `1393fe0` | feat: expand filters with assigned-to and date-range, improve gantt calendar |
| 2026-07-16 09:10 | `95ef738` | feat: agregar persistencia de filtros en URL para tickets, reportes y calendario |
| 2026-07-16 09:14 | `e0ec459` | feat: agregar componentes reutilizables para filtrado y búsqueda mejorada |
| 2026-07-16 09:17 | `abe6c7a` | feat: agregar visualización de filtros activos como chips interactivos |
| 2026-07-16 09:18 | `3868acd` | feat: agregar utilidades de validación de fechas y alertas visuales |
| 2026-07-16 09:25 | `7b175d2` | fix: mejorar filtros en vista de auditoría - agregar población de usuarios y tipos |
| 2026-07-16 09:34 | `576aa99` | fix: reemplazar stats de Firestore a SQL Server con TypeORM |
| 2026-07-16 09:36 | `92a02fb` | fix: reescribir audit.service.js para usar TypeORM + SQL Server |
| 2026-07-21 10:48 | `ad8eafc` | feat: multitenant fase 0+1 (entidades, smoke, fix BIT↔boolean) + filtros URL/chips + refactor cliente |
| 2026-07-21 11:00 | `3edd7bf` | fix: reescribir stats/audit.service.js a Firebase (era TypeORM muerto) |
| 2026-07-22 08:13 | `41e449b` | Subir todos los cambios |
| 2026-07-22 11:30 | `6e5a8ee` | Fix tickets list matchMedia callback reference |
| 2026-07-22 11:32 | `62e3df5` | Merge pull request #1 from itsxMasato/feature/nueva-funcion |
| 2026-07-22 11:38 | `1eded63` | fix(deploy): wire Firebase Auth login + Render.com backend |
| 2026-07-22 15:38 | `66b3edd` | fix(deploy): disable health check + persistent session store |
| 2026-07-22 15:50 | `702065c` | fix(deploy): ensure session store dir exists in production |
| 2026-07-23 07:56 | `e2ed54c` | Sube los cambios |
| 2026-07-23 08:03 | `ada337d` | Sube los cambios |
| 2026-07-23 08:27 | `c6b7e65` | Sube los cambios |
| 2026-07-23 11:08 | `a2b5c46` | Protección de URL en cliente y ajuste de splash de bienvenida |
| 2026-07-23 11:16 | `45fa297` | Subir cambios nuevos |
| 2026-07-23 11:26 | `4230f0e` | Subir cambios nuevos |
| 2026-07-23 11:31 | `fe62e05` | Fix socket URL in production / prevent WebSocket connect to Netlify frontend |
| 2026-07-23 11:37 | `d177195` | Fix Render session cookies by trusting proxy in production |
| 2026-07-23 11:52 | `5b0b416` | Fix iPhone mobile safe-area and responsive login splash layout |
| 2026-07-23 11:56 | `6c14793` | Fix desktop layout regression caused by 100dvh root sizing |
| 2026-07-23 12:02 | `9acd047` | Make production API and socket base URL detection robust for non-localhost deployments |
| 2026-07-23 13:42 | `4b78034` | chore(deploy): rebuild dist/ con fixes iPhone + routing a Render |
| 2026-07-23 14:24 | `791175b` | Enable temporary SAC delete actions in users view |
| 2026-07-23 15:40 | `764ed6b` | Fix jefe_inmediato visibility for solucionado tickets and sync Firebase auth user state |
| 2026-07-23 16:27 | `73680b7` | Protect base roles from accidental reassignment |
| 2026-07-28 17:03 | `f2df1a6` | Rediseño de login, fix de verificación de contraseña Firebase, y avances multitenant/auditoría |

## Cómo verificar esto de forma independiente

Cualquier persona con acceso al repositorio (incluido un abogado o perito, si hiciera falta) puede reproducir esta tabla ejecutando, en la raíz del proyecto:

```
git log --reverse --format="%ad|%h|%an|%s" --date=format:"%Y-%m-%d %H:%M"
```

y confirmar que el campo de autor (`%an`) es el mismo en las 50 entradas.

## Nota

Este documento registra hechos verificables del control de versiones. No es un dictamen legal ni determina la titularidad de los derechos patrimoniales — ver [`NOTICE.md`](../NOTICE.md) para esa distinción.
