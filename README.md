# Vivero Club

Landing page standalone de suscripciones mensuales (plantas, macetas y selección curada).

Formulario multi-step → guardado en Firestore **antes** del checkout → creación de la suscripción
en MercadoPago (Preapproval Plan) → redirección al checkout → sincronización de estados por Webhook.

## Stack

- React + Vite (frontend)
- Firebase Web SDK (escritura previa al checkout) y Firebase Admin (API routes)
- MercadoPago Preapproval + Webhooks
- API Routes estilo Vercel (`/api/...`)

## Estructura

```
api/
  _lib/firebase-admin.js
  _lib/admin-auth.js
  _lib/club.js
  _lib/mp-client.js
  admin/
    config.js
    suscriptores.js
  mercadopago/
    crear-suscripcion.js
    webhook.js
    status.js
    cancelar.js
    pausar.js
    sync-pagos.js
src/
  components/SubscriptionLanding.jsx
  components/SubscriptionSuccess.jsx
  admin/         <- panel de administración (/admin)
  firebase/config.js
  styles/subscription.css
  styles/admin.css
  utils/mercadopago.js   <- cliente HTTP del frontend
  utils/admin.js
  utils/validations.js
  assets/hero/   <- imágenes de fondo del hero (ver src/assets/hero/README.md)
  App.jsx
  main.jsx
```

## Setup

```bash
npm install
cp .env.example .env
npm run dev:full   # vercel dev: frontend + funciones /api (necesario para el admin)
```

> `npm run dev` levanta solo el frontend (Vite) y **no** expone las funciones
> `/api`. La landing funciona, pero el panel `/admin` y el checkout real
> necesitan `npm run dev:full` o un deploy en Vercel.

## Variables de entorno

Cargá `.env` (ver `.env.example`):

- `VITE_*`: configuración Firebase Web + `VITE_API_BASE_URL` y `VITE_FIRESTORE_COLLECTION`.
- Backend (solo servidor): `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`,
  `MP_ACCESS_TOKEN`, `MP_PREAPPROVAL_PLAN_ID`, `MP_WEBHOOK_SECRET`, `MP_BACK_URL`,
  `FIRESTORE_COLLECTION`.
- Panel admin: `ADMIN_UIDS` (UIDs de Firebase Auth autorizados, separados por coma).

`FIREBASE_PRIVATE_KEY` debe conservar los saltos de línea (`\n`). En `.env` local podés dejar
las comillas dobles como en `.env.example` (dotenv las elimina). En el dashboard de Vercel pegalo
**sin** comillas. Ambos casos funcionan: la API normaliza comillas y `\n` antes de usarlo.

## Modo demo (sin credenciales de MercadoPago)

Sirve para probar el formulario y el guardado en Firestore sin tener `MP_ACCESS_TOKEN` ni
`MP_PREAPPROVAL_PLAN_ID`:

- `VITE_MOCK_MP=true`: el frontend guarda en Firestore y muestra la pantalla de éxito sin
  llamar a la API ni redirigir a MercadoPago.
- `MOCK_MP=true`: la API crea la suscripción y devuelve `{ mock: true, checkout_url: null }`.

Ambas deben ir en `false` en producción.

## MercadoPago

1. Creá un **plan de suscripción (preapproval_plan)** en tu cuenta MP y copiá su ID en
   `MP_PREAPPROVAL_PLAN_ID`.
2. Generá un **Access Token** (TEST o PROD) y cargalo en `MP_ACCESS_TOKEN`.
3. Configurá el webhook en MP apuntando a `https://TU-DOMINIO/api/mercadopago/webhook` (POST),
   suscripto a los eventos **`preapproval`**, **`subscription_authorized_payment`** y
   **`payment`**.
4. Copiá la **clave secreta** del webhook (MP → Tus integraciones → Webhooks) en
   `MP_WEBHOOK_SECRET`. Si está vacía, el webhook **no valida la firma** (solo para desarrollo).
5. Seteá `MP_BACK_URL=https://TU-DOMINIO` para las `back_url` y `notification_url`.

Flujo:

1. La landing guarda el suscriptor en Firestore (`activo:false, pendiente:true`).
2. `POST /api/mercadopago/crear-suscripcion` crea un **preapproval por suscriptor** con
   `external_reference = email`, `notification_url` y `back_url`, y devuelve `init_point`.
3. El usuario completa el pago en MercadoPago.
4. MP llama al **webhook** `/api/mercadopago/webhook`, que valida la firma, **re-consulta** el
   `preapproval`/`payment` real a la API de MP y actualiza el suscriptor
   (`activo`, `pendiente`, `mercadopago_status`, fechas e `historialPagos`).

> El webhook debe ser accesible públicamente. Localmente usá un túnel (ngrok) o probá con
> `vercel dev` + túnel, porque MercadoPago no alcanza `localhost`.

## Modelo de datos (Firestore)

Colección `suscriptores` (configurable por `VITE_FIRESTORE_COLLECTION` en el frontend y
`FIRESTORE_COLLECTION` en el backend; ambos deben coincidir).
ID de documento = `email.trim().toLowerCase()`.

