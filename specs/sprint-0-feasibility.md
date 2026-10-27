# Sprint 0 — Identidad y verificación social

Estado: **documentado / hallazgos consultados el 21-oct-2026**.

## Hallazgos preliminares en documentación oficial

- **Facebook:** Meta indica que el Like Button y Comment Button para sitios externos se discontinuaron el **10-feb-2026**, se muestran como elementos invisibles y no habrá plugins de reemplazo. Por tanto, el widget de Like que se proponía no es una opción válida en una integración nueva. [Social Plugins — Meta](https://developers.facebook.com/docs/plugins/like-button/)
- **Instagram:** existe el campo `is_user_follow_business`, pero la User Profile API descrita por Meta requiere que el participante haya interactuado con la cuenta profesional mediante un mensaje/webhook o una acción de mensajería, consentimiento y permisos de mensajería. No equivale a un botón de follow insertado en el iframe ni a un OAuth genérico disponible para cualquier visitante. [Instagram User Profile API — Meta](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/)
- **TikTok:** hay una API de investigación que puede exponer listas de cuentas seguidas para ciertos perfiles públicos, pero TikTok la limita a investigadores independientes/académicos sin fines de lucro aprobados. No es una integración asumible para una gala promocional ordinaria. [About Research Tools — TikTok](https://developers.tiktok.com/doc/about-research-api?enter_method=left_navigation) · [Query User Following — TikTok](https://developers.tiktok.com/docs/en/research-api-specs-query-user-following)

**Conclusión:** con los widgets y el flujo de “abrir red, seguir y cerrar” no hay una prueba universal, inmediata y autorizable para las tres redes. El MVP adopta la alternativa elegida: confirmación manual explícitamente no verificada, conservada en servidor para el identificador de navegador. No se construirá un desbloqueo estricto ni se etiquetará el estado como verificado. Si en el futuro se solicita verificación real, se reabre este spike por plataforma.

## SPIKE-01 — ¿Se puede verificar un follow/like?

**Como** responsable de la gala, **quiero** comprobar qué acciones sociales se pueden verificar legítimamente, **para** no desbloquear votos si solo se abrió un enlace y no inventar una integración que la plataforma no permite.

### Alcance

Investigar por separado la acción exacta deseada (seguir cuenta, seguir perfil, dar like a página/publicación) en Facebook, Instagram y TikTok; quién es propietario de la cuenta; permisos y revisión de app necesarios; endpoint/evento disponible; y si el servidor puede verificar el resultado para ese participante.

### Criterios de aceptación

1. Para cada red y tipo de acción hay un registro con documentación oficial consultada, requisitos de cuenta, scopes/permisos, revisión requerida y limitaciones.
2. Existe un prototipo con respuesta autenticada validable por el API o se documenta claramente que no existe una señal adecuada.
3. Abrir/cerrar pestaña, recibir `window.focus`, cargar un widget o marcar un checkbox nunca satisface la condición de verificación estricta.
4. No se solicitan ni almacenan contraseñas de redes.
5. Se presenta una decisión explícita: integración aprobada por red, requisito alternativo o confirmación manual etiquetada como no verificada.

### Resultado si no hay API verificable

La función “desbloquear cinco votos solo después de verificar follow/like” no puede implementarse de manera fiable con un simple iframe/widget. Se debe elegir una alternativa de producto antes de la historia VOTE-03. No simular el éxito.

## SPIKE-02 — Identidad anónima por navegador

**Como** participante, **quiero** que mi elegibilidad y mis cuotas se reconozcan en todos los widgets de la misma gala, **para** no repetir el proceso en cada iframe.

### Criterios de aceptación

1. Comparar una cuenta participante (p. ej. email OTP) con una cookie firmada y documentar qué identifica cada opción y su resistencia a borrado, cambio de dispositivo y uso de varias cuentas.
2. Probar Safari/iOS, Chrome y Firefox con cookies de terceros permitidas y bloqueadas, incluyendo dos sitios anfitriones distintos.
3. La propuesta no usa IP como identificador principal y no depende exclusivamente de cookies de terceros.
4. Definir el mínimo de datos, vencimiento/renovación de sesión, consentimiento y procedimiento de borrado.
5. Acordar si se exige iniciar sesión para votar o si se acepta la limitación de una identidad basada en dispositivo.

### Decisión de producto

Se acepta el modo **solo navegador/dispositivo**, sin inicio de sesión del participante. El API emitirá un token de participante opaco/firmado y guardará los votos y confirmaciones en servidor. Probar almacenamiento particionado en Safari/Chrome/Firefox. Cuando los iframes se inserten bajo orígenes anfitriones distintos, el mismo navegador puede recibir identidades distintas; no prometer continuidad entre todos los sitios. Borrar almacenamiento o cambiar de dispositivo permite crear una identidad nueva.
