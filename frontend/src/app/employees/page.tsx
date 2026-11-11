"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Camera,
  Edit3,
  Eye,
  Plus,
  Search,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
  CheckCircle2,
  Building2,
  Clock,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/FormControls";
import { ConfirmDialog, Modal, SlideOverDrawer } from "@/components/ui/Modal";
import { EmptyState, Pagination, TableSkeleton } from "@/components/ui/DataHelpers";
import { FaceSetupModal } from "@/components/biometric/FaceSetupModal";
import { QuickRegisterModal } from "@/components/biometric/QuickRegisterModal";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  Branch,
  DailyAttendance,
  Department,
  Employee,
  FaceStatus,
  Shift,
} from "@/lib/api";
import {
  formatDate,
  formatDurationMins,
  formatTime,
  getInitials,
  toLocalDateInputValue,
} from "@/lib/utils";

const PAGE_SIZE = 12;

function EmployeesContent() {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [enrollmentFilter, setEnrollmentFilter] = useState(searchParams.get("enrollment") || "");
  const [page, setPage] = useState(1);

  // Registration Wizard (2-step)
  const [registerOpen, setRegisterOpen] = useState(searchParams.get("action") === "register");
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [createdEmp, setCreatedEmp] = useState<Employee | null>(null);
  const [regSaving, setRegSaving] = useState(false);
  const [regForm, setRegForm] = useState({
    first_name: "",
    last_name: "",
    employee_code: "",
    email: "",
    phone: "",
    designation: "",
    branch_id: "",
    department_id: "",
    default_shift_id: "",
  });

  // Quick Register
  const [quickRegOpen, setQuickRegOpen] = useState(false);

  // Edit Drawer
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    designation: "",
    branch_id: "",
    department_id: "",
    default_shift_id: "",
    status: "ACTIVE",
  });

  // Profile Drawer
  const [profileEmp, setProfileEmp] = useState<Employee | null>(null);
  const [profileFaceStatus, setProfileFaceStatus] = useState<FaceStatus | null>(null);
  const [profileAttendance, setProfileAttendance] = useState<DailyAttendance[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Face Setup Modal
  const [faceModalEmp, setFaceModalEmp] = useState<Employee | null>(null);

  // Deactivate / Reactivate confirmation
  const [confirmToggleEmp, setConfirmToggleEmp] = useState<Employee | null>(null);
  const [togglingStatus, setTogglingStatus] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [emps, meta] = await Promise.all([
        api.getEmployees({ limit: 250 }),
        api.getMetadata(),
      ]);
      setEmployees(emps);
      setBranches(meta.branches);
      setDepartments(meta.departments);
      setShifts(meta.shifts);
      setRegForm((prev) => ({
        ...prev,
        branch_id: prev.branch_id || meta.branches[0]?.id || "",
        department_id: prev.department_id || meta.departments[0]?.id || "",
        default_shift_id: prev.default_shift_id || meta.shifts[0]?.id || "",
      }));
    } catch (err: unknown) {
      toast.error("Failed to load employees", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openProfile = useCallback(async (emp: Employee) => {
    setProfileEmp(emp);
    setLoadingProfile(true);
    try {
      const today = new Date();
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(today.getDate() - 14);
      const [faceSt, recent] = await Promise.all([
        api.getFaceStatus(emp.id).catch(() => null),
        api
          .getDailyAttendance({
            employee_id: emp.id,
            start_date: toLocalDateInputValue(twoWeeksAgo),
            end_date: toLocalDateInputValue(today),
            limit: 14,
          })
          .catch(() => []),
      ]);
      setProfileFaceStatus(faceSt);
      setProfileAttendance(recent);
    } finally {
      setLoadingProfile(false);
    }
  }, []);

  // Open profile automatically if ?employeeId=... is in query string
  useEffect(() => {
    const empId = searchParams.get("employeeId");
    if (empId && employees.length > 0) {
      const match = employees.find((e) => e.id === empId);
      if (match) openProfile(match);
    }
  }, [searchParams, employees, openProfile]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter((emp) => {
      if (q) {
        const hay = `${emp.full_name} ${emp.employee_code} ${emp.email} ${emp.designation || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (branchFilter && emp.branch?.id !== branchFilter) return false;
      if (deptFilter && emp.department?.id !== deptFilter) return false;
      if (statusFilter && emp.status !== statusFilter) return false;
      if (enrollmentFilter && emp.enrollment_status !== enrollmentFilter) return false;
      return true;
    });
  }, [employees, search, branchFilter, deptFilter, statusFilter, enrollmentFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, branchFilter, deptFilter, statusFilter, enrollmentFilter]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  const openRegisterModal = () => {
    setRegStep(1);
    setCreatedEmp(null);
    setRegForm({
      first_name: "",
      last_name: "",
      employee_code: `EMP-${Math.floor(1000 + Math.random() * 9000)}`,
      email: "",
      phone: "",
      designation: "",
      branch_id: branches[0]?.id || "",
      department_id: departments[0]?.id || "",
      default_shift_id: shifts[0]?.id || "",
    });
    setRegisterOpen(true);
  };

  const handleRegisterStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegSaving(true);
    try {
      const created = await api.createEmployee({
        ...regForm,
        employee_code: regForm.employee_code.trim().toUpperCase(),
      });
      setCreatedEmp(created);
      setRegStep(2);
      loadAll();
      toast.success("Employee profile created", `${created.full_name} added to the directory.`);
    } catch (err: unknown) {
      toast.error("Could not register employee", err instanceof Error ? err.message : undefined);
    } finally {
      setRegSaving(false);
    }
  };

  const openEditDrawer = (emp: Employee) => {
    setEditingEmp(emp);
    setEditForm({
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email,
      phone: emp.phone || "",
      designation: emp.designation || "",
      branch_id: emp.branch?.id || branches[0]?.id || "",
      department_id: emp.department?.id || departments[0]?.id || "",
      default_shift_id: emp.default_shift?.id || shifts[0]?.id || "",
      status: emp.status,
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setEditSaving(true);
    try {
      const updated = await api.updateEmployee(editingEmp.id, editForm);
      toast.success("Profile updated", `${updated.full_name}'s details have been saved.`);
      setEditingEmp(null);
      if (profileEmp?.id === updated.id) setProfileEmp(updated);
      loadAll();
    } catch (err: unknown) {
      toast.error("Update failed", err instanceof Error ? err.message : undefined);
    } finally {
      setEditSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggleEmp) return;
    setTogglingStatus(true);
    try {
      if (confirmToggleEmp.status === "ACTIVE") {
        await api.deleteEmployee(confirmToggleEmp.id, false);
        toast.success("Employee deactivated", `${confirmToggleEmp.full_name} is now inactive.`);
      } else {
        await api.updateEmployee(confirmToggleEmp.id, { status: "ACTIVE" });
        toast.success("Employee reactivated", `${confirmToggleEmp.full_name} is active again.`);
      }
      setConfirmToggleEmp(null);
      loadAll();
    } catch (err: unknown) {
      toast.error("Action failed", err instanceof Error ? err.message : undefined);
    } finally {
      setTogglingStatus(false);
    }
  };

  const enrolledCount = employees.filter((e) => e.enrollment_status === "ENROLLED").length;
  const activeCount = employees.filter((e) => e.status === "ACTIVE").length;

  return (
    <AppShell title="Employees">
      <PageHeader
        title="Employees"
        subtitle={`${activeCount} active staff · ${enrolledCount} of ${employees.length} ready for face kiosk check-in`}
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQuickRegOpen(true)}
            icon={<Sparkles className="w-3.5 h-3.5 text-blue-600" />}
          >
            Quick Camera Register
          </Button>
        }
        primaryAction={
          <Button size="sm" onClick={openRegisterModal} icon={<Plus className="w-4 h-4" />}>
            Add Employee
          </Button>
        }
      />

      {/* Filter Bar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, email…"
                className="pl-9"
              />
            </div>

            <Select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>

            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>

            <Select value={enrollmentFilter} onChange={(e) => setEnrollmentFilter(e.target.value)}>
              <option value="">All Face Setup</option>
              <option value="ENROLLED">Face Ready</option>
              <option value="NOT_ENROLLED">Not Set Up</option>
            </Select>

            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Employees Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Users className="w-5 h-5" />}
            title="No employees match your filters"
            description="Add a new employee or adjust your search and department filters."
            action={
              <Button size="sm" onClick={openRegisterModal} icon={<Plus className="w-4 h-4" />}>
                Add Employee
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Department & Branch</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Face Setup</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 font-semibold text-xs flex items-center justify-center shrink-0">
                            {getInitials(emp.full_name)}
                          </div>
                          <div className="min-w-0">
                            <button
                              type="button"
                              onClick={() => openProfile(emp)}
                              className="font-medium text-slate-900 hover:text-blue-600 text-left block truncate"
                            >
                              {emp.full_name}
                            </button>
                            <div className="text-[11px] text-slate-500 truncate">
                              {emp.designation ? `${emp.designation} · ` : ""}
                              {emp.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                        {emp.employee_code}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900 font-medium">{emp.department?.name || "—"}</div>
                        <div className="text-[11px] text-slate-500">{emp.branch?.name || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                        {emp.default_shift?.name || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={emp.enrollment_status} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={emp.status} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openProfile(emp)}
                            title="View Profile"
                            icon={<Eye className="w-3.5 h-3.5" />}
                          >
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => openEditDrawer(emp)}
                            title="Edit Details"
                            icon={<Edit3 className="w-3.5 h-3.5" />}
                          >
                            Edit
                          </Button>
                          <Button
                            variant={emp.enrollment_status === "ENROLLED" ? "outline" : "primary"}
                            size="xs"
                            onClick={() => setFaceModalEmp(emp)}
                            icon={<Camera className="w-3.5 h-3.5" />}
                          >
                            {emp.enrollment_status === "ENROLLED" ? "Update Face" : "Set Up Face"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setConfirmToggleEmp(emp)}
                            title={emp.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                            className={emp.status === "ACTIVE" ? "text-red-600 hover:bg-red-50" : "text-emerald-600 hover:bg-emerald-50"}
                            icon={
                              emp.status === "ACTIVE" ? (
                                <UserMinus className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )
                            }
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      {/* Guided 2-Step Registration Modal */}
      <Modal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        title={regStep === 1 ? "Add New Employee (Step 1 of 2)" : "Employee Created (Step 2 of 2)"}
        subtitle={
          regStep === 1
            ? "Enter profile details and work assignments."
            : "Set up face recognition now or finish later."
        }
        maxWidth="max-w-xl"
        footer={
          regStep === 1 ? (
            <>
              <Button variant="outline" onClick={() => setRegisterOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="add-emp-form" loading={regSaving}>
                Save & Continue
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setRegisterOpen(false)}>
                Skip for Now
              </Button>
              <Button
                onClick={() => {
                  const target = createdEmp;
                  setRegisterOpen(false);
                  if (target) setFaceModalEmp(target);
                }}
                icon={<Camera className="w-4 h-4" />}
              >
                Set Up Face Now
              </Button>
            </>
          )
        }
      >
        {regStep === 1 ? (
          <form id="add-emp-form" onSubmit={handleRegisterStep1} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="First Name" required>
                <Input
                  required
                  placeholder="e.g. Ayesha"
                  value={regForm.first_name}
                  onChange={(e) => setRegForm({ ...regForm, first_name: e.target.value })}
                />
              </Field>
              <Field label="Last Name" required>
                <Input
                  required
                  placeholder="e.g. Rahman"
                  value={regForm.last_name}
                  onChange={(e) => setRegForm({ ...regForm, last_name: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Employee Code" required>
                <Input
                  required
                  value={regForm.employee_code}
                  onChange={(e) => setRegForm({ ...regForm, employee_code: e.target.value })}
                  className="uppercase font-mono"
                />
              </Field>
              <Field label="Job Title / Designation">
                <Input
                  placeholder="e.g. Operations Lead"
                  value={regForm.designation}
                  onChange={(e) => setRegForm({ ...regForm, designation: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Work Email" required>
                <Input
                  type="email"
                  required
                  placeholder="ayesha@company.com"
                  value={regForm.email}
                  onChange={(e) => setRegForm({ ...regForm, email: e.target.value })}
                />
              </Field>
              <Field label="Phone Number">
                <Input
                  type="tel"
                  placeholder="+8801700000000"
                  value={regForm.phone}
                  onChange={(e) => setRegForm({ ...regForm, phone: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Branch" required>
                <Select
                  required
                  value={regForm.branch_id}
                  onChange={(e) => setRegForm({ ...regForm, branch_id: e.target.value })}
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Department" required>
                <Select
                  required
                  value={regForm.department_id}
                  onChange={(e) => setRegForm({ ...regForm, department_id: e.target.value })}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Default Shift" required>
                <Select
                  required
                  value={regForm.default_shift_id}
                  onChange={(e) => setRegForm({ ...regForm, default_shift_id: e.target.value })}
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </form>
        ) : (
          <div className="py-4 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div className="text-base font-semibold text-slate-900">
              {createdEmp?.full_name} ({createdEmp?.employee_code}) added!
            </div>
            <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
              Would you like to capture 3 quick photos right now so they can check in at the live kiosk?
            </p>
          </div>
        )}
      </Modal>

      {/* Edit Employee Drawer */}
      <SlideOverDrawer
        open={Boolean(editingEmp)}
        onClose={() => setEditingEmp(null)}
        title={`Edit ${editingEmp?.full_name || "Employee"}`}
        subtitle={editingEmp?.employee_code}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingEmp(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-emp-form" loading={editSaving}>
              Save Changes
            </Button>
          </>
        }
      >
        <form id="edit-emp-form" onSubmit={handleEditSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name" required>
              <Input
                required
                value={editForm.first_name}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </Field>
            <Field label="Last Name" required>
              <Input
                required
                value={editForm.last_name}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Email" required>
            <Input
              type="email"
              required
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </Field>
            <Field label="Job Title">
              <Input
                value={editForm.designation}
                onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Branch" required>
            <Select
              value={editForm.branch_id}
              onChange={(e) => setEditForm({ ...editForm, branch_id: e.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department" required>
            <Select
              value={editForm.department_id}
              onChange={(e) => setEditForm({ ...editForm, department_id: e.target.value })}
            >
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assigned Shift" required>
            <Select
              value={editForm.default_shift_id}
              onChange={(e) => setEditForm({ ...editForm, default_shift_id: e.target.value })}
            >
              {shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Employment Status">
            <Select
              value={editForm.status}
              onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="TERMINATED">Terminated</option>
            </Select>
          </Field>
        </form>
      </SlideOverDrawer>

      {/* Employee Profile Drawer */}
      <SlideOverDrawer
        open={Boolean(profileEmp)}
        onClose={() => setProfileEmp(null)}
        title={profileEmp?.full_name || "Employee Profile"}
        subtitle={`${profileEmp?.employee_code} · ${profileEmp?.designation || "Team Member"}`}
        footer={
          profileEmp && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  const emp = profileEmp;
                  setProfileEmp(null);
                  openEditDrawer(emp);
                }}
                icon={<Edit3 className="w-3.5 h-3.5" />}
              >
                Edit Profile
              </Button>
              <Button
                onClick={() => {
                  const emp = profileEmp;
                  setProfileEmp(null);
                  setFaceModalEmp(emp);
                }}
                icon={<Camera className="w-3.5 h-3.5" />}
              >
                {profileEmp.enrollment_status === "ENROLLED" ? "Update Face" : "Set Up Face"}
              </Button>
            </>
          )
        }
      >
        {profileEmp && (
          <div className="space-y-5">
            {/* Summary Info */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Employment Status</span>
                <StatusBadge status={profileEmp.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-900">{profileEmp.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Phone</span>
                <span className="font-medium text-slate-900">{profileEmp.phone || "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" /> Department / Branch
                </span>
                <span className="font-medium text-slate-900">
                  {profileEmp.department?.name || "—"} · {profileEmp.branch?.name || "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500 inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" /> Assigned Shift
                </span>
                <span className="font-medium text-slate-900">
                  {profileEmp.default_shift
                    ? `${profileEmp.default_shift.name} (${formatTime(profileEmp.default_shift.start_time)} – ${formatTime(profileEmp.default_shift.end_time)})`
                    : "—"}
                </span>
              </div>
            </div>

            {/* Face Recognition Readiness */}
            <div className="p-4 rounded-xl border border-slate-200 bg-white space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">Kiosk Face Recognition</span>
                <StatusBadge status={profileEmp.enrollment_status} />
              </div>
              {loadingProfile ? (
                <p className="text-slate-400">Checking setup details…</p>
              ) : profileFaceStatus?.has_active_template ? (
                <p className="text-slate-600">
                  Configured using {profileFaceStatus.sample_count} sample
                  {profileFaceStatus.sample_count === 1 ? "" : "s"}
                  {profileFaceStatus.enrolled_at ? ` on ${formatDate(profileFaceStatus.enrolled_at)}` : ""}.
                </p>
              ) : (
                <p className="text-slate-500">
                  Not set up yet. Capture 3 quick photos so this employee can use the touchless kiosk.
                </p>
              )}
            </div>

            {/* Recent Attendance */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-900">Recent Attendance (Last 14 Days)</h4>
              {loadingProfile ? (
                <TableSkeleton rows={3} cols={3} />
              ) : profileAttendance.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">No attendance recorded in the last 14 days.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {profileAttendance.slice(0, 7).map((row) => (
                    <div key={row.id} className="px-3.5 py-2.5 flex items-center justify-between text-xs bg-white">
                      <div>
                        <div className="font-medium text-slate-900">{formatDate(row.attendance_date)}</div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {formatTime(row.check_in_time)} – {formatTime(row.check_out_time)} ·{" "}
                          {formatDurationMins(row.total_work_minutes)}
                        </div>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

      {/* Guided Face Setup Modal (for existing employees) */}
      <FaceSetupModal
        open={Boolean(faceModalEmp)}
        employee={faceModalEmp}
        onClose={() => setFaceModalEmp(null)}
        onCompleted={loadAll}
      />

      {/* Quick Camera Register Modal */}
      <QuickRegisterModal
        open={quickRegOpen}
        onClose={() => setQuickRegOpen(false)}
        onSuccess={() => loadAll()}
        departments={departments}
        shifts={shifts}
      />

      {/* Deactivate / Reactivate Confirmation */}
      <ConfirmDialog
        open={Boolean(confirmToggleEmp)}
        onClose={() => setConfirmToggleEmp(null)}
        onConfirm={handleToggleStatus}
        loading={togglingStatus}
        title={
          confirmToggleEmp?.status === "ACTIVE" ? "Deactivate Employee" : "Reactivate Employee"
        }
        message={
          confirmToggleEmp?.status === "ACTIVE"
            ? `Deactivating ${confirmToggleEmp.full_name} will mark them inactive and suspend their kiosk face profile. Attendance history is preserved.`
            : `Reactivating ${confirmToggleEmp?.full_name} will restore their active status in the directory.`
        }
        confirmLabel={confirmToggleEmp?.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
        confirmVariant={confirmToggleEmp?.status === "ACTIVE" ? "danger" : "success"}
      />
    </AppShell>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <EmployeesContent />
    </Suspense>
  );
}

