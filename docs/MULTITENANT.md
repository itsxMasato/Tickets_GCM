<!-- Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. -->

# Multi-tenant — Planeación de grupo empresarial

> **Propósito de este documento.** Dejar por escrito, en un solo lugar, la decisión de negocio y la arquitectura técnica para que el sistema pase de "una empresa con un SAC" a "un grupo empresarial con N empresas, cada una con sus propios roles, y un Platform Admin que ve y administra todas". Si los tokens se acaban, este archivo es la fuente de verdad para retomar el trabajo sin pérdida de contexto.
>
> **Audiencia.** Quien administre el sistema (hoy Miguel Flores, su autor), como recordatorio ejecutivo. Cualquier desarrollador o auditor externo que se sume al proyecto.
>
> **Estado.** Aprobado por Miguel el 2026-07-21. Fases 0, 1 y 2 (services + smoke) implementadas. Fases 3 a 11 pendientes. Bug BIT↔boolean resuelto (ver §9.1).

---

## 1. La decisión de negocio

### 1.1 El cambio conceptual

Hoy el sistema modela "una organización". Mañana debe modelar "un **grupo empresarial** con varias organizaciones independientes que comparten la misma plataforma de tickets, pero no se ven entre sí".

| Concepto | Hoy | Mañana |
|---|---|---|
| Unidad organizativa | "GCM" (implícito) | Empresa (explícita, configurable) |
| Quién es el SAC | Un solo SAC global (hoy Miguel) | **Un SAC por empresa** + un **Platform Admin** que ve todo |
| Quién asigna tickets | El SAC global | El SAC de esa empresa |
| Visibilidad de datos | Global | **Aislamiento total por empresa**, bypass solo para platform admin |
| Cantidad de tickets previstos | Cientos/día | Miles/día, con N empresas emitiendo en paralelo |

### 1.2 La regla de oro

> **Cada empresa es una burbuja. Nadie la atraviesa salvo quien tenga el rol de platform admin.**

Esto vale para: tickets, categorías, usuarios, comentarios, asignaciones, attachments, notificaciones, calendar, reportes, auditoría. Todo se filtra por `company_id` antes de cualquier otra regla.

### 1.3 Decisiones cerradas (no se reabren sin conversación)

- ✅ **Aislamiento total por defecto.** Un usuario de la empresa A jamás ve un ticket de la empresa B. Ni siquiera ve que existe.
- ✅ **SAC por empresa + platform admin.** Cada empresa tiene su SAC local. El platform admin es el único que cruza. **No es una identidad fija de una persona** — es el flag `users.is_platform_admin`, transferible desde Usuarios → Editar usuario por quien ya tenga el flag (ver §5.4). Si la persona a cargo hoy deja el puesto, se le otorga el flag a quien la reemplace y luego se le revoca a la saliente; el sistema bloquea quedarse sin ningún platform admin activo.
- ✅ **Multi-membresía.** Un usuario puede pertenecer a varias empresas con roles distintos en cada una. Ejemplo: un jefe puede ser `jefe_inmediato` en GCM Norte y `admin_area` en GCM Sur.
- ✅ **Membresía default.** Si el usuario pertenece a varias, una queda marcada como default y el login va directo a esa (sin selector). Si tiene varias y ninguna es default, el login muestra un selector.
- ✅ **Stack técnico.** TypeORM + SQL Server, sin ninguna dependencia de Firebase/Firestore (cutover completo, ver commit del corte).
- ✅ **Cutover = ventana de mantenimiento de 2-5 min** (Fase 10). La app queda degradada durante la ventana. Backup completo previo.

---

## 2. Vocabulario del modelo

