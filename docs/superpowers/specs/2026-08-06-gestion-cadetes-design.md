# Gestión de Cadetes — Diseño

## Contexto y problema

Rotiserías en Argentina (caso de referencia: Paraná) que trabajan con cadetes de delivery pierden tiempo porque actúan de intermediarios: el cadete llama al mostrador para pedir la dirección exacta de un cliente, ya que muchas direcciones son confusas o la numeración de calle no es confiable. Además, no hay forma sistemática de recordar qué clientes son "buenos" o "problemáticos" (ej. no atiende, dirección difícil, mascota suelta).

## Objetivo

Una app que sirva como base de datos de clientes por rotisería, asociando cada cliente a una ubicación real en un mapa (no solo la dirección en texto), a una puntuación construida a partir del historial de entregas, y a notas libres sobre el cliente o la vivienda. Además, permitir que los propios clientes se autoregistren y compartan un código corto para que cualquier rotisería los sume rápido a su base, sin tener que volver a cargar todos sus datos desde cero.

## Fuera de alcance (explícito)

- La app **no** gestiona el pedido en sí (qué se compró, precio, pago, estado de preparación). Eso se sigue resolviendo como hoy (teléfono, WhatsApp, otro sistema). El único evento que la app modela es la **asignación de una entrega a un cadete** (cliente + quién la lleva), no el pedido completo.
- No hay reputación de cliente compartida entre rotiserías distintas: cada rotisería tiene su propia base de clientes privada. El "código" del cliente autoregistrado solo sirve para autocompletar datos de contacto/ubicación al vincularlo, nunca para compartir notas o puntuación entre negocios.
- Soporte offline robusto para el cadete no es un requisito del MVP.

## Decisiones de producto

- **Multi-tenant desde el día uno**: cada rotisería (`Tenant`) tiene su propio espacio aislado de clientes y personal, pensando en ofrecer esto a más de una rotisería sin migrar el modelo de datos después.
- **Roles dentro de una rotisería**: `admin` (dueño, invita personal), `mostrador`, `cadete`. El alta de personal la hace el admin invitando por teléfono — no hay autoregistro con aprobación.
- **Ubicación en mapa**: cualquier rol puede fijar o corregir el pin (mostrador al cargar, cliente al autoregistrarse, cadete al llegar y notar que estaba mal puesto). El cadete suele ser quien mejor sabe corregirlo, porque es quien efectivamente llega a la casa.
- **Notas de cliente/vivienda**: texto libre (ej. "rejas negras", "perro suelto"), sin categorías predefinidas para el MVP.
- **Puntuación**: escala 1–5 por entrega completada; el perfil del cliente muestra el promedio de sus entregas.
- **Notificación al cadete**: Web Push dentro de la PWA cuando se le asigna una entrega, con respaldo de una lista de "mis entregas asignadas" dentro de la app por si el push no llega.
- **Compartir el código de cliente**: código corto (ej. 6 caracteres) que el cliente dicta por teléfono/WhatsApp al llamar por primera vez a una rotisería nueva; el mostrador lo busca en la app y vincula al cliente autoregistrado, autocompletando nombre, teléfono y ubicación.
- **Autenticación**: teléfono + contraseña (identificador natural en Argentina, sin depender de un proveedor de SMS externo).
- **Mapas**: OpenStreetMap + Leaflet (sin costo variable por uso, suficiente cobertura de calles).

## Arquitectura

```
┌─────────────────────┐      REST (JSON)      ┌──────────────────────────┐
│  Next.js (TanStack   │  ───────────────────▶ │  NestJS API               │
│  Query) + Tailwind   │                        │  (autohosteado, Barcelona)│
│  PWA — Vercel         │ ◀───────────────────  │                            │
└──────────────────────┘   Web Push (VAPID)     └───────────┬──────────────┘
                                                              │
                                                    ┌─────────▼─────────┐
                                                    │   PostgreSQL       │
                                                    │   (mismo servidor) │
                                                    └────────────────────┘
```

- Un único frontend Next.js sirve las tres experiencias (mostrador, cadete, cliente autoregistrado) con vistas/rutas distintas según el rol — no son tres apps separadas.
- PWA instalable (manifest + service worker) para que mostrador y cadetes la usen como app desde el celular, y para habilitar Web Push.
- NestJS expone una API REST versionada, con CORS configurado para aceptar el dominio de Vercel.
- Postgres vive en el mismo servidor autohosteado que el backend (más simple de operar al principio; separable después si hace falta escalar).
- **Limitación conocida**: Web Push en iOS/Safari solo funciona si el cadete instaló la PWA en la pantalla de inicio (iOS 16.4+). Suficiente para el MVP, pero el onboarding del cadete debe incluir ese paso explícitamente.

## Modelo de datos

**`User`** (cuenta global — staff y clientes autoregistrados comparten la misma tabla de identidad)
- `id`, `name`, `phone` (único, es el login), `password_hash`
- `short_code` (único, se genera si el usuario se autoregistra como cliente)
- `home_location` (lat/lng + texto de dirección), editable por el propio usuario

**`Tenant`** (la rotisería)
- `id`, `name`, `contact_info`

**`Membership`** (rol de un `User` dentro de un `Tenant`)
- `user_id`, `tenant_id`, `role` (`admin` | `mostrador` | `cadete`)

**`CustomerRecord`** (ficha de cliente, privada de cada tenant)
- `id`, `tenant_id`
- `linked_user_id` (nullable — si el cliente se autoregistró y fue vinculado por código)
- `name`, `phone`, `address_text`, `lat`, `lng`
- `notes` (texto libre)
- Si está vinculado a un `User`, nombre/teléfono/ubicación se copian al vincular (no quedan sincronizados en vivo); `notes` y el resto son siempre privados del tenant.

