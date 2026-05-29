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
}

export interface DailyWorkforce {
  id: string;
  work_date: string;
  location_id: string;
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
  is_present: boolean;
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
  processed_kg: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Form types
export interface WorkforceFormData {
  labour_count: number;
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
}

export interface ProcessingFormData {
  processed_kg: number;
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
}

export interface LocationBreakdown {
  location: Location;
  workforce: number;
  processing: number;
  supervisors: number;
}

export interface SupervisorAttendanceRecord {
  date: string;
  locations: Location[];
  is_present: boolean;
}

export type TabType = 'workforce' | 'sanitization' | 'processing';
export type AttendanceViewType = 'supervisor' | 'date';
