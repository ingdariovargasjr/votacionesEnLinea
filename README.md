# Plataforma de votaciones de gala

Proyecto en desarrollo siguiendo las especificaciones de [`specs/`](./specs/). El mockup inicial se conserva en `index.html`; la aplicación nueva vive en `apps/web` y la API en `apps/api`.

## Stack

- Vue 3 + TypeScript + Vite para administración y, en siguientes historias, el widget iframe.
- API REST Node.js + TypeScript + Express compatible con Cloudflare Workers.
- Supabase Auth para cuentas y Supabase Postgres para datos/planes.
- Firebase Hosting para Vue con sitios separados de testing y producción; Cloudflare Workers ejecuta la API por entorno.

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

La historia **OPS-02** mantiene `testing` separado de `producción`. Las ramas persistentes `testing` y `producción` ya se crearon desde el mismo commit inicial de `main`; el código se valida primero en `testing` y se promueve por PR revisado. Firebase usa el proyecto `respeto-6e276` con dos sitios, `votaciones-en-linea-testing` y `votaciones-en-linea`, asignados en `.firebaserc`. La API de testing se ejecuta como Cloudflare Worker independiente (`votaciones-api-testing`); producción no se migra ni despliega hasta aprobarla por separado.

### Preparación de cuentas (una vez)

1. Crea **dos proyectos Supabase** (testing y producción), cada uno con Auth, base de datos y Storage independientes. Firebase ya está creado: el proyecto `respeto-6e276` aloja el sitio testing `votaciones-en-linea-testing` y el sitio producción `votaciones-en-linea`. Testing usa datos sintéticos; no copies votos ni datos personales reales.
2. La configuración de Cloudflare Workers está en `wrangler.jsonc` y solo define el Worker de testing. Wrangler ya está autenticado y `votaciones-api-testing` está publicado en `https://votaciones-api-testing.gala-api.workers.dev`; su `/health` responde 200. Configura los secretos de Supabase de testing con `wrangler secret put <NOMBRE> --config wrangler.jsonc` y vuelve a desplegar con `npm run deploy:workers:testing --workspace @gala/api`. `SUPABASE_SERVICE_ROLE_KEY` nunca se incluye en el frontend ni en Git. `PUBLIC_WEB_URL` y `CORS_ORIGINS` ya se fijan al sitio Firebase de testing. No hay configuración ni despliegue de Worker de producción en este cambio.
3. La protección de ramas ya está aplicada: `testing` requiere PR y CI; `producción` requiere PR, CI verde y actualizado, al menos una aprobación vigente y bloquea pushes directos, force-pushes y borrado. Los GitHub Environments están limitados a las ramas correspondientes. Mantén `main` como base; no despliegues producción desde `main`.
4. En **cada GitHub Environment** establece las variables:
   - `SUPABASE_PROJECT_REF`: referencia del proyecto Supabase correspondiente.
   - `VITE_API_URL`: URL HTTPS del Worker API del mismo entorno, sin barra final.
   - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: URL y anon/publishable key pública del Supabase de ese entorno.
5. En cada GitHub Environment establece `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` y `FIREBASE_SERVICE_ACCOUNT_JSON` para los workflows de migración/despliegue. En Cloudflare configura también los secretos de la API del entorno (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y, si aplica, `SUPERUSER_EMAIL`/`ADMIN_USER_IDS`). Nunca pongas credenciales en archivos versionados, variables `VITE_*`, el repo o el chat.
6. En cada Supabase → **Authentication → URL Configuration**, fija el sitio Firebase de su entorno como Site URL y allowlist de redirects: el host testing para Supabase testing y el host producción para Supabase producción. Configura SMTP y confirma correo antes de crear la cuenta superusuario. Revisa también los dominios/orígenes iframe autorizados; esos se administran por gala y no son lo mismo que CORS.

### Ciclo de publicación

