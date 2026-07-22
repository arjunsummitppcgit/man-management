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
  cleaning_labour: number;
  crates_cleaning: number;
  nets_cleaning: number;
  nmr_labour: number;
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
  // Completed sub-categories (auto-summed into processed_kg by DB trigger)
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
  checking_count: number;
  cleaning_count: number;
  qc_count: number;
  security_count: number;
  supervisor_ids: string[];
}

export interface SanitizationFormData {
  cleaning_labour: number;
  crates_cleaning: number;
  nets_cleaning: number;
  nmr_labour: number;
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
  // Work In Process sub-categories
  wip_hon_to_headless: number;
  wip_headless_to_va: number;
  // Completed sub-categories (processed_kg derived by DB trigger)
  hon_to_headless: number;
  headless_to_va: number;
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
  checkingCount: number;
  cleaningCount: number;
  qcCount: number;
  securityCount: number;
  // Sanitization headcount KPIs
  sanitizationCleaningLabour: number;
  sanitizationCratesCleaning: number;
  sanitizationNetsCleaning: number;
  sanitizationNmrLabour: number;
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

export type TabType = 'workforce' | 'sanitization' | 'processing' | 'yield' | 'non_local_ladies' | 'hl_va';

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
