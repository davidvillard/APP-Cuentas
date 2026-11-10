// Decide qué se ve: acceso, contraseña nueva (enlace de recuperación), crear/unirse a un hogar o la app.
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppShell, useRoute } from '@/components/AppShell';
import { backend } from '@/lib/backend';
import { DataProvider, FullMessage } from '@/lib/store';
import type { Session } from '@/lib/types';
import { AuthScreen, OnboardingScreen, ResetScreen } from '@/screens/auth';
import { Inicio } from '@/pages/Inicio';
import { Movimientos } from '@/pages/Movimientos';
import { Horarios } from '@/pages/Horarios';
import { Informes } from '@/pages/Informes';
import { Hogar } from '@/pages/Hogar';
import { Navidad } from '@/pages/Navidad';

// El enlace del correo de recuperación vuelve con #…type=recovery. Se lee al cargar, antes de que Supabase limpie la URL.
const CAME_FROM_RECOVERY = location.hash.includes('type=recovery');

export default function App() {
  const [auth, setAuth] = useState<{ ready: boolean; session: Session | null }>({ ready: false, session: null });
  const [recovering, setRecovering] = useState(CAME_FROM_RECOVERY);

  useEffect(() => {
    let alive = true;
    backend.session().then((s) => { if (alive) setAuth({ ready: true, session: s }); });
    backend.onAuthChange((s, event) => {
      if (!alive) return;
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setAuth({ ready: true, session: s });
    });
    return () => { alive = false; };
  }, []);

  if (!auth.ready) return <FullMessage title="Cargando…" />;
  if (!auth.session) return <AuthScreen />;
  if (recovering) {
    return (
      <ResetScreen
        session={auth.session}
        onDone={() => {
          setRecovering(false);
          history.replaceState(null, '', location.pathname);
          toast.success('Contraseña cambiada');
        }}
      />
    );
  }
  return <HouseholdGate key={auth.session.user.id} session={auth.session} />;
}

function HouseholdGate({ session }: { session: Session }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['household', session.user.id], queryFn: () => backend.household() });
  if (q.isPending) return <FullMessage title="Cargando…" />;
  if (q.isError) return <FullMessage title="No se pudo cargar tu hogar" text={(q.error as Error).message} action={() => q.refetch()} />;
  if (!q.data) {
    return <OnboardingScreen session={session} onDone={() => qc.invalidateQueries({ queryKey: ['household'] }).then(() => { location.hash = '/hogar'; })} />;
  }
  return (
    <DataProvider session={session} household={q.data}>
      <Router />
    </DataProvider>
  );
}

function Router() {
  const [route, go] = useRoute();
  const page = {
    inicio: <Inicio go={go} />,
    movimientos: <Movimientos />,
    horarios: <Horarios go={go} />,
    informes: <Informes go={go} />,
    hogar: <Hogar />,
    navidad: <Navidad />,
  }[route];
  return <AppShell route={route} go={go}>{page}</AppShell>;
}
