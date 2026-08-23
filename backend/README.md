# Alanna backend

Express + MySQL + Sequelize + JWT.

## Arranque

```bash
cp .env.example .env
npm install
npm run db:reset
npm run dev
```

La conexión MySQL se lee de `.env` (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). No hace falta Docker.

API en `http://localhost:4000/api`. El front (puerto 8080) apunta a esa URL.

Usuario de desarrollo: `hola@planner.mx` / `demo1234`.

WhatsApp usa un adaptador stub (`src/services/whatsapp.adapter.js`) y una cola `outbound_jobs`. No se envían mensajes reales todavía.

Para Google Search Console: coloca `VITE_GSC_VERIFICATION` en `front/.env` y envía a mano `https://tu-dominio/sitemap.xml`.