| Término | Significado |
|---|---|
| **Empresa (Company)** | Una organización del grupo. Tiene nombre, slug, color de marca, logo. ID interno autogenerado. |
| **Membresía (Membership)** | El "pase" de un usuario a una empresa, con un rol y un área dentro de ella. Una persona con N membresías = un usuario con N roles en N empresas. |
| **Platform Admin** | Usuario con `is_platform_admin = 1`. Bypass total: ve todas las empresas, todos los tickets, todos los reportes. Es un flag transferible (hoy lo tiene Miguel Flores, autor del sistema), no una identidad fija — ver §5.4. |
| **Tenant scope** | El `company_id` activo en una sesión. Todas las queries del backend se filtran por ese valor. |
| **Área de empresa** | Subdivisión operativa: operaciones, logística, mantenimiento, sistemas, otro. Cada empresa define las suyas. |
| **Permiso por empresa** | Override de un permiso para un rol dentro de una empresa específica. Si no hay override, se usa el default global. |
| **Vista de plataforma** | Modo del platform admin donde ve los datos agregados de todas las empresas a la vez (no impersona, solo agrega). |
| **Switch de empresa** | Acción del platform admin o usuario multi-membresía de cambiar de tenant scope sin re-loguearse. |

---

## 3. Modelo de datos (Fase 1 ✅ implementado)

### 3.1 Entidades nuevas (4)

```text
companies                   — Empresas del grupo. 1 fila por empresa.
                              id, name, slug, is_default, active,
                              color, logo_url, timestamps.

company_areas               — Áreas operativas definidas por empresa.
                              id, company_id, key, name, active.
                              Una empresa tiene sus 5 áreas default:
                              operaciones, logistica, mantenimiento,
                              sistemas, otro.

user_company_memberships    — La tabla central del multi-tenant.
                              id, user_id, company_id, role, area_key,
                              is_default, active, timestamps.
                              UNIQUE (user_id, company_id).

role_permissions            — Overrides de permisos por empresa.
                              id, company_id, role, permission_key, value.
                              UNIQUE (company_id, role, permission_key).
```

### 3.2 Entidades modificadas (6)

| Entidad | Cambio | Estado |
|---|---|---|
| `users` | + `is_platform_admin`; **− `role`, `area`** (migran a `user_company_memberships`) | ✅ |
| `tickets` | + `company_id` | ✅ |
| `categories` | + `company_id`, UNIQUE pasa a `(company_id, name)` | ✅ |
| `calendar_events` | + `company_id` | ✅ |
| `notifications` | + `company_id` (denormalizado para reportes) | ✅ |
| `audit_log` | + `company_id` (denormalizado para reportes) | ✅ |

> **Nota BIT↔boolean (2026-07-21):** 10 columnas booleanas de 6 entidades (`User.active`, `User.is_platform_admin`, `Company.active`/`is_default`, `CompanyArea.active`, `UserCompanyMembership.active`/`is_default`, `RolePermission.value`, `Category.active`, `Notification.read`) están declaradas como `type: 'integer'` con `transformer: bitBoolean()` (`src/orm/transformers.js`). El driver TypeORM 1.0 sobre better-sqlite3 hidrata `type: 'boolean'` siempre como `false`; el transformer preserva el round-trip 1/0↔boolean. **TODO Fase 10:** decidir si el DDL MSSQL emite `INT` (cambia semántica vs. la `BIT` del `schema.sql` legacy) o se hace el `type` driver-aware. Ver §9.1 y [[session-2026-07-21-smoke-multitenant]].

### 3.3 Índices críticos en MSSQL (T-SQL del DBA, fuera de scope código)

```text
IX_tickets_company_status        (company_id, status, created_at DESC)
IX_tickets_company_assigned      (company_id, assigned_to, status)
IX_tickets_company_created       (company_id, created_by, created_at DESC)
IX_tickets_company_area          (company_id, area_key, status)
IX_notifications_company_user    (company_id, user_id, read, created_at DESC)
IX_audit_company_target          (company_id, target_type, created_at DESC)
IX_users_company_active          (company_id, active)
```

### 3.4 Entidades sin cambios funcionales

