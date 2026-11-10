<img src="brand/tilo-logo.svg" alt="Tilo" width="360">
# Tilo

Tilo ([tilo.app](https://tilo.app)) es una app de presupuesto para el hogar: perfiles con sueldo fijo (12 o 14 pagas) o por horas con horario semanal, gastos previstos y reales por categoría, objetivo de ahorro e informe mensual descargable. Login con email y contraseña; los datos se comparten entre los miembros de un hogar.

## Arrancar

```bash
npm install
npm run dev
```

Abre http://localhost:5173. Sin `.env` arranca en **modo demo**: entras con cualquier email y contraseña y ves datos de ejemplo que no se guardan. Con `.env` usa Supabase: login real y datos guardados.

```bash
npm test           # cálculos (pagas extra, horas, ahorro, gastos fijos) con Vitest
npm run typecheck  # comprobación de tipos (TypeScript)
npm run build      # comprueba los tipos y genera la versión para publicar en dist/
```

## Tecnología

React 19 + TypeScript + Vite, Tailwind CSS 4 con componentes de [shadcn/ui](https://ui.shadcn.com) (hojas desde abajo, diálogos, avisos), iconos de `lucide-react`, datos con TanStack Query y gráficos con Recharts. Base de datos, login y cambios en directo con Supabase. Publicado en Vercel.

## Estructura

- `src/lib/calc.ts`: cálculos puros (ingresos fijos y por horas, gastos, ahorro, plan del mes, gastos fijos). Tests en `calc.test.ts`.
- `src/lib/backend.ts`: acceso a datos: Supabase o modo demo, con la misma interfaz.
- `src/lib/store.tsx`: estado de la app con sesión: datos del hogar, mes visible, cambios en directo y acciones de guardar y eliminar.
- `src/lib/types.ts`, `categories.ts` (icono y color de cada categoría), `format.ts`, `reports.ts` (CSV e informe descargable).
- `src/components/`: armazón con la navegación (`AppShell`), hoja de gasto (`expenses`), confirmación y piezas comunes; `ui/` son los componentes de shadcn/ui.
- `src/pages/`: Inicio, Movimientos, Horarios, Informes, Hogar y Navidad. `src/screens/`: acceso y alta del hogar.
- `supabase/migrations/`: tablas, funciones y seguridad por filas.
- `brand/`: logos. `prototipo/`: primer prototipo de una sola página.

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
