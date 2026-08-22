// Database types matching Supabase schema

export interface Location {
  id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface Supervisor {
  id: string;
  name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  joining_date: string | null;
  salary: number | null;
}

export interface DailyWorkforce {
  id: string;
  work_date: string;
  location_id: string;
  // Labour sub-categories
  labour_kg_basic: number;
  labour_daily_wage: number;
  labour_company: number;
  labour_non_locals: number;
  // Computed from sub-categories by DB trigger
  labour_count: number;
  boys_count: number;
  // Checking sub-categories
  checking_waste: number;
  checking_pd: number;
  /** Total checking. Sub-categories sum to this from migration 023 on; older rows hold an unsplit total. */
  checking_count: number;
  cleaning_count: number;
  qc_count: number;
  security_count: number;
  total_headcount: number;
  created_at: string;
  updated_at: string;
}

export interface DailySupervisorAssignment {
  id: string;
  work_date: string;
  location_id: string;
  supervisor_id: string;
  is_present: number;
  created_at: string;
  // Joined fields
  supervisor?: Supervisor;
  location?: Location;
}

export interface DailySanitization {
  id: string;
  work_date: string;
  location_id: string;
  // Sanitization headcounts
  outside_cleaning: number;
  local_crates_wash: number;
  company_crates_wash: number;
  /** @deprecated Retired by migration 024 in favour of outside_cleaning. Historical dates only. */
  cleaning_labour: number;
  /** @deprecated Retired by migration 024 in favour of the crates-wash split. Historical dates only. */
  nmr_labour: number;
  // Cleaned quantities
  crates_cleaning: number;
  nets_cleaning: number;
  washroom_cleaning: number;
  grading_machine_cleaning: number;
  chlorine_ppc: number;
  chlorine_crates: number;
  chlorine_washrooms: number;
  soap_oil_ppc: number;
  soap_oil_crates: number;
  soap_oil_washrooms: number;
  chlorine_grading_machine: number;
  soap_oil_grading_machine: number;
  gloves: number;
  head_cap: number;
  masks: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyTarget {
  id: string;
  year: number;
  month: number;
  location_id: string | null; // null = combined target
  target_kg: number;
  created_at: string;
  updated_at: string;
  // Joined
  location?: Location;
}

export interface DailyProcessing {
  id: string;
  work_date: string;
  location_id: string;
  // Work In Process sub-categories
  wip_hon_to_headless: number;
  wip_headless_to_va: number;
  // Completed sub-categories. Migration 029 keeps these in step with the HONS
  // TO HL and HL to VA registers; processed_kg is their sum (migration 003).
  hon_to_headless: number;
  headless_to_va: number;
  processed_kg: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Form types
export interface WorkforceFormData {
  // Labour sub-categories (labour_count derived automatically by DB)
  labour_kg_basic: number;
  labour_daily_wage: number;
  labour_company: number;
  labour_non_locals: number;
  boys_count: number;
  // Checking sub-categories (checking_count derived from these on save)
  checking_waste: number;
  checking_pd: number;
  cleaning_count: number;
  qc_count: number;
  security_count: number;
  supervisor_ids: string[];
}

export interface SanitizationFormData {
  outside_cleaning: number;
  local_crates_wash: number;
  company_crates_wash: number;
  crates_cleaning: number;
  nets_cleaning: number;
  washroom_cleaning: number;
  grading_machine_cleaning: number;
  chlorine_ppc: number;
  chlorine_crates: number;
  chlorine_washrooms: number;
  soap_oil_ppc: number;
  soap_oil_crates: number;
  soap_oil_washrooms: number;
  chlorine_grading_machine: number;
  soap_oil_grading_machine: number;
  gloves: number;
  head_cap: number;
  masks: number;
  notes: string;
}

export interface ProcessingFormData {
  // Work In Process sub-categories — the only processing figures still keyed in
  wip_hon_to_headless: number;
  wip_headless_to_va: number;
  notes: string;
}

export interface TargetFormData {
  target_kg: number;
  location_id: string | null;
}

// Dashboard types
export interface DashboardKPIs {
  totalWorkforce: number;
  supervisorsPresent: number;
  todaysProcessing: number;
  monthlyTarget: number;
  monthlyProcessed: number;
  monthlyProgress: number;
  dailyAverageNeeded: number;
  daysRemaining: number;
  supervisorNames?: string[];
  supervisorBreakdown?: string;
  unassignedSupervisorNames?: string[];
  // Labour sub-category totals
  labourKgBasic: number;
  labourDailyWage: number;
  labourCompany: number;
  labourNonLocals: number;
  labourTotal: number;
  // Remaining workforce headcount KPIs
  boysCount: number;
  checkingWaste: number;
  checkingPd: number;
  /** Total checking, including any pre-split rows not covered by checkingWaste + checkingPd. */
  checkingCount: number;
  cleaningCount: number;
  qcCount: number;
  securityCount: number;
  // Sanitization headcount KPIs
  sanitizationOutsideCleaning: number;
  sanitizationLocalCratesWash: number;
  sanitizationCompanyCratesWash: number;
  /** Retired Cleaning Labour + NMR Labour, still counted for dates entered before migration 024. */
  sanitizationRetiredLabour: number;
  sanitizationCratesCleaning: number;
  sanitizationNetsCleaning: number;
  sanitizationWashroomCleaning: number;
  sanitizationGradingMachineCleaning: number;
  sanitizationTotal: number;
  // Processing sub-category totals (completed)
  honToHeadless: number;
  headlessToVa: number;
  // Processing sub-category totals (WIP)
  wipHonToHeadless: number;
  wipHeadlessToVa: number;
  yesterdayCratesCleaning?: number;
  yesterdayNetsCleaning?: number;
  yesterdayChlorinePpc?: number;
  yesterdayChlorineCrates?: number;
  yesterdayChlorineWashrooms?: number;
  yesterdayChlorineGradingMachine?: number;
  yesterdaySoapOilPpc?: number;
  yesterdaySoapOilCrates?: number;
  yesterdaySoapOilWashrooms?: number;
  yesterdaySoapOilGradingMachine?: number;
  yesterdayGloves?: number;
  yesterdayHeadCap?: number;
  yesterdayMasks?: number;
  yesterdayDate?: string;
  yesterdayNotes?: { location: string; note: string }[];
  yesterdayTopGrade?: string | null;
  yesterdayTopGradeQty?: number;
}

export interface LocationBreakdown {
  location: Location;
  workforce: number;
  processing: number;
  supervisors: number;
  // Processing sub-fields
  wipHonToHeadless: number;
  wipHeadlessToVa: number;
  completedHonToHeadless: number;
  completedHeadlessToVa: number;
}

export interface SupervisorAttendanceRecord {
  date: string;
  locations: Location[];
  is_present: number;
}

export type TabType = 'daily_plan' | 'workforce' | 'sanitization' | 'processing' | 'yield' | 'non_local_ladies' | 'hl_va' | 'grading';

// ─── Grading Data ────────────────────────────────────────────────────────────

/** A stored grading register row. Every value is optional — see migration 025. */
export interface GradingEntry {
  id: string;
  work_date: string;
  unit_key: string;
  start_time: string | null;
  stop_time: string | null;
  total_grading_qty: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

/** Form state for one register row; times are 'HH:MM' from the time inputs. */
export interface GradingFormRow {
  unit_key: string;
  start_time: string;
  stop_time: string;
  total_grading_qty: string;
  note: string;
}

// ─── Yield Report Types ──────────────────────────────────────────────────────

export interface YieldEntry {
  id: string;
  work_date: string;
  batch_id: string;
  count_text: string;
  count_range: string;
  hon_kgs: number;
  hl_kgs: number;
  location_id: string;
  grader_name: string;
  created_at: string;
  updated_at: string;
  // Joined
  location?: Location;
}

export interface YieldFormRow {
  id?: string;        // existing DB id (undefined for new unsaved rows)
  batch_id: string;
  count_text: string;
  count_range: string;
  hon_kgs: string;    // string for input binding
  hl_kgs: string;     // string for input binding
  location_id: string;
  grader_name: string;
}

// ─── Non Local Ladies Report Types ──────────────────────────────────────────

export interface NonLocalLadyEntry {
  id: string;
  work_date: string;
  batch_name: string;
  no_of_ladies: number;
  hl_qty: number;
  pd_qty: number;
  per_head_amount: number;
  /** Basic rate in force when this day was saved (migration 026). */
  salary_basic: number;
  created_at: string;
  updated_at: string;
}

export interface NonLocalLadyFormRow {
  id?: string;
  batch_name: string;
  no_of_ladies: string;   // string for input binding
  hl_qty: string;
  pd_qty: string;
  per_head_amount: string;
}

// ─── HL to VA Types ──────────────────────────────────────────────────────────

export interface HlVaEntry {
  id: string;
  work_date: string;
  batch_id: string;
  count_text: string;
  grade: string;            // auto-derived from count via standard yield chart
  variety: string;          // PD | PDTO | PVPD | PVPDTO | EZPL | PUD | BTFLY
  hl_kgs: number;
  va_kgs: number;
  location_id: string | null;
  grader_name: string;
  created_at: string;
  updated_at: string;
  // Joined
  location?: { name: string } | null;
}

export interface HlVaFormRow {
  batch_id: string;
  count_text: string;      // strings for input binding
  variety: string;
  hl_kgs: string;
  va_kgs: string;
  location_id: string;
  grader_name: string;
}

// ─── Maintenance Task Types ("My Tasks") ─────────────────────────────────────

export type TaskStatus = 'pending' | 'resolved';
export type TaskPriority = 'low' | 'normal' | 'high';

export interface MaintenanceFollowup {
  id: string;
  task_id: string;
  note: string;
  followup_on: string;
  created_at: string;
}

export interface MaintenanceTask {
  id: string;
  title: string;            // short label on the box, e.g. 'Exhaust fan'
  problem: string;          // e.g. 'Exhaust fan not working'
  assigned_to: string;
  assigned_phone: string | null;
  location_id: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  escalated_on: string;
  next_followup_on: string | null;
  resolved_on: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  location?: { name: string } | null;
  followups?: MaintenanceFollowup[];
}

export interface MaintenanceTaskFormData {
  title: string;
  problem: string;
  assigned_to: string;
  assigned_phone: string;
  location_id: string;
  priority: TaskPriority;
  escalated_on: string;
  next_followup_on: string;
}

// ─── Daily Plan Types ────────────────────────────────────────────────────────
// What the day is *meant* to look like, decided when the harvest batches land:
// which location de-heads which batch, and how much HL each location feeds into
// VA. Both quantities are stage inputs (HON in, HL in), so they line up with
// yield_entries.hon_kgs and hl_va_entries.hl_kgs for the variance. Migration 031.

export interface DailyPlanHonHlEntry {
  id: string;
  work_date: string;
  batch_name: string;
  count_text: string;
  planned_qty: number;   // HON kgs planned into this location
  boxes: number;
  location_id: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  location?: { id: string; name: string; code: string } | null;
}

export interface DailyPlanHlVaEntry {
  id: string;
  work_date: string;
  location_id: string;
  planned_qty: number;   // HL kgs planned into VA at this location
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  location?: { id: string; name: string; code: string } | null;
}

/** One planned batch on the form; quantities are strings for input binding. */
export interface DailyPlanHonHlFormRow {
  batch_name: string;
  count_text: string;
  planned_qty: string;
  boxes: string;
  location_id: string;
}

/** One planned location on the HL to VA half of the form. */
export interface DailyPlanHlVaFormRow {
  location_id: string;
  planned_qty: string;
}

/** A location's plan and what the registers actually recorded against it. */
export interface DailyPlanVsActualRow {
  location: string;
  plannedHon: number;
  actualHon: number;
  plannedHl: number;
  actualHl: number;
}
