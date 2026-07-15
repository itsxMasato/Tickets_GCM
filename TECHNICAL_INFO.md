# Información Técnica del Sistema — Tickets GCM

> Documento consolidado de arquitectura, stack y requisitos de conexión a la base de datos.
> Generado el 2026-06-26 para presentación interna.
> **Motivo principal:** la base de datos está siendo administrada por Kaspersky, lo que genera errores intermitentes de autenticación/conexión que deben documentarse para poder solicitar soporte formal.

---

## 1. Resumen del sistema

**Nombre:** Tickets GCM (Sistema interno de tickets — Grupo Camarón / GCM)
**Versión:** 0.2.0
**Tipo:** Aplicación web SPA + API REST
**Entorno de ejecución:** Node.js ≥ 18
**Package manager:** pnpm

### Propósito
Centralizar el ciclo de vida de un ticket interno desde `recibido → asignado → en_proceso → solucionado → cerrado`, con rama `reabierto` desde `solucionado` o `cerrado`. Cada rol (supervisor de campo, SAC, admin de área, jefe inmediato) tiene visibilidad y permisos estrictamente delimitados.

### North Star
"Sala de control" para una operación seria: supervisor captura, SAC tria/reasigna, admin de área ejecuta, jefe inmediato cierra y audita. No es un dashboard genérico.

---

## 2. Stack tecnológico

### Backend
| Tecnología | Versión | Rol |
|---|---|---|
| **Node.js** | ≥ 18 | Runtime |
| **Express** | 5.2.1 | Framework HTTP / API REST |
| **express-session** | 1.19.0 | Manejo de sesiones |
| **connect-sqlite3** | 0.9.16 | Store de sesiones |
| **bcrypt** | 6.0.0 | Hash de contraseñas |
| **multer** | 2.1.1 | Upload de adjuntos |
| **socket.io** | 4.8.3 | Notificaciones en tiempo real |
| **uuid** | 14.0.0 | Generación de IDs/códigos |
| **dotenv** | 17.4.2 | Variables de entorno |
| **cookie-parser** | 1.4.7 | Parsing de cookies |

### Persistencia (capa dual)
| Tecnología | Versión | Rol |
|---|---|---|
| **better-sqlite3** | 12.10.1 | BD legacy local (desarrollo y producción actual) |
| **mssql** | 12.5.5 | Driver SQL Server (capa ORM) |
| **typeorm** | 1.0.0 | ORM para SQL Server |
| **reflect-metadata** | 0.2.2 | Requerido por TypeORM |

### Frontend
| Tecnología | Versión | Rol |
|---|---|---|
| **Vite** | 5.4.0 | Bundler y dev server |
| **Tailwind CSS** | 3.4.0 | Estilos utilitarios |
| **JavaScript vanilla** | ES2022 | Lógica de vistas y componentes |

### Dev tools
| Herramienta | Rol |
|---|---|
| **nodemon** | Auto-restart del servidor |
| **concurrently** | Orquestación `dev:all` (CSS + server + cliente) |

---

## 3. Arquitectura del proyecto

### Estructura de directorios
```
Tickets_GCM/
├── client/                  # Frontend (Vite + vanilla JS)
│   ├── api.js               # Cliente HTTP centralizado
│   ├── components/          # Componentes reutilizables
│   │   ├── chat.js
│   │   ├── chat-composer.js
│   │   ├── empty-state.js
│   │   ├── layout.js
│   │   ├── login.js
│   │   ├── modal.js
│   │   ├── sidebar.js
│   │   └── topbar.js
│   ├── views/               # Vistas por ruta
│   │   ├── audit.js
│   │   ├── categories.js
│   │   ├── dashboard.js
│   │   ├── login.js
│   │   ├── notifications.js
│   │   ├── reports.js
│   │   ├── ticket-detail.js
│   │   ├── tickets-list.js
│   │   └── users.js
│   ├── utils/               # Utilidades (DOM, íconos)
│   ├── index.html
│   ├── main.js              # Bootstrap del cliente
│   └── styles.css           # Entrada Tailwind
├── src/                     # Backend
│   ├── server.js            # Entry point
│   ├── app.js               # Bootstrap de Express
│   ├── config/              # Config desde .env
│   ├── db/                  # Capa SQLite (legacy)
│   │   ├── connection.js    # Singleton de better-sqlite3
│   │   ├── migrate.js       # Migración idempotente
│   │   ├── schema.sql       # DDL SQLite
│   │   └── seed.js          # Datos iniciales
│   ├── orm/                 # Capa TypeORM/SQL Server
│   │   ├── datasource.js    # DataSource (conexión perezosa)
│   │   ├── env.js           # Resolución de variables
│   │   ├── enums.js         # Enums compartidos
│   │   ├── naming-strategy.js
│   │   ├── entities/        # 8 EntitySchema
│   │   └── repositories/
│   ├── routes/              # Routers Express (auth, users, categories, tickets, notifications, stats)
│   ├── services/            # Lógica de negocio
│   ├── middleware/          # requireAuth, requireRole, upload, errorHandler
│   ├── sockets/             # Socket.IO
│   └── utils/               # validators, password, time
├── public/                  # Assets estáticos
│   ├── css/
│   ├── dist/                # Build de Vite
│   ├── img/
│   └── videos/
├── scripts/
│   └── orm-smoke.js         # Smoke test de conexión a SQL Server
├── data/                    # BD SQLite local + sesiones
├── uploads/                 # Archivos subidos
├── .env                     # Variables de entorno (NO commiteado)
├── .env.example             # Plantilla
└── package.json
```

