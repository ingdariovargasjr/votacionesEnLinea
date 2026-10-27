# Backlog priorizado

El orden combina valor de producto y riesgo técnico. Los ítems P0 deben resolverse antes de prometer una función de verificación social.

| Prioridad | ID | Historia / entrega | Estado |
|---|---|---|---|
| P0 | SPIKE-01 | Probar qué señales de follow/like ofrecen oficialmente Facebook, Instagram y TikTok; decidir alternativa para las que no se puedan verificar. | Cerrado para MVP: confirmación manual no verificada |
| P0 | SPIKE-02 | Elegir identidad de participante persistente entre iframes/sitios y probar cookies/Storage Access en navegadores objetivo. | Decidido: solo navegador; validar particionado antes de publicar |
| P1 | AUTH-01 | Registro/login recuperable, perfiles persistentes, superusuario gratuito y bloqueo de galas para cuentas sin pago activo. | Código listo; pendiente migración/correo |
| P1 | OPS-02 | Separar testing y producción con ramas `testing`/`producción` desde `main`, Firebase Hosting, Render, Supabase, CI y promoción aprobada. | Ramas creadas; código y CI en testing; pendientes proyectos cloud, Render Blueprint y protección GitHub Pro/Team |
| P1 | ADM-01 | Crear y editar una gala y sus votaciones/ternas como borradores. | Validada con Supabase |
| P1 | ADM-02 | Configurar nominados, regla de voto, zona horaria y programa social asociado a una votación. | Implementada y migración aplicada; validar flujo autenticado |
| P1 | THEME-01 | Personalizar colores de botones y tipografía por gala, con vista previa. | Implementada; migración aplicada |
| P1 | IMG-01 | Cargar y administrar una imagen de Supabase Storage por nominado. | Implementada; migración aplicada; validar subida autenticada |
| P1 | ADM-03 | Publicar/despublicar una votación y conservar versiones e historial al editar. | Implementada; migración aplicada; validar flujo autenticado |
| P2 | EMB-01 | Generar un snippet iframe por votación publicada y previsualizarlo aislado. | Implementada; pendiente validación en hosts reales |
| P2 | EMB-02 | Mostrar en el iframe solo la terna seleccionada, su estado y controles responsive/tema. | Implementada en modo lectura; pendiente validación visual en navegadores |
| P3 | VOTE-01 | Permitir una asignación de un voto por participante, terna y día. | Implementada; migraciones 007-008 aplicadas; pendiente validación concurrente autenticada |
| P3 | VOTE-02 | Permitir cinco votos por participante, terna y día; distribuirlos entre nominados; aceptar el envío de forma atómica. | Implementada con bloqueo por habilitación social; VOTE-03 provee la confirmación |
| P3 | VOTE-03 | Reutilizar en todas las ternas la confirmación manual asociada al mismo programa social. | Implementada; migración 009 aplicada; pendiente validar entre ternas |
| P4 | ADM-04 | Consultar resultados por terna y ranking general de luchadores en toda la gala. | Gráficos y asociación maestra implementados; migración 011 aplicada; pendiente validar con votos reales |
| P4 | OPS-01 | Gestionar orígenes autorizados de iframe, auditoría, límites de solicitudes y privacidad/retención. | Antes de producción |

## Iteraciones sugeridas

1. **Sprint 0 — factibilidad:** cerrar SPIKE-01 y SPIKE-02, confirmar cuotas por terna, identidad y dominios que alojarán iframes.
2. **Sprint 1 — cuentas y administración:** AUTH-01 primero, después ADM-01/02/03 sobre API + Supabase.
3. **Sprint 2 — publicación:** EMB-01/02; iframe real de lectura usando una votación publicada.
4. **Sprint 3 — votos:** VOTE-01/02 con transacciones, fecha/zona horaria y protección de duplicados.
5. **Sprint 4 — acceso y operación:** VOTE-03 solo con integración social aprobada; ADM-04 y OPS-01.
6. **Sprint 5 — despliegue:** OPS-02; validar el recorrido completo primero en testing y habilitar producción solo con aprobación.

## Definición de terminado común

- Criterios de aceptación automatizados (unitarios y API; Playwright para el flujo iframe cuando exista el frontend).
- Migración Supabase revisable y política de acceso probada; ningún secreto privilegiado en el bundle Vue.
- Estados de error y carga; navegación por teclado; diseño móvil; logs sin credenciales ni datos sociales innecesarios.
- Documentación de variables de entorno y despliegue en Firebase/Render/Supabase. La historia de votos requiere además prueba de concurrencia.
