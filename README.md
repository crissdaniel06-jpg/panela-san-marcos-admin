# Panel administrativo · Panela San Marcos

Panel estático para iniciar sesión con Supabase, buscar pedidos, revisar comprobantes privados y cambiar estados. Usa el mismo proyecto de Supabase que la tienda.

## Preparación

1. Copia `config.example.js` como `config.js` y pega la URL y clave **publishable** del proyecto. Nunca agregues `service_role`.
2. Añade `<script src="config.js"></script>` antes de `app.js` en `index.html`.
3. Habilita `app_metadata.role = "admin"` en la cuenta autorizada desde un entorno de confianza (Dashboard de Supabase o servidor). El usuario no puede concederse este rol desde el navegador.
4. Aplica `supabase/migrations/20261102000000_admin_panel.sql` al proyecto existente.
5. Sirve la carpeta con un servidor estático, por ejemplo `python -m http.server 4173`, y abre `http://localhost:4173`.

## Alcance y seguridad

El panel exige el rol en `app_metadata`. La migración agrega lectura de pedidos y comprobantes solo para administradores y un RPC de estados. El cambio de cantidad está deshabilitado deliberadamente en el primer MVP: alterar líneas de pedidos ya creados exige una decisión de negocio y un registro transaccional. Cancelar pedido usa la función existente del proyecto; esa función actual solo permite cancelar pedidos propios, por lo que el botón administrativo debe habilitarse después de desplegar una RPC admin de cancelación revisada. No se muestra una acción que la base no autorice.

El acceso a comprobantes usa enlaces firmados de 60 segundos y requiere política Storage de administrador.
