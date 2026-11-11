"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Clock,
  Download,
  FileSpreadsheet,
  Percent,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/FormControls";
import { EmptyState, TableSkeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  DailyAttendance,
  Department,
  MonthlyReportResponse,
} from "@/lib/api";
import {
  cn,
  downloadCsvContent,
  formatDate,
  formatDurationMins,
  formatTime,
  toLocalDateInputValue,
} from "@/lib/utils";

type ReportView = "monthly" | "daily" | "departments" | "punctuality" | "overtime";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function ReportsPage() {
  const { isAuthenticated } = useAuth();
  const toast = useToast();

  const [view, setView] = useState<ReportView>("monthly");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [departmentId, setDepartmentId] = useState("");
  const [dailyDate, setDailyDate] = useState(toLocalDateInputValue());

  const [departments, setDepartments] = useState<Department[]>([]);
  const [monthly, setMonthly] = useState<MonthlyReportResponse | null>(null);
  const [dailyRows, setDailyRows] = useState<DailyAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.getMetadata().then((m) => setDepartments(m.departments)).catch(() => {});
  }, []);

  const loadReports = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [mRes, dRes] = await Promise.all([
        api.getMonthlySummary(year, month, departmentId || undefined),
        api.getDailyAttendance({
          target_date: dailyDate,
          department_id: departmentId || undefined,
          limit: 250,
        }),
      ]);
      setMonthly(mRes);
      setDailyRows(dRes);
    } catch (err: unknown) {
      toast.error("Failed to generate report", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, year, month, departmentId, dailyDate, toast]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleStatutoryCsv = async () => {
    setExporting(true);
    try {
      await api.downloadMonthlyCsv(year, month, departmentId || undefined);
      toast.success("Report exported", `Attendance register for ${MONTHS[month - 1]} ${year} downloaded.`);
    } catch (err: unknown) {
      toast.error("Export failed", err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const handleSummaryCsv = () => {
    const rows = monthly?.summaries || [];
    downloadCsvContent(`monthly_summary_${year}_${String(month).padStart(2, "0")}.csv`, [
      [
        "Employee Code",
        "Name",
        "Department",
        "Designation",
        "Working Days",
        "Present",
        "Late",
        "Absent",
        "Leaves",
        "Holidays",
        "Work Hours",
        "Overtime Hours",
        "Attendance Rate (%)",
      ],
      ...rows.map((r) => [
        r.employee_code,
        r.full_name,
        r.department_name || "",
        r.designation || "",
        r.working_days,
        r.present_days,
        r.late_days,
        r.absent_days,
        r.leave_days,
        r.holiday_days,
        r.total_work_hours,
        r.overtime_hours,
        r.attendance_rate,
      ]),
    ]);
    toast.success("Summary exported", `${rows.length} employee summaries exported.`);
  };

  const totals = useMemo(() => {
    const list = monthly?.summaries || [];
    const totalHours = list.reduce((acc, r) => acc + r.total_work_hours, 0);
    const totalOvertime = list.reduce((acc, r) => acc + r.overtime_hours, 0);
    const totalLate = list.reduce((acc, r) => acc + r.late_days, 0);
    const totalAbsent = list.reduce((acc, r) => acc + r.absent_days, 0);
    return {
      totalHours: totalHours.toFixed(1),
      totalOvertime: totalOvertime.toFixed(1),
      totalLate,
      totalAbsent,
    };
  }, [monthly]);

  const deptRollup = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        employees: number;
        present: number;
        late: number;
        absent: number;
        workHours: number;
        overtimeHours: number;
        rateSum: number;
      }
    > = {};

    for (const s of monthly?.summaries || []) {
      const key = s.department_name || "Unassigned";
      if (!map[key]) {
        map[key] = {
          name: key,
          employees: 0,
          present: 0,
          late: 0,
          absent: 0,
          workHours: 0,
          overtimeHours: 0,
          rateSum: 0,
        };
      }
      map[key].employees += 1;
      map[key].present += s.present_days;
      map[key].late += s.late_days;
      map[key].absent += s.absent_days;
      map[key].workHours += s.total_work_hours;
      map[key].overtimeHours += s.overtime_hours;
      map[key].rateSum += s.attendance_rate;
    }

    return Object.values(map).map((d) => ({
      ...d,
      avgRate: d.employees > 0 ? Number((d.rateSum / d.employees).toFixed(1)) : 0,
    }));
  }, [monthly]);

  const punctualitySorted = useMemo(() => {
    return [...(monthly?.summaries || [])].sort(
      (a, b) => b.late_days + b.absent_days - (a.late_days + a.absent_days)
    );
  }, [monthly]);

  const overtimeSorted = useMemo(() => {
    return [...(monthly?.summaries || [])].sort(
      (a, b) => b.overtime_hours - a.overtime_hours || b.total_work_hours - a.total_work_hours
    );
  }, [monthly]);

  return (
    <AppShell title="Reports & Analytics">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Generate daily, monthly, department, punctuality, and overtime reports with CSV export."
        secondaryActions={
          <Button variant="outline" size="sm" onClick={handleSummaryCsv} icon={<FileSpreadsheet className="w-3.5 h-3.5" />}>
            Export Summary CSV
          </Button>
        }
        primaryAction={
          <Button
            size="sm"
            onClick={handleStatutoryCsv}
            loading={exporting}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export Daily Register CSV
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-3">
          {view === "daily" ? (
            <Input
              type="date"
              value={dailyDate}
              onChange={(e) => setDailyDate(e.target.value)}
              className="w-44"
              aria-label="Report date"
            />
          ) : (
            <>
              <Select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-28"
                aria-label="Year"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-40"
                aria-label="Month"
              >
                {MONTHS.map((m, idx) => (
                  <option key={m} value={idx + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </>
          )}

          <Select
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            className="w-48"
            aria-label="Filter by department"
          >
            <option value="">All Departments</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>

          <Button variant="outline" size="sm" onClick={loadReports} icon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Employees Included"
          value={monthly?.total_employees ?? 0}
          hint={`${MONTHS[month - 1]} ${year}`}
          icon={<Users className="w-4 h-4" />}
        />
        <StatCard
          label="Average Attendance Rate"
          value={`${(monthly?.average_attendance_rate ?? 0).toFixed(1)}%`}
          hint="Across selected scope"
          icon={<Percent className="w-4 h-4" />}
          tone="info"
        />
        <StatCard
          label="Total Hours Worked"
          value={`${totals.totalHours}h`}
          hint={`${totals.totalOvertime}h overtime`}
          icon={<Clock className="w-4 h-4" />}
          tone="success"
        />
        <StatCard
          label="Late & Absence Incidents"
          value={`${totals.totalLate} / ${totals.totalAbsent}`}
          hint="Late days / Absent days"
          icon={<Timer className="w-4 h-4" />}
          tone="warning"
        />
      </div>

      {/* Report View Selector */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          { id: "monthly", label: "Monthly Summary" },
          { id: "daily", label: "Daily Attendance" },
          { id: "departments", label: "Department Comparison" },
          { id: "punctuality", label: "Late & Absence Report" },
          { id: "overtime", label: "Working Hours & Overtime" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setView(t.id as ReportView)}
            className={cn(
              "px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              view === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Views */}
      {loading ? (
        <Card>
          <TableSkeleton rows={6} cols={7} />
        </Card>
      ) : view === "daily" ? (
        <Card className="overflow-hidden">
          {dailyRows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="w-5 h-5" />}
              title="No daily attendance rows"
              description={`No attendance records found for ${formatDate(dailyDate)}.`}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Check In</th>
                    <th className="px-4 py-3">Check Out</th>
                    <th className="px-4 py-3">Late</th>
                    <th className="px-4 py-3">Worked</th>
                    <th className="px-4 py-3">Overtime</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dailyRows.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{d.employee_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{d.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{d.department_name}</td>
                      <td className="px-4 py-3 tabular-nums">{formatTime(d.check_in_time)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatTime(d.check_out_time)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatDurationMins(d.late_minutes)}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">{formatDurationMins(d.total_work_minutes)}</td>
                      <td className="px-4 py-3 tabular-nums text-blue-600">{formatDurationMins(d.overtime_minutes)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={d.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : view === "departments" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="lg:col-span-5">
            <CardHeader
              title="Department Attendance Rates"
              subtitle={`Comparison for ${MONTHS[month - 1]} ${year}`}
            />
            <CardContent className="space-y-4">
              {deptRollup.length === 0 ? (
                <p className="text-xs text-slate-500 py-4 text-center">No department data available.</p>
              ) : (
                deptRollup.map((d) => (
                  <div key={d.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{d.name}</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{d.avgRate}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, d.avgRate)}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {d.employees} staff · {d.workHours.toFixed(1)}h worked · {d.late} late days
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-7 overflow-hidden">
            <CardHeader title="Department Summary Table" />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Staff</th>
                    <th className="px-4 py-3 text-right">Present Days</th>
                    <th className="px-4 py-3 text-right">Late Days</th>
                    <th className="px-4 py-3 text-right">Absent Days</th>
                    <th className="px-4 py-3 text-right">Work Hours</th>
                    <th className="px-4 py-3 text-right">Avg Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {deptRollup.map((d) => (
                    <tr key={d.name} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.employees}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">{d.present}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{d.late}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-700">{d.absent}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{d.workHours.toFixed(1)}h</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-700">{d.avgRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : view === "punctuality" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Present Days</th>
                  <th className="px-4 py-3 text-right">Late Arrivals</th>
                  <th className="px-4 py-3 text-right">Absences</th>
                  <th className="px-4 py-3 text-right">Leave Days</th>
                  <th className="px-4 py-3 text-right">Attendance Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {punctualitySorted.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.full_name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.department_name || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-emerald-700 font-medium">{row.present_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-amber-700 font-semibold">{row.late_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-700 font-semibold">{row.absent_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-blue-700">{row.leave_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">{row.attendance_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : view === "overtime" ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Working Days</th>
                  <th className="px-4 py-3 text-right">Present Days</th>
                  <th className="px-4 py-3 text-right">Total Work Hours</th>
                  <th className="px-4 py-3 text-right">Overtime Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overtimeSorted.map((row) => (
                  <tr key={row.employee_id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.full_name}</div>
                      <div className="text-[11px] font-mono text-slate-500">{row.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.department_name || "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.working_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{row.present_days}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                      {row.total_work_hours}h
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-blue-700">
                      {row.overtime_hours}h
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {!monthly?.summaries?.length ? (
            <EmptyState
              icon={<FileSpreadsheet className="w-5 h-5" />}
              title="No report data for this period"
              description="Try choosing a different month or department."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Work Days</th>
                    <th className="px-4 py-3 text-right">Present</th>
                    <th className="px-4 py-3 text-right">Late</th>
                    <th className="px-4 py-3 text-right">Absent</th>
                    <th className="px-4 py-3 text-right">Leaves</th>
                    <th className="px-4 py-3 text-right">Work (Hrs)</th>
                    <th className="px-4 py-3 text-right">Overtime</th>
                    <th className="px-4 py-3 text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthly.summaries.map((row) => (
                    <tr key={row.employee_id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{row.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.department_name || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">{row.working_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">
                        {row.present_days}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-amber-700">{row.late_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-700">{row.absent_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-700">{row.leave_days}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{row.total_work_hours}h</td>
                      <td className="px-4 py-3 text-right tabular-nums text-blue-600">{row.overtime_hours}h</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-900">
                        {row.attendance_rate}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </AppShell>
  );
}

