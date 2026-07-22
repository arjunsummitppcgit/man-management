// ─── Assistant shared types ──────────────────────────────────────────────────
// The result envelope every assistant tool returns. The model receives a
// compact JSON of this (to reference numbers + write a summary); the UI
// receives the full envelope and renders it on the results canvas.

export type ResultKind = 'kpi' | 'table' | 'card' | 'chart';

export interface ResultColumn {
  key: string;
  label: string;
  format?: 'number' | 'kg' | 'currency' | 'date' | 'text';
}

export interface KpiTile {
  label: string;
  value: string | number;
  unit?: string;
  tone?: 'default' | 'success' | 'danger' | 'accent';
}

export interface ToolResult {
  kind: ResultKind;
  title: string;
  /** KPI tiles shown above the table (optional for any kind) */
  kpis?: KpiTile[];
  columns?: ResultColumn[];
  rows?: Record<string, string | number | null>[];
  /** card kind: label/value pairs */
  fields?: { label: string; value: string }[];
  chart?: {
    type: 'bar' | 'line';
    xKey: string;
    series: { key: string; label: string }[];
  };
  meta: {
    date_resolved?: string;
    person_resolved?: string;
    source_tables: string[];
    row_count: number;
    no_data?: boolean;
    unit?: string;
  };
}

// ─── Chat wire types ─────────────────────────────────────────────────────────

export interface AssistantApiRequest {
  question: string;
  /** Prior turns, oldest first, for follow-up context ("his salary") */
  history: { role: 'user' | 'assistant'; content: string }[];
}

export interface AssistantApiResponse {
  summary: string;
  results: ToolResult[];
  /** e.g. "Arjun Varma · 19 Jul 2026" — shown as the resolved-context pill */
  resolved?: string;
  model: string;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  resolved?: string;
  /** indices into the results canvas produced by this turn */
  resultIds?: string[];
  error?: boolean;
}

export interface CanvasResult extends ToolResult {
  id: string;
  askedAt: string;
  question: string;
}