`ticket_assignments`, `ticket_comments`, `attachments` heredan el tenant por JOIN a `tickets`. El service filtra siempre por el `company_id` del ticket padre.

---

## 4. Modelo de roles

### 4.1 Antes (1 rol global por usuario)

```
users.role = 'supervisor_campo' | 'sac' | 'admin_area' | 'jefe_inmediato'
users.area = 'operaciones' | 'logistica' | 'mantenimiento' | 'sistemas' | 'otro'
```

### 4.2 Después (rol por membresía + flag global)

```
users.is_platform_admin = 0 | 1
user_company_memberships.role   = 4 valores, igual que antes
user_company_memberships.area_key = 5 valores, igual que antes
```

**Diferencia clave:** el rol ya no vive en el usuario. Vive en la membresía. Un mismo usuario puede ser `jefe_inmediato` en la empresa A y `admin_area` en la empresa B. Su rol activo depende de qué membresía está cargada en la sesión.

### 4.3 Tabla de quién-puede-qué

| Acción | supervisor_campo | admin_area | jefe_inmediato | sac | platform_admin |
|---|---|---|---|---|---|
| Crear ticket | ✅ (su empresa) | ✅ (su empresa) | ✅ (su empresa) | ✅ (su empresa) | ✅ (cualquiera) |
| Asignar ticket | ❌ | ❌ | ❌ | ✅ (su empresa) | ✅ (cualquiera) |
| Cambiar estado | ❌ (solo comentarios) | ✅ (su empresa, no cierra) | ✅ (cierra, reabre) | ✅ (no cierra) | ✅ (todo) |
| Ver tickets del área | propios | los de su área | los de su área (por estado) | todos los de la empresa | todos |
| Gestionar usuarios | ❌ | ❌ | ❌ | ✅ (su empresa) | ✅ (todas) |
| Gestionar categorías | ❌ | ❌ | ❌ | ✅ (su empresa) | ✅ (todas) |
| Gestionar permisos | ❌ | ❌ | ❌ | ✅ (su empresa) | ✅ (todas) |
| Ver reportes | propios | los de su área | los de su área | todos de la empresa | todos de todas |
| Crear empresas | ❌ | ❌ | ❌ | ❌ | ✅ |
| Ver auditoría | ❌ | ❌ | ❌ | ✅ (su empresa) | ✅ (todas) |

### 4.4 canView de jefe_inmediato — semántica cerrada

- El jefe inmediato ve los tickets de **su área** + **en estado `solucionado`** (los que están listos para cerrar).
- Confirmado por Miguel el 2026-07-21.
- Multi-tenant: además, filtra por `company_id` de su membresía activa.
- El filtro de "listos para cerrar" es semántica de visibilidad, no un quick-filter de UI. La UI puede agregar un quick-filter encima sin contradicción.

---

## 5. Modelo de sesión y middleware

### 5.1 Sesión (lo que se guarda en `req.session`)

```js
req.session.userId            // int, nunca cambia durante la sesión
req.session.activeCompanyId   // int, cambia con switch-company
req.session.activeMembership  // { companyId, role, areaKey, isDefault }
req.session.isPlatformAdmin   // bool, mirror de users.is_platform_admin
```

### 5.2 req.user (lo que el middleware `requireAuth` arma)

```js
req.user = {
  id:               1,
  username:         'miguel',
  full_name:        'Miguel Flores',
  isPlatformAdmin:  true,
  memberships: [
    { companyId: 1, company: { name: 'GCM Central', slug: 'gcm-central', color: '#0b1e3a' }, role: 'sac', areaKey: null, isDefault: true },
    { companyId: 2, company: { name: 'GCM Norte',  slug: 'gcm-norte',  color: '#1e3a5f' }, role: 'jefe_inmediato', areaKey: 'operaciones', isDefault: false },
  ],
  activeMembership: { companyId: 1, role: 'sac', areaKey: null },
  company:          { id: 1, name: 'GCM Central', slug: 'gcm-central', color: '#0b1e3a', logo_url: null },
}
```

