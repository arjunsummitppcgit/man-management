'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';
import ScrollToTop from '@/components/layout/ScrollToTop';
import PageGuard from '@/components/layout/PageGuard';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Login stays a centered, chrome-free page on every screen size
  if (pathname === '/login') {
    return (
      <div className="max-w-lg mx-auto min-h-screen bg-gray-50 relative">
        <main className="pb-20">{children}</main>
      </div>
    );
  }

  return (
    <>
      <Sidebar />
      {/* Mobile: identical centered column. Desktop: full-width content beside the sidebar.
          print-full-width releases both constraints when printing (see globals.css). */}
      <div className="lg:pl-[268px] print-full-width">
        <div className="max-w-lg mx-auto min-h-screen bg-gray-50 relative lg:max-w-[1560px] lg:mx-auto lg:px-6 xl:px-10 print-full-width">
          <main className="pb-20 lg:pb-14">
            <PageGuard>{children}</PageGuard>
          </main>
          <BottomNav />
        </div>
      </div>
      {/* Fixed to the viewport, so it sits outside the content column */}
      <ScrollToTop />
    </>
  );
}
