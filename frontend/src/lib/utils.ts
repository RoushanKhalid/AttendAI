export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function getInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function formatTime(isoOrTime?: string | null): string {
  if (!isoOrTime) return "—";
  // Handle HH:MM:SS time-only strings
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(isoOrTime)) {
    const [hStr, mStr] = isoOrTime.split(":");
    const h = Number(hStr);
    const m = Number(mStr);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  }
  const d = new Date(isoOrTime);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDate(isoDate?: string | null): string {
  if (!isoDate) return "—";
  // If YYYY-MM-DD, parse cleanly without timezone shift
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (dateOnly) {
    const d = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDurationMins(mins?: number | null): string {
  if (!mins || mins <= 0) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function calculateShiftDurationMins(startTime: string, endTime: string, breakMins: number = 0): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (Number.isNaN(sh) || Number.isNaN(eh)) return 0;
  const startTotal = sh * 60 + sm;
  let endTotal = eh * 60 + em;
  if (endTotal <= startTotal) {
    endTotal += 24 * 60;
  }
  return Math.max(0, endTotal - startTotal - breakMins);
}

export function calculateDaysInclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0;
  const s = new Date(startDate);
  const e = new Date(endDate);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e < s) return 0;
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function toLocalDateInputValue(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type BadgeTone = "success" | "danger" | "warning" | "info" | "neutral";

export function getStatusMeta(status?: string | null): { label: string; tone: BadgeTone } {
  const key = (status || "").toUpperCase();
  switch (key) {
    case "PRESENT":
      return { label: "Present", tone: "success" };
    case "CHECK_IN":
      return { label: "Checked In", tone: "success" };
    case "CHECK_OUT":
      return { label: "Checked Out", tone: "info" };
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "ACTIVE":
      return { label: "Active", tone: "success" };
    case "ENROLLED":
      return { label: "Face Ready", tone: "success" };
    case "LATE":
      return { label: "Late Arrival", tone: "warning" };
    case "HALF_DAY":
      return { label: "Half Day", tone: "warning" };
    case "EARLY_DEPARTURE":
      return { label: "Early Leave", tone: "warning" };
    case "PENDING":
      return { label: "Pending", tone: "warning" };
    case "ABSENT":
      return { label: "Absent", tone: "danger" };
    case "REJECTED":
      return { label: "Rejected", tone: "danger" };
    case "INACTIVE":
    case "TERMINATED":
      return { label: key === "TERMINATED" ? "Terminated" : "Inactive", tone: "danger" };
    case "ON_LEAVE":
      return { label: "On Leave", tone: "info" };
    case "HOLIDAY":
      return { label: "Holiday", tone: "info" };
    case "WEEKLY_OFF":
      return { label: "Weekly Off", tone: "neutral" };
    case "NOT_ENROLLED":
      return { label: "Not Set Up", tone: "neutral" };
    case "NONE":
      return { label: "No Request", tone: "neutral" };
    default:
      return { label: status || "Unknown", tone: "neutral" };
  }
}

export function getRoleLabel(role?: string): string {
  switch ((role || "").toUpperCase()) {
    case "ADMIN":
      return "Administrator";
    case "HR_MANAGER":
      return "HR Manager";
    case "LINE_MANAGER":
      return "Line Manager";
    case "EMPLOYEE":
      return "Employee";
    default:
      return role || "User";
  }
}

export function isAdminUser(roles?: string[], isSuperuser?: boolean): boolean {
  if (isSuperuser) return true;
  return Boolean(roles?.includes("ADMIN"));
}

export function isAdminOrHrUser(roles?: string[], isSuperuser?: boolean): boolean {
  if (isSuperuser) return true;
  return Boolean(roles?.some((r) => r === "ADMIN" || r === "HR_MANAGER"));
}

export function isManagerOrAboveUser(roles?: string[], isSuperuser?: boolean): boolean {
  if (isSuperuser) return true;
  return Boolean(roles?.some((r) => r === "ADMIN" || r === "HR_MANAGER" || r === "LINE_MANAGER"));
}

export function downloadCsvContent(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? "" : String(val);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