### Flujo de arranque
```
pnpm dev:all
  ├── dev:css      → Tailwind watch → public/css/styles.css
  ├── dev:server   → nodemon src/server.js
  │   ├── 1. migrate()        (Aplica schema.sql + seed)
  │   ├── 2. createApp()      (Express + session + rutas)
  │   ├── 3. sockets.setup()  (Socket.IO con sesión compartida)
  │   └── 4. httpServer.listen(PORT)
  └── dev:client   → Vite dev server
```

### Modelos de capas
- **Backend**: rutas → middleware → servicios → ORM/DB
- **Frontend**: router cliente → views → components → utils
- **Auth**: sesiones con cookie `connect.sid` (SQLite store en `data/sessions.db`)
- **Realtime**: Socket.IO comparte `sessionMiddleware` y une al usuario a salas `tickets`, `sac`, `user:<id>`

---

## 4. Modelo de datos

### Roles (4, excluyentes)
| Rol | Código | Responsabilidad |
|---|---|---|
| Supervisor de campo | `supervisor_campo` | Genera tickets en campo (mobile/tablet) |
| SAC | `sac` | Triage global, asignación/reasignación, ve todo |
| Admin de área | `admin_area` | Trabaja tickets de su área (no cierra) |
| Jefe inmediato | `jefe_inmediato` | Cierra / reabre / audita su área |

### Estados de ticket (6)
`recibido → asignado → en_proceso → solucionado → cerrado`
Rama: `solucionado | cerrado → reabierto → en_proceso`

### Prioridades (4)
`baja | media | alta | urgente`

### Áreas (3+1)
`operaciones | logistica | mantenimiento | sistemas | otro`

### Tablas (8 entidades, replica en SQLite y MSSQL)
1. **users** — id, username, password_hash, full_name, email, role, area, active, created_at
2. **categories** — id, name, active, created_at
3. **tickets** — id, code, title, description, category_id, area, status, priority, created_by, assigned_to, closed_by, created_at, updated_at, closed_at
4. **ticket_assignments** — historial de reasignaciones
5. **ticket_comments** — chat del ticket (incluye attachment_id)
6. **attachments** — archivos subidos
7. **notifications** — inbox por usuario (8 tipos)
8. **audit_log** — bitácora de operaciones sensibles

### Matriz de permisos (resumen)

| Acción | supervisor_campo | sac | admin_area | jefe_inmediato |
|---|:-:|:-:|:-:|:-:|
| Crear ticket | ✅ | ✅ | ✅ | ✅ |
| Ver ticket propio | ✅ | ✅ (todos) | ✅ (asignados) | ✅ (su área) |
| Asignar / reasignar | ❌ | ✅ | ❌ | ✅ (su área) |
| Cambiar a `en_proceso` / `solucionado` | ❌ | ✅ | ✅ (asignados) | ❌ |
| Cerrar ticket | ❌ | ✅ | ❌ | ✅ (su área) |
| Reabrir ticket | ❌ | ✅ | ❌ | ✅ (su área) |
| Gestionar usuarios | ❌ | ✅ | ❌ | ❌ |
| Gestionar categorías | ❌ | ✅ | ❌ | ❌ |
| Ver auditoría | ❌ | ✅ | ❌ | ✅ (su área) |

