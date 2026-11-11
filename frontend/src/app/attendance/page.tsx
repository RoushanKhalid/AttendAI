"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Clock,
  Download,
  Search,
  AlertTriangle,
  Calendar,
  Eye,
  FileCheck2,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Input, Select } from "@/components/ui/FormControls";
import { SlideOverDrawer } from "@/components/ui/Modal";
import { EmptyState, Pagination, TableSkeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { api, AttendanceLog, DailyAttendance, Department } from "@/lib/api";
import {
  cn,
  downloadCsvContent,
  formatDate,
  formatDateTime,
  formatDurationMins,
  formatTime,
  isManagerOrAboveUser,
  toLocalDateInputValue,
} from "@/lib/utils";

type AttendanceTab = "today" | "history" | "late" | "early" | "missing" | "logs";

const PAGE_SIZE = 12;

function AttendanceContent() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();

  const isManager = isManagerOrAboveUser(user?.roles, user?.is_superuser);

  const initialTab = (searchParams.get("tab") as AttendanceTab) || "today";
  const initialStatus = searchParams.get("status") || "";
  const initialSearch = searchParams.get("search") || "";

  const [tab, setTab] = useState<AttendanceTab>(initialTab);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [departmentId, setDepartmentId] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialStatus);

  const today = toLocalDateInputValue();
  const sevenDaysAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toLocalDateInputValue(d);
  })();

  const [targetDate, setTargetDate] = useState(today);
  const [startDate, setStartDate] = useState(sevenDaysAgo);
  const [endDate, setEndDate] = useState(today);
  const [punchTypeFilter, setPunchTypeFilter] = useState("");

  const [dailyRows, setDailyRows] = useState<DailyAttendance[]>([]);
  const [logRows, setLogRows] = useState<AttendanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Employee detail drawer
  const [selectedRecord, setSelectedRecord] = useState<DailyAttendance | null>(null);
  const [selectedEmpLogs, setSelectedEmpLogs] = useState<AttendanceLog[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    api.getMetadata().then((m) => setDepartments(m.departments)).catch(() => {});
  }, []);

  const fetchRecords = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setPage(1);
    try {
      if (tab === "logs") {
        const logs = await api.getAttendanceLogs({
          search: search || undefined,
          department_id: departmentId || undefined,
          punch_type: punchTypeFilter || undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
          limit: 200,
        });
        setLogRows(logs);
      } else {
        const isHistory = tab === "history";
        const effectiveStatus =
          tab === "late"
            ? "LATE"
            : tab === "early"
            ? "EARLY_DEPARTURE"
            : statusFilter || undefined;

        const rows = await api.getDailyAttendance({
          target_date: isHistory ? undefined : targetDate,
          start_date: isHistory ? startDate : undefined,
          end_date: isHistory ? endDate : undefined,
          department_id: departmentId || undefined,
          status: effectiveStatus,
          search: search || undefined,
          missing_punch_only: tab === "missing",
          limit: 250,
        });
        setDailyRows(rows);
      }
    } catch (err: unknown) {
      toast.error("Could not load attendance records", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [
    isAuthenticated,
    tab,
    search,
    departmentId,
    statusFilter,
    targetDate,
    startDate,
    endDate,
    punchTypeFilter,
    toast,
  ]);

  useEffect(() => {
    const timer = setTimeout(fetchRecords, 180);
    return () => clearTimeout(timer);
  }, [fetchRecords]);

  const openDetailDrawer = async (record: DailyAttendance) => {
    setSelectedRecord(record);
    setLoadingDetail(true);
    try {
      const logs = await api.getAttendanceLogs({
        employee_id: record.employee_id,
        start_date: record.attendance_date,
        end_date: record.attendance_date,
        limit: 20,
      });
      setSelectedEmpLogs(logs);
    } catch {
      setSelectedEmpLogs([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleExport = () => {
    if (tab === "logs") {
      downloadCsvContent(`punch_logs_${startDate}_to_${endDate}.csv`, [
        ["Timestamp", "Employee Code", "Employee Name", "Department", "Type", "Terminal", "Mode"],
        ...logRows.map((l) => [
          formatDateTime(l.punch_time),
          l.employee_code,
          l.employee_name,
          l.department_name,
          l.punch_type,
          l.device_id,
          l.verification_mode,
        ]),
      ]);
      toast.success("Exported punch logs", `${logRows.length} rows downloaded.`);
    } else {
      downloadCsvContent(`attendance_${tab}_${targetDate}.csv`, [
        [
          "Date",
          "Employee Code",
          "Employee Name",
          "Department",
          "Shift",
          "Check In",
          "Check Out",
          "Late (mins)",
          "Early Leave (mins)",
          "Worked",
          "Overtime (mins)",
          "Status",
          "Correction Status",
        ],
        ...dailyRows.map((d) => [
          d.attendance_date,
          d.employee_code || "",
          d.employee_name || "",
          d.department_name || "",
          d.shift_name || "",
          d.check_in_time ? formatTime(d.check_in_time) : "",
          d.check_out_time ? formatTime(d.check_out_time) : "",
          d.late_minutes,
          d.early_departure_minutes,
          formatDurationMins(d.total_work_minutes),
          d.overtime_minutes,
          d.status,
          d.regularization_status,
        ]),
      ]);
      toast.success("Exported attendance", `${dailyRows.length} rows downloaded.`);
    }
  };

  const activeItems = tab === "logs" ? logRows : dailyRows;
  const pagedDaily = useMemo(
    () => dailyRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [dailyRows, page]
  );
  const pagedLogs = useMemo(
    () => logRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [logRows, page]
  );

  const tabs: Array<{ id: AttendanceTab; label: string }> = [
    { id: "today", label: "Today's Attendance" },
    { id: "history", label: "Attendance History" },
    { id: "late", label: "Late Arrivals" },
    { id: "early", label: "Early Departures" },
    { id: "missing", label: "Missing Punches" },
    { id: "logs", label: "Check-In / Out Logs" },
  ];

  return (
    <AppShell title="Attendance">
      <PageHeader
        title="Attendance Management"
        subtitle={
          isManager
            ? "Track daily check-ins, work hours, late arrivals, early departures, and missing punches."
            : "View your daily attendance records, work hours, and check-in/out timestamps."
        }
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRecords}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={activeItems.length === 0}
            icon={<Download className="w-3.5 h-3.5" />}
          >
            Export CSV
          </Button>
        }
      />

      {/* Sub-navigation Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                if (t.id !== "today" && t.id !== "history") {
                  setStatusFilter("");
                }
              }}
              className={cn(
                "px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
                isActive
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Filters Card */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {isManager && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search employee or code…"
                  className="pl-9"
                />
              </div>
            )}

            {tab === "history" || tab === "logs" ? (
              <>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  aria-label="Start date"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  aria-label="End date"
                />
              </>
            ) : (
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                <Input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="pl-9"
                  aria-label="Target date"
                />
              </div>
            )}

            {isManager && (
              <Select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                aria-label="Filter by department"
              >
                <option value="">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            )}

            {tab === "logs" ? (
              <Select
                value={punchTypeFilter}
                onChange={(e) => setPunchTypeFilter(e.target.value)}
                aria-label="Filter by punch type"
              >
                <option value="">All Punch Types</option>
                <option value="CHECK_IN">Checked In</option>
                <option value="CHECK_OUT">Checked Out</option>
              </Select>
            ) : tab === "today" || tab === "history" ? (
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                <option value="PRESENT">Present</option>
                <option value="LATE">Late Arrival</option>
                <option value="HALF_DAY">Half Day</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="ABSENT">Absent</option>
                <option value="HOLIDAY">Holiday</option>
              </Select>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Main Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : tab === "logs" ? (
          logRows.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-5 h-5" />}
              title="No check-in or check-out logs found"
              description="Try widening the date range or clearing your active search filters."
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="px-4 py-3">Date & Time</th>
                      <th className="px-4 py-3">Employee</th>
                      <th className="px-4 py-3">Department</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Terminal</th>
                      <th className="px-4 py-3">Method</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-900 tabular-nums whitespace-nowrap">
                          {formatDateTime(log.punch_time)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{log.employee_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{log.employee_code}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{log.department_name}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={log.punch_type} />
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono">{log.device_id}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {log.verification_mode === "FACE_RECOGNITION" ? "Face Kiosk" : log.verification_mode}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={page}
                totalItems={logRows.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            </>
          )
        ) : dailyRows.length === 0 ? (
          <EmptyState
            icon={<Clock className="w-5 h-5" />}
            title={
              tab === "missing"
                ? "No missing check-outs found"
                : "No attendance records for these filters"
            }
            description={
              tab === "missing"
                ? "Everyone who checked in on this date has a recorded check-out, or no records match."
                : "Select a different date or clear filters to inspect attendance history."
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Check In</th>
                    <th className="px-4 py-3">Check Out</th>
                    <th className="px-4 py-3">Worked</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedDaily.map((row) => {
                    const isMissingOut = Boolean(row.check_in_time && !row.check_out_time);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{row.employee_name || "Employee"}</div>
                          <div className="text-[11px] text-slate-500">
                            <span className="font-mono">{row.employee_code}</span> · {row.department_name}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                          {formatDate(row.attendance_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.shift_name || "Standard"}</td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          <div className="font-medium text-slate-900">{formatTime(row.check_in_time)}</div>
                          {row.late_minutes > 0 && (
                            <div className="text-[11px] text-amber-600">{row.late_minutes}m late</div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          {isMissingOut ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                              <AlertTriangle className="w-3.5 h-3.5" /> Missing
                            </span>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">{formatTime(row.check_out_time)}</div>
                              {row.early_departure_minutes > 0 && (
                                <div className="text-[11px] text-amber-600">
                                  {row.early_departure_minutes}m early
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                          <div className="font-medium text-slate-900">
                            {formatDurationMins(row.total_work_minutes)}
                          </div>
                          {row.overtime_minutes > 0 && (
                            <div className="text-[11px] text-blue-600">
                              +{formatDurationMins(row.overtime_minutes)} OT
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openDetailDrawer(row)}
                            icon={<Eye className="w-3.5 h-3.5" />}
                          >
                            Inspect
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalItems={dailyRows.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Employee Attendance Detail Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(null)}
        title={selectedRecord?.employee_name || "Attendance Record"}
        subtitle={
          selectedRecord
            ? `${selectedRecord.employee_code} · ${formatDate(selectedRecord.attendance_date)}`
            : undefined
        }
        footer={
          selectedRecord && (
            <>
              <Button variant="outline" onClick={() => setSelectedRecord(null)}>
                Close
              </Button>
              <Link
                href={`/regularization?employeeId=${selectedRecord.employee_id}&date=${selectedRecord.attendance_date}`}
              >
                <Button icon={<FileCheck2 className="w-4 h-4" />}>
                  {isManager ? "Correct / Regularize" : "Request Correction"}
                </Button>
              </Link>
            </>
          )
        }
      >
        {selectedRecord && (
          <div className="space-y-5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Status</span>
                <StatusBadge status={selectedRecord.status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Assigned Shift</span>
                <span className="font-medium text-slate-900">{selectedRecord.shift_name || "Standard"}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Check In</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatTime(selectedRecord.check_in_time)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Check Out</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatTime(selectedRecord.check_out_time)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Worked</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDurationMins(selectedRecord.total_work_minutes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Late Arrival</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDurationMins(selectedRecord.late_minutes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Early Departure</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDurationMins(selectedRecord.early_departure_minutes)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Overtime</span>
                <span className="font-medium text-slate-900 tabular-nums">
                  {formatDurationMins(selectedRecord.overtime_minutes)}
                </span>
              </div>
              {selectedRecord.remarks && (
                <div className="pt-2 border-t border-slate-200 text-xs text-slate-600">
                  <span className="font-medium text-slate-800 block mb-0.5">Notes</span>
                  {selectedRecord.remarks}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-900">Raw Punch Timestamps</h4>
              {loadingDetail ? (
                <TableSkeleton rows={2} cols={2} />
              ) : selectedEmpLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-3">
                  No raw camera punches recorded on this date.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {selectedEmpLogs.map((l) => (
                    <div key={l.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white">
                      <div>
                        <div className="font-medium text-slate-900 tabular-nums">{formatTime(l.punch_time)}</div>
                        <div className="text-[11px] text-slate-500">{l.device_id}</div>
                      </div>
                      <StatusBadge status={l.punch_type} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>
    </AppShell>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AttendanceContent />
    </Suspense>
  );
}

