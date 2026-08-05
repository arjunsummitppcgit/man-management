'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PageHeader from '@/components/layout/PageHeader';
import { useToast } from '@/components/ui/Toast';
import { useLocations } from '@/hooks/useLocations';
import { supabase } from '@/lib/supabase/client';
import { exportToPDF, exportToExcel } from '@/lib/export';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useAppSettings, SETTING_NL_LADIES_SALARY_BASIC } from '@/hooks/useAppSettings';
import { getTodayString } from '@/lib/utils';


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
  const { locations, addLocation } = useLocations();
  const { isSubUser } = useAuth();
  // Sub-users cannot access attendance reports — admin only
  const reportTypes = isSubUser
    ? REPORT_TYPES.filter((type) => type !== 'Supervisor Attendance')
    : REPORT_TYPES;
  const [reportType, setReportType] = useState(REPORT_TYPES[0]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [isLightMode, setIsLightMode] = useState(false);
  const [showLiveAnalytics, setShowLiveAnalytics] = useState(true);

  // Manage Locations
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [addingLocation, setAddingLocation] = useState(false);

  // Company Ladies salary basic (admin-only)
  const { nlLadiesSalaryBasic, loading: settingsLoading, updateSetting } = useAppSettings();
  const [basicModalOpen, setBasicModalOpen] = useState(false);
  const [newSalaryBasic, setNewSalaryBasic] = useState('');
  const [savingBasic, setSavingBasic] = useState(false);

  // Report Preview state
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<(string | number)[][]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // My Tasks summary (maintenance tasks)
  const [taskCounts, setTaskCounts] = useState({ pending: 0, due: 0 });

  // User email from auth and check dark mode
  const [userEmail, setUserEmail] = useState('');
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserEmail(data.user.email || '');
    });
    setIsLightMode(!document.documentElement.classList.contains('dark'));
    setShowLiveAnalytics(localStorage.getItem('showLiveAnalytics') !== 'false');
  }, []);

  // Pending / due-today counts for the My Tasks card badge
  useEffect(() => {
    supabase
      .from('maintenance_tasks')
      .select('next_followup_on')
      .eq('status', 'pending')
      .then(({ data, error }) => {
        if (error) {
          console.error('Error fetching maintenance task counts:', error);
          return;
        }
        const today = getTodayString();
        setTaskCounts({
          pending: data?.length || 0,
          due: (data || []).filter((t) => t.next_followup_on && t.next_followup_on <= today).length,
        });
      });
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
            .map(([date, val]) => [date, val.workforce, Number(val.processed.toFixed(3))]);

        } else if (reportType === 'Workforce Report') {
          const { data } = await supabase
            .from('daily_workforce')
            .select('work_date, labour_count, boys_count, checking_waste, checking_pd, checking_count, cleaning_count, qc_count, security_count, total_headcount')
            .gte('work_date', dateFrom)
            .lte('work_date', dateTo)
            .order('work_date', { ascending: true });

          headers = [
            'Date', 'Labour', 'Boys', 'Waste Checking', 'PD Checking', 'Checking Total',
            'Cleaning', 'QC', 'Security', 'Total',
          ];
          rows = (data || []).map((w) => [
            w.work_date, w.labour_count, w.boys_count,
            // Dates before migration 023 carry an unsplit figure in the total only.
            w.checking_waste, w.checking_pd, w.checking_count,
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
            Number((p.headless_to_va as number || 0).toFixed(3)),
            (p.notes as string) || '',
          ]);

        } else if (reportType === 'Sanitization Report') {
          const { data } = await supabase
            .from('daily_sanitization')
            .select('work_date, outside_cleaning, local_crates_wash, company_crates_wash, cleaning_labour, nmr_labour, crates_cleaning, nets_cleaning, washroom_cleaning, grading_machine_cleaning, chlorine_ppc, chlorine_crates, chlorine_washrooms, soap_oil_ppc, soap_oil_crates, soap_oil_washrooms, gloves, head_cap, masks, location:locations(name)')
            .gte('work_date', dateFrom)
            .lte('work_date', dateTo)
            .order('work_date', { ascending: true });

          headers = [
            'Date', 'Location', 'Outside Cleaning', 'Local Crates Wash', 'Company Crates Wash',
            'Cleaning Labour (retired)', 'NMR Labour (retired)', 'Crates Cleaned', 'Nets Cleaned',
            'Washroom Cleaned', 'Grading Machine Cleaned', 'Chlorine PPC (L)', 'Chlorine Crates (L)',
            'Chlorine Washrooms (L)', 'Soap Oil PPC (L)', 'Soap Oil Crates (L)', 'Soap Oil Washrooms (L)',
            'Gloves (pairs)', 'Head Cap (pcs)', 'Masks (pcs)'
          ];
          rows = (data || []).map((s: Record<string, unknown>) => [
            s.work_date as string,
            (s.location as { name: string } | null)?.name || '',
            s.outside_cleaning as number,
            s.local_crates_wash as number,
            s.company_crates_wash as number,
            // Retired by migration 024 — kept in the export so historical dates stay complete.
            s.cleaning_labour as number,
            s.nmr_labour as number,
            s.crates_cleaning as number,
            s.nets_cleaning as number,
            s.washroom_cleaning as number,
            s.grading_machine_cleaning as number,
            s.chlorine_ppc as number,
            s.chlorine_crates as number,
            s.chlorine_washrooms as number,
            s.soap_oil_ppc as number,
            s.soap_oil_crates as number,
            s.soap_oil_washrooms as number,
            s.gloves as number,
            s.head_cap as number,
            s.masks as number,
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


  const handleToggleLightMode = () => {
    const nextLight = !isLightMode;
    setIsLightMode(nextLight);
    if (nextLight) {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    }
    window.dispatchEvent(new Event('themechange'));
  };

  const handleToggleLiveAnalytics = () => {
    const nextVal = !showLiveAnalytics;
    setShowLiveAnalytics(nextVal);
    localStorage.setItem('showLiveAnalytics', String(nextVal));
    window.dispatchEvent(new Event('analyticschange'));
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



  const handleAddLocation = async () => {
    const trimmed = newLocationName.trim();
    if (!trimmed) {
      showToast('Enter a location name', 'error');
      return;
    }
    setAddingLocation(true);
    try {
      await addLocation(trimmed);
      showToast('Location added', 'success');
      setNewLocationName('');
      setLocationModalOpen(false);
    } catch (error) {
      console.error('Error adding location:', error);
      showToast('Failed to add location', 'error');
    } finally {
      setAddingLocation(false);
    }
  };

  const handleSaveSalaryBasic = async () => {
    const value = parseFloat(newSalaryBasic);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    setSavingBasic(true);
    try {
      await updateSetting(SETTING_NL_LADIES_SALARY_BASIC, value.toFixed(2));
      showToast(`Salary Basic updated to ₹${value.toFixed(2)}`, 'success');
      setBasicModalOpen(false);
    } catch (error) {
      console.error('Error updating salary basic:', error);
      showToast('Failed to update Salary Basic', 'error');
    } finally {
      setSavingBasic(false);
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

        {/* My Tasks — maintenance issues & follow-ups (admin-only) */}
        {!isSubUser && (
          <Link
            href="/maintenance-tasks"
            className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100 transition-transform active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-orange-600">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-700">My Tasks</h3>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {taskCounts.pending > 0
                    ? `${taskCounts.pending} pending maintenance task${taskCounts.pending > 1 ? 's' : ''}`
                    : 'Maintenance issues & follow-ups'}
                </p>
              </div>
              {taskCounts.due > 0 && (
                <span className="px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-semibold rounded-full flex-shrink-0">
                  {taskCounts.due} due
                </span>
              )}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </div>
          </Link>
        )}

        {/* Manage Locations (admin-only) */}
        {!isSubUser && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4.5 h-4.5 text-teal-600">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Manage Locations</h3>
              </div>
              <button
                type="button"
                onClick={() => setLocationModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {locations.map((loc) => (
                <span
                  key={loc.id}
                  className="px-2.5 py-1 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-full border border-gray-200 dark:border-gray-700"
                >
                  {loc.name}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
              For rare cases needing extra processing capacity — added locations appear immediately in every location dropdown.
            </p>
          </div>
        )}

        {/* Company Ladies Salary Basic (admin-only) */}
        {!isSubUser && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                  <span className="text-sm">👩</span>
                </div>
                <h3 className="text-sm font-semibold text-gray-700">Company Ladies Salary Basic</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewSalaryBasic(String(nlLadiesSalaryBasic));
                  setBasicModalOpen(true);
                }}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                {settingsLoading ? '—' : `₹${nlLadiesSalaryBasic.toFixed(2)}`}
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-wider">per head</span>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
              Used on Daily Entry → NL Ladies to work out Difference and P&amp;L. Days already
              entered keep the rate they were saved under — a change only applies going forward.
            </p>
          </div>
        )}

        {/* App Preferences */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 animate-fade-in space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shadow-inner">
                <span className="text-sm">{isLightMode ? '☀️' : '🌙'}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  {isLightMode ? 'Light Mode' : 'Dark Mode'}
                </h3>
                <p className="text-[10px] text-gray-400">
                  {isLightMode ? 'Toggle to default dark theme' : 'Toggle to enable light theme'}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleToggleLightMode}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/40 active:scale-95 ${
                isLightMode
                  ? 'bg-teal-500 border-teal-500'
                  : 'bg-gray-300 border-gray-400 dark:bg-gray-600 dark:border-gray-500'
              }`}
              aria-label="Toggle theme mode"
            >
              <span
                style={{ backgroundColor: '#ffffff' }}
                className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform ${
                  isLightMode ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shadow-inner">
                <span className="text-sm">📊</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700">
                  Live Analytics
                </h3>
                <p className="text-[10px] text-gray-400">
                  {showLiveAnalytics ? 'Analytics are visible on dashboard' : 'Analytics are hidden on dashboard'}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleToggleLiveAnalytics}
              className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500/40 active:scale-95 ${
                showLiveAnalytics
                  ? 'bg-teal-500 border-teal-500'
                  : 'bg-gray-300 border-gray-400 dark:bg-gray-600 dark:border-gray-500'
              }`}
              aria-label="Toggle live analytics"
            >
              <span
                style={{ backgroundColor: '#ffffff' }}
                className={`inline-block h-4 w-4 transform rounded-full shadow-md transition-transform ${
                  showLiveAnalytics ? 'translate-x-6' : 'translate-x-1'
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
                {reportTypes.map((type) => (
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

      {/* Edit Salary Basic Modal */}
      {basicModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setBasicModalOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="mb-5">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Company Ladies Salary Basic</h3>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
                Currently ₹{nlLadiesSalaryBasic.toFixed(2)}. New entries use the new rate from the
                moment you save — already-saved days keep their original rate.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                Salary Basic (₹ per head)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                autoFocus
                value={newSalaryBasic}
                onChange={(e) => setNewSalaryBasic(e.target.value)}
                placeholder="e.g. 350"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBasicModalOpen(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingBasic}
                onClick={handleSaveSalaryBasic}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-xl shadow-lg shadow-amber-600/20 transition-all min-h-[48px] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {savingBasic ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Location Modal */}
      {locationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setLocationModalOpen(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl p-6 border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mb-5" />

            <div className="mb-5">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Add Location</h3>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
                For rare cases needing an extra processing location — it&apos;ll show up in every location dropdown right away.
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">
                Location Name
              </label>
              <input
                type="text"
                autoFocus
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="e.g. PPC 5"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setLocationModalOpen(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={addingLocation}
                onClick={handleAddLocation}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] flex items-center justify-center gap-2"
              >
                {addingLocation ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
