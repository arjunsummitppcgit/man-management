'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/lib/supabase/client';
import { exportToPDF, exportToExcel } from '@/lib/export';
import Modal from '@/components/ui/Modal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';


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

  // Report Preview state
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<(string | number)[][]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // User email from auth and check dark mode
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '');
    });
    setIsDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  // Fetch Report Preview Data when dateFrom, dateTo, or reportType changes
  useEffect(() => {
    if (!dateFrom || !dateTo) {
      setPreviewHeaders([]);
      setPreviewRows([]);
      return;
    }

    const fetchPreviewData = async () => {
      setPreviewLoading(true);
      try {
        let headers: string[] = [];
        let rows: (string | number)[][] = [];

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
            .select('work_date, location_id, headless_to_va')
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
            entry.processed += (p.headless_to_va || 0);
            dateMap.set(p.work_date, entry);
          });
          rows = Array.from(dateMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, val]) => [date, val.workforce, Number(val.processed.toFixed(2))]);

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
            .gt('is_present', 0)
            .order('work_date', { ascending: true });

          headers = ['Date', 'Supervisor', 'Location', 'Attendance Value'];
          rows = (data || []).map((a: Record<string, unknown>) => [
            a.work_date as string,
            (a.supervisor as { name: string } | null)?.name || '',
            (a.location as { name: string } | null)?.name || '',
            typeof a.is_present === 'boolean' ? (a.is_present ? 1.0 : 0.0) : (Number(a.is_present) || 0),
          ]);

        } else if (reportType === 'Processing Report') {
          const { data } = await supabase
            .from('daily_processing')
            .select('work_date, headless_to_va, notes, location:locations(name)')
            .gte('work_date', dateFrom)
            .lte('work_date', dateTo)
            .order('work_date', { ascending: true });

          headers = ['Date', 'Location', 'Processed (kg)', 'Notes'];
          rows = (data || []).map((p: Record<string, unknown>) => [
            p.work_date as string,
            (p.location as { name: string } | null)?.name || '',
            Number((p.headless_to_va as number || 0).toFixed(2)),
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

        setPreviewHeaders(headers);
        setPreviewRows(rows);
      } catch (err) {
        console.error('Error fetching preview data:', err);
        showToast('Failed to load report preview', 'error');
        setPreviewHeaders([]);
        setPreviewRows([]);
      } finally {
        setPreviewLoading(false);
      }
    };

    fetchPreviewData();
  }, [reportType, dateFrom, dateTo, showToast]);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetting, setResetting] = useState(false);


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
    if (previewRows.length === 0) {
      showToast('No data available to export', 'error');
      return;
    }
    setExporting(true);
    try {
      const title = `${reportType} (${dateFrom} to ${dateTo})`;
      const filename = `${reportType.replace(/\s+/g, '_').toLowerCase()}_${dateFrom}_${dateTo}`;

      if (format === 'pdf') {
        exportToPDF(title, previewHeaders, previewRows, filename);
      } else {
        exportToExcel(title, previewHeaders, previewRows, filename);
      }

      showToast(`${reportType} exported as ${format.toUpperCase()} successfully!`, 'success');
    } catch {
      showToast('Export failed. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleResetData = async () => {
    setResetting(true);
    try {
      // 1. Delete monthly targets
      const { error: targetsErr } = await supabase
        .from('monthly_targets')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // 2. Delete daily processing
      const { error: processingErr } = await supabase
        .from('daily_processing')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // 3. Delete daily sanitization
      const { error: sanitizationErr } = await supabase
        .from('daily_sanitization')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // 4. Delete daily supervisor assignments
      const { error: assignmentsErr } = await supabase
        .from('daily_supervisor_assignments')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // 5. Delete daily workforce
      const { error: workforceErr } = await supabase
        .from('daily_workforce')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (targetsErr || processingErr || sanitizationErr || assignmentsErr || workforceErr) {
        console.error({ targetsErr, processingErr, sanitizationErr, assignmentsErr, workforceErr });
        showToast('Reset failed or partially failed. Check console for details.', 'error');
      } else {
        showToast('All entry data reset successfully!', 'success');
        setIsResetModalOpen(false);
        router.refresh();
      }
    } catch (err) {
      console.error(err);
      showToast('An unexpected error occurred during reset.', 'error');
    } finally {
      setResetting(false);
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

            {/* Scrollable Preview Box */}
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report Preview</span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                  {previewRows.length} rows found
                </span>
              </div>

              <div className="max-h-60 overflow-auto border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/30 dark:bg-gray-800/20 scrollbar-thin min-h-[120px] flex flex-col justify-start">
                {previewLoading ? (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <LoadingSpinner />
                  </div>
                ) : !dateFrom || !dateTo ? (
                  <div className="flex-1 flex items-center justify-center py-8 text-center px-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      📅 Please select a From and To date range to preview data
                    </p>
                  </div>
                ) : previewRows.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center py-8 text-center px-4">
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                      📭 No data found for the selected range
                    </p>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 bg-gray-100/90 dark:bg-gray-800/90 backdrop-blur-sm shadow-sm z-10">
                      <tr>
                        {previewHeaders.map((header, idx) => (
                          <th key={idx} className="px-3 py-2 font-bold text-gray-750 dark:text-gray-305 border-b border-gray-250 dark:border-gray-700 whitespace-nowrap">
                            {header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800/50">
                      {previewRows.map((row, rIdx) => (
                        <tr key={rIdx} className="hover:bg-gray-50/50 dark:hover:bg-gray-700/30 transition-colors">
                          {row.map((val, cIdx) => (
                            <td key={cIdx} className="px-3 py-2 text-gray-650 dark:text-gray-400 whitespace-nowrap">
                              {typeof val === 'number' ? val : (val || '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* Export Buttons */}
            <div className="flex gap-2 pt-3 border-t border-gray-100 dark:border-gray-800 mt-2">
              <button
                onClick={() => handleExport('pdf')}
                disabled={exporting || previewLoading || previewRows.length === 0}
                className="flex-1 py-2.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/20 dark:hover:bg-rose-950/30 text-rose-600 dark:text-rose-450 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                PDF
              </button>
              <button
                onClick={() => handleExport('excel')}
                disabled={exporting || previewLoading || previewRows.length === 0}
                className="flex-1 py-2.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-450 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
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

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-rose-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-rose-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-rose-600">Danger Zone</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Delete all entry data (daily workforce, supervisor attendance, processing records, targets, and sanitization logs) to start fresh. Supervisor profiles and locations will not be deleted.
          </p>
          <button
            onClick={() => setIsResetModalOpen(true)}
            className="w-full py-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 font-semibold text-sm rounded-xl transition-colors border border-rose-200 min-h-[44px] flex items-center justify-center gap-1.5"
          >
            Reset All Entry Data
          </button>
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

        {/* Reset Confirmation Modal */}
        <Modal
          isOpen={isResetModalOpen}
          onClose={() => !resetting && setIsResetModalOpen(false)}
          title="Reset Application Data"
        >
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 text-rose-700 text-xs rounded-xl border border-rose-100 font-medium">
              ⚠️ Warning: This action is irreversible. All workforce records, supervisor attendance logs, processing data, sanitization logs, and monthly targets will be deleted permanently.
            </div>
            <p className="text-sm text-gray-600">
              Locations and Supervisor names/profiles will be kept intact.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setIsResetModalOpen(false)}
                disabled={resetting}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleResetData}
                disabled={resetting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-semibold text-sm rounded-xl transition-colors disabled:opacity-50 min-h-[44px] flex items-center justify-center gap-1.5"
              >
                {resetting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Resetting...
                  </>
                ) : (
                  'Yes, Reset All'
                )}
              </button>
            </div>
          </div>
        </Modal>


        {/* Bottom spacing */}
        <div className="h-4" />
      </div>
    </div>
  );
}
