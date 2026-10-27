# Plataforma de votaciones de gala

Proyecto en desarrollo siguiendo las especificaciones de [`specs/`](./specs/). El mockup inicial se conserva en `index.html`; la aplicación nueva vive en `apps/web` y la API en `apps/api`.

## Stack

- Vue 3 + TypeScript + Vite para administración y, en siguientes historias, el widget iframe.
- API REST Node.js + TypeScript + Express desplegable como servicio web de Render.
- Supabase Auth para cuentas y Supabase Postgres para datos/planes.
- Firebase Hosting para Vue y dos servicios API en Render; `render.yaml` contiene el blueprint de testing y producción.

## Historia implementada

**AUTH-01, ADM-01, ADM-02, THEME-01, IMG-01, ADM-03, EMB-01, EMB-02, VOTE-01/02/03 y ADM-04:** registro/login y perfiles, administración de galas/ternas, tema persistente, imágenes privadas, publicación versionada, widget embebible, votos diarios atómicos, confirmación social manual compartida y resultados agregados para administración.

## Desarrollo local

Requiere Node.js 22 o posterior y un proyecto Supabase.

1. Instala dependencias: `npm install`.
2. Copia `apps/web/.env.example` a `apps/web/.env.local` y define `VITE_API_URL=http://localhost:3001`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. Copia `apps/api/.env.example` a `apps/api/.env` y define URL/anon key de Supabase, `SUPABASE_SERVICE_ROLE_KEY`, `SUPERUSER_EMAIL`, `CORS_ORIGINS=http://localhost:5173` y `PUBLIC_WEB_URL=http://localhost:5173`.
4. Ejecuta en Supabase, en orden, las migraciones `202610210001` a `202610210011` (o aplícalas con Supabase CLI).
5. Añade `http://localhost:5173/**` a **Authentication → URL Configuration → Redirect URLs**.
6. Inicia ambos servicios: `npm run dev`.

### Aplicar migraciones con Supabase CLI

La CLI ya está inicializada en `supabase/`. En una terminal local (no compartas los valores por chat):

1. Autentica la CLI con tu **Personal Access Token**: `npx supabase login`.
2. Vincula el proyecto: `npx supabase link --project-ref <PROJECT_REF>`. La CLI solicitará la contraseña de la base de datos si la necesita.
3. Revisa primero el plan: `npx supabase db push --dry-run`.
4. Si el plan muestra las migraciones esperadas, aplícalas con `npx supabase db push`.

El token y la contraseña se guardan fuera del repositorio. No los pongas en `apps/api/.env`, en comandos compartidos ni en el frontend. Si las migraciones 001/002 ya se ejecutaron manualmente, el `--dry-run` permite revisar cómo la CLI tratará su historial antes de continuar.

Regístrate con el correo configurado en `SUPERUSER_EMAIL` y confirma ese correo. El API lo reconocerá como superusuario con plan gratuito. Las demás cuentas pueden registrarse, pero no crear/editar galas hasta que tengan suscripción activa. La integración de pagos todavía no está implementada.

Vue usa solo la anon key pública. La `service_role` es exclusivamente del API, nunca debe ponerse en una variable `VITE_*`, commitearse o enviarse al navegador. El registro no permite elegir rol ni plan; el superusuario se define en el entorno del servidor.

Las contraseñas las administra Supabase Auth y nunca se guardan en `profiles`; esa tabla contiene solo el perfil, rol y estado del plan.

## Entornos en la nube

La historia **OPS-02** prepara Firebase Hosting, Render y Supabase para mantener `testing` separado de `producción`. Las ramas persistentes `testing` y `producción` se crearán desde el mismo commit de `main`; todo cambio se prueba primero en `testing` y se promueve a `producción` con un pull request revisado. Firebase CLI (`firebase-tools`) está instalado como dependencia de desarrollo; `firebase.json` publica `apps/web/dist` y redirige las rutas Vue al SPA. `render.yaml` vincula `gala-voting-api-testing` (rama `testing`) al entorno Render `Testing` y `gala-voting-api-production` (rama `producción`) al entorno `Production` del proyecto `votacionesEnLinea`; cada uno requiere sus propias variables y despliegue manual para respetar el orden de migración.

### Preparación de cuentas (una vez)

1. Crea **dos proyectos Supabase** (testing y producción) y **dos proyectos Firebase**. Mantén separados Auth, base de datos, Storage, usuarios, llaves y datos. Testing solo debe usar datos sintéticos; no copies votos o datos personales reales.
2. Desde el mismo commit de la rama `main`, crea las ramas persistentes `testing` y `producción`. Conecta el repositorio a Render como Blueprint desde `render.yaml`. Cada servicio queda asociado solo a su rama y con deploy automático desactivado. Configura cada servicio con sus propios `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPERUSER_EMAIL`, `CORS_ORIGINS` y `PUBLIC_WEB_URL` (y `ADMIN_USER_IDS` solo si se necesita compatibilidad antigua). `CORS_ORIGINS` y `PUBLIC_WEB_URL` deben tener el dominio Firebase de ese mismo entorno; nunca compartas `service_role`.
3. En GitHub → **Settings → Environments**, crea `testing` y `production`. Añade revisores requeridos a `production`. Protege `testing` con CI requerido. Protege `producción` para exigir PR, CI verde, que la rama esté actualizada, aprobación vigente y para bloquear pushes directos y force-pushes. Mantén `main` como base; no despliegues producción desde `main`.
4. En **cada GitHub Environment** establece las variables:
   - `FIREBASE_PROJECT_ID`: ID del proyecto Firebase de ese entorno.
   - `SUPABASE_PROJECT_REF`: referencia del proyecto Supabase correspondiente.
   - `VITE_API_URL`: URL HTTPS del servicio API Render del mismo entorno, sin barra final.
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: URL y anon/publishable key pública del Supabase de ese entorno.
5. En cada Environment establece los secretos `SUPABASE_ACCESS_TOKEN` (PAT de Supabase con acceso a ambos proyectos o un token dedicado), `SUPABASE_DB_PASSWORD` (solo la contraseña DB de ese entorno) y `FIREBASE_SERVICE_ACCOUNT_JSON` (JSON de cuenta de servicio con privilegio mínimo para desplegar Hosting en ese proyecto). Evita compartir estos secretos entre entornos. Nunca pongas credenciales en archivos `.env`, `VITE_*`, el repo o el chat.
6. En Supabase → **Authentication → URL Configuration**, fija el dominio Firebase correcto como Site URL y allowlist de redirects. Configura SMTP y confirma correo antes de crear la cuenta superusuario. Revisa también los dominios/orígenes iframe autorizados; esos se administran por gala y no son lo mismo que CORS.

