"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Camera,
  Edit3,
  FolderTree,
  Plus,
  Save,
  Settings,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Badge, StatusBadge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/FormControls";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  Branch,
  Department,
  Employee,
  OrganizationInfo,
  RoleInfo,
  SystemPreferences,
  UserAccount,
} from "@/lib/api";
import { cn, getRoleLabel, isAdminUser } from "@/lib/utils";

type SettingsSection =
  | "organization"
  | "branches"
  | "departments"
  | "users"
  | "kiosk"
  | "rules"
  | "preferences";

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const toast = useToast();

  const isSuperAdmin = isAdminUser(user?.roles, user?.is_superuser);

  const [section, setSection] = useState<SettingsSection>("organization");
  const [loading, setLoading] = useState(true);

  const [org, setOrg] = useState<OrganizationInfo | null>(null);
  const [orgForm, setOrgForm] = useState({ name: "", code: "" });
  const [savingOrg, setSavingOrg] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchModal, setBranchModal] = useState<{ open: boolean; editing: Branch | null }>({
    open: false,
    editing: null,
  });
  const [branchForm, setBranchForm] = useState({ name: "", timezone: "Asia/Dhaka", address: "" });
  const [savingBranch, setSavingBranch] = useState(false);

  const [departments, setDepartments] = useState<Department[]>([]);
  const [deptModal, setDeptModal] = useState<{ open: boolean; editing: Department | null }>({
    open: false,
    editing: null,
  });
  const [deptForm, setDeptForm] = useState({ name: "", code: "", branch_id: "" });
  const [savingDept, setSavingDept] = useState(false);
  const [deleteDeptTarget, setDeleteDeptTarget] = useState<Department | null>(null);
  const [deletingDept, setDeletingDept] = useState(false);

  const [users, setUsers] = useState<UserAccount[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [userModal, setUserModal] = useState<{ open: boolean; editing: UserAccount | null }>({
    open: false,
    editing: null,
  });
  const [userForm, setUserForm] = useState({
    username: "",
    email: "",
    full_name: "",
    password: "",
    role_name: "EMPLOYEE",
    employee_id: "",
    is_active: true,
  });
  const [savingUser, setSavingUser] = useState(false);

  const [prefs, setPrefs] = useState<SystemPreferences | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadAll = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const [orgRes, brRes, deptRes, prefRes] = await Promise.all([
        api.getOrganization(),
        api.getBranchesDetailed(),
        api.getDepartmentsDetailed(),
        api.getPreferences(),
      ]);
      setOrg(orgRes);
      setOrgForm({ name: orgRes.name, code: orgRes.code });
      setBranches(brRes);
      setDepartments(deptRes);
      setPrefs(prefRes);

      if (isSuperAdmin) {
        const [uRes, rRes, eRes] = await Promise.all([
          api.getUsers().catch(() => []),
          api.getRoles().catch(() => []),
          api.getEmployees({ limit: 250 }).catch(() => []),
        ]);
        setUsers(uRes);
        setRoles(rRes);
        setEmployees(eRes);
      }
    } catch (err: unknown) {
      toast.error("Failed to load settings", err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, isSuperAdmin, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const navSections = useMemo(() => {
    const items: Array<{
      id: SettingsSection;
      label: string;
      icon: React.ComponentType<{ className?: string }>;
      adminOnly?: boolean;
    }> = [
      { id: "organization", label: "Organization", icon: Building2 },
      { id: "branches", label: "Branches", icon: FolderTree },
      { id: "departments", label: "Departments", icon: Users },
      { id: "users", label: "Users & Roles", icon: Shield, adminOnly: true },
      { id: "kiosk", label: "Kiosk Configuration", icon: Camera },
      { id: "rules", label: "Attendance Rules", icon: Sliders },
      { id: "preferences", label: "System Preferences", icon: Settings },
    ];
    return items.filter((i) => !i.adminOnly || isSuperAdmin);
  }, [isSuperAdmin]);

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOrg(true);
    try {
      const updated = await api.updateOrganization(orgForm);
      setOrg((prev) => (prev ? { ...prev, ...updated } : updated));
      toast.success("Organization updated", "Changes saved.");
    } catch (err: unknown) {
      toast.error("Update failed", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingOrg(false);
    }
  };

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBranch(true);
    try {
      if (branchModal.editing) {
        await api.updateBranch(branchModal.editing.id, branchForm);
        toast.success("Branch updated", `${branchForm.name} saved.`);
      } else {
        await api.createBranch(branchForm);
        toast.success("Branch created", `${branchForm.name} added.`);
      }
      setBranchModal({ open: false, editing: null });
      loadAll();
    } catch (err: unknown) {
      toast.error("Could not save branch", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingBranch(false);
    }
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingDept(true);
    try {
      if (deptModal.editing) {
        await api.updateDepartment(deptModal.editing.id, deptForm);
        toast.success("Department updated", `${deptForm.name} saved.`);
      } else {
        await api.createDepartment(deptForm);
        toast.success("Department created", `${deptForm.name} added.`);
      }
      setDeptModal({ open: false, editing: null });
      loadAll();
    } catch (err: unknown) {
      toast.error("Could not save department", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingDept(false);
    }
  };

  const handleDeleteDept = async () => {
    if (!deleteDeptTarget) return;
    setDeletingDept(true);
    try {
      await api.deleteDepartment(deleteDeptTarget.id);
      toast.success("Department deleted", `${deleteDeptTarget.name} removed.`);
      setDeleteDeptTarget(null);
      loadAll();
    } catch (err: unknown) {
      toast.error("Cannot delete department", err instanceof Error ? err.message : undefined);
    } finally {
      setDeletingDept(false);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      if (userModal.editing) {
        await api.updateUser(userModal.editing.id, {
          full_name: userForm.full_name,
          email: userForm.email,
          role_name: userForm.role_name,
          employee_id: userForm.employee_id || "",
          is_active: userForm.is_active,
          ...(userForm.password ? { password: userForm.password } : {}),
        });
        toast.success("User account updated", `${userForm.email} saved.`);
      } else {
        await api.createUser({
          username: userForm.username,
          email: userForm.email,
          full_name: userForm.full_name,
          password: userForm.password,
          role_name: userForm.role_name,
          employee_id: userForm.employee_id || null,
          is_active: userForm.is_active,
        });
        toast.success("User account created", `${userForm.email} can now sign in.`);
      }
      setUserModal({ open: false, editing: null });
      loadAll();
    } catch (err: unknown) {
      toast.error("Could not save user account", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingUser(false);
    }
  };

  const handleSavePrefs = async (partial: Partial<SystemPreferences>) => {
    setSavingPrefs(true);
    try {
      const updated = await api.updatePreferences(partial);
      setPrefs(updated);
      toast.success("Preferences saved", "Settings updated across the workspace.");
    } catch (err: unknown) {
      toast.error("Could not save preferences", err instanceof Error ? err.message : undefined);
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <AppShell title="Settings">
      <PageHeader
        title="Settings"
        subtitle="Manage your organization, locations, team access, kiosk defaults, and attendance policies."
        secondaryActions={
          <Link href="/leaves">
            <Button variant="outline" size="sm" icon={<CalendarDays className="w-3.5 h-3.5" />}>
              Holiday Settings
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Settings Nav */}
        <Card className="lg:col-span-3 p-2">
          <nav className="space-y-1">
            {navSections.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors",
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  )}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Right Panel */}
        <div className="lg:col-span-9 space-y-5">
          {loading ? (
            <Card className="p-6 space-y-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-24 w-full" />
            </Card>
          ) : section === "organization" ? (
            <Card>
              <CardHeader
                title="Organization Details"
                subtitle="Company identity and active structure counts"
              />
              <CardContent className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Branches</div>
                    <div className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                      {org?.branches_count ?? branches.length}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Departments</div>
                    <div className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                      {org?.departments_count ?? departments.length}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="text-xs text-slate-500">Active Staff</div>
                    <div className="text-xl font-semibold text-slate-900 mt-1 tabular-nums">
                      {org?.employees_count ?? 0}
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSaveOrg} className="space-y-4 max-w-md">
                  <Field label="Organization Name" required>
                    <Input
                      required
                      disabled={!isSuperAdmin}
                      value={orgForm.name}
                      onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                    />
                  </Field>
                  <Field label="Organization Code" required>
                    <Input
                      required
                      disabled={!isSuperAdmin}
                      value={orgForm.code}
                      onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })}
                      className="uppercase font-mono"
                    />
                  </Field>
                  {isSuperAdmin && (
                    <Button type="submit" loading={savingOrg} icon={<Save className="w-4 h-4" />}>
                      Save Organization
                    </Button>
                  )}
                </form>
              </CardContent>
            </Card>
          ) : section === "branches" ? (
            <Card>
              <CardHeader
                title="Branches & Locations"
                subtitle="Office locations and timezones"
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setBranchForm({ name: "", timezone: "Asia/Dhaka", address: "" });
                      setBranchModal({ open: true, editing: null });
                    }}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Branch
                  </Button>
                }
              />
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {branches.map((b) => (
                    <div key={b.id} className="px-5 py-4 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{b.name}</div>
                        <div className="text-slate-500 mt-0.5">
                          {b.timezone} {b.address ? `· ${b.address}` : ""}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {b.department_count ?? 0} departments · {b.employee_count ?? 0} employees
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setBranchForm({
                            name: b.name,
                            timezone: b.timezone,
                            address: b.address || "",
                          });
                          setBranchModal({ open: true, editing: b });
                        }}
                        icon={<Edit3 className="w-3.5 h-3.5" />}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : section === "departments" ? (
            <Card>
              <CardHeader
                title="Departments"
                subtitle="Organize teams across branches"
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setDeptForm({ name: "", code: "", branch_id: branches[0]?.id || "" });
                      setDeptModal({ open: true, editing: null });
                    }}
                    icon={<Plus className="w-3.5 h-3.5" />}
                  >
                    Add Department
                  </Button>
                }
              />
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100">
                  {departments.map((d) => (
                    <div key={d.id} className="px-5 py-3.5 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">{d.name}</span>
                          {d.code && (
                            <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                              {d.code}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          {d.branch_name || "Branch"} · {d.employee_count ?? 0} employees
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setDeptForm({
                              name: d.name,
                              code: d.code || "",
                              branch_id: d.branch_id || branches[0]?.id || "",
                            });
                            setDeptModal({ open: true, editing: d });
                          }}
                          icon={<Edit3 className="w-3.5 h-3.5" />}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteDeptTarget(d)}
                          icon={<Trash2 className="w-3.5 h-3.5" />}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : section === "users" ? (
            <Card>
              <CardHeader
                title="User Accounts & Roles"
                subtitle="Control sign-in access and role permissions"
                action={
                  <Button
                    size="sm"
                    onClick={() => {
                      setUserForm({
                        username: "",
                        email: "",
                        full_name: "",
                        password: "",
                        role_name: "HR_MANAGER",
                        employee_id: "",
                        is_active: true,
                      });
                      setUserModal({ open: true, editing: null });
                    }}
                    icon={<UserPlus className="w-3.5 h-3.5" />}
                  >
                    Create User
                  </Button>
                }
              />
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-medium">
                    <tr>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Linked Employee</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900">{u.full_name || u.username}</div>
                          <div className="text-[11px] text-slate-500">
                            {u.email} · <span className="font-mono">{u.username}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge tone="info">{getRoleLabel(u.roles[0])}</Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {u.employee_name ? `${u.employee_name} (${u.employee_code})` : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.is_active ? "ACTIVE" : "INACTIVE"} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="outline"
                            size="xs"
                            onClick={() => {
                              setUserForm({
                                username: u.username,
                                email: u.email,
                                full_name: u.full_name || "",
                                password: "",
                                role_name: u.roles[0] || "EMPLOYEE",
                                employee_id: u.employee_id || "",
                                is_active: u.is_active,
                              });
                              setUserModal({ open: true, editing: u });
                            }}
                            icon={<Edit3 className="w-3.5 h-3.5" />}
                          >
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : section === "kiosk" && prefs ? (
            <Card>
              <CardHeader
                title="Kiosk Configuration"
                subtitle="Default behavior when launching the live attendance kiosk"
                action={
                  <Link href="/kiosk">
                    <Button variant="outline" size="xs" icon={<Camera className="w-3.5 h-3.5" />}>
                      Open Kiosk
                    </Button>
                  </Link>
                }
              />
              <CardContent className="space-y-4 max-w-lg">
                <Field label="Default Terminal Name">
                  <Input
                    value={prefs.kiosk.default_terminal_id}
                    onChange={(e) =>
                      setPrefs({ ...prefs, kiosk: { ...prefs.kiosk, default_terminal_id: e.target.value } })
                    }
                  />
                </Field>
                <Field label="Default Punch Mode">
                  <Select
                    value={prefs.kiosk.default_attendance_mode}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        kiosk: { ...prefs.kiosk, default_attendance_mode: e.target.value },
                      })
                    }
                  >
                    <option value="AUTO">Automatic (First Check-In / Last Check-Out)</option>
                    <option value="CHECK_IN">Check-In Only</option>
                    <option value="CHECK_OUT">Check-Out Only</option>
                  </Select>
                </Field>
                <Field label="Default Welcome Prompt">
                  <Input
                    value={prefs.kiosk.welcome_message}
                    onChange={(e) =>
                      setPrefs({ ...prefs, kiosk: { ...prefs.kiosk, welcome_message: e.target.value } })
                    }
                  />
                </Field>
                <div className="space-y-2.5 pt-2 text-xs text-slate-700">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span>Play audio chime on check-in/out</span>
                    <input
                      type="checkbox"
                      checked={prefs.kiosk.audio_feedback_enabled}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          kiosk: { ...prefs.kiosk, audio_feedback_enabled: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span>Spoken voice greeting</span>
                    <input
                      type="checkbox"
                      checked={prefs.kiosk.voice_greeting_enabled}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          kiosk: { ...prefs.kiosk, voice_greeting_enabled: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span>Allow Quick Register from kiosk screen</span>
                    <input
                      type="checkbox"
                      checked={prefs.kiosk.allow_quick_register}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          kiosk: { ...prefs.kiosk, allow_quick_register: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </label>
                  <label className="flex items-center justify-between cursor-pointer">
                    <span>Relaxed lighting tolerance by default</span>
                    <input
                      type="checkbox"
                      checked={prefs.kiosk.relaxed_lighting_mode}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          kiosk: { ...prefs.kiosk, relaxed_lighting_mode: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-600"
                    />
                  </label>
                </div>

                <Button
                  loading={savingPrefs}
                  onClick={() => handleSavePrefs({ kiosk: prefs.kiosk })}
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Kiosk Settings
                </Button>
              </CardContent>
            </Card>
          ) : section === "rules" && prefs ? (
            <Card>
              <CardHeader
                title="Attendance Rules"
                subtitle="Standard workplace tracking rules and duplicate scan protection"
              />
              <CardContent className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
                  <Field label="Overtime Starts After (mins past shift end)">
                    <Input
                      type="number"
                      min={0}
                      value={prefs.attendance_rules.overtime_threshold_mins}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          attendance_rules: {
                            ...prefs.attendance_rules,
                            overtime_threshold_mins: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Auto-Deduct Break After (mins worked)">
                    <Input
                      type="number"
                      min={0}
                      value={prefs.attendance_rules.auto_deduct_break_after_mins}
                      onChange={(e) =>
                        setPrefs({
                          ...prefs,
                          attendance_rules: {
                            ...prefs.attendance_rules,
                            auto_deduct_break_after_mins: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                </div>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={prefs.attendance_rules.allow_employee_regularization_requests}
                    onChange={(e) =>
                      setPrefs({
                        ...prefs,
                        attendance_rules: {
                          ...prefs.attendance_rules,
                          allow_employee_regularization_requests: e.target.checked,
                        },
                      })
                    }
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Allow employees to submit missing punch correction requests
                </label>

                {prefs.engine_info && (
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs max-w-xl">
                    <div className="font-semibold text-slate-900">Active Recognition Protection</div>
                    <div className="flex justify-between text-slate-600">
                      <span>Duplicate scan cooldown window</span>
                      <span className="font-medium text-slate-900">
                        {prefs.engine_info.duplicate_protection_seconds} seconds
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Minimum face size in frame</span>
                      <span className="font-medium text-slate-900">
                        {prefs.engine_info.min_face_size_px} px
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  loading={savingPrefs}
                  onClick={() => handleSavePrefs({ attendance_rules: prefs.attendance_rules })}
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Attendance Rules
                </Button>
              </CardContent>
            </Card>
          ) : prefs ? (
            <Card>
              <CardHeader
                title="System Preferences"
                subtitle="Display format and workspace labels"
              />
              <CardContent className="space-y-4 max-w-md">
                <Field label="Date Format">
                  <Select
                    value={prefs.system.date_format}
                    onChange={(e) =>
                      setPrefs({ ...prefs, system: { ...prefs.system, date_format: e.target.value } })
                    }
                  >
                    <option value="YYYY-MM-DD">ISO (2026-11-11)</option>
                    <option value="MMM DD, YYYY">Standard (Nov 11, 2026)</option>
                  </Select>
                </Field>
                <Field label="Time Display">
                  <Select
                    value={prefs.system.time_format}
                    onChange={(e) =>
                      setPrefs({ ...prefs, system: { ...prefs.system, time_format: e.target.value } })
                    }
                  >
                    <option value="12h">12-hour (9:00 AM)</option>
                    <option value="24h">24-hour (09:00)</option>
                  </Select>
                </Field>
                <Field label="Workspace Tagline">
                  <Input
                    value={prefs.system.company_tagline}
                    onChange={(e) =>
                      setPrefs({ ...prefs, system: { ...prefs.system, company_tagline: e.target.value } })
                    }
                  />
                </Field>
                <Button
                  loading={savingPrefs}
                  onClick={() => handleSavePrefs({ system: prefs.system })}
                  icon={<Save className="w-4 h-4" />}
                >
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Branch Modal */}
      <Modal
        open={branchModal.open}
        onClose={() => setBranchModal({ open: false, editing: null })}
        title={branchModal.editing ? "Edit Branch" : "Add Branch"}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setBranchModal({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button type="submit" form="branch-form" loading={savingBranch}>
              Save Branch
            </Button>
          </>
        }
      >
        <form id="branch-form" onSubmit={handleSaveBranch} className="space-y-4">
          <Field label="Branch Name" required>
            <Input
              required
              value={branchForm.name}
              onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
            />
          </Field>
          <Field label="Timezone" required>
            <Input
              required
              value={branchForm.timezone}
              onChange={(e) => setBranchForm({ ...branchForm, timezone: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input
              value={branchForm.address}
              onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* Department Modal */}
      <Modal
        open={deptModal.open}
        onClose={() => setDeptModal({ open: false, editing: null })}
        title={deptModal.editing ? "Edit Department" : "Add Department"}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setDeptModal({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button type="submit" form="dept-form" loading={savingDept}>
              Save Department
            </Button>
          </>
        }
      >
        <form id="dept-form" onSubmit={handleSaveDept} className="space-y-4">
          <Field label="Department Name" required>
            <Input
              required
              value={deptForm.name}
              onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
            />
          </Field>
          <Field label="Department Code">
            <Input
              value={deptForm.code}
              onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
              className="uppercase font-mono"
            />
          </Field>
          <Field label="Branch" required>
            <Select
              required
              value={deptForm.branch_id}
              onChange={(e) => setDeptForm({ ...deptForm, branch_id: e.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      {/* User Account Modal */}
      <Modal
        open={userModal.open}
        onClose={() => setUserModal({ open: false, editing: null })}
        title={userModal.editing ? "Edit User Account" : "Create User Account"}
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setUserModal({ open: false, editing: null })}>
              Cancel
            </Button>
            <Button type="submit" form="user-form" loading={savingUser}>
              {userModal.editing ? "Save Changes" : "Create User"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSaveUser} className="space-y-3.5">
          {!userModal.editing && (
            <Field label="Username" required>
              <Input
                required
                value={userForm.username}
                onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
              />
            </Field>
          )}
          <Field label="Full Name">
            <Input
              value={userForm.full_name}
              onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
            />
          </Field>
          <Field label="Email" required>
            <Input
              type="email"
              required
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
            />
          </Field>
          <Field
            label={userModal.editing ? "New Password (leave blank to keep current)" : "Password"}
            required={!userModal.editing}
          >
            <Input
              type="password"
              required={!userModal.editing}
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
            />
          </Field>
          <Field label="Role" required>
            <Select
              value={userForm.role_name}
              onChange={(e) => setUserForm({ ...userForm, role_name: e.target.value })}
            >
              {(roles.length > 0
                ? roles
                : [
                    { id: "ADMIN", name: "ADMIN" },
                    { id: "HR_MANAGER", name: "HR_MANAGER" },
                    { id: "LINE_MANAGER", name: "LINE_MANAGER" },
                    { id: "EMPLOYEE", name: "EMPLOYEE" },
                  ]
              ).map((r) => (
                <option key={r.id} value={r.name}>
                  {getRoleLabel(r.name)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Link to Employee Profile (Optional)" hint="Required for Employee self-service accounts">
            <Select
              value={userForm.employee_id}
              onChange={(e) => setUserForm({ ...userForm, employee_id: e.target.value })}
            >
              <option value="">None</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name} ({e.employee_code})
                </option>
              ))}
            </Select>
          </Field>
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={userForm.is_active}
              onChange={(e) => setUserForm({ ...userForm, is_active: e.target.checked })}
              className="rounded border-slate-300 text-blue-600"
            />
            Account active (can sign in)
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteDeptTarget)}
        onClose={() => setDeleteDeptTarget(null)}
        onConfirm={handleDeleteDept}
        loading={deletingDept}
        title="Delete Department"
        message={`Are you sure you want to delete "${deleteDeptTarget?.name}"? Departments with assigned employees cannot be deleted until reassigned.`}
        confirmLabel="Delete Department"
      />
    </AppShell>
  );
}

