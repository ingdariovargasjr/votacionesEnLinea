# Sprint 4 — ADM-04 Resultados administrativos

**Como** organizador de una gala, **quiero** consultar resultados y participación agregados por evento, terna, versión y nominado, **para** dar seguimiento a la votación sin acceder a identidades individuales.

## Criterios de aceptación

- La ruta requiere sesión y valida que la cuenta sea propietaria de la gala o superusuario.
- Los resultados solo incluyen versiones publicadas, archivadas o retiradas; borradores nunca exponen actividad.
- Muestra envíos recibidos y votos asignados por gala y por versión; los votos por nominado se calculan desde el snapshot inmutable de esa versión.
- Las versiones históricas se muestran separadas y no se mezclan con la vigente.
- Cada terna muestra un gráfico por nominado y destaca a quien tenga más votos; en caso de igualdad, indica empate.
- El ranking general une nominaciones por una identidad maestra de luchador creada por gala, cuenta una identidad anónima una sola vez por luchador aunque vote en varias ternas y muestra además los votos asignados acumulados.
- Una nominación sin luchador maestro no se mezcla en el ranking general y queda indicada para que administración la asocie.
- La identidad maestra es metadato estadístico; corregir un vínculo reagrupará también el historial de esa nominación, pero no modificará sus votos ni sus snapshots.
- El reporte no devuelve participant IDs, claves de idempotencia, IP, correo ni otros datos personales.
- Se explicita que las identidades anónimas representan navegadores/dispositivos, no personas verificadas, y que un envío es una participación diaria por terna.
- Galas y versiones sin actividad muestran valores cero y estado vacío, sin errores.

## Estado

Implementados el RPC agregado de solo lectura, la ruta autenticada `GET /api/v1/events/:id/results`, los gráficos por terna y el ranking general por identidad maestra con votantes únicos. Las migraciones 010 y `202610210011_gala_fighter_identities.sql` están aplicadas. Tablas y RPC se comprobaron con una gala vacía, sin crear datos de prueba; queda validar los gráficos con votos de una gala real y revisar homónimos en el catálogo inicial.
