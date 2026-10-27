# Sprint 3 — Registro de votos

Estas historias dependen de una identidad de participante decidida en SPIKE-02. La API es la autoridad; ocultar botones en Vue no hace cumplir límites.

## VOTE-01 — Un voto diario

**Como** participante identificado, **quiero** emitir un voto en una terna de modalidad sencilla, **para** apoyar a un nominado sin superar el límite diario.

### Criterios de aceptación

- El servidor acepta solo un nominado activo perteneciente a la versión publicada de esa terna.
- Se acepta como máximo un envío por participante, terna y día en la zona horaria del evento.
- Dos solicitudes concurrentes no pueden registrar dos votos; la unicidad/transacción de base de datos resuelve la carrera.
- Reintentar una solicitud con la misma clave de idempotencia no duplica el voto.
- Si ya votó, el widget muestra estado de recibido/sin posibilidad de cambiarlo ese día.
- El voto queda asociado a la versión de la terna y no se elimina al retirarla.

## VOTE-02 — Cinco votos diarios distribuibles

**Como** participante con acceso social habilitado, **quiero** repartir mis cinco votos entre los nominados, **para** apoyar a mis favoritos según prefiera.

### Criterios de aceptación

- El API rechaza el envío si la persona no tiene habilitación vigente para el programa social asociado.
- El API valida que todas las cantidades sean enteros no negativos, que los nominados pertenezcan a esa versión publicada y que la suma sea exactamente cinco (decisión provisional; confirmar si se permite enviar menos).
- El registro de las asignaciones es atómico: se guardan todas o ninguna.
- El límite se aplica por participante, terna y fecha local del evento; intentos concurrentes no exceden el límite.
- La selección no se considera voto hasta que el API confirma el envío.
- El widget diferencia errores de sesión, acceso social, límite diario y error temporal del API.

## VOTE-03 — Confirmación social compartida (no verificada)

**Como** participante que afirma haber completado las acciones de un programa social, **quiero** reutilizar esa confirmación en las ternas asociadas, **para** no repetir el proceso dentro de cada iframe.

### Criterios de aceptación

- El estado se guarda en servidor ligado al identificador anónimo del navegador y al programa, con fecha y requisito confirmado; se etiqueta como confirmación manual, no como verificación.
- Se consulta al API al cargar cualquier widget; no se confía en un checkbox, cookie editable, URL de retorno ni `postMessage` del sitio anfitrión.
- Una habilitación completada no expira a medianoche: permanece según la política acordada; los límites de voto sí se reinician diariamente.
- La UI explica que la confirmación manual no prueba la acción y no solicita inicio de sesión ni contraseña de la red social.
- La confirmación de un programa no se vuelve a pedir diariamente y se comparte entre las ternas asociadas.
- Todas las ternas ligadas al mismo programa reflejan el mismo estado de elegibilidad.

### Estado de VOTE-03

Implementado el checklist de requisitos por programa, la confirmación explícita desde el widget y su persistencia por participante/programa/requisito con fecha y método `manual`. El API vuelve a consultar la habilitación al cargar cada widget; al confirmar todos los requisitos actuales se habilitan los cinco votos en todas las ternas asociadas. La migración `202610210009_manual_social_confirmations.sql` está aplicada al proyecto vinculado; tabla y RPC se comprobaron sin crear confirmaciones de prueba. Falta validar el recorrido visual y la reutilización entre ternas con una votación publicada.

## Cuotas por terna — confirmación pendiente

El diseño actual asume que cada terna de modalidad cinco permite cinco asignaciones diarias, mientras que el estado social se comparte entre ternas. Si se pretende un máximo de cinco asignaciones **entre todas las ternas** en total, la API deberá reservar cuota global por día y esto cambia la interfaz de selección/envío.

### Estado de VOTE-01 / VOTE-02

Implementadas API, widget y funciones transaccionales para identidad anónima firmada por servidor, límite único por participante/terna/fecha local, asignación de cinco votos, clave de idempotencia y conservación del `ballot_version_id`. Las migraciones `202610210007_record_ballot_votes.sql` y `202610210008_lock_vote_version_lifecycle.sql` están aplicadas. VOTE-02 exige habilitación manual en `participant_social_access`; VOTE-03 añade el flujo de confirmación que la escribe. Falta validar solicitudes concurrentes y el flujo de voto con una terna publicada.
