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

  async checkFaceQuality(imageBase64: string) {
    const res = await fetch(`${API_BASE_URL}/face/quality-check`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({ image: imageBase64 }),
    });
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

  async recognizeAndRecord(imageBase64: string, attendance_mode: string = "AUTO", device_id: string = "webcam_kiosk") {
    const res = await fetch(`${API_BASE_URL}/attendance/recognize-and-record`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        image: imageBase64,
        attendance_mode,
        device_id,
        skip_liveness: false,
      }),
    });
    if (!res.ok) throw new Error("Recognition failed");
    return res.json();
  }

  async getAttendanceLogs(): Promise<AttendanceLog[]> {
    const res = await fetch(`${API_BASE_URL}/attendance/logs?limit=50`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to fetch logs");
    return res.json();
  }
}

export const api = new ApiClient();