```js
{
  nombre, instagram, dni, telefono, correo,
  direccion, departamento, ciudad, codigoPostal,
  horarioEntrega,          // "manana" | "tarde"
  preferencias: string[],  // 1 a 2 ids
  activo: false, pendiente: true,
  fechaAlta: ISOString,
  mercadopago_plan_id, mercadopago_preapproval_id, mercadopago_status,
  fechaPrimerPago, fechaUltimoPago, fechaProximoCobro, fechaCancelacion,
  tema: "vivero", origen: "landing-vivero"
}
```

Subcolección `historialPagos/{docId}` creada por el webhook/sync con
`{ fecha, estado, monto, moneda, mercadopago_payment_id, mercadopago_authorized_payment_id, mercadopago_preapproval_id, type: "payment", actualizadoEn }`.
Los ids son determinísticos (`payment_{paymentId}`) para evitar duplicados.

Endpoints de suscripciones:

- `POST /api/mercadopago/crear-suscripcion`: crea el preapproval y devuelve `init_point`.
- `GET /api/mercadopago/status?email=...`: estado del suscriptor + historial de pagos.
- `POST /api/mercadopago/cancelar`: cancela en MercadoPago y actualiza Firestore.
- `POST /api/mercadopago/pausar`: pausa o reactiva el preapproval en MercadoPago.
- `POST /api/mercadopago/sync-pagos`: sincroniza un email, lista de emails o todos.
- `POST /api/mercadopago/webhook`: recibe y procesa eventos de MercadoPago.

Los endpoints de sincronización, pausa y cancelación requieren un token de Firebase
(`Authorization: Bearer <idToken>`) de un UID incluido en `ADMIN_UIDS`.

### Configuración de la landing

Colección `config`, documento `landing` (lo administra el panel):

```js
{
  clubNombre, subtitulo, precio: number,
  heroImageUrl: string,
  beneficios: [{ icon, title, text }],
  updatedAt: ISOString
}
```

La landing lee este documento al cargar y usa los valores de `.env` como fallback si no existe.

## Panel de administración

Disponible en `/admin` (y `/admin/club`). Usa **Firebase Authentication** (email/contraseña):

1. En Firebase Console → **Authentication** → habilitá el proveedor
   **Email/Password**.
2. Creá el usuario administrador (ej. `admin@gmail.com`) con su contraseña.
3. Copiá el **UID** del usuario y cargalo en `ADMIN_UIDS` (podés poner varios separados por coma).

El login se hace con Firebase Auth en el frontend. El panel lee y escribe **directamente en
Firestore** desde el navegador; el control de acceso se hace con las **reglas de seguridad** de
Firestore (ver más abajo), autorizando los UID listados en `ADMIN_UIDS`.

> Para probar el panel con sincronización, pausa o cancelación real contra MercadoPago usá
> `npm run dev:full` (Vercel dev). La landing y las acciones directas sobre Firestore
> (activar/eliminar) siguen funcionando con `npm run dev`.

Incluye:

- **Suscriptores**: listado con deduplicación por DNI/email, estadísticas (total, activos, sin
  pago, pendientes, abandonados y cancelados), búsqueda, filtros por estado, acciones (activar,
  pausar, sincronizar, cancelar, eliminar), historial de pagos expandible, sincronización por
  lotes contra MercadoPago y export a Excel.
- **Ajustes de la landing**: hero (badge, título, subtítulo, botón e imagen por URL o subida a
  Firebase Storage), precio, beneficios (cards) y preferencias del formulario.

### Reglas de Firestore (ejemplo)

El frontend escribe suscriptores antes del checkout (público) y solo el admin puede leer/editar.
Reemplazá el UID por los tuyos (los mismos de `ADMIN_UIDS`):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
        request.auth.uid in ['REEMPLAZAR_UID_ADMIN'];
    }

    match /config/{doc} {
      allow read: if true;
      allow write: if isAdmin();
    }

    match /suscriptores/{email} {
      allow create: if true;
      allow read, update, delete: if isAdmin();

      match /historialPagos/{pago} {
        allow read: if isAdmin();
        allow write: if false;
      }
    }
  }
}
```

> Si tenés varios administradores, listá todos los UID dentro del `in [...]`.
> Las subidas de imagen usan Firebase Storage: habilitá Storage y agregá reglas de escritura
> para `hero/` (solo `isAdmin()`).

## Deploy (Vercel)

```bash
npm run build
```

Cargá las variables de entorno en el proyecto de Vercel (las `VITE_*` y las de backend).
Las rutas de `api/` se despliegan automáticamente.

## Flujo crítico

Ver [MercadoPago](#mercadopago). Resumen: la landing guarda el suscriptor →
`/api/mercadopago/crear-suscripcion` devuelve el `init_point` → redirección al checkout →
el webhook valida la firma, re-consulta a MP y actualiza `activo`/`pendiente` + `historialPagos`.
