# Sprint 5 — Entornos y despliegue

## OPS-02 — Separar testing y producción en la nube

**Como** responsable del producto, **quiero** probar una versión completa en un entorno aislado antes de publicarla en vivo, **para** reducir el riesgo de afectar galas, cuentas o votos reales.

### Criterios de aceptación

- Se crean las ramas persistentes `testing` y `producción` desde el mismo commit base de `main`.
- Todo cambio funcional se incorpora primero en `testing`; se valida ahí con CI y pruebas manuales antes de promoverlo.
- La promoción a `producción` se realiza mediante pull request desde `testing`. El PR debe incluir los últimos cambios aprobados de testing, estar actualizado, pasar CI y recibir aprobación; no se permiten commits directos ni despliegues sin aprobar a `producción`.
- `producción` contiene únicamente el código aprobado y probado en `testing`; los despliegues de producción se ejecutan desde esa rama.
- Existe un entorno `testing` y otro `production`, cada uno con su API Cloudflare Worker y proyecto Supabase independientes. Firebase Hosting usa el proyecto `respeto-6e276` con dos sitios: `votaciones-en-linea-testing` y `votaciones-en-linea`.
- Cada Worker queda aislado por nombre, configuración y secretos del entorno; se despliega manualmente después de migrar su base. Firebase publica solo el target correspondiente desde la rama adecuada.
- Las migraciones Supabase se aplican manualmente al proyecto seleccionado desde la rama correspondiente, con revisión `--dry-run`; producción requiere aprobación protegida en GitHub.
- No se copian usuarios, imágenes privadas, secretos ni votos reales a testing. Las pruebas usan datos sintéticos.
- Las variables públicas de Vite se construyen para el entorno elegido; `service_role`, contraseñas DB, tokens y credenciales Firebase nunca se incluyen en el bundle ni en el repositorio.
- El frontend valida que la API seleccionada responda `/health` antes de publicar.
- CI ejecuta pruebas y compilaciones en pull requests a `testing` y `producción`, y en las tres ramas.
- Cada entorno configura por separado dominios de Auth/redirect, CORS, `PUBLIC_WEB_URL`, orígenes de iframe y correos/administradores.
- El proceso de promoción es explícito: migrar y probar en testing, aprobar y fusionar un PR `testing` → `producción`, aplicar migraciones de producción con aprobación, comprobar el Worker sano y publicar Firebase producción.
- Existe una ruta documentada de reversión. Las migraciones de esquema deben ser compatibles hacia atrás; los votos y datos de usuarios no se revierten restaurando código.

### Configuración preparada / pendiente de cuentas

Las ramas y reglas están activas; `testing` requiere PR/CI y `producción` requiere aprobación vigente y CI actualizado. Firebase está configurado para sus dos sitios. El Worker de testing está publicado en `https://votaciones-api-testing.gala-api.workers.dev`; health/CORS pasan y los endpoints con base de datos devuelven 503 hasta instalar secretos de un Supabase persistente de testing. La integración de Supabase para previews de PR no configura por sí sola los secretos del Worker estable. El GitHub Environment `testing` no tiene variables ni secretos y Firebase testing no se ha publicado. El proyecto Supabase local existente no se reutiliza. `producción` permanece sin cambios.

### Checklist de cuentas

1. Crear proyectos Supabase separados y configurar Auth/SMTP, Storage y dominios permitidos en ambos.
2. Crear y autenticar un Worker Cloudflare independiente por entorno; el target `testing` está definido en `wrangler.jsonc`.
3. Cargar en GitHub Environments y Cloudflare los valores/secretos enumerados en README; nunca reutilizar service-role keys o contraseñas DB entre entornos.
4. Configurar en cada Supabase el dominio Firebase de su entorno como URL de retorno permitida; Firebase ya tiene los sitios de producción y testing mapeados.
5. Integrar cambios primero en `testing`, ejecutar migraciones y smoke tests; después abrir el PR `testing` → `producción` y publicar producción solo con aprobación y CI verde.
