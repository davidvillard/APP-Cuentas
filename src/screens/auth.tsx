// Pantallas sin sesión o sin hogar: entrar / crear cuenta / recuperar contraseña, elegir contraseña nueva
// (al volver del correo de recuperación) y crear o unirse a un hogar.
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Brand } from '@/components/AppShell';
import { Field } from '@/components/bits';
import { backend, isConfigured } from '@/lib/backend';
import type { Session } from '@/lib/types';

const validEmail = (s: string) => /^\S+@\S+\.\S+$/.test(s);

function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid min-h-svh w-full max-w-5xl content-start gap-10 px-5 py-6 md:grid-cols-2 md:content-center md:gap-16 md:px-8">
      <div className="md:col-span-2"><Brand /></div>
      <div className="space-y-4">
        <h1 className="text-4xl font-bold leading-[1.05] tracking-tight md:text-5xl">Lo que entra, lo que sale y lo que os queda.</h1>
        <p className="max-w-md text-lg text-muted-foreground">Sueldos fijos o por horas, gastos previstos y reales, y cada mes un informe de cuánto habéis ahorrado.</p>
        <dl className="hidden max-w-sm border-t pt-4 md:block">
          {[['Nómina de Alex', '2.150 €'], ['Sara, 118 h a 9,80 €', '1.156 €'], ['Gastos del mes', '−1.902 €']].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5"><dt>{k}</dt><dd>{v}</dd></div>
          ))}
          <div className="mt-1.5 flex justify-between border-t pt-2.5 font-bold text-income"><dt>Os quedan</dt><dd>1.404 €</dd></div>
        </dl>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

function Message({ error, info }: { error: string; info: string }) {
  return (
    <>
      {error && <p role="alert" className="text-sm font-medium text-over">{error}</p>}
      {info && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{info}</p>}
    </>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const switchTo = (m: typeof mode) => { setMode(m); setError(''); setInfo(''); };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setError(''); setInfo('');
    const mail = email.trim();
    if (!validEmail(mail)) return setError('Escribe un email válido.');
    if (mode !== 'forgot' && password.length < 8) return setError('La contraseña necesita al menos 8 caracteres.');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await backend.resetPassword(mail);
        setInfo(`Si hay una cuenta con ${mail}, te llegará un correo con el enlace. Revisa también el spam.`);
      } else if (mode === 'signup') {
        const { needsConfirmation } = await backend.signUp(mail, password);
        if (needsConfirmation) {
          setMode('login');
          setInfo(`Te hemos enviado un correo a ${mail}. Abre el enlace para confirmar la cuenta y luego entra.`);
        }
      } else {
        await backend.signIn(mail, password);
      }
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  };

  return (
    <Layout>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">{mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Recuperar la contraseña' : 'Entrar'}</h2>
        {!isConfigured && <p className="rounded-lg bg-muted p-3 text-sm">Supabase no está configurado: entra con cualquier email y contraseña para ver la app con datos de ejemplo.</p>}
        {mode === 'forgot' && <p className="text-muted-foreground">Te enviamos un enlace para elegir una contraseña nueva.</p>}
        <Field label="Email">
          <Input className="h-11" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        {mode !== 'forgot' && (
          <Field label="Contraseña">
            <Input className="h-11" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        )}
        {mode === 'signup' && <p className="-mt-2 text-sm text-muted-foreground">Mínimo 8 caracteres.</p>}
        {mode === 'login' && (
          <button type="button" className="-mt-2 self-start text-sm font-semibold text-ring" onClick={() => switchTo('forgot')}>¿Has olvidado la contraseña?</button>
        )}
        <Message error={error} info={info} />
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? 'Un momento…' : mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar enlace' : 'Entrar'}
        </Button>
        <p className="text-sm text-muted-foreground">
          {mode === 'login' ? '¿Es tu primera vez? ' : mode === 'signup' ? '¿Ya tienes cuenta? ' : ''}
          <button type="button" className="font-semibold text-ring" onClick={() => switchTo(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? 'Crear cuenta' : 'Volver a entrar'}
          </button>
        </p>
      </form>
    </Layout>
  );
}

export function ResetScreen({ session, onDone }: { session: Session; onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (password.length < 8) return setError('La contraseña necesita al menos 8 caracteres.');
    setBusy(true);
    try {
      await backend.updatePassword(password);
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Layout>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Elige una contraseña nueva</h2>
        <p className="text-muted-foreground">Para {session.user.email}. Mínimo 8 caracteres.</p>
        <Field label="Contraseña nueva">
          <Input className="h-11" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Message error={error} info="" />
        <Button type="submit" variant="save" size="lg" disabled={busy}>{busy ? 'Un momento…' : 'Guardar contraseña'}</Button>
      </form>
    </Layout>
  );
}

export function OnboardingScreen({ session, onDone }: { session: Session; onDone: () => void }) {
  const [person, setPerson] = useState('');
  const [house, setHouse] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async (fn: () => Promise<void>) => {
    if (!person.trim()) return setError('Escribe tu nombre.');
    setBusy(true); setError('');
    try {
      await fn();
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-8 px-5 py-6 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <Brand />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="truncate">{session.user.email}</span>
          <Button variant="ghost" size="sm" onClick={() => backend.signOut()}>Salir</Button>
        </div>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bienvenido a Tilo</h1>
        <p className="pt-2 text-muted-foreground">Primero, ¿cómo te llamas? Así sabremos quién paga cada gasto.</p>
      </div>
      <Field label="Tu nombre" className="max-w-sm">
        <Input className="h-11" value={person} onChange={(e) => setPerson(e.target.value)} placeholder="Por ejemplo, David" />
      </Field>
      <div className="grid gap-6 md:grid-cols-2">
        <form className="flex flex-col gap-3 rounded-xl border p-5" onSubmit={(e) => { e.preventDefault(); go(() => backend.createHousehold(house.trim(), person.trim())); }}>
          <h2 className="text-lg font-semibold">Crear vuestro hogar</h2>
          <p className="text-sm text-muted-foreground">Es donde se guardan los sueldos y gastos. Luego invitas a tu pareja con un código.</p>
          <Field label="Nombre del hogar"><Input className="h-10" value={house} onChange={(e) => setHouse(e.target.value)} placeholder="Casa" /></Field>
          <Button type="submit" disabled={busy} className="mt-auto">Crear hogar</Button>
        </form>
        <form className="flex flex-col gap-3 rounded-xl border p-5" onSubmit={(e) => { e.preventDefault(); go(() => backend.joinHousehold(code, person.trim())); }}>
          <h2 className="text-lg font-semibold">Unirme a un hogar</h2>
          <p className="text-sm text-muted-foreground">Si tu pareja ya lo creó, pídele el código. Lo tiene en Hogar.</p>
          <Field label="Código de invitación">
            <Input className="h-10 uppercase tracking-widest" maxLength={8} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Button type="submit" variant="outline" disabled={busy || !code.trim()} className="mt-auto">Unirme</Button>
        </form>
      </div>
      {error && <p role="alert" className="font-medium text-over">{error}</p>}
    </div>
  );
}