---

## 5. API REST

### Endpoints principales

**Auth** (`/api/auth`)
- `POST /login` — `{ username, password }` → `{ user }`
- `POST /logout`
- `GET /me` — usuario actual (requireAuth)

**Users** (`/api/users`) — solo SAC
- `GET /?role=&active=&area=`
- `POST /` — crear
- `PATCH /:id` — editar

**Categories** (`/api/categories`)
- `GET /`, `POST /`, `PATCH /:id`

**Tickets** (`/api/tickets`)
- `GET /?status=&area=&...` — listado filtrado por rol
- `GET /:id` — detalle
- `POST /` — crear
- `PATCH /:id` — editar metadata
- `POST /:id/assign` — (sac, jefe_inmediato)
- `POST /:id/status` — cambiar estado
- `POST /:id/comments` — comentar
- `GET /:id/comments` — listar comentarios
- `POST /:id/attachments` — subir archivo (multer)
- `GET /:id/history` — historial

**Notifications** (`/api/notifications`)
- `GET /`, `PATCH /:id/read`, `POST /read-all`

**Stats** (`/api/stats`)
- `GET /summary`, `/by-area`, `/by-status`, `/by-priority`

### Middleware
- `requireAuth` — valida `req.session.userId` (401 si falta)
- `requireRole(...roles)` — valida rol (403 si no coincide)
- `upload` — multer para adjuntos (max 10MB por defecto)
- `errorHandler` — formato JSON `{ error: { code, message } }`

### Códigos de error
| HTTP | code | Cuándo |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Datos inválidos |
| 401 | `UNAUTHORIZED` | Sin sesión |
| 403 | `FORBIDDEN` | Rol no permitido |
| 404 | `NOT_FOUND` | Recurso inexistente |
| 409 | `CONFLICT` | Username duplicado |

---

## 6. Variables de entorno (`.env`)

```bash
# === Core ===
PORT=3000
NODE_ENV=development
SESSION_SECRET=<largo-y-aleatorio>
DB_PATH=./data/tickets.db
UPLOAD_DIR=./uploads
MAX_UPLOAD_MB=10

# === SQL Server (TypeORM) ===
# Resueltos por src/orm/env.js
MSSQL_HOST=<host-proporcionado-por-Kaspersky>
MSSQL_PORT=1433
MSSQL_DATABASE=<nombre-BD>
MSSQL_USER=<usuario-Kaspersky>
MSSQL_PASSWORD=<password-Kaspersky>
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
MSSQL_POOL_MAX=10
ORM_SYNCHRONIZE=false
ORM_LOGGING=false
```

> **Nota:** si no se usan las variables `MSSQL_*`, el sistema hace fallback a las legacy `DB_SERVER`/`DB_PORT`/`DB_DATABASE`/`DB_USER`/`DB_PASSWORD`/`DB_ENCRYPT`/`DB_TRUST_SERVER_CERT`.

---

## 7. Conexión a la base de datos administrada por Kaspersky

### 7.1 Contexto del problema
La base de datos del sistema (SQL Server) está siendo **administrada y protegida por Kaspersky** (suite de seguridad corporativa). Esto introduce una capa adicional entre la aplicación y el motor de BD que genera **errores intermitentes de conexión/autenticación**.

### 7.2 Síntomas observados
- Conexión a SQL Server rechazada o cerrada inesperadamente.
- `Login failed for user '<usuario>'` repetido aun con credenciales correctas.
- Timeouts esporádicos en operaciones ORM (`getRepository`, `repo.findOne`, etc.).
- Posibles bloqueos por análisis heurístico / control de aplicaciones.

### 7.3 Arquitectura de la conexión

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  App Node.js     │───▶│ Capa Kaspersky   │───▶│  SQL Server      │
│  (TypeORM/       │    │ (proxy/filter/   │    │  (instancia      │
│   mssql driver)  │    │  authentication) │    │   corporativa)   │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

La capa Kaspersky puede comportarse como:
- **Proxy de autenticación** (intermediario que valida credenciales antes de reenviar).
- **Application control** (filtra qué procesos pueden hablar con el puerto 1433).
- **Inspección TLS** (interrumpe el handshake `encrypt=true`/`trustServerCertificate`).

