# Sprint 5 — Entornos y despliegue

## OPS-02 — Separar testing y producción en la nube

**Como** responsable del producto, **quiero** probar una versión completa en un entorno aislado antes de publicarla en vivo, **para** reducir el riesgo de afectar galas, cuentas o votos reales.

### Criterios de aceptación

- Se crean las ramas persistentes `testing` y `producción` desde el mismo commit base de `main`.
- Todo cambio funcional se incorpora primero en `testing`; se valida ahí con CI y pruebas manuales antes de promoverlo.
- La promoción a `producción` se realiza mediante pull request desde `testing`. El PR debe incluir los últimos cambios aprobados de testing, estar actualizado, pasar CI y recibir aprobación; no se permiten commits directos ni despliegues sin aprobar a `producción`.
- `producción` contiene únicamente el código aprobado y probado en `testing`; los despliegues de producción se ejecutan desde esa rama.
- Existe un entorno `testing` y otro `production`, cada uno con su API Render y proyecto Supabase independientes. Firebase Hosting usa el proyecto `respeto-6e276` con dos sitios aislados: `votaciones-en-linea-testing` y `votaciones-en-linea`.
- Cada servicio Render queda vinculado a una sola rama (`testing` o `producción`) y requiere despliegue manual después de migrar su base. Testing puede usar el plan Free con su limitación de suspensión; Production requiere selección/aprobación explícita de cualquier plan con costo. Firebase publica solo el target correspondiente desde la rama adecuada.
- Las migraciones Supabase se aplican manualmente al proyecto seleccionado desde la rama correspondiente, con revisión `--dry-run`; producción requiere aprobación protegida en GitHub.
- No se copian usuarios, imágenes privadas, secretos ni votos reales a testing. Las pruebas usan datos sintéticos.
- Las variables públicas de Vite se construyen para el entorno elegido; `service_role`, contraseñas DB, tokens y credenciales Firebase nunca se incluyen en el bundle ni en el repositorio.
- El frontend valida que la API seleccionada responda `/health` antes de publicar.
- CI ejecuta pruebas y compilaciones en pull requests a `testing` y `producción`, y en las tres ramas.
- Cada entorno configura por separado dominios de Auth/redirect, CORS, `PUBLIC_WEB_URL`, orígenes de iframe y correos/administradores.
- El proceso de promoción es explícito: migrar y probar en testing, aprobar y fusionar un PR `testing` → `producción`, aplicar migraciones de producción con aprobación, esperar la API Render sana y publicar Firebase producción.
- Existe una ruta documentada de reversión. Las migraciones de esquema deben ser compatibles hacia atrás; los votos y datos de usuarios no se revierten restaurando código.

### Configuración preparada / pendiente de cuentas

Las ramas `testing` y `producción` ya se crearon desde el commit inicial de `main`; el código se subió primero a `testing` y CI pasó. Solo los workflows manuales de despliegue también están en `main` para que GitHub los pueda despachar. Las reglas de rama están activas: `testing` requiere PR y CI; `producción` requiere PR, CI actualizado, una aprobación vigente, resolución de conversaciones y bloquea push directo, force-push y borrado. Los GitHub Environments se crearon y se restringieron a su rama. Firebase Hosting está configurado en `.firebaserc` para sus dos sitios y se verificó la lista de sitios de `respeto-6e276`. `producción` se mantiene en el commit base hasta completar pruebas y aprobar el PR. Falta crear dos proyectos Supabase, cargar los secretos y crear/configurar manualmente los Web Services de Render; Testing puede empezar con Free, Production requiere aprobar el costo que indique Render. El Supabase actualmente vinculado no se reasigna automáticamente.

### Checklist de cuentas

1. Crear proyectos Supabase separados y configurar Auth/SMTP, Storage y dominios permitidos en ambos.
2. En Render, crear manualmente una API Web Service por entorno y conectar cada una a su rama; detenerse si el flujo exige aprobar un plan con costo.
3. Cargar en GitHub Environments y Render las variables/secretos enumerados en README; nunca reutilizar service-role keys o contraseñas DB entre entornos.
4. Configurar en cada Supabase el dominio Firebase de su entorno como URL de retorno permitida; Firebase ya tiene los sitios de producción y testing mapeados.
5. Integrar cambios primero en `testing`, ejecutar migraciones y smoke tests; después abrir el PR `testing` → `producción` y publicar producción solo con aprobación y CI verde.
