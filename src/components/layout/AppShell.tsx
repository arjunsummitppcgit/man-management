'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import BottomNav from '@/components/layout/BottomNav';

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
      {/* Mobile: identical centered column. Desktop: full-width content beside the sidebar. */}
      <div className="lg:pl-[268px]">
        <div className="max-w-lg mx-auto min-h-screen bg-gray-50 relative lg:max-w-[1560px] lg:mx-auto lg:px-6 xl:px-10">
          <main className="pb-20 lg:pb-14">{children}</main>
          <BottomNav />
        </div>
      </div>
    </>
  );
}