### 5.3 Middleware

- **`requireAuth`** — Lee sesión, carga memberships activas, arma `req.user`. Si la sesión no tiene membresía activa y la ruta lo requiere, rechaza con 401.
- **`requireCompany`** (NUEVO, Fase 3) — Asegura que hay un tenant activo. Si no, 403 `TENANT_REQUIRED`.
- **`requirePermission(key)`** (NUEVO, Fase 7) — Lee el rol activo + override de empresa para `key`. Si no, 403.
- **Platform admin bypass** — `requirePermission` retorna `true` si `req.user.isPlatformAdmin` (excepto para `manageCompanies`, que también puede).

### 5.4 Transferencia del rol de platform admin (continuidad del negocio)

El platform admin **no es una identidad fija de una persona** — es el flag `users.is_platform_admin`, y cualquier usuario puede tenerlo. Esto es deliberado: si quien lo tiene hoy deja el puesto, el acceso al sistema no debe depender de que esa persona siga disponible.

**Cómo transferirlo:**

1. Quien ya es platform admin va a Usuarios → Editar usuario de la persona que va a asumir, y marca el checkbox **"Administrador de plataforma"**. Guardar.
2. Confirmar que la nueva persona puede operar (crear tickets sin empresa activa, gestionar todas las empresas, etc.).
3. Editar a la persona saliente y desmarcar el checkbox (o desactivar su cuenta directamente).

**Protecciones ya implementadas** (`auth.service.js:updateUser`):

- Solo alguien que **ya** es platform admin puede otorgar o revocar el flag — un SAC común no puede.
- No se puede revocar el flag al **único** platform admin activo (`403 FORBIDDEN`), ni tampoco desactivar esa cuenta como atajo para saltarse la protección — ambos caminos se validan.

**Vía de emergencia (sin acceso a la UI):** `node scripts/set-platform-admin.js <id> [true|false]` contra SQL Server directamente — requiere acceso a las credenciales `MSSQL_*` del entorno, no a una cuenta de usuario específica de la app. Documentar quién en la organización tiene ese acceso (además de quien hoy es platform admin) es la única pieza que sigue dependiendo de coordinación humana, no de código.

---

## 6. Endpoints nuevos (referencia)

### 6.1 Auth

