'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isNewerThan, parseSeenMarker } from '@/lib/ticketActivity';

/**
 * "Something happened on Tickets" for the whole app.
 *
 * Every ticket write bumps tickets.updated_at — the trigger in migration 035
 * does it for comments and attachments too — so one column answers "has
 * anything changed since I last looked", whether that was a new ticket, a
 * comment, a file or a status move.
 *
 * The marker for "when I last looked" is kept per user in localStorage rather
 * than in the database. That keeps this to a UI change with no migration to run
 * by hand, and per-device unread is what people expect from a notification dot
 * anyway. Clearing site data just means the dot shows once more — nothing is
 * lost.
 */

/** How often to re-check while the app is open. */
const POLL_MS = 60_000;

const seenKey = (userId: string) => `ppc.ticketsSeenAt.${userId}`;

// ─── The marker, as an external store ────────────────────────────────────────
// localStorage is not React state, so it is read through useSyncExternalStore:
// every component sees the same value, a write updates all of them at once, and
// nothing has to be mirrored into state inside an effect.

const listeners = new Set<() => void>();

function emitSeenChanged() {
  listeners.forEach((fn) => fn());
}

function subscribeSeen(onChange: () => void) {
  listeners.add(onChange);
  // Another tab marking the tickets read should clear this tab's badge too.
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith('ppc.ticketsSeenAt.')) onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}

/** Raw stored value, '' when absent — a primitive, so React can compare it. */
function readSeenRaw(userId: string | null): string {
  if (!userId || typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(seenKey(userId)) ?? '';
  } catch {
    // Private mode / storage disabled — treat as "never looked".
    return '';
  }
}

interface TicketActivity {
  id: string;
  updated_at: string;
}

interface TicketAlertsState {
  /** Epoch ms of the last visit to Tickets; null means never. */
  seenAt: number | null;
  /** How many tickets have been touched since then. */
  unseenCount: number;
  /**
   * Everything up to `upTo` (a Postgres timestamp) has now been seen. Called by
   * the Tickets page; never moves the marker backwards.
   */
  markSeen: (upTo?: string) => void;
  /** Re-read the activity now. */
  refresh: () => void;
}

const TicketAlertsContext = createContext<TicketAlertsState | null>(null);

export function TicketAlertsProvider({ children }: { children: React.ReactNode }) {
  const value = useTicketAlertsState();
  return createElement(TicketAlertsContext.Provider, { value }, children);
}

function useTicketAlertsState(): TicketAlertsState {
  const { user, canView } = useAuth();
  const userId = user?.id ?? null;
  const maySeeTickets = canView('tickets');

  const getSeenRaw = useCallback(() => readSeenRaw(userId), [userId]);
  // Server render has no localStorage; '' matches the pre-fetch client state,
  // and nothing is painted from the marker until `activity` arrives anyway.
  const seenRaw = useSyncExternalStore(subscribeSeen, getSeenRaw, () => '');
  const seenAt = useMemo(() => parseSeenMarker(seenRaw), [seenRaw]);

  const [activity, setActivity] = useState<TicketActivity[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    // No login, or no rights to Tickets: nothing to poll and nothing to show.
    // `activity` is only ever read through unseenCount, which is gated on the
    // same flag, so there is no stale state to clear here.
    if (!userId || !maySeeTickets) return;

    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase.from('tickets').select('id, updated_at');
      if (cancelled) return;
      if (error) {
        // Missing table (migration 035 not run) or a blip — a notification dot
        // is never worth breaking a page over, so go quiet.
        console.error('Could not check for ticket activity:', error);
        setActivity([]);
        return;
      }
      setActivity((data as TicketActivity[]) || []);
    };

    void load();

    // Phones sit in the background for hours; the poll alone would leave a
    // stale dot until the next tick, so re-check the moment the app comes back
    // to the front.
    const onWake = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(() => void load(), POLL_MS);
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
    };
  }, [userId, maySeeTickets, reloadKey]);

  const unseenCount = useMemo(
    () =>
      maySeeTickets ? activity.filter((t) => isNewerThan(t.updated_at, seenAt)).length : 0,
    [maySeeTickets, activity, seenAt]
  );

  const markSeen = useCallback(
    (upTo?: string) => {
      if (!userId) return;
      const parsed = upTo ? Date.parse(upTo) : NaN;
      const stamp = Number.isFinite(parsed) ? parsed : Date.now();
      const current = parseSeenMarker(readSeenRaw(userId));
      if (current !== null && stamp <= current) return; // never rewind
      try {
        window.localStorage.setItem(seenKey(userId), String(stamp));
      } catch {
        // Nothing to do — the dot will simply show again next time.
      }
      emitSeenChanged();
    },
    [userId]
  );

  return useMemo(
    () => ({ seenAt, unseenCount, markSeen, refresh }),
    [seenAt, unseenCount, markSeen, refresh]
  );
}

export function useTicketAlerts(): TicketAlertsState {
  const ctx = useContext(TicketAlertsContext);
  if (!ctx) throw new Error('useTicketAlerts must be used inside <TicketAlertsProvider>');
  return ctx;
}