1. Todo trabajo funcional se incorpora primero a `testing` (directamente o mediante PR); CI ejecuta `npm test` y compila API/web. Completa allí las pruebas manuales.
2. Ejecuta **Actions → Apply Supabase migrations** en la rama `testing`, entorno `testing`. Inspecciona el `--dry-run` y aplica migraciones al Supabase de pruebas.
3. Despliega manualmente el Worker `votaciones-api-testing`. Espera que `/health` responda `200` antes de desplegar el frontend.
4. Ejecuta **Actions → Deploy Firebase Hosting** desde `testing`, entorno `testing`. El workflow verifica la API, compila con las variables de testing y publica solo el target `hosting:testing` (`votaciones-en-linea-testing`). Después prueba Auth, votos, Storage, iframes y reportes usando datos sintéticos.
5. Cuando todo esté aprobado en testing, abre un pull request **desde `testing` hacia `producción`**. El PR debe incluir los últimos cambios probados, estar actualizado con la rama destino, pasar CI y conservar una aprobación vigente. Después configura un Worker de producción independiente con sus propios secretos, migra/provisiona la base de datos de producción y publica Firebase solo tras comprobar la API.

Los workflows están bajo `.github/workflows/`. Las ramas de despliegue se crean inicialmente desde `main`; luego testing se promueve a producción exclusivamente mediante PR aprobado. El workflow de Firebase rechaza despliegues desde una rama incorrecta. Firebase se publica manualmente para que el frontend no salga antes de que API y migraciones estén listas. Para reversión del Worker, usa versiones anteriores de Cloudflare; las migraciones deben ser aditivas y compatibles hacia atrás. No reviertas votos o datos con un rollback de código.

### Despliegue manual de Firebase desde una máquina autorizada

Con los targets del archivo `.firebaserc`, un despliegue manual autorizado se hace con `npm run firebase -- deploy --only hosting:testing --project respeto-6e276` o `npm run firebase -- deploy --only hosting:production --project respeto-6e276`. Prefiere los workflows protegidos de GitHub y no guardes credenciales de servicio localmente.

**Estado:** ramas, protecciones y GitHub Environments están configurados; Firebase tiene sus dos sitios mapeados. El Worker de testing ya está publicado y su smoke test remoto pasa para health/CORS; los endpoints de datos responden 503 hasta configurar Supabase. La integración GitHub-Supabase puede crear previews/migrar cada PR, pero el Worker estable necesita secretos de una rama/proyecto persistente de testing. El Environment `testing` sigue sin variables ni secretos y el frontend de Firebase aún no se publicó. No se ejecutaron migraciones desde este flujo. `producción` no se modificó.

### Integrar el widget

Publica la terna, autoriza el origen HTTPS exacto del sitio anfitrión y copia el snippet de esa versión. El `iframe` apunta al endpoint del API, que valida el `Referer` contra la lista permitida y aplica `frame-ancestors`; sin autorización el widget no carga. El iframe usa un alto inicial de 680 px (mínimo 360 px). El anfitrión puede ajustar `height` con CSS/media queries según su diseño; el widget no envía `postMessage` ni acepta mensajes para cambiar su tamaño, para no confiar en mensajes arbitrarios. El componente visual de la vista previa de administración es el mismo; el acceso a ella requiere sesión.

## Alcance y limitaciones acordadas

La confirmación de follow/like será manual y no verificada. La identidad de participantes será por navegador/dispositivo: borrar almacenamiento, cambiar de navegador o ciertas políticas de particionado en iframes puede crear una identidad distinta. No es antifraude fuerte ni prueba de que se siguió una cuenta. Consulta las decisiones y criterios en `specs/open-decisions.md`.

VOTE-01/02 guardan un identificador anónimo firmado en el almacenamiento local del widget; no usan IP, correo ni contraseña como identidad. Los navegadores que particionan `localStorage` por sitio anfitrión pueden asignar identidades distintas en cada sitio. Los envíos aceptados quedan ligados a la versión publicada y no se editan ni borran.

VOTE-03 guarda la confirmación por requisito y programa, no caduca a medianoche y se consulta desde el servidor en cada widget. La migración `202610210009_manual_social_confirmations.sql` debe aplicarse antes de habilitar este flujo en el entorno remoto.

ADM-04 presenta al ganador (o empate) de cada terna y un ranking general de luchadores por identidades anónimas distintas. Para consolidar nominaciones entre ternas, asígnalas al mismo luchador maestro de la gala; el conteo representa navegadores/dispositivos y no personas verificadas. La migración 011 inicia la asociación de datos existentes por nombre igual; revisa posibles homónimos y asígnalos al maestro correcto.
