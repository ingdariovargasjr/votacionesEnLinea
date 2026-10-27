# Sprint 1 — Administración de galas y ternas

## ADM-01 — Crear una gala

**Como** administrador autenticado, **quiero** crear una gala con nombre, descripción, slug y zona horaria, **para** organizar las votaciones que voy a publicar.

### Criterios de aceptación

- Dado que inicié sesión como administrador, cuando creo una gala con campos obligatorios válidos, entonces se guarda como `draft` y aparece en mi listado.
- Si el slug ya existe, el API informa el conflicto y no crea una gala duplicada.
- Si falta un dato obligatorio o la zona horaria no es válida, la interfaz muestra el error y no guarda.
- Una persona no autenticada o sin rol de administrador recibe `401/403` aunque invoque el endpoint directamente.
- Una gala en borrador no tiene iframe público activo.

## ADM-02 — Crear y configurar votaciones/ternas

**Como** administrador, **quiero** agregar a una gala cualquier cantidad de votaciones, nominados y reglas, **para** generar una terna independiente por cada iframe.

### Criterios de aceptación

- Cada terna tiene título, descripción e identificador público UUID estable, nominados y regla `single_daily` o `five_daily`.
- Se puede agregar, editar, ordenar y quitar nominados antes de publicar; el orden configurado es el orden mostrado en el iframe.
- Para `five_daily` se puede asociar un programa social compartido por otras ternas de la gala.
- El administrador puede guardar y reabrir una gala como borrador sin perder datos.
- El API valida los datos además de la validación de Vue.

## THEME-01 — Personalizar la apariencia de una gala

**Como** administrador, **quiero** cambiar los colores de los botones y la tipografía de mi gala, **para** que sus votaciones embebidas tengan una identidad visual propia y no reutilicen los colores del mockup.

### Criterios de aceptación

- La apariencia se configura a nivel de gala y se hereda en todas sus ternas/iframes.
- Puedo seleccionar el color principal de los botones y un color secundario/acento mediante controles de color y/o valor HEX.
- Puedo escoger una familia tipográfica de una lista de opciones compatibles con el widget; la selección se aplica a títulos, texto y botones.
- El panel muestra una vista previa del widget con los colores y tipografía elegidos antes de guardar.
- La interfaz conserva contraste y legibilidad: el color del texto de los botones se ajusta automáticamente o se muestra una advertencia cuando el contraste sea insuficiente.
- Guardar cambios de apariencia no altera nominados, votos, cuotas ni resultados. Los widgets existentes reflejan la apariencia vigente de la gala.
- Los valores de tema se validan en API y se guardan junto con la configuración de la gala; no se aceptan CSS arbitrario ni URLs de fuentes ingresadas por el usuario.

## IMG-01 — Cargar imágenes de nominados

**Como** administrador, **quiero** cargar una imagen para cada nominado de una terna, **para** que las personas puedan reconocer visualmente a quién apoyan.

### Criterios de aceptación

- Puedo subir, reemplazar o quitar la imagen desde la edición del nominado.
- El MVP acepta JPEG, PNG y WebP con un máximo de 5 MB por archivo; el API valida el tipo y tamaño, no solo el input de Vue.
- La carga requiere autorización de administrador y el API genera/gestiona el acceso a Supabase Storage; ninguna clave `service_role` llega al navegador.
- En el widget la imagen se muestra recortada de forma consistente sin deformarse y tiene texto alternativo derivado del nombre del nominado.
- Si la imagen no existe, falla o ya no está disponible, se muestra un avatar de respaldo y no se rompe la terna.
- Al quitar o reemplazar una imagen no se borran votos ni se cambia la identidad del nominado.

## ADM-03 — Publicar, editar y retirar una votación

**Como** administrador, **quiero** publicar una terna, recuperar su iframe y poder editarla o retirarla, **para** insertar y mantener la votación en mi sitio.

### Criterios de aceptación

- Una terna solo se publica si tiene título, regla y al menos dos nominados.
- Publicar crea una versión inmutable consultable por un `publicId` no secuencial; el API público no expone datos de borradores ni información administrativa.
- Al publicar, se muestra un snippet iframe con URL estable, instrucciones de integración y botón de vista previa.
- Retirar bloquea nuevos votos sin borrar votos o resultados históricos.
- Si se cambia una terna publicada, se crea una versión nueva; los votos existentes siguen vinculados a la versión original y no se reasignan.
- El host del iframe queda limitado a los dominios autorizados configurados para la gala. Antes de tener dominio, se permite vista previa solo al administrador.

## Notas de implementación para la primera entrega

La interfaz de administración y el widget son rutas/modos separados de Vue. La API aplica autorización y guarda en Supabase. El desbloqueo social y el registro de votos quedan para sus historias posteriores; seguirán las decisiones de SPIKE-01/02 (confirmación manual no verificada e identidad por navegador).

### Estado de ADM-01

La historia de creación/edición/listado de galas ya tiene una primera implementación en `apps/web`, `apps/api` y `supabase/migrations/202610210001_create_events.sql`.

### Estado de ADM-02

La administración de ternas, nominados ordenables y programas sociales compartidos está implementada en `apps/web`, `apps/api` y `supabase/migrations/202610210003_create_votings.sql`. La migración ya está aplicada en el proyecto Supabase; falta validar el flujo autenticado en runtime.

### Estado de THEME-01

Los controles de tema se guardan por gala mediante el API; el servidor valida colores HEX y una lista cerrada de tipografías. El texto de botones se ajusta al mayor contraste disponible y muestra una advertencia si no alcanza WCAG AA. La migración `202610210004_add_event_theme.sql` ya está aplicada.

### Estado de IMG-01

La carga, reemplazo y eliminación de imágenes se implementó mediante el API, con validación de tamaño y firma MIME y URLs firmadas para el bucket privado `nominee-images`. La migración `202610210005_create_private_nominee_images.sql` ya está aplicada; falta probar una subida autenticada desde el navegador. ADM-03 sigue pendiente.

### Estado de ADM-03

Snapshots inmutables con `publicId` aleatorio, historial de versiones, publicación/retiro, preview privado y lista de orígenes autorizados por gala están implementados. El API público devuelve únicamente snapshots versionados y valida el origen indicado por el iframe. La migración `202610210006_publish_ballot_versions.sql` ya está aplicada; falta probar publicación/retirada en runtime.
