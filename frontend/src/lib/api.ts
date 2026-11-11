const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface UserProfile {
  id: string;
  user_id?: string;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  roles: string[];
  employee_id?: string | null;
}

export interface Branch {
  id: string;
  organization_id?: string;
  name: string;
  timezone: string;
  address?: string | null;
  department_count?: number;
  employee_count?: number;
}

export interface Department {
  id: string;
  name: string;
  code?: string | null;
  branch_id?: string;
  branch_name?: string;
  employee_count?: number;
}

export interface Shift {
  id: string;
  name: string;
  code: string;
  start_time: string;
  end_time: string;
  grace_period_mins: number;
  half_day_late_mins: number;
  break_duration_mins: number;
  is_overnight: boolean;
  shift_day_boundary?: string;
  created_at?: string;
}

export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  designation?: string | null;
  status: string;
  enrollment_status: string;
  hire_date?: string | null;
  department?: Department | null;
  branch?: Branch | null;
  default_shift?: Shift | null;
  created_at?: string;
}

export interface FaceStatus {
  employee_id: string;
  employee_code: string;
  full_name: string;
  enrollment_status: string;
  has_active_template: boolean;
  model_version?: string | null;
  sample_count: number;
  enrolled_at?: string | null;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  reason?: string;
  status: string;
  approved_by_user_id?: string;
  created_at: string;
}

export interface LeaveUsageSummary {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  ANNUAL: number;
  CASUAL: number;
  SICK: number;
  UNPAID: number;
  total_days_taken: number;
}

export interface Holiday {
  id: string;
  branch_id: string;
  branch_name?: string;
  holiday_date: string;
  name: string;
  is_recurring: boolean;
  created_at: string;
}

export interface AttendanceLog {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department_name: string;
  punch_time: string;
  device_id: string;
  confidence_score: number;
  liveness_score: number;
  punch_type: string;
  verification_mode: string;
}

export interface DailyAttendance {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  shift_name?: string;
  attendance_date: string;
  check_in_time?: string | null;
  check_out_time?: string | null;
  late_minutes: number;
  early_departure_minutes: number;
  total_work_minutes: number;
  overtime_minutes: number;
  status: string;
  regularization_status: string;
  remarks?: string | null;
}

export interface RegularizationRequestItem {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_code?: string;
  department_name?: string;
  daily_attendance_id?: string | null;
  attendance_date: string;
  original_check_in?: string | null;
  original_check_out?: string | null;
  original_status?: string | null;
  requested_check_in?: string | null;
  requested_check_out?: string | null;
  requested_status: string;
  reason: string;
  status: string;
  reviewed_by_user_id?: string | null;
  reviewed_by_name?: string | null;
  review_remarks?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  username?: string;
  action: string;
  entity_name: string;
  entity_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  created_at: string;
}

export interface EmployeeMonthlySummary {
  employee_id: string;
  employee_code: string;
  full_name: string;
  department_name?: string;
  designation?: string;
  total_calendar_days: number;
  working_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  late_days: number;
  total_work_hours: number;
  overtime_hours: number;
  attendance_rate: number;
}

export interface MonthlyReportResponse {
  year: number;
  month: number;
  total_employees: number;
  average_attendance_rate: number;
  summaries: EmployeeMonthlySummary[];
}

export interface DashboardSummary {
  total_employees: number;
  present_today: number;
  absent_today: number;
  late_today: number;
  on_leave_today?: number;
  attendance_percentage: number;
  department_stats: Array<{
    department_id: string;
    department_name: string;
    total_employees: number;
    present: number;
    late: number;
    absent: number;
    percentage: number;
  }>;
  recent_punches: AttendanceLog[];
}

export interface OrganizationInfo {
  id: string;
  name: string;
  code: string;
  created_at: string;
  branches_count?: number;
  departments_count?: number;
  employees_count?: number;
}

export interface UserAccount {
  id: string;
  username: string;
  email: string;
  full_name?: string | null;
  is_active: boolean;
  is_superuser: boolean;
  roles: string[];
  employee_id?: string | null;
  employee_name?: string | null;
  employee_code?: string | null;
  created_at?: string;
}

export interface RoleInfo {
  id: string;
  name: string;
  description?: string | null;
}

