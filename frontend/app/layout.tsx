import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Gestión de Cadetes',
  description: 'Base de clientes y entregas para negocios',
  manifest: '/manifest.json',
};

// Every route reads the session cookie and/or useSearchParams — there is no
// static content to prerender, so opt the whole app out of static generation
// instead of wrapping each useSearchParams() call site in its own Suspense
// boundary.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
