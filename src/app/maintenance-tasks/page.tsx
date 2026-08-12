'use client';

import React, { useState, useEffect, useMemo } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/Toast';
import { usePermissionAlert } from '@/components/ui/PermissionAlert';
import { useLocations } from '@/hooks/useLocations';
import { useMaintenanceTasks, isFollowupDue, daysOpen } from '@/hooks/useMaintenanceTasks';
import { formatDate, getTodayString } from '@/lib/utils';
import type { MaintenanceTask, MaintenanceTaskFormData, TaskPriority } from '@/types';

type FilterKey = 'all' | 'pending' | 'due' | 'resolved';

const PRIORITIES: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
];

const EMPTY_FORM: MaintenanceTaskFormData = {
  title: '',
  problem: '',
  assigned_to: '',
  assigned_phone: '',
  location_id: '',
  priority: 'normal',
  escalated_on: '',
  next_followup_on: '',
};

// ─── Shared bottom-sheet shell ───────────────────────────────────────────────

function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-t-3xl border-t border-gray-200 dark:border-gray-800 shadow-2xl animate-slide-up flex flex-col"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-1 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto mt-4 mb-4 flex-shrink-0" />
        <div className="flex items-start justify-between px-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="min-w-0">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 ml-3 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center transition-colors active:scale-95"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 focus:border-teal-500 focus:outline-none';
