# Sprint 5 — Entornos y despliegue

## OPS-02 — Separar testing y producción en la nube

**Como** responsable del producto, **quiero** probar una versión completa en un entorno aislado antes de publicarla en vivo, **para** reducir el riesgo de afectar galas, cuentas o votos reales.

### Criterios de aceptación

- Se crean las ramas persistentes `testing` y `producción` desde el mismo commit base de `main`.
- Todo cambio funcional se incorpora primero en `testing`; se valida ahí con CI y pruebas manuales antes de promoverlo.
- La promoción a `producción` se realiza mediante pull request desde `testing`. El PR debe incluir los últimos cambios aprobados de testing, estar actualizado, pasar CI y recibir aprobación; no se permiten commits directos ni despliegues sin aprobar a `producción`.
- `producción` contiene únicamente el código aprobado y probado en `testing`; los despliegues de producción se ejecutan desde esa rama.
- Existe un entorno `testing` y otro `production`, cada uno con un proyecto Firebase Hosting, una API Render y un proyecto Supabase independientes.
- Cada servicio Render queda vinculado a una sola rama (`testing` o `producción`) y requiere despliegue manual después de migrar su base. Firebase también se publica manualmente desde la rama adecuada.
- Las migraciones Supabase se aplican manualmente al proyecto seleccionado desde la rama correspondiente, con revisión `--dry-run`; producción requiere aprobación protegida en GitHub.
- No se copian usuarios, imágenes privadas, secretos ni votos reales a testing. Las pruebas usan datos sintéticos.
- Las variables públicas de Vite se construyen para el entorno elegido; `service_role`, contraseñas DB, tokens y credenciales Firebase nunca se incluyen en el bundle ni en el repositorio.
- El frontend valida que la API seleccionada responda `/health` antes de publicar.
- CI ejecuta pruebas y compilaciones en pull requests a `testing` y `producción`, y en las tres ramas.
- Cada entorno configura por separado dominios de Auth/redirect, CORS, `PUBLIC_WEB_URL`, orígenes de iframe y correos/administradores.
- El proceso de promoción es explícito: migrar y probar en testing, aprobar y fusionar un PR `testing` → `producción`, aplicar migraciones de producción con aprobación, esperar la API Render sana y publicar Firebase producción.
- Existe una ruta documentada de reversión. Las migraciones de esquema deben ser compatibles hacia atrás; los votos y datos de usuarios no se revierten restaurando código.

### Configuración preparada / pendiente de cuentas

Las ramas `testing` y `producción` ya se crearon desde el commit inicial de `main`; el código se subió primero a `testing` en el commit `44c6fa9` y CI pasó. Solo los workflows manuales de despliegue también están en `main` para que GitHub los pueda despachar. `producción` se mantiene en el commit base hasta completar pruebas y aprobar el PR. Falta crear/configurar los proyectos Firebase/Supabase, conectar el Blueprint y configurar valores en GitHub/Render. El Supabase actualmente vinculado no se reasigna automáticamente. El repo es privado y el plan GitHub actual no permite activar protecciones de rama; hace falta Pro/Team para exigir approvals y checks.

### Checklist de cuentas

1. Crear proyectos Supabase separados y configurar Auth/SMTP, Storage y dominios permitidos en ambos.
2. Crear dos proyectos Firebase y habilitar Hosting. Configurar los dominios Hosting/custom domains como URLs de retorno permitidas en el Supabase correspondiente.
3. Las ramas ya están creadas desde el mismo commit base. Conectar `render.yaml` desde la rama `testing` como Blueprint al proyecto `votacionesEnLinea`; verifica que `gala-voting-api-testing` quede en el entorno Render `Testing` y `gala-voting-api-production` en `Production`. Asigna a cada servicio sus propias URL/anon key/service role, correo superusuario, URL del frontend y CORS. El deploy automático queda desactivado para permitir migrar la base primero.
4. Crear GitHub Environments `testing` y `production`; exigir revisores para `production`. Proteger `testing` y `producción`; en `producción`, requerir pull request, CI exitoso, rama actualizada con su base, descartar aprobaciones obsoletas y bloquear pushes/force-push directos.
5. Cargar en cada Environment las variables/secretos enumerados en README; nunca reutilizar service-role keys ni contraseñas entre entornos.
6. Integrar cambios solo primero en `testing`, ejecutar migraciones y smoke tests allí; después abrir el PR `testing` → `producción` y desplegar producción únicamente cuando tenga aprobación vigente y CI verde.
