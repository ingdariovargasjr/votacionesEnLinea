# Sprint 2 — Widget público embebible

## EMB-01 — Obtener el iframe de una terna publicada

**Como** administrador, **quiero** copiar el iframe de una terna publicada, **para** insertarlo en la página de la gala sin incluir el panel de configuración.

### Criterios de aceptación

- El snippet apunta a una ruta pública de widget por `publicId` y no incluye secretos, service keys ni datos de administrador.
- El widget carga solo una terna; no muestra navegación de administración, otras votaciones ni resultados no publicados.
- La vista previa administrativa y el iframe público usan el mismo componente visual, pero los borradores no son accesibles para visitantes.
- La política `frame-ancestors` solo permite los dominios autorizados; una inserción desde origen no permitido no muestra el widget.
- El snippet incluye `title` accesible y parámetros de tamaño razonables; se documenta cómo lograr altura adaptable sin confiar en mensajes arbitrarios.

## EMB-02 — Ver una terna en el widget

**Como** visitante, **quiero** ver únicamente el título, instrucciones, nominados y regla de la terna, **para** votar desde la página anfitriona en escritorio o móvil.

### Criterios de aceptación

- El widget consume la configuración publicada desde API; nunca usa la configuración local del navegador como fuente oficial.
- El diseño se adapta al ancho del iframe, soporta tema claro/oscuro y navegación por teclado.
- Aplica la apariencia vigente configurada para la gala (colores de botones y tipografía), sin reutilizar valores codificados del mockup.
- Se muestran estados de cargando, error, votación cerrada y votación no encontrada.
- Las imágenes opcionales fallidas usan avatar de respaldo; el nombre del nominado sigue siendo legible.
- Si el visitante no tiene la sesión/identidad requerida, se ofrece el flujo definido en SPIKE-02 sin enviar credenciales a la página anfitriona.

### Alcance de esta entrega

El widget de EMB-01/02 es de solo lectura y no pide sesión ni credenciales. La identidad anónima de navegador y el flujo previo al envío se incorporarán con VOTE-01/02, sin enviar credenciales al host. La vista previa de administración y el embed usan el mismo componente Vue; el endpoint del API genera un wrapper con CSP `frame-ancestors`, token de corta duración ligado al `publicId` y al origen, y bloquea la carga si el `Referer` no pertenece a la allowlist de la gala.

Estado: código implementado; faltan pruebas manuales de integración desde un host permitido y otro bloqueado en navegadores objetivo.
