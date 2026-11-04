# Cuentas de Casa

App de presupuesto para el hogar: perfiles con sueldo fijo (12 o 14 pagas) o por horas con horario semanal, gastos previstos y reales por categoría, objetivo de ahorro e informe mensual descargable. Login con email y contraseña; los datos se comparten entre los miembros de un hogar.

## Estado

- `prototipo/cuentas-de-casa.html`: primer prototipo (una sola página, sin login).
- `supabase/schema.sql`: base de datos con login, hogares compartidos y seguridad por filas.
- Pendiente: la app nueva (rediseño con fondo blanco + login conectado a Supabase).

## Configurar Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega y ejecuta `supabase/schema.sql`.
3. En **Authentication > Providers**, deja activado Email.
4. Copia `.env.example` a `.env` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings > API).

## Cómo funciona el hogar compartido

- Al registrarte creas un hogar. Tiene un código de invitación de 8 caracteres.
- La otra persona se registra y se une con ese código.
- Solo los miembros de un hogar pueden leer o cambiar sus datos (lo impone la base de datos con RLS, no solo la app).