**`Delivery`** (evento de asignación de entrega — dispara notificación y calificación)
- `id`, `tenant_id`, `customer_record_id`
- `cadete_user_id`, `assigned_by_user_id`
- `status` (`assigned` | `completed` | `cancelled`)
- `rating` (1–5, nullable hasta completar), `rating_note`
- `created_at`, `completed_at`

## Flujos principales

### A. Alta de una rotisería
1. El dueño se registra como `admin` y crea el `Tenant`.
2. Desde su panel, invita a mostrador y cadetes por teléfono → se crea el `User` (si no existía) + `Membership` con el rol correspondiente. Reciben un link para poner su contraseña.

### B. Autoregistro de cliente
1. La persona crea su cuenta con teléfono + contraseña, sin necesidad de que ninguna rotisería la invite.
2. Carga su ubicación: comparte GPS o la marca a mano en el mapa, más dirección en texto.
3. La app le muestra su `short_code` para compartir por teléfono/WhatsApp al llamar a una rotisería nueva.

### C. Mostrador atiende un pedido
1. Busca al cliente por teléfono, nombre o `short_code`.
2. Si no existe `CustomerRecord` en ese tenant pero el cliente dio su código → se crea el `CustomerRecord` vinculado (`linked_user_id`), autocompletando nombre/teléfono/ubicación.
3. Si el cliente no tiene código (no tiene cuenta) → el mostrador carga los datos a mano, marcando el pin en el mapa.
4. Si el `CustomerRecord` ya existe → el mostrador ve de una la ubicación, el promedio de puntuación y las notas antes de tomar el pedido.

### D. Asignación al cadete
1. El mostrador crea un `Delivery` (`CustomerRecord` + `cadete_user_id`).
2. El cadete recibe un Web Push → abre la app → ve mapa, dirección y notas de esa entrega puntual.
3. Si el pin está mal, el cadete lo corrige ahí mismo.

### D.1 Editar/cancelar una entrega
- Mientras el `Delivery` está en `assigned`, el mostrador (o el propio cadete) puede:
  - **Reasignarlo** a otro cadete → dispara un nuevo push al nuevo cadete.
  - **Cancelarlo** → pasa a `cancelled`, no cuenta para la puntuación del cliente ni queda pendiente en la lista del cadete.
- Una vez `completed`, no se puede editar ni cancelar. Si la calificación se cargó mal, se puede corregir `rating`/`rating_note` desde el detalle del cliente (permiso `admin`/`mostrador`, no `cadete`), pero el registro de que la entrega existió no se borra.

### E. Cierre y calificación
1. Al completar la entrega (cadete o mostrador), se marca el `Delivery` como `completed` con `rating` (1–5) y nota opcional.
2. El promedio del `CustomerRecord` se recalcula con cada nueva entrega completada.

## Manejo de errores y casos borde

- **Código de cliente no encontrado**: se avisa claramente y se ofrece cargar el cliente a mano — nunca bloquea el flujo de tomar el pedido.
- **Cadete sin conexión al momento del push**: el sistema operativo reintenta la entrega del push de forma nativa; además, el cadete siempre tiene una lista de "mis entregas asignadas" como respaldo.
- **Múltiples entregas asignadas al mismo cadete en simultáneo**: comportamiento esperado, no es un error — se listan todas.
- **Aislamiento entre tenants**: cada request autenticado lleva el `tenant_id` derivado del `Membership` activo; el backend valida que todo `CustomerRecord`/`Delivery` consultado pertenezca a ese tenant. Nunca se confía en un `tenant_id` que venga del cliente.
- **Cliente autoregistrado que cambia su ubicación**: no afecta retroactivamente los `CustomerRecord` ya vinculados (los datos se copiaron al vincular, no están sincronizados en vivo).
- **Teléfono duplicado**: `User.phone` es único a nivel global, validado server-side al registrarse.

## Testing

- **Backend (NestJS)**: tests unitarios de servicios (aislamiento por tenant, cálculo de puntaje, transiciones de estado de `Delivery`) + tests e2e de los endpoints clave (auth, alta de cliente, asignación, cancelación) contra una Postgres de test.
- **Frontend (Next.js)**: tests de componentes para las vistas críticas (búsqueda de cliente, formulario de asignación, vista de entrega del cadete) + un smoke test end-to-end (ej. Playwright) del flujo completo: mostrador crea cliente → asigna → cadete recibe y completa → se refleja el rating.
- **Multi-tenancy**: test explícito de que un `Membership` de un tenant nunca puede leer/escribir `CustomerRecord` o `Delivery` de otro tenant — el riesgo de seguridad más crítico del sistema.
- **Push notifications**: verificación manual en dispositivo real (Android y iOS con PWA instalada) antes de dar por cerrada esa parte, dado que el comportamiento de Web Push varía entre navegadores/SO y no lo cubre bien un test automatizado.

## No funcional / seguridad

- Contraseñas con hash (bcrypt/argon2), nunca texto plano.
- JWT de sesión con `user_id` + `memberships` (tenant + rol), revalidado contra la DB en operaciones sensibles.
- Rate limiting en login y búsqueda por `short_code`, para evitar fuerza bruta sobre códigos de clientes ajenos.
- HTTPS obligatorio en el servidor autohosteado (necesario además porque Web Push y geolocalización del navegador requieren contexto seguro).

## Stack técnico

- **Frontend**: Next.js + TanStack Query, Tailwind CSS, PWA (manifest + service worker), desplegado en Vercel.
- **Backend**: NestJS (REST), autohosteado en servidor propio (Barcelona).
- **Base de datos**: PostgreSQL, en el mismo servidor que el backend.
- **Mapas**: OpenStreetMap + Leaflet.
- **Notificaciones**: Web Push (VAPID).