const labelClass =
  'block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider';

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MaintenanceTasksPage() {
  const { showToast } = useToast();
  const { requireModify, reportError } = usePermissionAlert();
  const { locations } = useLocations();
  const {
    tasks, loading, fetchTasks, addTask, resolveTask, reopenTask, deleteTask, addFollowup,
  } = useMaintenanceTasks();

  const [filter, setFilter] = useState<FilterKey>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // New task form
  const [form, setForm] = useState<MaintenanceTaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Follow-up form (inside the detail sheet)
  const [followupNote, setFollowupNote] = useState('');
  const [followupOn, setFollowupOn] = useState('');
  const [nextFollowupOn, setNextFollowupOn] = useState('');
  const [savingFollowup, setSavingFollowup] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const selected = tasks.find((t) => t.id === selectedId) || null;

  const counts = useMemo(() => ({
    all: tasks.length,
    pending: tasks.filter((t) => t.status === 'pending').length,
    due: tasks.filter(isFollowupDue).length,
    resolved: tasks.filter((t) => t.status === 'resolved').length,
  }), [tasks]);

  // Alerts first, then still-open tasks, then closed ones — newest within each group
  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter((t) => {
      if (filter === 'pending') return t.status === 'pending';
      if (filter === 'due') return isFollowupDue(t);
      if (filter === 'resolved') return t.status === 'resolved';
      return true;
    });
    const rank = (t: MaintenanceTask) => (isFollowupDue(t) ? 0 : t.status === 'pending' ? 1 : 2);
    return [...filtered].sort(
      (a, b) => rank(a) - rank(b) || b.escalated_on.localeCompare(a.escalated_on)
    );
  }, [tasks, filter]);

  // Tasks are undated, so Modify on this page is the whole rule.
  const handleCreate = async () => {
    if (!requireModify('maintenance-tasks')) return;
    if (!form.title.trim()) {
      showToast('Enter a task name', 'error');
      return;
    }
    setSaving(true);
    try {
      await addTask({ ...form, escalated_on: form.escalated_on || getTodayString() });
      showToast('Task created', 'success');
      setForm(EMPTY_FORM);
      setCreateOpen(false);
    } catch (error) {
      console.error('Error creating task:', error);
      if (!reportError(error)) showToast('Failed to create task', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFollowup = async () => {
    if (!selected) return;
    if (!requireModify('maintenance-tasks')) return;
    if (!followupNote.trim()) {
      showToast('Enter a follow-up note', 'error');
      return;
    }
    setSavingFollowup(true);
    try {
      await addFollowup(
        selected.id,
        followupNote,
        followupOn || getTodayString(),
        nextFollowupOn
      );
      showToast('Follow-up added', 'success');
      setFollowupNote('');
      setFollowupOn('');
      setNextFollowupOn('');
    } catch (error) {
      console.error('Error adding follow-up:', error);
      if (!reportError(error)) showToast('Failed to add follow-up', 'error');
    } finally {
      setSavingFollowup(false);
    }
  };

  const handleResolve = async () => {
    if (!selected) return;
    if (!requireModify('maintenance-tasks')) return;
    try {
      await resolveTask(selected.id, getTodayString());
      showToast('Task marked resolved', 'success');
    } catch (error) {
      console.error('Error resolving task:', error);
      if (!reportError(error)) showToast('Failed to update task', 'error');
    }
  };

  const handleReopen = async () => {
    if (!selected) return;
    if (!requireModify('maintenance-tasks')) return;
    try {
      await reopenTask(selected.id);
      showToast('Task reopened', 'success');
    } catch (error) {
      console.error('Error reopening task:', error);
      if (!reportError(error)) showToast('Failed to update task', 'error');
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!requireModify('maintenance-tasks')) return;
    if (!window.confirm(`Delete "${selected.title}" and all its follow-up notes?`)) return;
    try {
      await deleteTask(selected.id);
      showToast('Task deleted', 'success');
      setSelectedId(null);
    } catch (error) {
      console.error('Error deleting task:', error);
      if (!reportError(error)) showToast('Failed to delete task', 'error');
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="My Tasks"
        subtitle="Maintenance issues & follow-ups"
        rightAction={
          <button
            type="button"
            onClick={() => {
              // Refuse at the door rather than after the whole task is typed.
              if (!requireModify('maintenance-tasks')) return;
              setCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-colors active:scale-95 min-h-[40px]"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Task
          </button>
        }
      />

      <div className="px-4 space-y-4">
        {/* Follow-up alert strip */}
        {counts.due > 0 && (
          <button
            type="button"
            onClick={() => setFilter('due')}
            className="w-full flex items-center gap-3 bg-rose-50 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-3.5 text-left transition-transform active:scale-[0.99]"
          >
            <div className="w-9 h-9 rounded-xl bg-white/60 dark:bg-rose-950/40 flex items-center justify-center flex-shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-5 h-5 text-rose-600">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-rose-700">
                {counts.due} follow-up{counts.due > 1 ? 's' : ''} due
              </p>
              <p className="text-[11px] text-rose-600">Tap to see the tasks that need chasing today</p>
            </div>
          </button>
        )}

        {/* Filter pills */}
        <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1">
          {([
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'due', label: 'Follow-up due' },
            { key: 'resolved', label: 'Resolved' },
          ] as { key: FilterKey; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors min-h-[38px] border ${
                filter === key
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm shadow-teal-600/20'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {label}
              <span className={`ml-1.5 ${filter === key ? 'text-white/70' : 'text-gray-400'}`}>
                {counts[key]}
              </span>
            </button>
          ))}
        </div>

        {/* Task boxes */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner />
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 py-14 px-6 text-center">
            <div className="text-3xl mb-2">🛠️</div>
            <p className="text-sm font-semibold text-gray-700">
              {filter === 'all' ? 'No tasks yet' : 'Nothing here'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {filter === 'all'
                ? 'Tap “New Task” to log a maintenance problem.'
                : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {visibleTasks.map((task) => (
              <TaskBox key={task.id} task={task} onClick={() => setSelectedId(task.id)} />
            ))}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* ── Task detail ────────────────────────────────────────────────── */}
      {selected && (
        <BottomSheet
          onClose={() => setSelectedId(null)}
          title={
            <>
              <h3
                className={`text-base font-bold text-gray-900 dark:text-gray-100 ${
                  selected.status === 'resolved' ? 'line-through decoration-2 decoration-emerald-500' : ''
                }`}
              >
                {selected.title}
              </h3>
              <div className="flex items-center gap-2 mt-1.5">
                <StatusChip task={selected} />
                <PriorityChip priority={selected.priority} />
              </div>
            </>
          }
        >
          <div className="space-y-5">
            {/* Details */}
            <div className="space-y-2.5">
              <DetailRow label="Problem" value={selected.problem || '—'} />
              <DetailRow label="Escalated" value={formatDate(selected.escalated_on)} />
              {selected.status === 'resolved' ? (
                <DetailRow
                  label="Resolved"
                  value={selected.resolved_on ? formatDate(selected.resolved_on) : '—'}
                  tone="emerald"
                />
              ) : (
                <DetailRow
                  label="Next follow-up"
                  value={selected.next_followup_on ? formatDate(selected.next_followup_on) : 'Not set'}
                  tone={isFollowupDue(selected) ? 'rose' : undefined}
                />
              )}
              <DetailRow
                label="Days open"
                value={`${daysOpen(selected)} day${daysOpen(selected) === 1 ? '' : 's'}`}
              />
              <DetailRow label="Assigned to" value={selected.assigned_to || 'Unassigned'} />
              {selected.location?.name && (
                <DetailRow label="Location" value={selected.location.name} />
              )}
              {selected.assigned_phone && (
                <div className="flex items-start justify-between gap-3 py-1">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider pt-1">
                    Phone
                  </span>
                  <a
                    href={`tel:${selected.assigned_phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-50 text-teal-600 text-sm font-semibold rounded-lg transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                    </svg>
                    {selected.assigned_phone}
                  </a>
                </div>
              )}
            </div>

            {/* Follow-up timeline */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              <h4 className={labelClass}>
                Follow-up notes ({selected.followups?.length || 0})
              </h4>
              {selected.followups && selected.followups.length > 0 ? (
                <ol className="space-y-2.5">
                  {selected.followups.map((f) => (
                    <li key={f.id} className="flex gap-3">
                      <div className="flex flex-col items-center flex-shrink-0 pt-1">
                        <span className="w-2 h-2 rounded-full bg-teal-500" />
                        <span className="flex-1 w-px bg-gray-200 dark:bg-gray-700 mt-1" />
                      </div>
                      <div className="pb-1 min-w-0">
                        <p className="text-[11px] font-semibold text-teal-600">
                          {formatDate(f.followup_on)}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-300 break-words">{f.note}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  No follow-ups logged yet.
                </p>
              )}
            </div>

            {/* Add follow-up (open tasks only) */}
            {selected.status === 'pending' && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-3">
                <h4 className={labelClass}>Add follow-up</h4>
                <textarea
                  rows={2}
                  value={followupNote}
                  onChange={(e) => setFollowupNote(e.target.value)}
                  placeholder="e.g. Called technician, coming tomorrow morning"
                  className={`${inputClass} resize-none`}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Note date
                    </label>
                    <input
                      type="date"
                      value={followupOn || getTodayString()}
                      onChange={(e) => setFollowupOn(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      Next follow-up
                    </label>
                    <input
                      type="date"
                      value={nextFollowupOn}
                      onChange={(e) => setNextFollowupOn(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingFollowup}
                  onClick={handleAddFollowup}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] disabled:opacity-50"
                >
                  {savingFollowup ? 'Saving...' : 'Add Follow-up'}
                </button>
              </div>
            )}

            {/* Actions */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4 flex gap-3">
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Delete
              </button>
              {selected.status === 'pending' ? (
                <button
                  type="button"
                  onClick={handleResolve}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow-lg shadow-emerald-600/20 transition-all min-h-[48px]"
                >
                  Mark Resolved
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReopen}
                  className="flex-1 py-3 bg-amber-50 hover:bg-amber-100 text-amber-600 font-semibold rounded-xl transition-colors min-h-[48px]"
                >
                  Reopen Task
                </button>
              )}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* ── New task ───────────────────────────────────────────────────── */}
      {createOpen && (
        <BottomSheet
          onClose={() => setCreateOpen(false)}
          title={
            <>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">New Task</h3>
              <p className="text-xs text-gray-550 dark:text-gray-400 mt-1">
                Log a maintenance problem and who&apos;s chasing it.
              </p>
            </>
          }
        >
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Task Name</label>
              <input
                type="text"
                autoFocus
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Exhaust fan"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>Problem</label>
              <textarea
                rows={2}
                value={form.problem}
                onChange={(e) => setForm({ ...form, problem: e.target.value })}
                placeholder="e.g. Exhaust fan not working"
                className={`${inputClass} resize-none`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Assigned To</label>
                <input
                  type="text"
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  placeholder="Name"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.assigned_phone}
                  onChange={(e) => setForm({ ...form, assigned_phone: e.target.value })}
                  placeholder="Optional"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Location</label>
                <select
                  value={form.location_id}
                  onChange={(e) => setForm({ ...form, location_id: e.target.value })}
                  className={`${inputClass} appearance-none`}
                >
                  <option value="">Not specific</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  className={`${inputClass} appearance-none`}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>Escalated On</label>
                <input
                  type="date"
                  value={form.escalated_on || getTodayString()}
                  onChange={(e) => setForm({ ...form, escalated_on: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Next Follow-up</label>
                <input
                  type="date"
                  value={form.next_followup_on}
                  onChange={(e) => setForm({ ...form, next_followup_on: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="flex-1 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-colors min-h-[48px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl shadow-lg shadow-teal-600/20 transition-all min-h-[48px] disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function TaskBox({ task, onClick }: { task: MaintenanceTask; onClick: () => void }) {
  const resolved = task.status === 'resolved';
  const due = isFollowupDue(task);

  const accent = resolved
    ? 'border-emerald-200 dark:border-emerald-900/40'
    : due
      ? 'border-rose-200 dark:border-rose-900/40'
      : 'border-gray-100';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative bg-white rounded-2xl p-3.5 shadow-sm border ${accent} text-left transition-transform active:scale-[0.98] hover:shadow-md flex flex-col min-h-[118px]`}
    >
      {due && (
        <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
      )}

      <h3
        className={`text-sm font-bold leading-snug pr-3 ${
          resolved
            ? 'line-through decoration-2 decoration-emerald-500 text-gray-500'
            : 'text-gray-900'
        }`}
      >
        {task.title}
      </h3>

      {task.problem && (
        <p className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-snug">{task.problem}</p>
      )}

      <div className="mt-auto pt-2.5 space-y-1.5">
        <p className="text-[10px] text-gray-400 font-medium">
          {formatDate(resolved && task.resolved_on ? task.resolved_on : task.escalated_on)}
        </p>
        <StatusChip task={task} />
      </div>
    </button>
  );
}

function StatusChip({ task }: { task: MaintenanceTask }) {
  if (task.status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-semibold rounded-full">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
        Completed
      </span>
    );
  }
  if (isFollowupDue(task)) {
    return (
      <span className="inline-block px-2 py-0.5 bg-rose-50 text-rose-600 text-[10px] font-semibold rounded-full">
        Follow-up due
      </span>
    );
  }
  return (
    <span className="inline-block px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-semibold rounded-full">
      Pending
    </span>
  );
}

function PriorityChip({ priority }: { priority: TaskPriority }) {
  const styles: Record<TaskPriority, string> = {
    high: 'bg-rose-50 text-rose-600',
    normal: 'bg-blue-50 text-blue-600',
    low: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold rounded-full ${styles[priority]}`}>
      {priority === 'normal' ? 'Normal' : priority === 'high' ? 'High priority' : 'Low priority'}
    </span>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'rose' | 'emerald';
}) {
  const valueColor =
    tone === 'rose'
      ? 'text-rose-600'
      : tone === 'emerald'
        ? 'text-emerald-600'
        : 'text-gray-800 dark:text-gray-200';
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex-shrink-0">
        {label}
      </span>
      <span className={`text-sm font-medium text-right ${valueColor}`}>{value}</span>
    </div>
  );
}