### 7.4 Configuración actual del driver (`src/orm/datasource.js`)

```js
{
  type: 'mssql',
  host: env.MSSQL_HOST,
  port: env.MSSQL_PORT,             // 1433
  username: env.MSSQL_USER,
  password: env.MSSQL_PASSWORD,
  database: env.MSSQL_DATABASE,
  synchronize: false,               // ⚠️ NO crear tablas automáticamente en prod
  options: {
    encrypt: false,                 // ⚠️ si Kaspersky inspecciona TLS, evaluar
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 15000,
  requestTimeout: 15000,
}
```

### 7.5 Requisitos para conectarse correctamente

#### A. **Conectividad de red**
| Requisito | Detalle |
|---|---|
| Puerto TCP 1433 abierto | Desde el host de la app hacia el servidor SQL Server administrado por Kaspersky |
| Regla de firewall corporativa | Permitir tráfico saliente del proceso Node.js al destino del SQL Server |
| DNS / resolución del host | Confirmar que `MSSQL_HOST` resuelve correctamente (FQDN o IP) |
| Latencia | Estable; la capa Kaspersky no debe introducir RTT excesivo (< 50ms recomendado) |

#### B. **Credenciales y autenticación SQL Server**
| Requisito | Detalle |
|---|---|
| Usuario SQL | Debe estar creado en la instancia (`MSSQL_USER`) |
| Autenticación | SQL Server Authentication (no Windows Auth) — el driver mssql no soporta Kerberos/Windows Auth de forma nativa |
| Permisos mínimos | `db_datareader` + `db_datawriter` + permisos para `DBCC USEROPTIONS` (si se requiere) |
| Política de expiración | Confirmar si Kaspersky aplica rotación periódica — si es así, sincronizar con el equipo de seguridad |
| Password | Largo, sin caracteres especiales que rompan la cadena de conexión (o escaparlos correctamente) |

#### C. **Configuración TLS/SSL**
La capa Kaspersky puede interceptar el handshake TLS. Decidir con el equipo de seguridad:
| Opción | Cuándo usar |
|---|---|
| `MSSQL_ENCRYPT=true` + `MSSQL_TRUST_CERT=true` | Si SQL Server tiene certificado válido y Kaspersky lo permite |
| `MSSQL_ENCRYPT=false` | Si Kaspersky rechaza la conexión cifrada (recomendado en redes internas) |
| `MSSQL_TRUST_CERT=false` | Si el certificado está firmado por CA corporativa conocida |

> ⚠️ **Crítico:** validar con Kaspersky cuál de los dos escenarios (`encrypt=true` o `encrypt=false`) está permitido. Un handshake TLS roto es causa frecuente del error intermitente de conexión.

#### D. **Whitelist en Kaspersky (Application Control / Firewall corporativo)**
Solicitar al equipo de seguridad que autorice:
- **Proceso:** `node.exe` (y la ruta completa de Node.js)
- **Puerto destino:** 1433 (TCP saliente)
- **Host destino:** el `MSSQL_HOST` configurado
- **Frecuencia / horario:** si hay ventanas de mantenimiento, documentarlas

#### E. **Driver y dependencias**
| Requisito | Versión actual | Estado |
|---|---|---|
| `mssql` | 12.5.5 | ✅ Compatible con SQL Server 2017+ |
| `typeorm` | 1.0.0 | ✅ Soporta mssql driver |
| `reflect-metadata` | 0.2.2 | ✅ Requerido por TypeORM |
| `tedious` (transitiva de mssql) | auto | Verificar que no esté bloqueado por Kaspersky |

### 7.6 Diagnóstico de errores de conexión

#### Script de prueba
```bash
pnpm orm:smoke
```
Este script (`scripts/orm-smoke.js`):
1. Inicializa el DataSource de TypeORM.
2. Hace un `COUNT(*)` en cada una de las 8 entidades.
3. Imprime tabla con los conteos (exit 0) o mensaje claro de error (exit 1).

#### Errores típicos y causa probable
| Mensaje | Causa probable |
|---|---|
| `ECONNREFUSED <host>:1433` | Firewall / Kaspersky bloquea el puerto |
| `ETIMEDOUT` | Red o DNS roto, o Kaspersky en modo inspección |
| `Login failed for user '<user>'` | Credencial incorrecta o Kaspersky rechaza la auth |
| `EHOSTUNREACH` | Host mal resuelto o ruta de red bloqueada |
| `ESOCKET` / `Connection lost` | Kaspersky cerró la conexión por heurística |
| `certificate` / `TLS handshake` | Conflicto entre `encrypt` y política de Kaspersky |

