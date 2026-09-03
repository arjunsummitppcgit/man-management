import type { Metadata, Viewport } from 'next';
import { Inter, Sora } from 'next/font/google';
import './globals.css';
import AppShell from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';
import { PermissionAlertProvider } from '@/components/ui/PermissionAlert';
import { AuthProvider } from '@/hooks/useAuth';
import { TicketAlertsProvider } from '@/hooks/useTicketAlerts';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'PPC Manager',
  description: 'Prawn Processing Management',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PPC Manager',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The theme script below sets the `dark` class before React hydrates, so the
    // server's className never matches — that difference is intended, not a bug.
    <html lang="en" className={`${inter.variable} ${sora.variable} h-full`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                if (localStorage.getItem('theme') === 'light') {
                  document.documentElement.classList.remove('dark');
                } else {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full font-sans antialiased bg-gray-50 text-gray-900">
        <ToastProvider>
          {/* One session + rights fetch for the whole app. Previously every
              useAuth() call site kept its own copy, so a single page mounted
              four independent listeners and four copies of the same queries. */}
          <AuthProvider>
            {/* Sits inside AuthProvider: the popup explains a refused save using
                the same rights the rest of the app reads. */}
            <PermissionAlertProvider>
              {/* One ticket-activity check for the whole app — the nav badges
                  and the Tickets page all read the same answer. */}
              <TicketAlertsProvider>
                <AppShell>{children}</AppShell>
              </TicketAlertsProvider>
            </PermissionAlertProvider>
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
