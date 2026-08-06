# Gestión de Cadetes — Frontend (Fase 2) — Diseño

## Contexto

La Fase 1 (backend NestJS) ya está implementada: auth, tenants, customers, deliveries y push, según [`2026-08-06-gestion-cadetes-design.md`](./2026-08-06-gestion-cadetes-design.md). Esta fase construye el frontend Next.js que sirve las tres experiencias definidas en ese spec — mostrador, cadete, cliente autoregistrado — sobre esa API, y suma al backend las piezas que el frontend necesita y que no existían en fase 1.

## Objetivo

Un único frontend Next.js (PWA, mobile-first) que permita: al mostrador buscar/dar de alta clientes y asignar entregas a cadetes; al cadete ver y completar sus entregas asignadas con notificación push; al cliente autoregistrarse, fijar su ubicación y compartir su `short_code`. Diseño minimalista pero con feedback de interacción cuidado en cada acción (polish, no decoración).

## Fuera de alcance (heredado de fase 1)

- Gestión del pedido en sí (qué se compró, precio, pago).
- Reputación de cliente compartida entre tenants distintos.
- Soporte offline robusto — el service worker habilita instalabilidad y push, no una estrategia de caché de datos.

## Cambios respecto del spec de fase 1

Estos ítems no estaban en el diseño del backend y surgen de las necesidades reales del frontend; implican tareas de backend adicionales en esta fase:

- **Auth por cookie httpOnly** en vez de `accessToken` devuelto en el body — más seguro contra XSS, el front nunca toca el JWT directamente.
- **Invitación de staff por link con token**, no contraseña temporal en la respuesta JSON. El invitado completa sus propios datos (nombre, teléfono, email, contraseña) al aceptar la invitación.
- **Campo `email` en `User`**, opcional para clientes, requerido al aceptar una invitación de staff — usado únicamente para recuperación de contraseña (el teléfono sigue siendo el identificador de login).
- **"Olvidé mi contraseña"** vía email automático (proveedor simple tipo Resend), porque a diferencia del link de invitación (que el admin reenvía manualmente por WhatsApp), acá no hay nadie que se lo reenvíe al usuario.
- **Tablero de entregas activas por tenant** para mostrador/admin — hoy el backend solo expone `GET /deliveries/mine`, filtrado al usuario logueado; no alcanza para ver el estado operativo del local completo.

## Decisiones de producto (frontend)

- **Una sola spec para las tres vistas**: comparten la misma app Next.js, el mismo layout de auth y componentes base (mapa, formularios, cards); no se justifica partir el diseño por rol.
- **Selección de tenant activo**: si el usuario tiene 0 memberships → vista de cliente. 1 membership → entra directo a esa rotisería. Más de 1 → selector simple antes de entrar. Evita over-engineering (selector siempre visible) sin romper el caso de usuarios con múltiples rotiserías.
- **Registro público = solo cliente**: la pantalla de `/registro` es para cualquiera que se autoregistra como cliente. El staff (mostrador/cadete) nunca pasa por ahí — llega exclusivamente vía link de invitación del admin. El dueño de una rotisería se registra igual que un cliente y luego crea su tenant desde un CTA secundario ("¿Sos dueño de una rotisería?").
- **Rutas por rol** (`route groups` de Next.js App Router): separación física en carpetas por experiencia, en vez de un dashboard único con visibilidad condicional. Da límites claros de qué ve cada rol sin la sobre-ingeniería de apps separadas (que además contradice la decisión explícita de fase 1 de un único frontend).
- **UI**: shadcn/ui sobre Tailwind — componentes accesibles por defecto, copiados al proyecto en vez de dependencia externa pesada.
- **Testing de componentes**: Vitest + React Testing Library (más rápido que Jest en un proyecto Next.js/ESM), con MSW para mockear la red. Playwright se mantiene para el smoke e2e definido en fase 1.

## Arquitectura

```
Next.js App Router (PWA)
├── app/(auth)/          — login, registro (cliente), invite/[token], forgot-password, reset-password/[token]
├── app/(mostrador)/     — búsqueda/alta de cliente, tablero de entregas, panel admin (invitar staff)
├── app/(cadete)/        — mis entregas asignadas, detalle de entrega (mapa + notas), completar con rating
├── app/(cliente)/       — perfil, ubicación (mapa), short code
├── components/          — LocationPicker (react-leaflet, dynamic import sin SSR), CustomerCard, DeliveryCard, forms (shadcn + react-hook-form + zod)
├── lib/api/             — cliente fetch tipado por recurso (auth, tenants, customers, deliveries, users), hooks de TanStack Query
└── lib/auth/            — lectura de sesión (membership activa), redirect por rol
```

