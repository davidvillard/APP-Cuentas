// Ajustes de tu cuenta: con qué email entras, salir y eliminar la cuenta.
// Eliminar la cuenta no rompe el hogar: tu perfil se queda sin cuenta con todo lo que apuntaste.
// Como no se puede deshacer, hay que escribir ELIMINAR para confirmar.
import { useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardTitle, PageHeader } from '@/components/bits';
import { backend } from '@/lib/backend';
import { useApp } from '@/lib/store';

const WORD = 'ELIMINAR';

export function Ajustes() {
  const { session, household, data, me, memberOf, isAdmin } = useApp();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const others = data.members.filter((m) => m.user_id !== session.user.id);
  const otherAdmins = others.some((m) => m.is_admin);
  const nextAdmin = data.people.find((p) => p.user_id === others[0]?.user_id)?.name;
  const myMember = me ? memberOf(me) : undefined;

  const remove = async () => {
    setBusy(true);
    try {
      await backend.deleteAccount();
      toast.success('Tu cuenta se ha eliminado');
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="flex max-w-2xl flex-col gap-6">
        <Card>
          <CardTitle>Tu cuenta</CardTitle>
          <dl className="grid gap-3 text-sm sm:grid-cols-[9rem_1fr]">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="font-medium break-all">{session.user.email ?? '—'}</dd>
            <dt className="text-muted-foreground">Hogar</dt>
            <dd className="font-medium">{household.name}{myMember?.is_admin ? ' · eres administrador' : ''}</dd>
          </dl>
          <Button variant="outline" className="mt-5" onClick={() => backend.signOut()}><LogOut /> Salir</Button>
        </Card>

        <Card className="border-over/40">
          <CardTitle>Eliminar cuenta</CardTitle>
          <p className="max-w-[60ch] text-sm text-muted-foreground">
            Se borra tu usuario y ya no podrás entrar con este email (podrás crear una cuenta nueva si quieres).
          </p>
          <ul className="mt-3 max-w-[60ch] list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {others.length ? (
              <>
                <li>Lo que has apuntado se queda en {household.name}: tu perfil pasa a ser un perfil sin cuenta, con tus gastos, trabajos y horarios.</li>
                {isAdmin && !otherAdmins && nextAdmin && <li>Eres el único administrador: pasará a serlo {nextAdmin}.</li>}
              </>
            ) : (
              <li>Eres la única persona con cuenta en {household.name}, así que el hogar se elimina con todos sus datos.</li>
            )}
          </ul>
          <Button variant="delete" className="mt-5" onClick={() => { setTyped(''); setOpen(true); }}><Trash2 /> Eliminar mi cuenta</Button>
        </Card>
      </div>

      <AlertDialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <AlertDialogContent>
          <form onSubmit={(e) => { e.preventDefault(); if (typed.trim().toUpperCase() === WORD) remove(); }} className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar tu cuenta para siempre?</AlertDialogTitle>
              <AlertDialogDescription>
                {others.length
                  ? `No se puede deshacer. Tus datos se quedan en ${household.name}, pero ya no podrás entrar con ${session.user.email ?? 'este email'}.`
                  : `No se puede deshacer. Se eliminan tu cuenta y ${household.name} con todos sus datos.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <label className="grid gap-1.5 text-sm font-medium text-muted-foreground">
              Escribe {WORD} para confirmar
              <Input autoFocus className="h-10" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={busy}>Cancelar</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={busy || typed.trim().toUpperCase() !== WORD}>
                {busy ? 'Eliminando…' : 'Eliminar mi cuenta'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
