"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Clock,
  Edit3,
  Moon,
  Plus,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Field, Input } from "@/components/ui/FormControls";
import { ConfirmDialog, Modal, SlideOverDrawer } from "@/components/ui/Modal";
import { EmptyState, InfoTooltip, Skeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { api, Employee, Shift } from "@/lib/api";
import {
  calculateShiftDurationMins,
  formatDurationMins,
  formatTime,
  isAdminOrHrUser,
} from "@/lib/utils";

const EMPTY_SHIFT_FORM = {
  name: "",
  code: "",
  start_time: "09:00",
  end_time: "18:00",
  grace_period_mins: 15,
  half_day_late_mins: 120,
  break_duration_mins: 60,
  is_overnight: false,
};

export default function ShiftsPage() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();
  const canManage = isAdminOrHrUser(user?.roles, user?.is_superuser);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState(EMPTY_SHIFT_FORM);
  const [saving, setSaving] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Assign employees drawer
  const [assignShift, setAssignShift] = useState<Shift | null>(null);
  const [assignSavingId, setAssignSavingId] = useState<string | null>(null);
  const [assignSearch, setAssignSearch] = useState("");

  const loadData = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [shiftsData, empsData] = await Promise.all([
        api.getShifts(),
        canManage ? api.getEmployees({ limit: 250 }).catch(() => []) : Promise.resolve([]),
      ]);
      setShifts(shiftsData);
      setEmployees(empsData);
    } catch (err: unknown) {
      toast.error("Failed to load shifts", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, canManage, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingShift(null);
    setForm(EMPTY_SHIFT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (shift: Shift) => {
    setEditingShift(shift);
    setForm({
      name: shift.name,
      code: shift.code,
      start_time: shift.start_time.slice(0, 5),
      end_time: shift.end_time.slice(0, 5),
      grace_period_mins: shift.grace_period_mins,
      half_day_late_mins: shift.half_day_late_mins,
      break_duration_mins: shift.break_duration_mins,
      is_overnight: shift.is_overnight,
    });
    setModalOpen(true);
  };

  const detectedOvernight = form.start_time > form.end_time || form.is_overnight;
  const previewNetMins = calculateShiftDurationMins(
    form.start_time,
    form.end_time,
    Number(form.break_duration_mins) || 0
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      start_time: `${form.start_time}:00`,
      end_time: `${form.end_time}:00`,
      grace_period_mins: Number(form.grace_period_mins),
      half_day_late_mins: Number(form.half_day_late_mins),
      break_duration_mins: Number(form.break_duration_mins),
      is_overnight: detectedOvernight,
      shift_day_boundary: "12:00:00",
    };

    try {
      if (editingShift) {
        await api.updateShift(editingShift.id, payload);
        toast.success("Shift updated", `${payload.name} settings saved.`);
      } else {
        await api.createShift(payload);
        toast.success("Shift created", `${payload.name} is now available for assignment.`);
      }
      setModalOpen(false);
      loadData();
    } catch (err: unknown) {
      toast.error("Could not save shift", err instanceof Error ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteShift(deleteTarget.id);
      toast.success("Shift deleted", `${deleteTarget.name} has been removed.`);
      setDeleteTarget(null);
      loadData();
    } catch (err: unknown) {
      toast.error("Cannot delete shift", err instanceof Error ? err.message : undefined);
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignEmployee = async (emp: Employee, targetShiftId: string) => {
    setAssignSavingId(emp.id);
    try {
      await api.updateEmployee(emp.id, { default_shift_id: targetShiftId });
      toast.success("Shift updated", `${emp.full_name} moved to ${assignShift?.name}.`);
      await loadData();
    } catch (err: unknown) {
      toast.error("Assignment failed", err instanceof Error ? err.message : undefined);
    } finally {
      setAssignSavingId(null);
    }
  };

  const employeesByShift = useMemo(() => {
    const map: Record<string, Employee[]> = {};
    for (const emp of employees) {
      const sid = emp.default_shift?.id;
      if (!sid) continue;
      if (!map[sid]) map[sid] = [];
      map[sid].push(emp);
    }
    return map;
  }, [employees]);

  const filteredAssignEmployees = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    return employees.filter((e) => {
      if (!q) return true;
      return (
        e.full_name.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q) ||
        (e.department?.name || "").toLowerCase().includes(q)
      );
    });
  }, [employees, assignSearch]);

  return (
    <AppShell title="Shifts & Schedules">
      <PageHeader
        title="Shifts & Schedules"
        subtitle="Configure working hours, grace periods, breaks, overnight rosters, and staff shift assignments."
        primaryAction={
          canManage ? (
            <Button size="sm" onClick={openCreateModal} icon={<Plus className="w-4 h-4" />}>
              Create Shift
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-5 space-y-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
            </Card>
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="w-5 h-5" />}
            title="No shifts configured"
            description="Create a shift schedule to define working hours, grace periods, and overtime rules."
            action={
              canManage ? (
                <Button size="sm" onClick={openCreateModal} icon={<Plus className="w-4 h-4" />}>
                  Create Shift
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {shifts.map((shift) => {
            const assignedList = employeesByShift[shift.id] || [];
            const netMins = calculateShiftDurationMins(
              shift.start_time,
              shift.end_time,
              shift.break_duration_mins
            );

            return (
              <Card key={shift.id} className="flex flex-col">
                <CardContent className="p-5 flex-1 space-y-4">
                  {/* Card Top */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-900 truncate">{shift.name}</h3>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                          {shift.code}
                        </span>
                        <Badge tone={shift.is_overnight ? "info" : "success"}>
                          {shift.is_overnight ? (
                            <>
                              <Moon className="w-3 h-3" /> Overnight
                            </>
                          ) : (
                            <>
                              <Sun className="w-3 h-3" /> Day Shift
                            </>
                          )}
                        </Badge>
                      </div>
                    </div>

                    {canManage && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openEditModal(shift)}
                          title="Edit shift"
                          icon={<Edit3 className="w-3.5 h-3.5" />}
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => setDeleteTarget(shift)}
                          title="Delete shift"
                          className="text-red-600 hover:bg-red-50"
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        />
                      </div>
                    )}
                  </div>

                  {/* Working Hours Box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-slate-500">Working Hours</div>
                      <div className="text-sm font-semibold text-slate-900 tabular-nums mt-0.5">
                        {formatTime(shift.start_time)} – {formatTime(shift.end_time)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-slate-500">Expected Work</div>
                      <div className="text-sm font-semibold text-blue-700 tabular-nums mt-0.5">
                        {formatDurationMins(netMins)}
                      </div>
                    </div>
                  </div>

                  {/* Rules List */}
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        Grace Period
                        <InfoTooltip text="Minutes after shift start before an employee is marked late." />
                      </span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {shift.grace_period_mins} mins
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Break Duration</span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {shift.break_duration_mins} mins
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">
                        Half-Day Threshold
                        <InfoTooltip text="Arriving later than this many minutes marks attendance as Half Day." />
                      </span>
                      <span className="font-medium text-slate-800 tabular-nums">
                        {shift.half_day_late_mins} mins
                      </span>
                    </div>
                  </div>
                </CardContent>

                {canManage && (
                  <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs rounded-b-xl">
                    <span className="text-slate-600 inline-flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <strong className="text-slate-900 tabular-nums">{assignedList.length}</strong>{" "}
                      {assignedList.length === 1 ? "employee" : "employees"} assigned
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setAssignSearch("");
                        setAssignShift(shift);
                      }}
                    >
                      Assign Staff
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Shift Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingShift ? `Edit Shift — ${editingShift.name}` : "Create Shift Schedule"}
        subtitle="Define start/end hours, breaks, and grace rules in plain terms."
        maxWidth="max-w-lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="shift-form" loading={saving}>
              {editingShift ? "Save Changes" : "Create Shift"}
            </Button>
          </>
        }
      >
        <form id="shift-form" onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Shift Name" required>
              <Input
                required
                placeholder="e.g. Morning Shift"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Shift Code" required hint="Short unique code">
              <Input
                required
                placeholder="e.g. DAY-09-18"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="uppercase font-mono"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time" required>
              <Input
                type="time"
                required
                value={form.start_time}
                onChange={(e) => setForm({ ...form, start_time: e.target.value })}
              />
            </Field>
            <Field label="End Time" required>
              <Input
                type="time"
                required
                value={form.end_time}
                onChange={(e) => setForm({ ...form, end_time: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Grace Period (mins)">
              <Input
                type="number"
                min={0}
                max={120}
                value={form.grace_period_mins}
                onChange={(e) => setForm({ ...form, grace_period_mins: Number(e.target.value) })}
              />
            </Field>
            <Field label="Break (mins)">
              <Input
                type="number"
                min={0}
                max={240}
                value={form.break_duration_mins}
                onChange={(e) => setForm({ ...form, break_duration_mins: Number(e.target.value) })}
              />
            </Field>
            <Field label="Half-Day Cutoff (mins)">
              <Input
                type="number"
                min={15}
                max={480}
                value={form.half_day_late_mins}
                onChange={(e) => setForm({ ...form, half_day_late_mins: Number(e.target.value) })}
              />
            </Field>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={detectedOvernight}
              onChange={(e) => setForm({ ...form, is_overnight: e.target.checked })}
              className="mt-0.5 rounded border-slate-300 text-blue-600"
            />
            <div className="text-xs">
              <div className="font-medium text-slate-900">Overnight Shift (crosses midnight)</div>
              <div className="text-slate-500 mt-0.5">
                Links early-morning check-outs to the previous evening&apos;s shift date. Net expected work:{" "}
                <strong className="text-slate-800">{formatDurationMins(previewNetMins)}</strong>.
              </div>
            </div>
          </label>
        </form>
      </Modal>

      {/* Assign Employees Drawer */}
      <SlideOverDrawer
        open={Boolean(assignShift)}
        onClose={() => setAssignShift(null)}
        title={`Staff Assignment — ${assignShift?.name || ""}`}
        subtitle={
          assignShift
            ? `${formatTime(assignShift.start_time)} – ${formatTime(assignShift.end_time)}`
            : undefined
        }
        footer={<Button onClick={() => setAssignShift(null)}>Done</Button>}
      >
        {assignShift && (
          <div className="space-y-4">
            <Input
              placeholder="Search employees by name or code…"
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
            />

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {filteredAssignEmployees.map((emp) => {
                const isOnThisShift = emp.default_shift?.id === assignShift.id;
                return (
                  <div key={emp.id} className="p-3 bg-white flex items-center justify-between gap-3 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{emp.full_name}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        <span className="font-mono">{emp.employee_code}</span> ·{" "}
                        {emp.department?.name || "—"} · Current: {emp.default_shift?.name || "None"}
                      </div>
                    </div>
                    {isOnThisShift ? (
                      <Badge tone="success">Assigned</Badge>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        loading={assignSavingId === emp.id}
                        onClick={() => handleAssignEmployee(emp, assignShift.id)}
                        icon={<Clock className="w-3 h-3" />}
                      >
                        Assign
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete Shift Schedule"
        message={
          (employeesByShift[deleteTarget?.id || ""]?.length || 0) > 0
            ? `There are ${employeesByShift[deleteTarget?.id || ""]?.length} employees currently assigned to "${deleteTarget?.name}". Please reassign those employees before deleting this shift.`
            : `Are you sure you want to delete "${deleteTarget?.name}" (${deleteTarget?.code})?`
        }
        confirmLabel="Delete Shift"
      />
    </AppShell>
  );
}

