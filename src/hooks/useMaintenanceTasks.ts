'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getTodayString } from '@/lib/utils';
import type { MaintenanceTask, MaintenanceTaskFormData } from '@/types';

export function useMaintenanceTasks() {
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('maintenance_tasks')
        .select('*, location:locations(name), followups:maintenance_task_followups(*)')
        .order('escalated_on', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Newest follow-up first inside each task
      const withSortedFollowups = (data || []).map((task: MaintenanceTask) => ({
        ...task,
        followups: [...(task.followups || [])].sort((a, b) =>
          b.followup_on.localeCompare(a.followup_on)
        ),
      }));
      setTasks(withSortedFollowups);
    } catch (error) {
      console.error('Error fetching maintenance tasks:', error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addTask = useCallback(async (form: MaintenanceTaskFormData) => {
    try {
      const { error } = await supabase.from('maintenance_tasks').insert({
        title: form.title.trim(),
        problem: form.problem.trim(),
        assigned_to: form.assigned_to.trim(),
        assigned_phone: form.assigned_phone.trim() || null,
        location_id: form.location_id || null,
        priority: form.priority,
        status: 'pending',
        escalated_on: form.escalated_on || getTodayString(),
        next_followup_on: form.next_followup_on || null,
      });

      if (error) throw error;
      await fetchTasks();
    } catch (error) {
      console.error('Error adding maintenance task:', error);
      throw error;
    }
  }, [fetchTasks]);

  const updateTask = useCallback(async (id: string, data: Partial<MaintenanceTask>) => {
    try {
      const { error } = await supabase.from('maintenance_tasks').update(data).eq('id', id);
      if (error) throw error;
      await fetchTasks();
    } catch (error) {
      console.error('Error updating maintenance task:', error);
      throw error;
    }
  }, [fetchTasks]);

  // Closing a task clears the pending follow-up so it stops raising alerts
  const resolveTask = useCallback(async (id: string, resolvedOn: string) => {
    await updateTask(id, {
      status: 'resolved',
      resolved_on: resolvedOn || getTodayString(),
      next_followup_on: null,
    });
  }, [updateTask]);

  const reopenTask = useCallback(async (id: string) => {
    await updateTask(id, { status: 'pending', resolved_on: null });
  }, [updateTask]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from('maintenance_tasks').delete().eq('id', id);
      if (error) throw error;
      await fetchTasks();
    } catch (error) {
      console.error('Error deleting maintenance task:', error);
      throw error;
    }
  }, [fetchTasks]);

  /**
   * Log a dated follow-up note. `nextFollowupOn` re-arms the alert for the
   * next chase-up (empty string clears it).
   */
  const addFollowup = useCallback(async (
    taskId: string,
    note: string,
    followupOn: string,
    nextFollowupOn: string
  ) => {
    try {
      const { error } = await supabase.from('maintenance_task_followups').insert({
        task_id: taskId,
        note: note.trim(),
        followup_on: followupOn || getTodayString(),
      });
      if (error) throw error;

      await supabase
        .from('maintenance_tasks')
        .update({ next_followup_on: nextFollowupOn || null })
        .eq('id', taskId);

      await fetchTasks();
    } catch (error) {
      console.error('Error adding follow-up note:', error);
      throw error;
    }
  }, [fetchTasks]);

  const deleteFollowup = useCallback(async (followupId: string) => {
    try {
      const { error } = await supabase
        .from('maintenance_task_followups')
        .delete()
        .eq('id', followupId);
      if (error) throw error;
      await fetchTasks();
    } catch (error) {
      console.error('Error deleting follow-up note:', error);
      throw error;
    }
  }, [fetchTasks]);

  return {
    tasks,
    loading,
    fetchTasks,
    addTask,
    updateTask,
    resolveTask,
    reopenTask,
    deleteTask,
    addFollowup,
    deleteFollowup,
  };
}

/** A pending task whose follow-up date has arrived (or passed). */
export function isFollowupDue(task: MaintenanceTask): boolean {
  if (task.status === 'resolved' || !task.next_followup_on) return false;
  return task.next_followup_on <= getTodayString();
}

/** Whole days a pending task has been open (0 = raised today). */
export function daysOpen(task: MaintenanceTask): number {
  const end = task.status === 'resolved' && task.resolved_on ? task.resolved_on : getTodayString();
  const ms = Date.parse(end) - Date.parse(task.escalated_on);
  return Math.max(0, Math.round(ms / 86_400_000));
}
