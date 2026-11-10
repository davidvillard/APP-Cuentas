import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { ConfirmProvider } from '@/components/confirm';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // Los cambios llegan en directo por Supabase Realtime; al volver a la pestaña también se recarga.
    queries: { staleTime: 30_000, retry: 2, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <App />
        <Toaster position="top-center" richColors closeButton />
      </ConfirmProvider>
    </QueryClientProvider>
  </StrictMode>,
);