### 7.7 Recomendaciones operativas
1. **Manejo de errores en la capa ORM**: actualmente la app bootea aunque SQL Server esté caído (conexión perezosa). Revisar `src/orm/datasource.js:65-77` (initPromise compartida).
2. **Logging de intentos fallidos**: activar `ORM_LOGGING=true` temporalmente para capturar el detalle en stderr.
3. **Reconexión automática**: el `pool` de mssql ya reintenta conexiones; si los errores persisten, considerar `retryAttempts` en opciones del driver.
4. **Monitoreo**: levantar alerta cuando `orm-smoke` falle 3 veces consecutivas.
5. **Respaldo de credenciales**: rotar `MSSQL_PASSWORD` con periodicidad alineada a la política de Kaspersky.

---

## 8. Cómo correr el sistema

### Instalación
```bash
pnpm install
cp .env.example .env
# editar .env con credenciales reales
```

### Comandos
```bash
pnpm dev:all         # CSS + server + client (desarrollo)
pnpm dev:server      # solo backend
pnpm dev:client      # solo frontend
pnpm dev:css         # solo Tailwind watch
pnpm build           # build de producción (CSS + cliente)
pnpm start           # producción (node src/server.js)
pnpm db:migrate      # aplicar schema SQLite + seed
pnpm orm:smoke       # smoke test contra SQL Server
```

### Datos sembrados (`src/db/seed.js`)
| Usuario | Password | Rol | Área |
|---|---|---|---|
| sac | sac123 | sac | — |
| jope | jefe123 | jefe_inmediato | operaciones |
| jlog | jefe123 | jefe_inmediato | logistica |
| jman | jefe123 | jefe_inmediato | mantenimiento |
| aope | area123 | admin_area | operaciones |
| alog | area123 | admin_area | logistica |
| aman | area123 | admin_area | mantenimiento |
| sup1 | sup123 | supervisor_campo | operaciones |
| sup2 | sup123 | supervisor_campo | logistica |

Categorías iniciales: Falla de equipo, Solicitud de mantenimiento, Incidencia en entrega, Solicitud de material, Reporte de novedad, Solicitud de acceso, Otro.

---

## 9. Estado actual del proyecto (al 2026-06-26)

### Migración ORM en curso (lotes completados)
- **Lote 1** (2026-06-23): categorías, notifications, audit
- **Lote 2** (2026-06-23): attachments, auth
- **Lote 3** (2026-06-23): tickets
- **Pendiente (lote 4)**: stats

### Últimos commits relevantes
- `396afcb` — orm: migrate tickets.service to TypeORM (batch 3)
- `4089c72` — primer commit
- `cff393e` — prueba
- `ab32300` — feat: nueva función
- `311d49d` — test CodeRabbit review

### Branch actual
`feature/nueva-funcion` (base para PR contra `main`)

---

## 10. Pendientes / riesgos identificados

| Tema | Detalle |
|---|---|
| Conexión Kaspersky | Errores intermitentes — bloqueante para validación final |
| Capa dual SQLite/MSSQL | Convive por diseño; `stats.service` aún sin migrar |
| Sockets | Salas `tickets`, `sac`, `user:<id>` definidas pero falta verificar emisión de eventos desde servicios |
| Tests automatizados | No hay suite visible — `scripts/orm-smoke.js` es el único test de humo |
| Documentación | Este archivo es la primera consolidación técnica |

---

## 11. Glosario

- **SAC**: Servicio al cliente — rol administrador global del flujo.
- **ORM**: Object-Relational Mapping (TypeORM en este proyecto).
- **Triage**: Proceso de SAC de recibir tickets `recibido` y asignarlos a un área/admin.
- **Reasignación**: Cambio de `assigned_to` (visible en `ticket_assignments`).
- **Bitácora / Audit**: Tabla `audit_log` que registra toda operación sensible.
- **Kaspersky**: Suite de seguridad corporativa que en este proyecto actúa como capa intermedia antes de SQL Server.

---

*Documento generado automáticamente. Para ampliar cualquier sección, contactar al equipo de desarrollo.*