| Método | Ruta | Body | Devuelve |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, password, companyId?}` | `{user, memberships, activeMembership, activeCompany}` o 401 |
| POST | `/api/auth/switch-company` | `{companyId}` | nuevo contexto activo o 403 |
| GET  | `/api/auth/companies?username=...` | — | array de empresas donde ese user tiene membresía (rate-limited, sin auth) |
| GET  | `/api/auth/me` | — | usuario con membresía activa (existente, se extiende) |

### 6.2 Empresas (Fase 2)

| Método | Ruta | Permiso |
|---|---|---|
| GET    | `/api/companies` | autenticado (ve solo las suyas; platform admin ve todas) |
| GET    | `/api/companies/:id` | autenticado (si es miembro) |
| POST   | `/api/companies` | `isPlatformAdmin` |
| PATCH  | `/api/companies/:id` | `isPlatformAdmin` |
| DELETE | `/api/companies/:id` | `isPlatformAdmin` (soft delete) |

### 6.3 Membresías (Fase 2)

| Método | Ruta | Permiso |
|---|---|---|
| GET    | `/api/users/:userId/memberships` | autenticado (si es a sí mismo, o platform admin) |
| POST   | `/api/users/:userId/memberships` | `manageUsers` o `isPlatformAdmin` |
| PATCH  | `/api/users/:userId/memberships/:id` | `manageUsers` o `isPlatformAdmin` |
| DELETE | `/api/users/:userId/memberships/:id` | `manageUsers` o `isPlatformAdmin` |
| GET    | `/api/companies/:companyId/memberships` | autenticado (si es miembro) |

### 6.4 Stats cross-tenant (Fase 8)

| Método | Ruta | Permiso |
|---|---|---|
| GET    | `/api/stats/dashboard` | autenticado (scope de su empresa) |
| GET    | `/api/stats/companies` | `isPlatformAdmin` (agregado por empresa) |
| GET    | `/api/stats/companies/:id/dashboard` | `isPlatformAdmin` (detalle de una empresa) |

---

## 7. Comportamientos clave

### 7.1 Login con selector

1. Usuario escribe username + password.
2. Backend valida. Carga todas las membresías activas.
3. Si hay 1 sola membresía → entra directo.
4. Si hay varias, una es default → entra directo a la default.
5. Si hay varias, ninguna es default → muestra selector visual con el listado. Usuario elige.
6. Si es platform admin y memberships > 1 → selector incluye "Vista de plataforma (todas)" como opción.

### 7.2 Aislamiento de queries — defensa en profundidad

El filtro `company_id` se aplica en **dos capas**:

- **Capa 1 (servicio):** cada función del service recibe `companyId` y lo pasa a las queries.
- **Capa 2 (repositorio):** las queries SQL tienen `WHERE company_id = ?` además de la lógica de rol.

Si la capa 1 tiene un bug, la capa 2 todavía filtra. Si la capa 2 tiene un bug, la capa 1 todavía filtra. Para validar esto, existe el smoke test #5 que prueba acceso cross-tenant con un usuario de otra empresa y espera **404** (no 403, para no leakear existencia).

### 7.3 Categorías únicas por empresa

Una categoría "Falla de caldera" puede existir en la empresa A y otra con el mismo nombre en la empresa B sin colisión. El constraint `UNIQUE (company_id, name)` lo garantiza. La vista `/categories` lista solo las de la empresa activa.

### 7.4 Auditoría cross-tenant

`audit_log.company_id` se denormaliza. La vista `/audit` del platform admin puede:
- Filtrar por empresa específica.
- Ver todas las empresas con un selector arriba.
- Exportar auditoría consolidada para compliance.

### 7.5 Rollback de emergencia

Si algo se rompe post-cutover y bloquea el acceso:

```sql
UPDATE users SET is_platform_admin = 1 WHERE id = X;
```

El usuario X ahora es platform admin, ve todo, puede arreglar lo que sea. El acceso al SQL Server requiere DBA; documentar este comando en el runbook.

---

## 8. Roadmap de implementación

Cada fase termina con un commit autocontenido y un smoke test. Si una fase falla, se puede revertir sin tocar las siguientes.

| # | Fase | Estado | Sesiones |
|---|---|---|---|
| 0 | Resolver divergencia HEAD↔WT, restaurar stats/audit a TypeORM | ✅ | 1 |
| 1 | Schema y migración: 4 entidades nuevas + company_id en 6 existentes | ✅ | 1 |
| 2 | Services (companies, company-areas, memberships) + smoke unit-level + fix BIT↔boolean | ✅ (rutas ⏳, entran en Fase 3) | 1 |
| 3 | Auth multi-tenant: login multi-membresía, switch-company, requireCompany, **rutas companies/areas/memberships** | 🔜 | 1 |
| 4 | Frontend: login multi-paso + store con tenant | 🔜 | 1 |
| 5 | Brand contextual: logo, color, nombre de empresa en sidebar/topbar | 🔜 | 0.5 |
| 6 | Reescritura de services: tickets, attachments, notifications, audit, calendar con company_id | 🔜 | 2 |
| 7 | Permisos por empresa: role_permissions, requirePermission, aplicación en rutas | 🔜 | 1 |
| 8 | Stats multi-tenant: dashboard scoped + endpoints cross-tenant para platform admin | 🔜 | 1 |
| 9 | Vistas admin con scope: users, categories, audit, reports, dashboard, company-switcher | ✅ (view /companies + docs/module-companies.md cerrados 2026-07-21; resto 🔜) | 1 |
| 10 | Migración a prod: seed-multitenant.js, validación, cutover, **decisión DDL BIT vs INT** | 🔜 | 1 |
| 11 | Limpieza: borrar firestoreData.js (si aplica), actualizar docs, docs/MULTITENANT.md | 🔜 | 0.5 |

**Total:** ~9-10 sesiones de trabajo concentrado. Paralelizable Fases 2+4+5 (frontend) con Fases 6+7+8 (backend core) si hay dos personas.

---

## 9. Smoke tests

### 9.1 `scripts/smoke-multitenant.js` (✅ creado y pasando, Fase 2)

Smoke **funcional sin HTTP** de los 3 services nuevos (companies, company-areas, memberships). Cubre las rutas críticas del CRUD sin levantar Express, contra una DB SQLite **temporal** (`data/smoke-multitenant.db`) que se borra al final. Corre con `pnpm run smoke:multitenant` (declarado en `package.json`).

Fases:

1. **Row counts** de las 4 entidades nuevas (`companies`, `company_areas`, `user_company_memberships`, `role_permissions`) — sanity de la conexión.
2. **Funcional:** crea 2 empresas, 2 áreas, 2 membresías (multi-membresía), valida que `listByUser` las devuelva con `company` denormalizado, hace `softDelete` de una, valida que `listByUser` (sin `activeOnly`) la siga viendo con `active=false`.
3. **Cleanup:** soft-delete idempotente en cascada (membership → area → company) y borrado del user de smoke.

Pre-requisito: `DISABLE_MSSQL=true` (ya está en `.env`); el script NO toca MSSQL — cae automáticamente a SQLite vía `datasource.js`.

**Estado al cierre de Fase 2 (2026-07-21):** `node --check` y `require()` ✅. Smoke **3/3 fases OK** después del fix BIT↔boolean.

#### Bug BIT↔boolean — surfaced y resuelto

El smoke **falló en Fase 2** al crear la membresía: `validateAreaKey(companyId, 'smoke-area')` no encontraba el área recién creada. Causa raíz: `repo.insert({ ..., active: 1 })` persistía `1`/`0` en SQLite, pero el `repo.findOne` de vuelta devolvía `active: false` en las columnas declaradas como `{ type: 'boolean' }`. Confirmado en repro mínimo con `User`, `Company` y `CompanyArea` — el driver TypeORM 1.0 sobre better-sqlite3 siempre hidrata `type: 'boolean'` como `false`.

**Decisión de fix:** `type: 'boolean'` → `type: 'integer'` con `transformer: bitBoolean()` (`src/orm/transformers.js` retorna `{ to: v => v ? 1 : 0, from: v => v === 1 || v === true }`). 10 columnas en 6 entidades migradas: `User.is_platform_admin`/`active`, `Company.active`/`is_default`, `CompanyArea.active`, `UserCompanyMembership.active`/`is_default`, `RolePermission.value`, `Category.active`, `Notification.read`.

**Re-validación post-fix:** `node --check` ✅ en `transformers.js` + 7 entidades. `pnpm run smoke:multitenant` ✅ **3/3 fases OK**.

**TODO arquitectónico para Fase 10 (cutover):** TypeORM 1.0 emite el `type` declarado en el EntitySchema al DDL. Como hoy las columnas son `integer` en entities, `synchronize=true` (o regenerar DDL) emitiría `INT`, no `BIT`. Opciones: (1) dejar `integer` y aceptar `INT` en MSSQL (cambia semántica vs. la `BIT` del `schema.sql` legacy); (2) hacer el `type` driver-aware (`type: process.env.MSSQL_HOST ? 'boolean' : 'integer'`); (3) heredar un column-type custom que diga `bit` para MSSQL y `integer` para SQLite. Por ahora se eligió (1) sin tocar el schema MSSQL real porque `synchronize=false` y el DBA replica el `BIT` en T-SQL. Decisión a cerrar antes de Fase 10.

### 9.2 HTTP smoke (NUEVO, Fase 10)

`scripts/smoke-multitenant-http.js` (a crear en Fase 10): smoke HTTP contra el server levantado. Misma cobertura que el funcional pero ejercitando middleware y rutas:

1. **Crear empresa.** `POST /api/companies` con sesión de platform admin → 201 con `{id, name, slug}`.
2. **Asignar membresía.** `POST /api/users/:id/memberships` → 201.
3. **Login con selector.** `POST /api/auth/login` → 200 con array de memberships.
4. **Switch de empresa.** `POST /api/auth/switch-company` → 200 con nuevo activeMembership.
5. **Aislamiento cross-tenant.** Usuario de empresa 1 intenta ver ticket de empresa 2 → **404** (no 403).
6. **Platform admin bypass.** `GET /api/tickets/9999` con sesión de Miguel → 200.
7. **Stats cross-tenant.** `GET /api/stats/companies` con sesión de Miguel → 200 con array.
8. **Permisos por empresa.** Override de `viewReports` para `admin_area` en empresa 1 → usuario de empresa 1 no ve `/reports`, mismo usuario en empresa 2 sí.

---

## 10. Riesgos críticos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Migración de datos pierde registros | Media | Backup completo antes del cutover. Script con dry-run. Validación post con counts. |
| canView regression de jefe_inmediato se arrastra al multi-tenant | Alta (ya casi) | Resolver en Fase 0 ✅. La regla cerrada es "por estado" y se documenta acá. |
| Performance: queries multi-tenant más lentas | Baja | Índices compuestos desde el inicio. Probar con dataset de 10k tickets. |
| Platform admin impersonation abusada | Baja (es Miguel) | Audit log de cada switch-company. Rate limit en el endpoint. |
| Usuarios no notan el nuevo paso del login | Media | Membresía default marcada → la mayoría entra en 1 paso. Onboarding doc. |
| Firestore a SQL Server no validado en runtime | Alta | Fase 0: validar con seed real. Fase 1: probar queries con datos reales antes de multi-tenant. |
| **Bug BIT↔boolean en columnas booleanas (RESUELTO)** | Alta | ✅ Fix en Fase 2: `type: 'boolean'` → `type: 'integer'` + `transformer: bitBoolean()` en 10 columnas de 6 entidades. Smoke multi-tenant 3/3 OK. **Pendiente decisión arquitectónica** (DDL `BIT` vs `INT`) para Fase 10. |

---

## 11. Archivos críticos a tocar (resumen ejecutivo)

### Backend — crear

```
src/orm/entities/company.entity.js                          ✅
src/orm/entities/company-area.entity.js                     ✅
src/orm/entities/user-company-membership.entity.js          ✅
src/orm/entities/role-permission.entity.js                  ✅
src/orm/transformers.js                                     ✅ Fase 2 (bitBoolean)
src/services/companies.service.js                           ✅ Fase 2
src/services/company-areas.service.js                       ✅ Fase 2
src/services/memberships.service.js                         ✅ Fase 2
src/routes/companies.routes.js                              🔜 Fase 3 (junto con requireCompany)
src/routes/company-areas.routes.js                          🔜 Fase 3
src/routes/memberships.routes.js                            🔜 Fase 3
scripts/smoke-multitenant.js                                ✅ Fase 2 (unit-level; HTTP en Fase 10)
src/middleware/requireCompany.js                            🔜 Fase 3
src/middleware/permissions.js                               🔜 Fase 7
src/db/seed-multitenant.js                                  ✅
```

### Backend — modificar

```
src/orm/entities/{user,ticket,category,calendar-event,
                  notification,audit-log}.entity.js         ✅
