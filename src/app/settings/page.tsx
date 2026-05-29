'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/lib/supabase/client';
import { exportToPDF, exportToExcel } from '@/lib/export';

const REPORT_TYPES = [
  'Daily Summary',
  'Workforce Report',
  'Supervisor Attendance',
  'Processing Report',
  'Sanitization Report',
];

export default function SettingsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const { locations } = useLocations();
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // User email from auth and check dark mode
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '');
    });
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const handleToggleDarkMode = () => {
    const nextDark = !isDarkMode;
    setIsDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    window.dispatchEvent(new Event('themechange'));
  };

  // Derive initials from email
  const userInitials = userEmail
    ? userEmail
        .split('@')[0]
        .split(/[._-]/)
        .map((part) => part.charAt(0).toUpperCase())
        .slice(0, 2)
        .join('')
    : 'PM';

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!dateFrom || !dateTo) {
      showToast('Please select a date range', 'error');
      return;
    }
    setExporting(true);
    try {
      let headers: string[] = [];
      let rows: (string | number)[][] = [];
      const title = `${reportType} (${dateFrom} to ${dateTo})`;
      const filename = `${reportType.replace(/\s+/g, '_').toLowerCase()}_${dateFrom}_${dateTo}`;

      if (reportType === 'Daily Summary') {
        // Fetch workforce + processing for each date in range
        const { data: workforce } = await supabase
          .from('daily_workforce')
          .select('work_date, location_id, total_headcount')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: true });

        const { data: processing } = await supabase
          .from('daily_processing')
          .select('work_date, location_id, processed_kg')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: true });

        headers = ['Date', 'Total Workforce', 'Total Processed (kg)'];
        const dateMap = new Map<string, { workforce: number; processed: number }>();
        workforce?.forEach((w) => {
          const entry = dateMap.get(w.work_date) || { workforce: 0, processed: 0 };
          entry.workforce += w.total_headcount;
          dateMap.set(w.work_date, entry);
        });
        processing?.forEach((p) => {
          const entry = dateMap.get(p.work_date) || { workforce: 0, processed: 0 };
          entry.processed += p.processed_kg;
          dateMap.set(p.work_date, entry);
        });
        rows = Array.from(dateMap.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, val]) => [date, val.workforce, Math.round(val.processed * 10) / 10]);

      } else if (reportType === 'Workforce Report') {
        const { data } = await supabase
          .from('daily_workforce')
          .select('work_date, labour_count, boys_count, checking_count, cleaning_count, qc_count, security_count, total_headcount')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: true });

        headers = ['Date', 'Labour', 'Boys', 'Checking', 'Cleaning', 'QC', 'Security', 'Total'];
        rows = (data || []).map((w) => [
          w.work_date, w.labour_count, w.boys_count, w.checking_count,
          w.cleaning_count, w.qc_count, w.security_count, w.total_headcount,
        ]);

      } else if (reportType === 'Supervisor Attendance') {
        const { data } = await supabase
          .from('daily_supervisor_assignments')
          .select('work_date, is_present, supervisor:supervisors(name), location:locations(name)')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .eq('is_present', true)
          .order('work_date', { ascending: true });

        headers = ['Date', 'Supervisor', 'Location', 'Present'];
        rows = (data || []).map((a: Record<string, unknown>) => [
          a.work_date as string,
          (a.supervisor as { name: string } | null)?.name || '',
          (a.location as { name: string } | null)?.name || '',
          (a.is_present as boolean) ? 'Yes' : 'No',
        ]);

      } else if (reportType === 'Processing Report') {
        const { data } = await supabase
          .from('daily_processing')
          .select('work_date, processed_kg, notes, location:locations(name)')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: true });

        headers = ['Date', 'Location', 'Processed (kg)', 'Notes'];
        rows = (data || []).map((p: Record<string, unknown>) => [
          p.work_date as string,
          (p.location as { name: string } | null)?.name || '',
          p.processed_kg as number,
          (p.notes as string) || '',
        ]);

      } else if (reportType === 'Sanitization Report') {
        const { data } = await supabase
          .from('daily_sanitization')
          .select('work_date, cleaning_labour, crates_cleaning, nets_cleaning, nmr_labour, washroom_cleaning, grading_machine_cleaning, location:locations(name)')
          .gte('work_date', dateFrom)
          .lte('work_date', dateTo)
          .order('work_date', { ascending: true });

        headers = ['Date', 'Location', 'Cleaning Labour', 'Crates', 'Nets', 'NMR', 'Washroom', 'Grading Machine'];
        rows = (data || []).map((s: Record<string, unknown>) => [
          s.work_date as string,
          (s.location as { name: string } | null)?.name || '',
          s.cleaning_labour as number,
          s.crates_cleaning as number,
          s.nets_cleaning as number,
          s.nmr_labour as number,
          s.washroom_cleaning as number,
          s.grading_machine_cleaning as number,
        ]);
      }

      if (format === 'pdf') {
        exportToPDF(title, headers, rows, filename);
      } else {
        exportToExcel(title, headers, rows, filename);
      }

      showToast(`${reportType} exported as ${format.toUpperCase()} successfully!`, 'success');
    } catch {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="More" />

      <div className="px-4 space-y-4">
        {/* Profile Card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-lg shadow-teal-600/20">
              <span className="text-white text-xl font-bold">{userInitials}</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">Plant Manager</h3>
              <p className="text-sm text-gray-500">{userEmail || 'Loading...'}</p>
              <span className="inline-block mt-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-full">
                Admin
              </span>
            </div>
          </div>
        </div>

        {/* App Preferences (Dark Mode) */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shadow-inner">
                <span className="text-sm">{isDarkMode ? '🌙' : '☀️'}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700">Dark Mode</h3>
                <p className="text-[10px] text-gray-400">Toggle dark theme preference</p>
              </div>
            </div>
            
            <button
              onClick={handleToggleDarkMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/20 active:scale-95 ${
                isDarkMode ? 'bg-teal-600' : 'bg-gray-200'
              }`}
              aria-label="Toggle dark mode"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isDarkMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Export Reports */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-amber-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-700">Export Reports</h3>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500 appearance-none"
              >
                {REPORT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 focus:border-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting}
                className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                PDF
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting}
                className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0112 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12h-1.5m1.5 0c.621 0 1.125.504 1.125 1.125M12 12h7.5m-7.5 0c0 .621-.504 1.125-1.125 1.125M21.375 12c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25-3.75c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125" />
                </svg>
                Excel
              </button>
            </div>
          </div>
        </div>

        {/* Manage Locations */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-blue-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-700">Manage Locations</h3>
          </div>

          <div className="space-y-1">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                    <span className="text-xs font-bold text-teal-600">
                      {loc.name.replace('PPC ', '')}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{loc.name}</p>
                    <p className="text-[10px] text-gray-400">{loc.code}</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-full">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* App Info */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-purple-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-700">App Info</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-500">Version</span>
              <span className="text-sm font-medium text-gray-700">1.0.0</span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-500">Build</span>
              <span className="text-sm font-medium text-gray-700">2026.05.28</span>
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-gray-500">Environment</span>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-semibold rounded-full">
                Demo
              </span>
            </div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full py-3.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 font-semibold rounded-2xl transition-colors border border-rose-200 min-h-[48px] flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
          </svg>
          Sign Out
        </button>

        {/* Bottom spacing */}
        <div className="h-4" />
      </div>
    </div>
  );
}
