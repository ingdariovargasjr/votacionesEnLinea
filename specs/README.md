# Especificación del sistema de votación

Estado: **borrador para revisión** · Enfoque: specification-driven development.

## Objetivo

Crear una plataforma para administrar varias galas y publicar sus votaciones como widgets aislados en otras páginas. Cada votación pública muestra únicamente su terna y controles para votar; la administración, edición, publicación y resultados pertenecen al panel separado.

## Vocabulario y modelo de producto

- **Gala / evento:** premiación configurable por el administrador.
- **Votación / terna:** una pregunta o categoría de la gala, con una regla de voto y sus nominados. Cada votación publicada tiene su propio enlace e iframe.
- **Nominado:** opción que recibe votos.
- **Apariencia de gala:** colores y familia tipográfica que se aplican a todos los widgets de las ternas de una gala; el administrador puede previsualizar el estilo antes de publicar.
- **Programa de acceso social:** conjunto de páginas/redes que se deben seguir. La habilitación se registra en servidor para la persona, no en cada iframe. Una vez habilitada, debe servir en los otros iframes que compartan ese programa.
- **Participante:** identidad que el servidor usa para hacer cumplir los límites diarios y reutilizar la habilitación social.

### Decisiones de producto confirmadas

1. Cada terna tiene su propio límite diario: un voto en modalidad sencilla o exactamente cinco votos distribuibles en modalidad cinco.
2. La habilitación social se comparte entre las ternas/galas que usen el mismo programa de acceso y permanece desde su confirmación en adelante; no se repite diariamente.
3. La identidad de participantes será **anónima por navegador/dispositivo**, sin login de participante. Esto reduce fricción, pero no evita que se eludan límites borrando datos, cambiando navegador/dispositivo o usando otro origen anfitrión. No se usará IP como identidad.
4. El requisito social usará **confirmación manual**: la persona indica que completó cada acción; el producto no afirmará que una API verificó el follow. Una confirmación puede ser falsa.
5. Al editar una votación publicada se conserva el historial. Los cambios que afecten nominados/reglas no deben reasignar votos anteriores; se deben versionar o exigir despublicar y publicar una nueva versión.

## Arquitectura objetivo

- **Frontend:** Vue 3 + TypeScript + Vite. Rutas separadas para administración/preview y para el widget público (`/embed/:publicId`).
- **Hosting:** Firebase Hosting para Vue; Render para la API Node.js/TypeScript, con recursos separados por ambiente.
- **API:** REST versionada, por ejemplo `/api/v1`. La API valida publicación, identidad, reglas, permisos y cuotas; el cliente no decide si un voto es válido.
- **Persistencia:** Supabase Postgres. Supabase Auth para administradores y el mecanismo de identidad de participantes que se decida. La clave `service_role` vive solo como secreto del API en Render; nunca en Vue ni en el iframe.
- **Embeds:** el iframe consume únicamente endpoints públicos de lectura y voto. Restringir `frame-ancestors` a los dominios autorizados por evento cuando se conozcan. Configurar CORS, límites de solicitudes y validación de `Origin`; CORS por sí solo no protege el API.
- **Estado:** los votos, límites diarios y confirmaciones manuales se almacenan en servidor. El participante anónimo recibe un identificador firmado y persistido en el navegador para la experiencia usual; no se presenta como identidad humana fuerte. El API valida la firma, pero el usuario puede evadir el límite borrando/cambiando su identidad local.

### Esquema de datos inicial (sujeto a la historia de identidad)

`events` (incluyendo configuración de apariencia), `social_access_programs`, `social_requirements`, `ballots`, `ballot_versions`, `nominees` (incluyendo ruta de imagen en Storage), `participants`, `social_confirmations`, `votes` y `vote_allocations`. Los votos tienen claves foráneas a la versión publicada, participante y nominado. La escritura de una asignación de cinco votos debe ser transaccional y validar la suma en servidor. Las imágenes se guardan en Supabase Storage y el API autoriza las cargas.

## Restricciones de integración social — riesgo bloqueante

Abrir un enlace externo, cerrar una ventana, volver al iframe o marcar una casilla **no prueba** que se haya dado like o follow. El MVP acepta la confirmación manual por decisión del producto, pero debe etiquetarse como tal y no como verificación real. Los widgets de las redes están aislados entre dominios y normalmente no entregan a un sitio externo un evento verificable de esa acción. Un inicio de sesión/OAuth tampoco implica por sí mismo permiso para consultar si una persona sigue una página.

Antes de ofrecer la verificación estricta solicitada se debe realizar un spike por Facebook, Instagram y TikTok: revisar APIs, permisos, revisión de aplicaciones, tipos de cuenta y políticas vigentes; prototipar y demostrar una respuesta verificable que el API pueda validar. No se recopilarán contraseñas de redes ni se desbloqueará solo porque el usuario abrió/cerró una pestaña.

Si una plataforma no ofrece una señal autorizada, se utiliza la confirmación manual acordada o un código de promoción. Ninguna de esas alternativas se presenta como prueba de follow.

## Seguridad y privacidad mínimas

- Verificar sesión de administrador y permisos en cada operación de administración.
- Mantener secretos y claves privilegiadas solo en Render; políticas RLS como defensa adicional en Supabase.
- Aplicar límites y unicidad en servidor/transacciones, guardar zona horaria y fecha de voto, y registrar cambios/publicaciones.
- No guardar contraseña ni token de acceso a redes sociales salvo que una integración oficial lo exija, esté aprobada y se documente el alcance. Preferir el mínimo dato necesario.
- Definir aviso de privacidad, retención/borrado de datos, edad mínima y jurisdicción antes del lanzamiento.

## Fuera de alcance del primer MVP

No incluye prueba antifraude perfecta, identificación fiable por IP, compra de votos, descubrimiento de cuentas sociales, ni una garantía de que una misma persona no use cuentas/dispositivos distintos. Los controles reducen abuso, pero no hacen posible identificar a una persona anónima con certeza.

## Documentos

- [`backlog.md`](./backlog.md): orden de prioridad e iteraciones.
- [`sprint-1-accounts.md`](./sprint-1-accounts.md): registro, acceso persistente, superusuario y bloqueo por suscripción.
- [`sprint-0-feasibility.md`](./sprint-0-feasibility.md): spike de identidad/seguimiento social.
- [`sprint-1-event-management.md`](./sprint-1-event-management.md): primera historia de producto lista para implementación.
- La personalización visual y carga de imágenes se especifican dentro de las historias iniciales de administración y publicación.
- [`sprint-2-embed.md`](./sprint-2-embed.md): historias del iframe público.
- [`sprint-3-voting.md`](./sprint-3-voting.md): historias de votos, cuotas e identidad.
- [`sprint-4-admin-results.md`](./sprint-4-admin-results.md): consulta administrativa de resultados agregados.
- [`sprint-5-environments.md`](./sprint-5-environments.md): separación y despliegue de testing/producción.
- [`open-decisions.md`](./open-decisions.md): decisiones que necesitamos confirmar antes de cerrar el modelo y las cuotas.
