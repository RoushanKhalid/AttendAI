const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  is_superuser: boolean;
  roles: string[];
}

export interface Employee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone?: string;
  designation?: string;
  status: string;
  enrollment_status: string;
  department?: { id: string; name: string };
  branch?: { id: string; name: string };
  default_shift?: { id: string; name: string; start_time: string; end_time: string };
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
  created_at: string;
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
  attendance_date: string;
  check_in_time?: string;
  check_out_time?: string;
  late_minutes: number;
  early_departure_minutes: number;
  total_work_minutes: number;
  overtime_minutes: number;
  status: string;
  regularization_status: string;
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

class ApiClient {
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
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

  async login(username_or_email: string, password: string) {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username_or_email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Login failed");
    }
    const data = await res.json();
    if (typeof window !== "undefined") {
      localStorage.setItem("token", data.access_token);
      localStorage.setItem("user", JSON.stringify(data));
    }
    return data;
  }

  logout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }
  }

  getUser(): UserProfile | null {
    if (typeof window !== "undefined") {
      const u = localStorage.getItem("user");
      return u ? JSON.parse(u) : null;
    }
    return null;
  }

  async getDashboardSummary(): Promise<DashboardSummary> {
    const res = await fetch(`${API_BASE_URL}/dashboard/summary`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch dashboard summary");
    return res.json();
  }

  async getEmployees(search?: string, department_id?: string): Promise<Employee[]> {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (department_id) params.append("department_id", department_id);
    const res = await fetch(`${API_BASE_URL}/employees?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch employees");
    return res.json();
  }

  async createEmployee(payload: Record<string, unknown>): Promise<Employee> {
    const res = await fetch(`${API_BASE_URL}/employees`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create employee");
    }
    return res.json();
  }

  async getMetadata() {
    const [branches, depts, shifts] = await Promise.all([
      fetch(`${API_BASE_URL}/employees/meta/branches`, { headers: this.getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE_URL}/employees/meta/departments`, { headers: this.getHeaders() }).then(r => r.json()),
      fetch(`${API_BASE_URL}/employees/meta/shifts`, { headers: this.getHeaders() }).then(r => r.json()),
    ]);
    return { branches, departments: depts, shifts };
  }

  // Shifts
  async getShifts(): Promise<Shift[]> {
    const res = await fetch(`${API_BASE_URL}/shifts`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch shifts");
    return res.json();
  }

  async createShift(payload: Record<string, unknown>): Promise<Shift> {
    const res = await fetch(`${API_BASE_URL}/shifts`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create shift");
    }
    return res.json();
  }

  async deleteShift(shiftId: string) {
    const res = await fetch(`${API_BASE_URL}/shifts/${shiftId}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to delete shift");
    }
    return res.json();
  }

  // Leaves
  async getLeaves(employee_id?: string, status_filter?: string): Promise<LeaveRequest[]> {
    const params = new URLSearchParams();
    if (employee_id) params.append("employee_id", employee_id);
    if (status_filter) params.append("status_filter", status_filter);
    const res = await fetch(`${API_BASE_URL}/leaves?${params.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch leaves");
    return res.json();
  }

  async applyLeave(payload: Record<string, unknown>): Promise<LeaveRequest> {
    const res = await fetch(`${API_BASE_URL}/leaves`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to submit leave application");
    }
    return res.json();
  }

  async updateLeaveStatus(leaveId: string, status: string, remarks?: string) {
    const res = await fetch(`${API_BASE_URL}/leaves/${leaveId}/status`, {
      method: "PUT",
      headers: this.getHeaders(),
      body: JSON.stringify({ status, remarks }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to update leave status");
    }
    return res.json();
  }

  // Holidays
  async getHolidays(branchId?: string, year?: number): Promise<Holiday[]> {
    const params = new URLSearchParams();
    if (branchId) params.append("branch_id", branchId);
    if (year) params.append("year", year.toString());
    const res = await fetch(`${API_BASE_URL}/holidays?${params.toString()}`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch holidays");
    return res.json();
  }

  async createHoliday(payload: Record<string, unknown>): Promise<Holiday> {
    const res = await fetch(`${API_BASE_URL}/holidays`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create holiday");
    }
    return res.json();
  }

  async deleteHoliday(holidayId: string) {
    const res = await fetch(`${API_BASE_URL}/holidays/${holidayId}`, {
      method: "DELETE",
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete holiday");
    return res.json();
  }

  // Attendance & Regularization
  async checkFaceQuality(imageBase64: string) {
    const res = await fetch(`${API_BASE_URL}/face/quality-check`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ image: imageBase64 }),
    });
    return res.json();
  }

  async quickRegister(payload: {
    first_name: string;
    last_name: string;
    employee_code?: string;
    email?: string;
    phone?: string;
    designation?: string;
    department_id?: string;
    branch_id?: string;
    default_shift_id?: string;
    face_image: string;
  }) {
    const res = await fetch(`${API_BASE_URL}/employees/quick-register`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Quick registration failed");
    }
    return res.json();
  }

  async enrollFace(employee_id: string, samples: string[]) {
    const res = await fetch(`${API_BASE_URL}/face/enroll`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ employee_id, samples }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Enrollment failed");
    }
    return res.json();
  }

  async recognizeAndRecord(
    imageBase64: string,
    attendance_mode: string = "AUTO",
    device_id: string = "webcam_kiosk",
    skip_liveness: boolean = false
  ) {
    const res = await fetch(`${API_BASE_URL}/attendance/recognize-and-record`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        image: imageBase64,
        attendance_mode,
        device_id,
        skip_liveness,
      }),
    });
    if (!res.ok) throw new Error("Recognition failed");
    return res.json();
  }

  async regularizeAttendance(payload: Record<string, unknown>) {
    const res = await fetch(`${API_BASE_URL}/attendance/regularize`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Regularization failed");
    }
    return res.json();
  }

  async getAttendanceLogs(): Promise<AttendanceLog[]> {
    const res = await fetch(`${API_BASE_URL}/attendance/logs?limit=50`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch logs");
    return res.json();
  }

  async getAuditLogs(): Promise<AuditLog[]> {
    const res = await fetch(`${API_BASE_URL}/attendance/audit-logs?limit=50`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch audit logs");
    return res.json();
  }

  // Reports
  async getMonthlySummary(year: number, month: number, department_id?: string): Promise<MonthlyReportResponse> {
    const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
    if (department_id) params.append("department_id", department_id);
    const res = await fetch(`${API_BASE_URL}/reports/monthly-summary?${params.toString()}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch monthly report summary");
    return res.json();
  }

  getExportCsvUrl(year: number, month: number, department_id?: string): string {
    const params = new URLSearchParams({ year: year.toString(), month: month.toString() });
    if (department_id) params.append("department_id", department_id);
    return `${API_BASE_URL}/reports/export/csv?${params.toString()}`;
  }
}

export const api = new ApiClient();
