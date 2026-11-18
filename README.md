# blogInsta

Blog HTML que muestra las publicaciones de Instagram de un cliente, ordenadas de la
más antigua a la más reciente y paginadas.

## Cómo funciona

1. El desarrollador realiza una conexión OAuth con la cuenta de Instagram del cliente
   y guarda el `access_token` (cifrado) en Supabase, en la tabla `instagram_oauth_config`.
2. El endpoint de servidor `api/instagram.js` lee ese token desde Supabase usando la
   `SUPABASE_SERVICE_ROLE_KEY`, lo descifra con la llave maestra
   `INSTAGRAM_TOKEN_ENCRYPTION_KEY` y consulta la API Graph de Instagram.
3. El navegador (`index.html`) pide `/api/instagram?page=N&user=<instagram_user_id>` y
   renderiza las tarjetas. Las llaves nunca llegan al cliente.

## Configuración

Copia `.env.example` a `.env` y completa las variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY` (hex de 32 bytes)
- `INSTAGRAM_USER_ID` (opcional; también se puede pasar `?user=` en la URL)
- `INSTAGRAM_GRAPH_VERSION` (opcional, por defecto `v21.0`)

## Instalación

```bash
npm install
```

Despliega `index.html` como sitio estático y `api/instagram.js` como función serverless
(por ejemplo en Vercel, donde `api/` se publica como `/api/instagram`).