- **Sesión**: cookie httpOnly seteada por el backend en `/auth/login`, `/auth/register` y `/invites/:token/accept`. Cada request del front usa `credentials: 'include'`.
- **Resolución de rol tras login**: `GET /tenants` determina el destino (cliente puro / tenant único / selector).
- **Formularios**: `react-hook-form` + `zod`, schemas espejados de los DTOs del backend, reutilizados entre alta y edición de cliente.
- **Mapa**: un único componente `<LocationPicker>` (react-leaflet + OpenStreetMap) reusado en alta/edición de cliente (mostrador), corrección de pin (cadete) y ubicación propia (cliente).

## Backend — adiciones necesarias para esta fase

1. **`Invite`** (`id`, `tenantId`, `role`, `token` único, `phone?`, `expiresAt`, `usedAt?`).
   - `POST /tenants/:tenantId/invites` (ADMIN) → genera el link (`{ url }`), lo muestra en pantalla para que el admin lo reenvíe manualmente.
   - `GET /invites/:token` → valida y devuelve `{ tenantName, role }` antes de mostrar el formulario de aceptación.
   - `POST /invites/:token/accept` → crea `User` + `Membership` con los datos que completa el invitado; marca el invite como usado.
2. **`email` en `User`** (`String? @unique`).
3. **`PasswordResetToken`** (`id`, `userId`, `token`, `expiresAt`, `usedAt?`).
   - `POST /auth/forgot-password` → dispara email con link de reseteo si el email existe (respuesta genérica siempre, para no filtrar qué emails están registrados).
   - `POST /auth/reset-password` → valida token, actualiza `passwordHash`.
4. **`GET /tenants/:tenantId/deliveries?status=ASSIGNED`** (ADMIN, MOSTRADOR) → todas las entregas activas del tenant, con datos de cliente y cadete, para el tablero.
5. **Auth por cookie**: `/auth/login`, `/auth/register` y `/invites/:token/accept` setean `Set-Cookie` httpOnly + Secure + SameSite=None en vez de devolver `accessToken` en el body. `JwtStrategy` pasa a leer de la cookie. CORS se configura con `credentials: true` y origin explícito del dominio de Vercel.

## Flujos principales

### A. Autenticación

- **Cliente (autoregistro)**: `/registro` → nombre, teléfono, contraseña (email opcional). Sin memberships, aterriza en `(cliente)/perfil`: carga ubicación en el mapa y ve su `short_code` para dictarlo por teléfono/WhatsApp.
- **Staff invitado**: recibe el link (`/invite/[token]`) por WhatsApp de parte del admin. La pantalla valida el token (`GET /invites/:token`) y muestra a qué rotisería y con qué rol lo están invitando antes del formulario (nombre, teléfono, email, contraseña). Token inválido/expirado/usado → mensaje claro, sin reintento automático ("pedile al admin que te reenvíe la invitación").
- **Login**: teléfono + contraseña, único formulario para cualquier rol. Link "olvidé mi contraseña" → email → `/reset-password/[token]` (mismo patrón de validación previa que invite).
- **Alta de rotisería**: cualquier usuario sin memberships ve, además de su perfil de cliente, un CTA secundario ("¿Sos dueño de una rotisería? Creá tu cuenta acá") → `POST /tenants`, pasa a ADMIN de ese tenant.

### B. Mostrador

1. Buscar cliente por teléfono/nombre/`short_code`. Si existe → ficha con ubicación, promedio de rating, notas, historial reciente.
2. Cliente con código pero sin `CustomerRecord` en el tenant → botón "vincular por código" (autocompleta nombre/teléfono/ubicación).
3. Cliente sin código → alta manual con `<LocationPicker>` + notas libres.
4. Desde la ficha del cliente: **"Asignar entrega"** → elige cadete (miembros con rol CADETE del tenant) → `POST /deliveries` (dispara push).
5. **Tablero de entregas** (`(mostrador)/entregas`): todas las `ASSIGNED` del tenant agrupadas por cadete, con reasignar/cancelar inline — punto de entrada para "el cadete no puede, hay que reasignar".
6. **Panel admin** (visible solo si `role === ADMIN`): generar invitaciones (nombre, rol, teléfono opcional), lista de miembros con estado (invitado pendiente / activo).

### C. Cadete

