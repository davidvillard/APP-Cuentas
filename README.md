# Tilo

Tilo ([tilo.app](https://tilo.app)) es una app de presupuesto para el hogar: perfiles con sueldo fijo (12 o 14 pagas) o por horas con horario semanal, gastos previstos y reales por categoría, objetivo de ahorro e informe mensual descargable. Login con email y contraseña; los datos se comparten entre los miembros de un hogar.

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Sin `.env` arranca en **modo demo**: entras con cualquier email y contraseña y ves datos de ejemplo que no se guardan. Con `.env` usa Supabase: login real y datos guardados.

```bash
npm test        # cálculos (pagas extra, horas, ahorro)
npm run build   # versión para publicar, en dist/
```

## Estructura

- `src/calc.js`: cálculos puros (ingresos fijos y por horas, gastos, ahorro, plan del mes).
- `src/backend.js`: acceso a datos: Supabase o modo demo, con el mismo interfaz.
- `src/main.js`: pantallas (acceso, crear o unirse a un hogar, resumen, gastos, horarios, perfiles, informe).
- `src/styles.css`: estilos.
- `supabase/migrations/`: tablas, funciones y seguridad por filas (migración inicial).
- `prototipo/`: primer prototipo de una sola página.

## Configurar Supabase

1. Crea un proyecto gratuito en [supabase.com](https://supabase.com).
2. Crea las tablas de una de estas formas:
   - Con la integración de GitHub (Project Settings > Integrations > GitHub): conecta este repo, deja la carpeta `supabase` y activa el despliegue a producción desde `main`. Aplica las migraciones de `supabase/migrations/` sola.
   - A mano: en **SQL Editor**, pega y ejecuta `supabase/migrations/20261105000000_init.sql`.
3. En **Authentication > Providers**, deja activado Email.
4. Copia `.env.example` a `.env` y rellena `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Project Settings > API).

## Cómo funciona el hogar compartido

- Al registrarte creas un hogar. Tiene un código de invitación de 8 caracteres.
- La otra persona se registra y se une con ese código.
- Solo los miembros de un hogar pueden leer o cambiar sus datos (lo impone la base de datos con RLS, no solo la app).