export interface SystemPreferences {
  kiosk: {
    default_terminal_id: string;
    default_attendance_mode: string;
    relaxed_lighting_mode: boolean;
    audio_feedback_enabled: boolean;
    voice_greeting_enabled: boolean;
    allow_quick_register: boolean;
    welcome_message: string;
  };
  attendance_rules: {
    working_days_per_week: string[];
    overtime_threshold_mins: number;
    auto_deduct_break_after_mins: number;
    allow_employee_regularization_requests: boolean;
  };
  system: {
    date_format: string;
    time_format: string;
    company_tagline: string;
  };
  engine_info?: {
    duplicate_protection_seconds: number;
    recognition_threshold: number;
    liveness_threshold: number;
    min_face_size_px: number;
  };
}

class ApiClient {
  private onUnauthorized: (() => void) | null = null;

  setUnauthorizedHandler(handler: (() => void) | null) {
    this.onUnauthorized = handler;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return headers;
  }

  private async request<T>(path: string, init: RequestInit = {}, defaultError = "Request failed"): Promise<T> {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        ...this.getHeaders(),
        ...(init.headers || {}),
      },
    });
    if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/login")) {
      if (this.onUnauthorized) {
        this.onUnauthorized();
      }
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = typeof err.detail === "string" ? err.detail : defaultError;
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  }

  // Auth
  async login(username_or_email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username_or_email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Incorrect username or password");
    }
    const data = await res.json();
    const profile: UserProfile = {
      id: data.user_id,
      user_id: data.user_id,
      username: data.username,
      email: data.email,
      full_name: data.full_name,
      is_active: true,
      is_superuser: Boolean(data.roles?.includes("ADMIN")),
      roles: data.roles || [],
      employee_id: data.employee_id || null,
    };
    if (typeof window !== "undefined") {
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(profile));
    }
    return profile;
  }

  async fetchMe(): Promise<UserProfile> {
    const profile = await this.request<UserProfile>("/auth/me", {}, "Failed to verify session");
    if (typeof window !== "undefined") {
      localStorage.setItem("user", JSON.stringify(profile));
    }
    return profile;
  }

  async changePassword(current_password: string, new_password: string) {
    return this.request<{ success: boolean; message: string }>(
      "/auth/change-password",
      {
        method: "POST",
        body: JSON.stringify({ current_password, new_password }),
      },
      "Failed to update password"
    );
  }

  logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  }

  getToken(): string | null {
    if (typeof window !== "undefined") {
      return localStorage.getItem("token");
    }
    return null;
  }

  getUser(): UserProfile | null {
    if (typeof window !== "undefined") {
      const u = localStorage.getItem("user");
      if (!u) return null;
      try {
        return JSON.parse(u) as UserProfile;
      } catch {
        return null;
      }
    }
    return null;
  }

  // Dashboard
  async getDashboardSummary(targetDate?: string): Promise<DashboardSummary> {
    const params = new URLSearchParams();
    if (targetDate) params.append("target_date", targetDate);
    const qs = params.toString();
    return this.request<DashboardSummary>(
      `/dashboard/summary${qs ? `?${qs}` : ""}`,
      {},
      "Failed to load dashboard overview"
    );
  }

  // Employees
  async getEmployees(paramsObj?: {
    search?: string;
    department_id?: string;
    branch_id?: string;
    status?: string;
    limit?: number;
  }): Promise<Employee[]> {
    const params = new URLSearchParams();
    if (paramsObj?.search) params.append("search", paramsObj.search);
    if (paramsObj?.department_id) params.append("department_id", paramsObj.department_id);
    if (paramsObj?.branch_id) params.append("branch_id", paramsObj.branch_id);
    if (paramsObj?.status) params.append("status", paramsObj.status);
    if (paramsObj?.limit) params.append("limit", String(paramsObj.limit));
    return this.request<Employee[]>(`/employees?${params.toString()}`, {}, "Failed to fetch employees");
  }

  async getEmployee(employeeId: string): Promise<Employee> {
    return this.request<Employee>(`/employees/${employeeId}`, {}, "Failed to fetch employee profile");
  }

  async createEmployee(payload: Record<string, unknown>): Promise<Employee> {
    return this.request<Employee>(
      "/employees",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to register employee"
    );
  }

  async updateEmployee(employeeId: string, payload: Record<string, unknown>): Promise<Employee> {
    return this.request<Employee>(
      `/employees/${employeeId}`,
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update employee"
    );
  }

  async deleteEmployee(employeeId: string, permanent: boolean = false) {
    return this.request<{ success: boolean; message: string }>(
      `/employees/${employeeId}?permanent=${permanent}`,
      { method: "DELETE" },
      "Failed to update employee status"
    );
  }

  async getMetadata(): Promise<{ branches: Branch[]; departments: Department[]; shifts: Shift[] }> {
    const [branches, departments, shifts] = await Promise.all([
      this.request<Branch[]>("/employees/meta/branches", {}, "Failed to load branches"),
      this.request<Department[]>("/employees/meta/departments", {}, "Failed to load departments"),
      this.request<Shift[]>("/employees/meta/shifts", {}, "Failed to load shifts"),
    ]);
    return { branches, departments, shifts };
  }

  async createDepartment(payload: { name: string; code?: string; branch_id: string }): Promise<Department> {
    return this.request<Department>(
      "/employees/meta/departments",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to create department"
    );
  }

  // Face Biometrics
  async getFaceStatus(employeeId: string): Promise<FaceStatus> {
    return this.request<FaceStatus>(`/face/status/${employeeId}`, {}, "Failed to check face setup status");
  }

  async checkFaceQuality(imageBase64: string) {
    return this.request<{
      success: boolean;
      face_count: number;
      faces: Array<{
        is_valid: boolean;
        message: string;
        bbox?: number[];
        yaw?: number;
        pitch?: number;
        roll?: number;
        blur_score?: number;
        brightness?: number;
      }>;
    }>("/face/quality-check", { method: "POST", body: JSON.stringify({ image: imageBase64 }) });
  }

  async enrollFace(employee_id: string, samples: string[]) {
    return this.request<{
      success: boolean;
      message: string;
      employee_id: string;
      sample_count: number;
    }>(
      "/face/enroll",
      { method: "POST", body: JSON.stringify({ employee_id, samples }) },
      "Face setup failed"
    );
  }

  async quickRegister(payload: {
    first_name: string;
    last_name: string;
    employee_code?: string;
    email?: string;
    designation?: string;
    department_id?: string;
    branch_id?: string;
    default_shift_id?: string;
    face_image: string;
  }) {
    return this.request<{ success: boolean; message: string; employee: Employee }>(
      "/employees/quick-register",
      { method: "POST", body: JSON.stringify(payload) },
      "Quick registration failed"
    );
  }

  // Shifts
  async getShifts(): Promise<Shift[]> {
    return this.request<Shift[]>("/shifts", {}, "Failed to fetch shifts");
  }

  async createShift(payload: Record<string, unknown>): Promise<Shift> {
    return this.request<Shift>(
      "/shifts",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to create shift"
    );
  }

  async updateShift(shiftId: string, payload: Record<string, unknown>): Promise<Shift> {
    return this.request<Shift>(
      `/shifts/${shiftId}`,
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update shift"
    );
  }

  async deleteShift(shiftId: string) {
    return this.request<{ success: boolean; message: string }>(
      `/shifts/${shiftId}`,
      { method: "DELETE" },
      "Failed to delete shift"
    );
  }

  // Leaves & Holidays
  async getLeaves(employee_id?: string, status_filter?: string): Promise<LeaveRequest[]> {
    const params = new URLSearchParams();
    if (employee_id) params.append("employee_id", employee_id);
    if (status_filter) params.append("status_filter", status_filter);
    return this.request<LeaveRequest[]>(`/leaves?${params.toString()}`, {}, "Failed to fetch leave requests");
  }

  async getLeaveUsageSummary(year?: number, employee_id?: string): Promise<LeaveUsageSummary[]> {
    const params = new URLSearchParams();
    if (year) params.append("year", String(year));
    if (employee_id) params.append("employee_id", employee_id);
    return this.request<LeaveUsageSummary[]>(
      `/leaves/usage-summary?${params.toString()}`,
      {},
      "Failed to fetch leave summary"
    );
  }

  async applyLeave(payload: Record<string, unknown>): Promise<LeaveRequest> {
    return this.request<LeaveRequest>(
      "/leaves",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to submit leave request"
    );
  }

  async updateLeaveStatus(leaveId: string, status: string, remarks?: string) {
    return this.request<LeaveRequest>(
      `/leaves/${leaveId}/status`,
      { method: "PUT", body: JSON.stringify({ status, remarks }) },
      "Failed to update leave request"
    );
  }

  async getHolidays(branchId?: string, year?: number): Promise<Holiday[]> {
    const params = new URLSearchParams();
    if (branchId) params.append("branch_id", branchId);
    if (year) params.append("year", year.toString());
    return this.request<Holiday[]>(`/holidays?${params.toString()}`, {}, "Failed to fetch holidays");
  }

  async createHoliday(payload: Record<string, unknown>): Promise<Holiday> {
    return this.request<Holiday>(
      "/holidays",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to create holiday"
    );
  }

  async deleteHoliday(holidayId: string) {
    return this.request<{ success: boolean; message: string }>(
      `/holidays/${holidayId}`,
      { method: "DELETE" },
      "Failed to delete holiday"
    );
  }

  // Attendance & Kiosk & Regularization
  async recognizeAndRecord(
    imageBase64: string,
    attendance_mode: string = "AUTO",
    device_id: string = "webcam_kiosk",
    skip_liveness: boolean = false
  ) {
    return this.request<{
      success: boolean;
      total_faces_detected: number;
      detections: Array<{
        bbox: number[];
        is_live: boolean;
        liveness_score: number;
        is_matched: boolean;
        employee_id?: string | null;
        employee_name?: string | null;
        employee_code?: string | null;
        confidence: number;
        margin_gap: number;
        match_message: string;
      }>;
      attendance_event?: {
        success: boolean;
        is_duplicate: boolean;
        message: string;
        punch_time: string;
        employee_id: string;
        employee_name: string;
        employee_code: string;
        punch_type: string;
        daily_status: string;
        late_minutes: number;
        total_work_minutes: number;
      } | null;
    }>(
      "/attendance/recognize-and-record",
      {
        method: "POST",
        body: JSON.stringify({
          image: imageBase64,
          attendance_mode,
          device_id,
          skip_liveness,
        }),
      },
      "Recognition service unavailable"
    );
  }

  async getDailyAttendance(paramsObj?: {
    target_date?: string;
    start_date?: string;
    end_date?: string;
    employee_id?: string;
    department_id?: string;
    status?: string;
    search?: string;
    missing_punch_only?: boolean;
    limit?: number;
  }): Promise<DailyAttendance[]> {
    const params = new URLSearchParams();
    if (paramsObj?.target_date) params.append("target_date", paramsObj.target_date);
    if (paramsObj?.start_date) params.append("start_date", paramsObj.start_date);
    if (paramsObj?.end_date) params.append("end_date", paramsObj.end_date);
    if (paramsObj?.employee_id) params.append("employee_id", paramsObj.employee_id);
    if (paramsObj?.department_id) params.append("department_id", paramsObj.department_id);
    if (paramsObj?.status) params.append("status", paramsObj.status);
    if (paramsObj?.search) params.append("search", paramsObj.search);
    if (paramsObj?.missing_punch_only) params.append("missing_punch_only", "true");
    if (paramsObj?.limit) params.append("limit", String(paramsObj.limit));
    return this.request<DailyAttendance[]>(`/attendance/daily?${params.toString()}`, {}, "Failed to fetch daily attendance");
  }

  async getAttendanceLogs(paramsObj?: {
    employee_id?: string;
    department_id?: string;
    punch_type?: string;
    search?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<AttendanceLog[]> {
    const params = new URLSearchParams();
    if (paramsObj?.employee_id) params.append("employee_id", paramsObj.employee_id);
    if (paramsObj?.department_id) params.append("department_id", paramsObj.department_id);
    if (paramsObj?.punch_type) params.append("punch_type", paramsObj.punch_type);
    if (paramsObj?.search) params.append("search", paramsObj.search);
    if (paramsObj?.start_date) params.append("start_date", paramsObj.start_date);
    if (paramsObj?.end_date) params.append("end_date", paramsObj.end_date);
    params.append("limit", String(paramsObj?.limit ?? 100));
    return this.request<AttendanceLog[]>(`/attendance/logs?${params.toString()}`, {}, "Failed to fetch punch records");
  }

  async regularizeAttendance(payload: Record<string, unknown>) {
    return this.request<{ success: boolean; message: string; daily_attendance: DailyAttendance; audit_log_id: string }>(
      "/attendance/regularize",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to update attendance record"
    );
  }

  async getRegularizationRequests(statusFilter?: string, employeeId?: string): Promise<RegularizationRequestItem[]> {
    const params = new URLSearchParams();
    if (statusFilter) params.append("status_filter", statusFilter);
    if (employeeId) params.append("employee_id", employeeId);
    return this.request<RegularizationRequestItem[]>(
      `/attendance/regularization-requests?${params.toString()}`,
      {},
      "Failed to load regularization requests"
    );
  }

  async createRegularizationRequest(payload: Record<string, unknown>): Promise<RegularizationRequestItem> {
    return this.request<RegularizationRequestItem>(
      "/attendance/regularization-requests",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to submit correction request"
    );
  }

  async reviewRegularizationRequest(requestId: string, status: "APPROVED" | "REJECTED", remarks?: string): Promise<RegularizationRequestItem> {
    return this.request<RegularizationRequestItem>(
      `/attendance/regularization-requests/${requestId}/review`,
      { method: "PUT", body: JSON.stringify({ status, remarks }) },
      "Failed to review correction request"
    );
  }

  async getAuditLogs(limit = 50): Promise<AuditLog[]> {
    return this.request<AuditLog[]>(`/attendance/audit-logs?limit=${limit}`, {}, "Failed to fetch audit history");
  }

  // Reports
  async getMonthlySummary(year: number, month: number, department_id?: string): Promise<MonthlyReportResponse> {
    const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
    if (department_id) params.append("department_id", department_id);
    return this.request<MonthlyReportResponse>(
      `/reports/monthly-summary?${params.toString()}`,
      {},
      "Failed to generate monthly report"
    );
  }

  async downloadMonthlyCsv(year: number, month: number, department_id?: string) {
    const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
    if (department_id) params.append("department_id", department_id);
    const res = await fetch(`${API_BASE_URL}/reports/export/csv?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to export attendance CSV");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `attendance_register_${year}_${String(month).padStart(2, "0")}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Settings
  async getOrganization(): Promise<OrganizationInfo> {
    return this.request<OrganizationInfo>("/settings/organization", {}, "Failed to load organization");
  }

  async updateOrganization(payload: { name: string; code: string }): Promise<OrganizationInfo> {
    return this.request<OrganizationInfo>(
      "/settings/organization",
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update organization"
    );
  }

  async getBranchesDetailed(): Promise<Branch[]> {
    return this.request<Branch[]>("/settings/branches", {}, "Failed to load branches");
  }

  async createBranch(payload: { name: string; timezone: string; address?: string }): Promise<Branch> {
    return this.request<Branch>(
      "/settings/branches",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to create branch"
    );
  }

  async updateBranch(branchId: string, payload: { name: string; timezone: string; address?: string }): Promise<Branch> {
    return this.request<Branch>(
      `/settings/branches/${branchId}`,
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update branch"
    );
  }

  async getDepartmentsDetailed(): Promise<Department[]> {
    return this.request<Department[]>("/settings/departments", {}, "Failed to load departments");
  }

  async updateDepartment(deptId: string, payload: { name: string; code?: string; branch_id: string }): Promise<Department> {
    return this.request<Department>(
      `/settings/departments/${deptId}`,
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update department"
    );
  }

  async deleteDepartment(deptId: string) {
    return this.request<{ success: boolean; message: string }>(
      `/settings/departments/${deptId}`,
      { method: "DELETE" },
      "Failed to delete department"
    );
  }

  async getRoles(): Promise<RoleInfo[]> {
    return this.request<RoleInfo[]>("/settings/roles", {}, "Failed to load roles");
  }

  async getUsers(): Promise<UserAccount[]> {
    return this.request<UserAccount[]>("/settings/users", {}, "Failed to load user accounts");
  }

  async createUser(payload: Record<string, unknown>): Promise<UserAccount> {
    return this.request<UserAccount>(
      "/settings/users",
      { method: "POST", body: JSON.stringify(payload) },
      "Failed to create user account"
    );
  }

  async updateUser(userId: string, payload: Record<string, unknown>): Promise<UserAccount> {
    return this.request<UserAccount>(
      `/settings/users/${userId}`,
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to update user account"
    );
  }

  async getPreferences(): Promise<SystemPreferences> {
    return this.request<SystemPreferences>("/settings/preferences", {}, "Failed to load preferences");
  }

  async updatePreferences(payload: Partial<SystemPreferences>): Promise<SystemPreferences> {
    return this.request<SystemPreferences>(
      "/settings/preferences",
      { method: "PUT", body: JSON.stringify(payload) },
      "Failed to save preferences"
    );
  }
}

export const api = new ApiClient();
