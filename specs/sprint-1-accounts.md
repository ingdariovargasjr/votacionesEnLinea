# AUTH-01 — Registro, acceso y superusuario de la plataforma

**Prioridad:** P1 · **Estado:** implementado en código; falta aplicar migración y configurar el correo superusuario.

## Historia de usuario

**Como** propietario de la plataforma, **quiero** que cada usuario tenga una cuenta recuperable, que mis galas queden vinculadas a esa cuenta en la base de datos y que mi correo sea el único superusuario gratuito, **para** volver a iniciar sesión si se pierde la sesión del navegador sin perder mis galas, y exigir una suscripción activa a los demás antes de que creen galas.

## Criterios de aceptación

1. Una persona puede crear una cuenta con correo y contraseña, confirmar su correo e iniciar sesión posteriormente. El registro público nunca acepta un rol, `user_id`, plan ni estado de pago enviado por el cliente.
2. Hay flujo para cerrar sesión, volver a iniciar sesión, solicitar recuperación y cambiar la contraseña desde una sesión autenticada. Borrar cookies o almacenamiento cierra la sesión, pero no borra la cuenta ni sus galas; al autenticarse de nuevo se recuperan desde Supabase.
3. Al registrarse, una cuenta normal recibe el rol `member` y estado `payment_required`; no puede crear ni editar galas sin una suscripción activa. Puede autenticarse y ver el estado de su cuenta.
4. El correo del superusuario se configura exclusivamente en el servidor como `SUPERUSER_EMAIL`. Después de confirmar ese correo, la API lo provisiona/promueve a `superuser`, plan `free` y acceso activo sin vencimiento.
5. El superusuario puede crear/editar galas sin pagar y consultar las galas de la plataforma. Ningún cliente puede ascenderse a superusuario editando datos de navegador o enviando su propio rol.
6. Los permisos se validan en cada ruta protegida de la API. La clave `service_role` no se incluye en el bundle Vue.
7. El acceso de cuentas normales queda bloqueado hasta que el servidor registre `subscription_status=active`. No se simula un pago ni se acepta una confirmación del navegador como pago.
8. Si el correo configurado para superusuario todavía no está confirmado en Supabase Auth, no se concede el rol privilegiado y la interfaz explica cómo terminar el alta.

## Fuera de alcance

- Cobro, checkout, facturas, renovación y webhooks del proveedor de pagos. Se requiere decidir proveedor y moneda antes de implementar la historia de facturación.
- Invitar otros administradores/superusuarios desde UI.
- Recuperar galas de una cuenta distinta o transferir propiedad entre cuentas.

## Notas de seguridad/datos

- Las contraseñas pertenecen exclusivamente a Supabase Auth. No se crea ni se guarda una columna `password` en `profiles` o en otra tabla de la aplicación.
- `profiles.id` referencia `auth.users.id`; las galas se vinculan a `owner_id` y no a una cookie.
- La cuenta inicial se autoriza mediante el email verificado configurado en el servidor. El frontend no tiene controles para elegir rol/plan.
- `ADMIN_USER_IDS` existe solo como compatibilidad temporal con ADM-01; se elimina una vez configurado y probado `SUPERUSER_EMAIL`.
- Para desarrollo local, configurar `SUPERUSER_EMAIL` en `apps/api/.env`. En Cloudflare Workers se configura como secreto del Worker correspondiente.
- El primer acceso de otro usuario puede registrarse, pero verá que debe pagar. Hasta elegir e integrar un proveedor, solo el superusuario podrá crear galas.
