"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  FileCheck2,
  History,
  Plus,
  Wrench,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Input, Select, Textarea } from "@/components/ui/FormControls";
import { Modal } from "@/components/ui/Modal";
import { EmptyState, TableSkeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  AuditLog,
  DailyAttendance,
  Employee,
  RegularizationRequestItem,
} from "@/lib/api";
import {
  cn,
  formatDate,
  formatDateTime,
  formatTime,
  isAdminOrHrUser,
  isManagerOrAboveUser,
  toLocalDateInputValue,
} from "@/lib/utils";

type RegTab = "pending" | "missing" | "requests" | "audit";

function RegularizationContent() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();

  const isManager = isManagerOrAboveUser(user?.roles, user?.is_superuser);
  const isHrOrAdmin = isAdminOrHrUser(user?.roles, user?.is_superuser);

  const [tab, setTab] = useState<RegTab>("pending");
  const [requests, setRequests] = useState<RegularizationRequestItem[]>([]);
  const [missingPunches, setMissingPunches] = useState<DailyAttendance[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit correction request modal (for Employees / Managers)
  const [reqOpen, setReqOpen] = useState(false);
  const [submittingReq, setSubmittingReq] = useState(false);
  const [reqForm, setReqForm] = useState({
    employee_id: searchParams.get("employeeId") || "",
    attendance_date: searchParams.get("date") || toLocalDateInputValue(),
    check_in_time: "09:00",
    check_out_time: "18:00",
    requested_status: "PRESENT",
    reason: "",
  });

  // Direct Admin Override Modal (POST /attendance/regularize)
  const [directOpen, setDirectOpen] = useState(false);
  const [submittingDirect, setSubmittingDirect] = useState(false);
  const [directForm, setDirectForm] = useState({
    employee_id: searchParams.get("employeeId") || "",
    attendance_date: searchParams.get("date") || toLocalDateInputValue(),
    check_in_time: "09:00",
    check_out_time: "18:00",
    status: "PRESENT",
    reason: "",
  });

  // Review Request Modal
  const [reviewTarget, setReviewTarget] = useState<{
    item: RegularizationRequestItem;
    decision: "APPROVED" | "REJECTED";
  } | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState("");
  const [reviewing, setReviewing] = useState(false);

  const loadData = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    setLoading(true);
    try {
      const today = new Date();
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(today.getDate() - 14);

      const [reqs, missing, audits, emps] = await Promise.all([
        api.getRegularizationRequests(),
        api
          .getDailyAttendance({
            start_date: toLocalDateInputValue(twoWeeksAgo),
            end_date: toLocalDateInputValue(today),
            missing_punch_only: true,
            limit: 100,
          })
          .catch(() => []),
        isManager ? api.getAuditLogs(60).catch(() => []) : Promise.resolve([]),
        isManager ? api.getEmployees({ limit: 250 }).catch(() => []) : Promise.resolve([]),
      ]);

      setRequests(reqs);
      setMissingPunches(missing);
      setAuditLogs(audits);
      setEmployees(emps);

      const defaultEmpId = searchParams.get("employeeId") || user.employee_id || emps[0]?.id || "";
      setReqForm((prev) => ({ ...prev, employee_id: prev.employee_id || defaultEmpId }));
      setDirectForm((prev) => ({ ...prev, employee_id: prev.employee_id || defaultEmpId }));
    } catch (err: unknown) {
      toast.error("Could not load regularization records", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, isManager, searchParams, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If navigated with ?employeeId=...&date=..., open the appropriate form
  useEffect(() => {
    if (searchParams.get("employeeId") && searchParams.get("date")) {
      if (isHrOrAdmin) {
        setDirectOpen(true);
      } else {
        setReqOpen(true);
      }
    }
  }, [searchParams, isHrOrAdmin]);

  const pendingRequests = useMemo(() => requests.filter((r) => r.status === "PENDING"), [requests]);

  const openCorrectionForMissing = (row: DailyAttendance) => {
    const inTime = row.check_in_time
      ? new Date(row.check_in_time).toTimeString().slice(0, 5)
      : "09:00";
    if (isHrOrAdmin) {
      setDirectForm({
        employee_id: row.employee_id,
        attendance_date: row.attendance_date,
        check_in_time: inTime,
        check_out_time: "18:00",
        status: "PRESENT",
        reason: "Missing check-out punch corrected",
      });
      setDirectOpen(true);
    } else {
      setReqForm({
        employee_id: row.employee_id,
        attendance_date: row.attendance_date,
        check_in_time: inTime,
        check_out_time: "18:00",
        requested_status: "PRESENT",
        reason: "",
      });
      setReqOpen(true);
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingReq(true);
    try {
      await api.createRegularizationRequest({
        employee_id: reqForm.employee_id,
        attendance_date: reqForm.attendance_date,
        requested_check_in: reqForm.check_in_time
          ? `${reqForm.attendance_date}T${reqForm.check_in_time}:00`
          : null,
        requested_check_out: reqForm.check_out_time
          ? `${reqForm.attendance_date}T${reqForm.check_out_time}:00`
          : null,
        requested_status: reqForm.requested_status,
        reason: reqForm.reason.trim(),
      });
      toast.success("Correction request submitted", "Sent to manager/HR for review.");
      setReqOpen(false);
      setReqForm((prev) => ({ ...prev, reason: "" }));
      loadData();
    } catch (err: unknown) {
      toast.error("Submission failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleDirectRegularize = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingDirect(true);
    try {
      await api.regularizeAttendance({
        employee_id: directForm.employee_id,
        attendance_date: directForm.attendance_date,
        check_in_time: directForm.check_in_time
          ? `${directForm.attendance_date}T${directForm.check_in_time}:00`
          : undefined,
        check_out_time: directForm.check_out_time
          ? `${directForm.attendance_date}T${directForm.check_out_time}:00`
          : undefined,
        status: directForm.status,
        reason: directForm.reason.trim(),
      });
      toast.success("Attendance record updated", "Work hours recalculated and saved to audit log.");
      setDirectOpen(false);
      setDirectForm((prev) => ({ ...prev, reason: "" }));
      loadData();
    } catch (err: unknown) {
      toast.error("Failed to update record", err instanceof Error ? err.message : undefined);
    } finally {
      setSubmittingDirect(false);
    }
  };

  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      await api.reviewRegularizationRequest(
        reviewTarget.item.id,
        reviewTarget.decision,
        reviewRemarks || undefined
      );
      toast.success(
        reviewTarget.decision === "APPROVED" ? "Correction approved" : "Correction rejected",
        reviewTarget.decision === "APPROVED"
          ? "Attendance record updated and logged to audit history."
          : "Request declined."
      );
      setReviewTarget(null);
      setReviewRemarks("");
      loadData();
    } catch (err: unknown) {
      toast.error("Review failed", err instanceof Error ? err.message : undefined);
    } finally {
      setReviewing(false);
    }
  };

  const listToRender = tab === "pending" ? pendingRequests : requests;

  return (
    <AppShell title="Attendance Regularization">
      <PageHeader
        title="Attendance Regularization"
        subtitle="Fix missing punches, compare original vs. requested corrections, and inspect audit history."
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setReqOpen(true)}
            icon={<Plus className="w-3.5 h-3.5" />}
          >
            Submit Correction Request
          </Button>
        }
        primaryAction={
          isHrOrAdmin ? (
            <Button size="sm" onClick={() => setDirectOpen(true)} icon={<Wrench className="w-3.5 h-3.5" />}>
              Direct HR Adjustment
            </Button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 overflow-x-auto">
        {[
          { id: "pending", label: `Pending Requests (${pendingRequests.length})` },
          { id: "missing", label: `Missing Punches (${missingPunches.length})` },
          { id: "requests", label: "All Correction Requests" },
          ...(isManager ? [{ id: "audit", label: "Audit History" }] : []),
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as RegTab)}
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

      {/* Tab Content */}
      {tab === "missing" ? (
        <Card className="overflow-hidden">
          {loading ? (
            <TableSkeleton rows={4} cols={5} />
          ) : missingPunches.length === 0 ? (
            <EmptyState
              icon={<FileCheck2 className="w-5 h-5" />}
              title="No missing punches in the last 14 days"
              description="All employees who checked in also have a check-out recorded."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Recorded Check-In</th>
                    <th className="px-4 py-3">Check-Out</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {missingPunches.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{row.employee_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {row.employee_code} · {row.department_name}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-slate-700">{formatDate(row.attendance_date)}</td>
                      <td className="px-4 py-3 tabular-nums font-medium text-slate-900">
                        {formatTime(row.check_in_time)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5" /> Missing Punch
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={row.regularization_status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="xs" variant="outline" onClick={() => openCorrectionForMissing(row)}>
                          {isHrOrAdmin ? "Fix Missing Punch" : "Request Fix"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : tab === "audit" ? (
        <Card className="overflow-hidden">
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : auditLogs.length === 0 ? (
            <EmptyState
              icon={<History className="w-5 h-5" />}
              title="No audit records yet"
              description="Approved attendance corrections and administrative adjustments appear here permanently."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map((audit) => (
                <div key={audit.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900">{audit.username || "System"}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-medium text-blue-700">
                        {audit.action.replace(/_/g, " ")}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="text-slate-500 tabular-nums">{formatDateTime(audit.created_at)}</span>
                    </div>
                    <p className="text-slate-600">
                      Reason: <span className="italic">&ldquo;{String(audit.new_values?.reason || "Manual adjustment")}&rdquo;</span>
                    </p>
                  </div>

                  {/* Clean Diff Pill */}
                  <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 shrink-0">
                    <div className="text-slate-500">
                      Before:{" "}
                      <span className="font-medium text-slate-700">
                        {audit.old_values?.status ? String(audit.old_values.status) : "No Record"}
                      </span>
                      {audit.old_values?.check_in_time || audit.old_values?.check_out_time ? (
                        <span className="ml-1 tabular-nums">
                          ({formatTime(audit.old_values?.check_in_time as string)} –{" "}
                          {formatTime(audit.old_values?.check_out_time as string)})
                        </span>
                      ) : null}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <div className="text-emerald-700 font-medium">
                      After: {String(audit.new_values?.status || "Updated")}
                      {audit.new_values?.check_in_time || audit.new_values?.check_out_time ? (
                        <span className="ml-1 tabular-nums">
                          ({formatTime(audit.new_values?.check_in_time as string)} –{" "}
                          {formatTime(audit.new_values?.check_out_time as string)})
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <Card>
              <TableSkeleton rows={4} cols={4} />
            </Card>
          ) : listToRender.length === 0 ? (
            <Card>
              <EmptyState
                icon={<FileCheck2 className="w-5 h-5" />}
                title={tab === "pending" ? "No pending correction requests" : "No correction requests found"}
                description="When employees submit missing punch or time corrections, you can review the original vs. requested changes here."
                action={
                  <Button size="sm" variant="outline" onClick={() => setReqOpen(true)} icon={<Plus className="w-4 h-4" />}>
                    Submit Correction Request
                  </Button>
                }
              />
            </Card>
          ) : (
            listToRender.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-semibold text-slate-900">{req.employee_name}</span>
                        <span className="text-xs font-mono text-slate-500">{req.employee_code}</span>
                        <StatusBadge status={req.status} />
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Attendance Date: <strong className="text-slate-700">{formatDate(req.attendance_date)}</strong> ·
                        Submitted {formatDateTime(req.created_at)}
                      </div>
                    </div>

                    {isManager && req.status === "PENDING" && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="success"
                          onClick={() => setReviewTarget({ item: req, decision: "APPROVED" })}
                          icon={<Check className="w-3.5 h-3.5" />}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 hover:bg-red-50 border-red-200"
                          onClick={() => setReviewTarget({ item: req, decision: "REJECTED" })}
                          icon={<X className="w-3.5 h-3.5" />}
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Side-by-Side Original vs Requested Comparison */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Original Record
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Status</span>
                        <StatusBadge status={req.original_status || "ABSENT"} />
                      </div>
                      <div className="flex items-center justify-between tabular-nums">
                        <span className="text-slate-500">Check In</span>
                        <span className="font-medium text-slate-800">{formatTime(req.original_check_in)}</span>
                      </div>
                      <div className="flex items-center justify-between tabular-nums">
                        <span className="text-slate-500">Check Out</span>
                        <span className="font-medium text-slate-800">{formatTime(req.original_check_out)}</span>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-700">
                        Requested Correction
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Status</span>
                        <StatusBadge status={req.requested_status} />
                      </div>
                      <div className="flex items-center justify-between tabular-nums">
                        <span className="text-slate-600">Check In</span>
                        <span className="font-semibold text-slate-900">{formatTime(req.requested_check_in)}</span>
                      </div>
                      <div className="flex items-center justify-between tabular-nums">
                        <span className="text-slate-600">Check Out</span>
                        <span className="font-semibold text-slate-900">{formatTime(req.requested_check_out)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div>
                      <span className="font-medium text-slate-800">Reason: </span>
                      {req.reason}
                    </div>
                    {req.reviewed_by_name && (
                      <div className="text-slate-500">
                        Reviewed by <strong className="text-slate-700">{req.reviewed_by_name}</strong>
                        {req.review_remarks ? ` — "${req.review_remarks}"` : ""}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Submit Correction Request Modal */}
      <Modal
        open={reqOpen}
        onClose={() => setReqOpen(false)}
        title="Request Attendance Correction"
        subtitle="Submit missing punch times or a correction for manager review."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setReqOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="reg-req-form" loading={submittingReq}>
              Submit Request
            </Button>
          </>
        }
      >
        <form id="reg-req-form" onSubmit={handleSubmitRequest} className="space-y-4">
          {isManager && (
            <Field label="Employee" required>
              <Select
                required
                value={reqForm.employee_id}
                onChange={(e) => setReqForm({ ...reqForm, employee_id: e.target.value })}
              >
                <option value="">Select employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.full_name} ({e.employee_code})
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Attendance Date" required>
              <Input
                type="date"
                required
                value={reqForm.attendance_date}
                onChange={(e) => setReqForm({ ...reqForm, attendance_date: e.target.value })}
              />
            </Field>
            <Field label="Requested Status" required>
              <Select
                value={reqForm.requested_status}
                onChange={(e) => setReqForm({ ...reqForm, requested_status: e.target.value })}
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="HALF_DAY">Half Day</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-In Time">
              <Input
                type="time"
                value={reqForm.check_in_time}
                onChange={(e) => setReqForm({ ...reqForm, check_in_time: e.target.value })}
              />
            </Field>
            <Field label="Check-Out Time">
              <Input
                type="time"
                value={reqForm.check_out_time}
                onChange={(e) => setReqForm({ ...reqForm, check_out_time: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Reason" required>
            <Textarea
              required
              rows={3}
              placeholder="Explain why the punch was missed or needs adjustment…"
              value={reqForm.reason}
              onChange={(e) => setReqForm({ ...reqForm, reason: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* Direct HR Adjustment Modal */}
      <Modal
        open={directOpen}
        onClose={() => setDirectOpen(false)}
        title="Direct Attendance Adjustment"
        subtitle="Immediately update an attendance record and write an entry to the audit log."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDirectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="direct-reg-form" loading={submittingDirect}>
              Apply Adjustment
            </Button>
          </>
        }
      >
        <form id="direct-reg-form" onSubmit={handleDirectRegularize} className="space-y-4">
          <Field label="Employee" required>
            <Select
              required
              value={directForm.employee_id}
              onChange={(e) => setDirectForm({ ...directForm, employee_id: e.target.value })}
            >
              <option value="">Select employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_code})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required>
              <Input
                type="date"
                required
                value={directForm.attendance_date}
                onChange={(e) => setDirectForm({ ...directForm, attendance_date: e.target.value })}
              />
            </Field>
            <Field label="Status" required>
              <Select
                value={directForm.status}
                onChange={(e) => setDirectForm({ ...directForm, status: e.target.value })}
              >
                <option value="PRESENT">Present</option>
                <option value="LATE">Late</option>
                <option value="HALF_DAY">Half Day</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="ABSENT">Absent</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Check-In Time">
              <Input
                type="time"
                value={directForm.check_in_time}
                onChange={(e) => setDirectForm({ ...directForm, check_in_time: e.target.value })}
              />
            </Field>
            <Field label="Check-Out Time">
              <Input
                type="time"
                value={directForm.check_out_time}
                onChange={(e) => setDirectForm({ ...directForm, check_out_time: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Audit Reason" required>
            <Textarea
              required
              rows={2}
              placeholder="e.g. Client site visit, terminal offline, forgotten check-out"
              value={directForm.reason}
              onChange={(e) => setDirectForm({ ...directForm, reason: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* Review Request Modal */}
      <Modal
        open={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title={reviewTarget?.decision === "APPROVED" ? "Approve Correction" : "Reject Correction"}
        subtitle={
          reviewTarget
            ? `${reviewTarget.item.employee_name} · ${formatDate(reviewTarget.item.attendance_date)}`
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
              onClick={handleReview}
              loading={reviewing}
            >
              {reviewTarget?.decision === "APPROVED" ? "Approve & Apply" : "Confirm Rejection"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600 leading-relaxed">
            {reviewTarget?.decision === "APPROVED"
              ? "Approving will update the attendance record, recalculate total work and overtime hours, and log the change."
              : "The original attendance record will remain unchanged."}
          </p>
          <Field label="Reviewer Remarks (Optional)">
            <Textarea
              rows={2}
              placeholder="Add an optional note…"
              value={reviewRemarks}
              onChange={(e) => setReviewRemarks(e.target.value)}
            />
          </Field>
        </div>
      </Modal>
    </AppShell>
  );
}

export default function RegularizationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <RegularizationContent />
    </Suspense>
  );
}