### Ciclo de publicación

1. Todo trabajo funcional se incorpora primero a `testing` (directamente o mediante PR); CI ejecuta `npm test` y compila API/web. Completa allí las pruebas manuales.
2. Ejecuta **Actions → Apply Supabase migrations** en la rama `testing`, entorno `testing`. Inspecciona el `--dry-run` y aplica migraciones al Supabase de pruebas.
3. Desde Render, ejecuta **Manual Deploy → Deploy latest commit** en `gala-voting-api-testing`. Espera que `/health` responda `200` antes de desplegar el frontend.
4. Ejecuta **Actions → Deploy Firebase Hosting** desde `testing`, entorno `testing`. El workflow verifica la API, compila con las variables de testing y publica en el Firebase de testing. Después prueba Auth, votos, Storage, iframes y reportes usando datos sintéticos.
5. Cuando todo esté aprobado en testing, abre un pull request **desde `testing` hacia `producción`**. El PR debe incluir los últimos cambios probados, estar actualizado con la rama destino, pasar CI y conservar una aprobación vigente; no hagas cambios funcionales directamente en `producción`. Una vez fusionado, aplica las migraciones con el workflow seleccionado como `production` (GitHub pedirá aprobación) y revisa el plan. Después, desde Render ejecuta **Manual Deploy → Deploy latest commit** en `gala-voting-api-production`; confirma su `/health` y solo entonces ejecuta **Deploy Firebase Hosting** desde `producción`, entorno `production`.

Los workflows están bajo `.github/workflows/`. Las ramas de despliegue se crean inicialmente desde `main`; luego testing se promueve a producción exclusivamente mediante PR aprobado. Los workflows rechazan despliegues desde una rama incorrecta. Firebase se publica manualmente para que el frontend no salga antes de que API y migraciones estén listas. Para reversión, redepliega en Render/Firebase un commit previamente validado; las migraciones deben ser aditivas y compatibles hacia atrás. No reviertas votos o datos con un rollback de código.

### Despliegue manual de Firebase desde una máquina autorizada

Después de crear el proyecto y completar el build con las variables correctas de ese entorno, el CLI puede autenticarse con `npm run firebase -- login` y publicar con `npm run firebase -- deploy --only hosting --project <FIREBASE_PROJECT_ID>`. Prefiere el workflow protegido de GitHub para desplegar, y no guardes credenciales de servicio localmente.

**Pendiente para quedar en línea:** este directorio todavía no tiene un repositorio Git remoto; faltan vincularlo a GitHub, crear `testing` y `producción` desde `main`, obtener los IDs de los proyectos Firebase/Supabase, completar el onboarding del Blueprint Render y cargar los valores privados por entorno. No se ejecutó ninguna migración en el Supabase existente ni se creó/deployó un recurso remoto.

### Integrar el widget

Publica la terna, autoriza el origen HTTPS exacto del sitio anfitrión y copia el snippet de esa versión. El `iframe` apunta al endpoint del API, que valida el `Referer` contra la lista permitida y aplica `frame-ancestors`; sin autorización el widget no carga. El iframe usa un alto inicial de 680 px (mínimo 360 px). El anfitrión puede ajustar `height` con CSS/media queries según su diseño; el widget no envía `postMessage` ni acepta mensajes para cambiar su tamaño, para no confiar en mensajes arbitrarios. El componente visual de la vista previa de administración es el mismo; el acceso a ella requiere sesión.

## Alcance y limitaciones acordadas

La confirmación de follow/like será manual y no verificada. La identidad de participantes será por navegador/dispositivo: borrar almacenamiento, cambiar de navegador o ciertas políticas de particionado en iframes puede crear una identidad distinta. No es antifraude fuerte ni prueba de que se siguió una cuenta. Consulta las decisiones y criterios en `specs/open-decisions.md`.

VOTE-01/02 guardan un identificador anónimo firmado en el almacenamiento local del widget; no usan IP, correo ni contraseña como identidad. Los navegadores que particionan `localStorage` por sitio anfitrión pueden asignar identidades distintas en cada sitio. Los envíos aceptados quedan ligados a la versión publicada y no se editan ni borran.

VOTE-03 guarda la confirmación por requisito y programa, no caduca a medianoche y se consulta desde el servidor en cada widget. La migración `202610210009_manual_social_confirmations.sql` debe aplicarse antes de habilitar este flujo en el entorno remoto.

ADM-04 presenta al ganador (o empate) de cada terna y un ranking general de luchadores por identidades anónimas distintas. Para consolidar nominaciones entre ternas, asígnalas al mismo luchador maestro de la gala; el conteo representa navegadores/dispositivos y no personas verificadas. La migración 011 inicia la asociación de datos existentes por nombre igual; revisa posibles homónimos y asígnalos al maestro correcto.
