"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Check,
  Clock,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, StatCard } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/FormControls";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { EmptyState, Pagination, TableSkeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  Branch,
  Employee,
  Holiday,
  LeaveRequest,
  LeaveUsageSummary,
} from "@/lib/api";
import {
  calculateDaysInclusive,
  cn,
  formatDate,
  isAdminOrHrUser,
  isManagerOrAboveUser,
  toLocalDateInputValue,
} from "@/lib/utils";

type LeaveTab = "PENDING" | "ALL" | "APPROVED" | "REJECTED" | "USAGE" | "HOLIDAYS";

const PAGE_SIZE = 10;

function LeavesContent() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();

  const isManager = isManagerOrAboveUser(user?.roles, user?.is_superuser);
  const isHrOrAdmin = isAdminOrHrUser(user?.roles, user?.is_superuser);

  const initialTab = (searchParams.get("status")?.toUpperCase() as LeaveTab) || "PENDING";
  const [tab, setTab] = useState<LeaveTab>(initialTab);

  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [usageSummary, setUsageSummary] = useState<LeaveUsageSummary[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [holidayYear, setHolidayYear] = useState(new Date().getFullYear());
  const [holidayBranch, setHolidayBranch] = useState("");
  const [page, setPage] = useState(1);

  // Apply leave modal
  const [applyOpen, setApplyOpen] = useState(searchParams.get("action") === "apply");
  const [applying, setApplying] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employee_id: "",
    leave_type: "ANNUAL",
    start_date: toLocalDateInputValue(),
    end_date: toLocalDateInputValue(),
    reason: "",
  });

  // Review leave modal
  const [reviewTarget, setReviewTarget] = useState<{ item: LeaveRequest; decision: "APPROVED" | "REJECTED" } | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewing, setReviewing] = useState(false);

  // Add holiday modal & delete confirm
  const [holidayOpen, setHolidayOpen] = useState(false);
  const [holidayForm, setHolidayForm] = useState({
    branch_id: "",
    holiday_date: toLocalDateInputValue(),
    name: "",
    is_recurring: false,
  });
  const [savingHoliday, setSavingHoliday] = useState(false);
  const [deleteHolidayTarget, setDeleteHolidayTarget] = useState<Holiday | null>(null);
  const [deletingHoliday, setDeletingHoliday] = useState(false);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setLoading(true);
    try {
      const [leavesData, usageData, holData, meta] = await Promise.all([
        api.getLeaves(),
        api.getLeaveUsageSummary(new Date().getFullYear()).catch(() => []),
        api.getHolidays(holidayBranch || undefined, holidayYear),
        api.getMetadata().catch(() => ({ branches: [], departments: [], shifts: [] })),
      ]);
      setLeaves(leavesData);
      setUsageSummary(usageData);
      setHolidays(holData);
      setBranches(meta.branches);
      setHolidayForm((prev) => ({ ...prev, branch_id: prev.branch_id || meta.branches[0]?.id || "" }));

      if (isManager) {
        const emps = await api.getEmployees({ limit: 250 }).catch(() => []);
        setEmployees(emps);
        setLeaveForm((prev) => ({ ...prev, employee_id: prev.employee_id || emps[0]?.id || "" }));
      } else if (user.employee_id) {
        setLeaveForm((prev) => ({ ...prev, employee_id: user.employee_id || "" }));
      }
    } catch (err: unknown) {
      toast.error("Failed to load leave records", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, isManager, holidayBranch, holidayYear, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const counts = useMemo(() => {
    return {
      pending: leaves.filter((l) => l.status === "PENDING").length,
      approved: leaves.filter((l) => l.status === "APPROVED").length,
      rejected: leaves.filter((l) => l.status === "REJECTED").length,
      holidays: holidays.length,
    };
  }, [leaves, holidays]);

  const filteredLeaves = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leaves.filter((l) => {
      if (tab === "PENDING" && l.status !== "PENDING") return false;
      if (tab === "APPROVED" && l.status !== "APPROVED") return false;
      if (tab === "REJECTED" && l.status !== "REJECTED") return false;
      if (typeFilter && l.leave_type !== typeFilter) return false;
      if (q) {
        const hay = `${l.employee_name || ""} ${l.employee_code || ""} ${l.reason || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leaves, tab, typeFilter, search]);

  useEffect(() => {
    setPage(1);
  }, [tab, typeFilter, search]);

  const pagedLeaves = useMemo(
    () => filteredLeaves.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredLeaves, page]
  );

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    const days = calculateDaysInclusive(leaveForm.start_date, leaveForm.end_date);
    if (days <= 0) {
      toast.error("Invalid dates", "End date must be on or after the start date.");
      return;
    }
    setApplying(true);
    try {
      await api.applyLeave(leaveForm);
      toast.success("Leave request submitted", `${days} day${days === 1 ? "" : "s"} requested.`);
      setApplyOpen(false);
      setLeaveForm((prev) => ({ ...prev, reason: "" }));
      loadData();
    } catch (err: unknown) {
      toast.error("Could not submit leave", err instanceof Error ? err.message : undefined);
    } finally {
      setApplying(false);
    }
  };

  const handleReviewLeave = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await api.updateLeaveStatus(reviewTarget.item.id, reviewTarget.decision, reviewRemarks || undefined);
      toast.success(
        reviewTarget.decision === "APPROVED" ? "Leave approved" : "Leave rejected",
        reviewTarget.decision === "APPROVED"
          ? "Daily attendance schedule updated automatically."
          : "The employee's request has been declined."
      );
      setReviewTarget(null);
      setReviewRemarks("");
      loadData();
    } catch (err: unknown) {
      toast.error("Failed to update leave status", err instanceof Error ? err.message : undefined);
    } finally {
      setReviewing(false);
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingHoliday(true);
    try {
      await api.createHoliday(holidayForm);
      toast.success("Holiday added", `${holidayForm.name} added to calendar.`);
      setHolidayOpen(false);
      setHolidayForm((prev) => ({ ...prev, name: "" }));
      loadData();
    } catch (err: unknown) {
      toast.error("Could not add holiday", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingHoliday(false);
    }
  };

  const handleDeleteHoliday = async () => {
    if (!deleteHolidayTarget) return;
    setDeletingHoliday(true);
    try {
      await api.deleteHoliday(deleteHolidayTarget.id);
      toast.success("Holiday removed", `${deleteHolidayTarget.name} removed from calendar.`);
      setDeleteHolidayTarget(null);
      loadData();
    } catch (err: unknown) {
      toast.error("Failed to delete holiday", err instanceof Error ? err.message : undefined);
    } finally {
      setDeletingHoliday(false);
    }
  };

  const daysRequested = calculateDaysInclusive(leaveForm.start_date, leaveForm.end_date);

  return (
    <AppShell title="Leave Management">
      <PageHeader
        title="Leave Management"
        subtitle="Review time-off requests, track annual leave days taken, and manage branch holidays."
        secondaryActions={
          isHrOrAdmin ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHolidayOpen(true)}
              icon={<Plus className="w-3.5 h-3.5" />}
            >
              Add Holiday
            </Button>
          ) : undefined
        }
        primaryAction={
          <Button size="sm" onClick={() => setApplyOpen(true)} icon={<Plus className="w-4 h-4" />}>
            Request Leave
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Pending Approvals"
          value={counts.pending}
          hint="Needs manager review"
          icon={<Clock className="w-4 h-4" />}
          tone="warning"
          onClick={() => setTab("PENDING")}
        />
        <StatCard
          label="Approved Leaves"
          value={counts.approved}
          hint="Synced to attendance"
          icon={<Check className="w-4 h-4" />}
          tone="success"
          onClick={() => setTab("APPROVED")}
        />
        <StatCard
          label="Rejected Requests"
          value={counts.rejected}
          hint="Declined requests"
          icon={<X className="w-4 h-4" />}
          tone="danger"
          onClick={() => setTab("REJECTED")}
        />
        <StatCard
          label={`Holidays (${holidayYear})`}
          value={counts.holidays}
          hint="Official non-working days"
          icon={<CalendarDays className="w-4 h-4" />}
          tone="info"
          onClick={() => setTab("HOLIDAYS")}
        />
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          { id: "PENDING", label: `Pending Approvals (${counts.pending})` },
          { id: "ALL", label: "All Requests" },
          { id: "APPROVED", label: "Approved" },
          { id: "REJECTED", label: "Rejected" },
          { id: "USAGE", label: "Leave Days Taken (YTD)" },
          { id: "HOLIDAYS", label: "Holiday Calendar" },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as LeaveTab)}
            className={cn(
              "px-3.5 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors",
              tab === t.id
                ? "border-blue-600 text-blue-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "HOLIDAYS" ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Select
                value={holidayYear}
                onChange={(e) => setHolidayYear(Number(e.target.value))}
                className="w-32"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
              <Select
                value={holidayBranch}
                onChange={(e) => setHolidayBranch(e.target.value)}
                className="w-56"
              >
                <option value="">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            {holidays.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="w-5 h-5" />}
                title="No holidays scheduled"
                description="Add official public or company holidays so employees are not marked absent."
                action={
                  isHrOrAdmin ? (
                    <Button size="sm" onClick={() => setHolidayOpen(true)} icon={<Plus className="w-4 h-4" />}>
                      Add Holiday
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="divide-y divide-slate-100">
                {holidays.map((hol) => (
                  <div
                    key={hol.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/70"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-semibold uppercase">
                          {new Date(hol.holiday_date + "T00:00:00").toLocaleDateString([], { month: "short" })}
                        </span>
                        <span className="text-sm font-bold leading-none tabular-nums">
                          {new Date(hol.holiday_date + "T00:00:00").getDate()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{hol.name}</div>
                        <div className="text-xs text-slate-500">
                          {hol.branch_name || "All Branches"} · {formatDate(hol.holiday_date)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {hol.is_recurring && <Badge tone="info">Annual</Badge>}
                      {isHrOrAdmin && (
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setDeleteHolidayTarget(hol)}
                          className="text-red-600 hover:bg-red-50"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      ) : tab === "USAGE" ? (
        <Card className="overflow-hidden">
          {usageSummary.length === 0 ? (
            <EmptyState
              icon={<CalendarDays className="w-5 h-5" />}
              title="No approved leave days recorded this year"
              description="Approved leave totals per employee will appear here automatically."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3 text-right">Annual</th>
                    <th className="px-4 py-3 text-right">Casual</th>
                    <th className="px-4 py-3 text-right">Sick</th>
                    <th className="px-4 py-3 text-right">Unpaid</th>
                    <th className="px-4 py-3 text-right">Total Days Taken</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {usageSummary.map((row) => (
                    <tr key={row.employee_id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.employee_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{row.employee_code}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.ANNUAL}d</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.CASUAL}d</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.SICK}d</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.UNPAID}d</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 tabular-nums">
                        {row.total_days_taken} days
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              {isManager && (
                <div className="relative flex-1 min-w-[220px] max-w-sm">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search employee or reason…"
                    className="pl-9"
                  />
                </div>
              )}
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-44"
              >
                <option value="">All Leave Types</option>
                <option value="ANNUAL">Annual Leave</option>
                <option value="CASUAL">Casual Leave</option>
                <option value="SICK">Sick Leave</option>
                <option value="UNPAID">Unpaid Leave</option>
              </Select>
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            {loading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : filteredLeaves.length === 0 ? (
              <EmptyState
                icon={<CalendarDays className="w-5 h-5" />}
                title="No leave requests here"
                description={
                  tab === "PENDING"
                    ? "There are no pending leave approvals right now."
                    : "No leave applications match your current filter."
                }
              />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                      <tr>
                        <th className="px-4 py-3">Employee</th>
                        <th className="px-4 py-3">Type</th>
                        <th className="px-4 py-3">Dates</th>
                        <th className="px-4 py-3">Duration</th>
                        <th className="px-4 py-3">Reason</th>
                        <th className="px-4 py-3">Status</th>
                        {isManager && <th className="px-4 py-3 text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pagedLeaves.map((leave) => {
                        const days = calculateDaysInclusive(leave.start_date, leave.end_date);
                        return (
                          <tr key={leave.id} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <div className="font-medium text-slate-900">{leave.employee_name || "Employee"}</div>
                              <div className="text-[11px] font-mono text-slate-500">{leave.employee_code}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge tone="neutral">{leave.leave_type}</Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap">
                              {formatDate(leave.start_date)}
                              {leave.end_date !== leave.start_date && ` – ${formatDate(leave.end_date)}`}
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-900 tabular-nums whitespace-nowrap">
                              {days} {days === 1 ? "day" : "days"}
                            </td>
                            <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                              {leave.reason || "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge status={leave.status} />
                            </td>
                            {isManager && (
                              <td className="px-4 py-3 text-right">
                                {leave.status === "PENDING" ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <Button
                                      size="xs"
                                      variant="success"
                                      onClick={() => setReviewTarget({ item: leave, decision: "APPROVED" })}
                                      icon={<Check className="w-3.5 h-3.5" />}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="xs"
                                      variant="outline"
                                      className="text-red-600 hover:bg-red-50 border-red-200"
                                      onClick={() => setReviewTarget({ item: leave, decision: "REJECTED" })}
                                      icon={<X className="w-3.5 h-3.5" />}
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-400">Reviewed</span>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={page}
                  totalItems={filteredLeaves.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setPage}
                />
              </>
            )}
          </Card>
        </div>
      )}

      {/* Request Leave Modal */}
      <Modal
        open={applyOpen}
        onClose={() => setApplyOpen(false)}
        title="Request Leave"
        subtitle="Submit a time-off request for approval."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setApplyOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="apply-leave-form" loading={applying}>
              Submit Request
            </Button>
          </>
        }
      >
        <form id="apply-leave-form" onSubmit={handleApplyLeave} className="space-y-4">
          {isManager && (
            <Field label="Employee" required>
              <Select
                required
                value={leaveForm.employee_id}
                onChange={(e) => setLeaveForm({ ...leaveForm, employee_id: e.target.value })}
              >
                <option value="">Select an employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_code})
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Leave Type" required>
            <Select
              value={leaveForm.leave_type}
              onChange={(e) => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
            >
              <option value="ANNUAL">Annual Leave</option>
              <option value="CASUAL">Casual Leave</option>
              <option value="SICK">Sick Leave</option>
              <option value="UNPAID">Unpaid Leave</option>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date" required>
              <Input
                type="date"
                required
                value={leaveForm.start_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, start_date: e.target.value })}
              />
            </Field>
            <Field label="End Date" required>
              <Input
                type="date"
                required
                value={leaveForm.end_date}
                onChange={(e) => setLeaveForm({ ...leaveForm, end_date: e.target.value })}
              />
            </Field>
          </div>

          <div className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
            <span>Total duration requested</span>
            <strong className="text-slate-900">
              {daysRequested > 0 ? `${daysRequested} day${daysRequested === 1 ? "" : "s"}` : "Invalid date range"}
            </strong>
          </div>

          <Field label="Reason">
            <Textarea
              rows={3}
              placeholder="Optional note for your manager…"
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* Approve / Reject Leave Confirmation Modal */}
      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget?.decision === "APPROVED" ? "Approve Leave Request" : "Reject Leave Request"}
        subtitle={
          reviewTarget
            ? `${reviewTarget.item.employee_name} · ${formatDate(reviewTarget.item.start_date)} to ${formatDate(reviewTarget.item.end_date)}`
            : undefined
        }
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={reviewTarget?.decision === "APPROVED" ? "success" : "danger"}
              onClick={handleReviewLeave}
              loading={reviewing}
            >
              {reviewTarget?.decision === "APPROVED" ? "Confirm Approval" : "Confirm Rejection"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            {reviewTarget?.decision === "APPROVED"
              ? "Approving this request will automatically mark the employee as On Leave on the attendance schedule for these dates."
              : "Please confirm you want to decline this leave request."}
          </p>
          <Field label="Remarks (Optional)">
            <Textarea
              rows={2}
              placeholder="Add an optional note…"
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
            />
          </Field>
        </div>
      </Modal>

      {/* Add Holiday Modal */}
      <Modal
        open={holidayOpen}
        onClose={() => setHolidayOpen(false)}
        title="Add Official Holiday"
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setHolidayOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="holiday-form" loading={savingHoliday}>
              Save Holiday
            </Button>
          </>
        }
      >
        <form id="holiday-form" onSubmit={handleAddHoliday} className="space-y-4">
          <Field label="Holiday Name" required>
            <Input
              required
              placeholder="e.g. Independence Day"
              value={holidayForm.name}
              onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
            />
          </Field>
          <Field label="Branch" required>
            <Select
              required
              value={holidayForm.branch_id}
              onChange={(e) => setHolidayForm({ ...holidayForm, branch_id: e.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input
              type="date"
              required
              value={holidayForm.holiday_date}
              onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={holidayForm.is_recurring}
              onChange={(e) => setHolidayForm({ ...holidayForm, is_recurring: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            Recurring every year on this date
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteHolidayTarget)}
        onClose={() => setDeleteHolidayTarget(null)}
        onConfirm={handleDeleteHoliday}
        loading={deletingHoliday}
        title="Remove Holiday"
        message={`Remove "${deleteHolidayTarget?.name}" on ${formatDate(deleteHolidayTarget?.holiday_date)} from the branch holiday calendar?`}
        confirmLabel="Remove Holiday"
      />
    </AppShell>
  );
}

export default function LeavesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LeavesContent />
    </Suspense>
  );
}