src/services/auth.service.js                                🔜 Fase 3
src/services/tickets.service.js                             🔜 Fase 6
src/services/attachments.service.js                         🔜 Fase 6
src/services/notifications.service.js                       🔜 Fase 6
src/services/audit.service.js                               🔜 Fase 6
src/services/calendar.service.js                            🔜 Fase 6
src/services/stats.service.js                               🔜 Fase 8
src/services/roles.service.js                               🔜 Fase 7
src/services/categories.service.js                          🔜 Fase 9
src/services/users.service.js                               🔜 Fase 9
src/middleware/requireAuth.js                               🔜 Fase 3
src/db/migrate.js                                           ⛔ no tocar (SQLite legacy)
src/db/schema.sql                                           ⛔ no tocar (SQLite legacy)
src/config/index.js                                         🔜 Fase 12
src/app.js                                                  🔜 Fase 2
```

### Frontend — crear

```
client/components/company-switcher.js                       🔜 Fase 9
client/views/companies.js                              ✅ Fase 9
docs/module-companies.md                               ✅ Fase 9
```

### Frontend — modificar

```
client/store.js                                             🔜 Fase 4
client/main.js                                              🔜 Fase 4
client/views/login.js                                       🔜 Fase 4
client/views/{users,categories,tickets-list,ticket-new,
             ticket-detail,reports,audit,dashboard,
             roles,calendar}.js                             🔜 Fase 9