1. Al entrar: lista de "mis entregas asignadas" (`GET /deliveries/mine`), orden por antigüedad — vista principal y respaldo si el push no llegó.
2. Push → tap → abre directo el detalle de esa entrega (mapa, dirección, notas).
3. Desde el detalle: corregir el pin si está mal (mismo `<LocationPicker>`, `PATCH customers/:id`); botón "Completar" → modal de rating (1–5) + nota opcional → `PATCH .../complete`.
4. El cadete también puede cancelar o pedir reasignación de una entrega propia (los guards del backend ya permiten `CADETE` en `reassign`/`cancel`).

### D. Cliente autoregistrado

- Vista mínima: perfil (nombre, teléfono, email opcional, ubicación en mapa), `short_code` grande y compartible (Web Share API si está disponible, si no copia al portapapeles).
- No ve nada de tenants/entregas — no tiene membership en ninguno.

## Diseño visual / UX

- **Base**: shadcn/ui + Tailwind, paleta neutra, mucho espacio en blanco, jerarquía por tipografía antes que por color decorativo. Sin sombras pesadas ni gradientes — minimalismo editorial.
- **"Que se sienta viva"**: foco en feedback de interacción, no en decoración — spinner→check al guardar en vez de un salto brusco, hover/press states con timing corto y consistente, confirmación sutil al fijar un pin en el mapa, toasts con motion en vez de aparecer/desaparecer secos, skeletons (no spinners genéricos) mientras carga TanStack Query. Regla general: toda acción del usuario tiene una respuesta visual inmediata, aunque sea mínima. Al implementar, se usa la skill `emil-design-eng` (y las de diseño minimalista disponibles) como guía concreta de polish.
- **Mobile-first**: mostrador típicamente en tablet/celular del local, cadete siempre en celular. Se diseña para pantalla chica primero.

## PWA y Web Push

- Manifest + service worker instalables desde el día uno (requisito para push en iOS 16.4+).
- Primer login como cadete: banner persistente "Instalá la app" con instrucciones según navegador detectado (iOS Safari vs Android Chrome); dismisseable pero reaparece en la próxima sesión hasta que la PWA esté instalada (`matchMedia('(display-mode: standalone)')`). El permiso de notificaciones se pide recién después de instalada (en iOS, pedirlo antes no tiene efecto).
- Al aceptar el permiso, la `PushSubscription` del navegador se envía a `POST /push/subscribe`.
- Sin caché de datos offline — el service worker solo habilita instalabilidad + push.

## Manejo de errores y casos borde

- Token de invite/reset inválido o expirado → mensaje explícito, nunca un error genérico ni un formulario roto.
- Sin memberships y sin acción tomada → el perfil de cliente es un estado válido, no una pantalla vacía de error.
- Geolocalización denegada → `<LocationPicker>` sigue funcionando con marcado manual; nunca bloquea el flujo.
- Push denegado o no soportado → el cadete sigue operando por "mis entregas asignadas"; ningún flujo depende exclusivamente del push.
- Conflictos de backend (409, 403) → mensaje inline en el formulario que los originó (ej. "ese teléfono ya está registrado"), no un error global.
- `forgot-password` con email no registrado → misma respuesta genérica que con uno registrado, para no filtrar qué cuentas existen.

## Testing

- **Vitest + React Testing Library**: componentes críticos — `<LocationPicker>`, búsqueda de cliente, formulario de asignación de entrega, tarjeta de entrega del cadete, formulario de aceptar invitación. MSW para mockear la red y no depender del backend levantado.
- **Playwright (smoke e2e)**: flujo completo definido en fase 1 — mostrador crea cliente → asigna → cadete recibe y completa → rating se refleja — corriendo contra el backend real de test.

## No funcional / seguridad

- JWT en cookie httpOnly + Secure + SameSite=None; el front nunca lo lee ni lo guarda en JS.
- Tokens de invite y de reset de contraseña son de un solo uso y expiran.
- `forgot-password` no filtra si un email existe o no en el sistema.
- CORS con `credentials: true` y origin restringido al dominio de Vercel.
- Contraseñas siempre hasheadas (bcrypt), igual que en fase 1.

## Stack técnico

- **Frontend**: Next.js (App Router) + TanStack Query, Tailwind CSS + shadcn/ui, react-hook-form + zod, react-leaflet + OpenStreetMap, PWA (manifest + service worker), desplegado en Vercel.
- **Testing**: Vitest + React Testing Library + MSW (componentes), Playwright (smoke e2e).
- **Backend (adiciones de esta fase)**: `Invite` y `PasswordResetToken` en Prisma, envío de email vía Resend (o proveedor equivalente), auth por cookie httpOnly.