client/components/{sidebar,topbar,layout}.js                🔜 Fase 5
client/utils/permissions.js                                 🔜 Fase 7
client/api.js                                               🔜 Fase 4
```

### Eliminar (eventual, Fase 11)

```
src/firestoreData.js     — ✅ eliminado (cutover completo a SQL Server)
```

### Documentación

```
docs/MULTITENANT.md                — ESTE DOCUMENTO ✅
TECHNICAL_INFO.md                  — actualizar con multi-tenant
USER_FLOWS.md                      — actualizar flujos cross-tenant
PRODUCT.md                         — actualizar register=multi-tenant
```

---

## 12. Convenciones heredadas (no se cambian)

- **Comentarios en header:** `/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */` en cada archivo tocado.
- **Async por convención:** Todos los services que tocan DB son `async`. Las queries de TypeORM usan `await getRepository(Entity)`.
- **Transacciones:** `await AppDataSource.transaction(async manager => { ... })` para operaciones multi-tabla.
- **Shape legacy:** Los services mantienen el shape de retorno legacy mientras se migra el frontend en paralelo.
- **T-SQL fuera de scope:** El DBA replica las constraints y los índices. La capa ORM declara solo columnas y relaciones lógicas.
- **Nombres en español:** Toda la UI en español. Strings de multi-tenant ("Plataforma", "Cambiar empresa") también en español. i18n queda para después.
- **Validación visual:** WCAG AA mínimo. Focus ring visible. Cierre con Esc. Tooltip en flujos no descubribles.

---

## 13. Cierre

Cuando las 11 fases estén verdes, el sistema pasa de "una empresa con un SAC" a "un grupo empresarial con N empresas, cada una con su propio SAC, y un platform admin que ve y administra todas". El precio: ~10 sesiones de trabajo. El beneficio: la plataforma escala a "miles de tickets por día" sin reescritura, y quien tenga el rol de platform admin puede vender el sistema a otras empresas del grupo sin tocar código de permisos — y ese rol se transfiere sin depender de que sea siempre la misma persona (§5.4).

**Documentación detallada de la vista de empresas**: `docs/module-companies.md` (creada al cerrar Fase 9 — explica el view `/companies`, sus 3 modales, contratos HTTP y eventos realtime).

**Recordatorio final:** si los tokens se acaban, este documento + la memoria de [[session-2026-07-21-multitenant-fase-0-1]] + el plan original multi-tenant son la fuente de verdad. Volver a leerlos antes de continuar cualquier fase pendiente.

— Miguel Flores, autor del sistema.
