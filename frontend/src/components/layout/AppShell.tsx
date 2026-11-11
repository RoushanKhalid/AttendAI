"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Clock,
  Camera,
  Users,
  CalendarClock,
  CalendarDays,
  FileCheck2,
  BarChart3,
  Settings,
  Search,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  KeyRound,
  Menu,
  X,
  ShieldCheck,
  ChevronDown,
  ArrowRight,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { api, Employee } from "@/lib/api";
import {
  cn,
  getInitials,
  getRoleLabel,
  isAdminOrHrUser,
  isManagerOrAboveUser,
} from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import { Field, Input } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: (roles: string[], isSuperuser: boolean) => boolean;
  description: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    visible: () => true,
    description: "Daily overview & live activity",
  },
  {
    label: "Attendance",
    href: "/attendance",
    icon: Clock,
    visible: () => true,
    description: "Check-ins, history & missing punches",
  },
  {
    label: "Live Kiosk",
    href: "/kiosk",
    icon: Camera,
    visible: (r, s) => isManagerOrAboveUser(r, s),
    description: "Touchless face attendance terminal",
  },
  {
    label: "Employees",
    href: "/employees",
    icon: Users,
    visible: (r, s) => isAdminOrHrUser(r, s),
    description: "Directory, profiles & face setup",
  },
  {
    label: "Shifts & Schedules",
    href: "/shifts",
    icon: CalendarClock,
    visible: () => true,
    description: "Working hours & shift rosters",
  },
  {
    label: "Leave Management",
    href: "/leaves",
    icon: CalendarDays,
    visible: () => true,
    description: "Leave requests & holiday calendar",
  },
  {
    label: "Regularization",
    href: "/regularization",
    icon: FileCheck2,
    visible: () => true,
    description: "Correction requests & audit history",
  },
  {
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    visible: (r, s) => isManagerOrAboveUser(r, s),
    description: "Attendance analytics & CSV exports",
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    visible: (r, s) => isAdminOrHrUser(r, s),
    description: "Organization, users, kiosk & rules",
  },
];

interface AlertItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: "warning" | "info";
}

export function AppShell({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const toast = useToast();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Global search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [employeeHits, setEmployeeHits] = useState<Employee[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  // User dropdown + password modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebar_collapsed") : null;
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  // Ctrl+K shortcut for global search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setProfileOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 40);
    }
  }, [searchOpen]);

  // Fetch employee search hits for managers/admins
  useEffect(() => {
    if (!searchOpen || !user) return;
    if (!isManagerOrAboveUser(user.roles, user.is_superuser)) return;
    const timer = setTimeout(async () => {
      try {
        const list = await api.getEmployees({ search: searchQuery || undefined, limit: 6 });
        setEmployeeHits(list.slice(0, 6));
      } catch {
        setEmployeeHits([]);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [searchOpen, searchQuery, user]);

  // Load actionable notifications
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    let active = true;
    const loadAlerts = async () => {
      try {
        const isMgr = isManagerOrAboveUser(user.roles, user.is_superuser);
        const isHr = isAdminOrHrUser(user.roles, user.is_superuser);
        const [leaves, regs, missing] = await Promise.all([
          api.getLeaves(undefined, "PENDING").catch(() => []),
          api.getRegularizationRequests("PENDING").catch(() => []),
          isMgr ? api.getDailyAttendance({ missing_punch_only: true, limit: 50 }).catch(() => []) : Promise.resolve([]),
        ]);
        const emps = isHr ? await api.getEmployees({ limit: 200 }).catch(() => []) : [];
        if (!active) return;

        const nextAlerts: AlertItem[] = [];
        if (leaves.length > 0) {
          nextAlerts.push({
            id: "leaves-pending",
            title: `${leaves.length} pending leave ${leaves.length === 1 ? "request" : "requests"}`,
            detail: isMgr ? "Waiting for review and approval" : "Submitted and awaiting manager review",
            href: "/leaves",
            tone: "warning",
          });
        }
        if (regs.length > 0) {
          nextAlerts.push({
            id: "reg-pending",
            title: `${regs.length} attendance correction ${regs.length === 1 ? "request" : "requests"}`,
            detail: isMgr ? "Review original vs. requested times" : "Your submitted corrections",
            href: "/regularization",
            tone: "warning",
          });
        }
        if (isMgr && missing.length > 0) {
          nextAlerts.push({
            id: "missing-punches",
            title: `${missing.length} missing check-out${missing.length === 1 ? "" : "s"} today`,
            detail: "Employees checked in without a check-out yet",
            href: "/attendance?tab=missing",
            tone: "info",
          });
        }
        if (isHr) {
          const unenrolled = emps.filter((e) => e.status === "ACTIVE" && e.enrollment_status !== "ENROLLED").length;
          if (unenrolled > 0) {
            nextAlerts.push({
              id: "face-setup",
              title: `${unenrolled} active ${unenrolled === 1 ? "employee needs" : "employees need"} face setup`,
              detail: "Complete face setup so they can use the live kiosk",
              href: "/employees?enrollment=NOT_ENROLLED",
              tone: "info",
            });
          }
        }
        setAlerts(nextAlerts);
      } catch {
        // silent fail
      }
    };
    loadAlerts();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user, pathname]);

  const visibleNav = useMemo(() => {
    const roles = user?.roles || [];
    const superuser = Boolean(user?.is_superuser);
    return NAV_ITEMS.filter((item) => item.visible(roles, superuser));
  }, [user]);

  const activeNav = useMemo(() => {
    return (
      visibleNav.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) || visibleNav[0]
    );
  }, [visibleNav, pathname]);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return visibleNav;
    return visibleNav.filter(
      (n) => n.label.toLowerCase().includes(q) || n.description.toLowerCase().includes(q)
    );
  }, [visibleNav, searchQuery]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwForm.next.length < 6) {
      toast.error("Password too short", "New password must be at least 6 characters.");
      return;
    }
    if (pwForm.next !== pwForm.confirm) {
      toast.error("Passwords do not match", "Please re-enter your new password.");
      return;
    }
    setPwSaving(true);
    try {
      await api.changePassword(pwForm.current, pwForm.next);
      toast.success("Password updated", "Your account password has been changed.");
      setPwOpen(false);
      setPwForm({ current: "", next: "", confirm: "" });
    } catch (err: unknown) {
      toast.error("Could not update password", err instanceof Error ? err.message : "Please verify your current password.");
    } finally {
      setPwSaving(false);
    }
  };

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm animate-pulse">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <p className="text-sm text-slate-500 font-medium">Loading workspace…</p>
        </div>
      </div>
    );
  }

  const primaryRole = user.roles?.[0] || (user.is_superuser ? "ADMIN" : "EMPLOYEE");

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 bg-white border-r border-slate-200 flex flex-col transition-all duration-200 lg:sticky lg:top-0 lg:h-screen",
          collapsed ? "lg:w-[70px]" : "lg:w-64",
          mobileMenuOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Brand */}
        <div className="h-16 px-4 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-sm">
              <ShieldCheck className="w-4 h-4" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 tracking-tight truncate">AttendAI</div>
                <div className="text-[11px] text-slate-500 truncate">Workforce Platform</div>
              </div>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close navigation menu"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1" aria-label="Main navigation">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900",
                  collapsed && "lg:justify-center lg:px-2"
                )}
              >
                <Icon className={cn("w-4 h-4 shrink-0", isActive ? "text-blue-600" : "text-slate-500")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-100 space-y-2 shrink-0">
          <button
            type="button"
            onClick={toggleCollapse}
            className={cn(
              "hidden lg:flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors",
              collapsed && "justify-center px-2"
            )}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            {!collapsed && <span>Collapse sidebar</span>}
          </button>

          <div
            className={cn(
              "flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200/70",
              collapsed && "lg:justify-center lg:p-1.5"
            )}
          >
            <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center shrink-0">
              {getInitials(user.full_name || user.username)}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 truncate">
                  {user.full_name || user.username}
                </div>
                <div className="text-[11px] text-slate-500 truncate">{getRoleLabel(primaryRole)}</div>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white/95 backdrop-blur border-b border-slate-200 sticky top-0 z-30 px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">
                {title || activeNav?.label || "Dashboard"}
              </div>
              {activeNav?.description && (
                <div className="hidden sm:block text-xs text-slate-500 truncate">{activeNav.description}</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Global Search Trigger */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100/80 text-xs text-slate-500 transition-colors sm:w-56 justify-between"
            >
              <span className="flex items-center gap-2 truncate">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="hidden sm:inline truncate">Search pages or people…</span>
                <span className="sm:hidden">Search</span>
              </span>
              <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-white border border-slate-200 rounded text-slate-400">
                Ctrl K
              </kbd>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((v) => !v);
                  setProfileOpen(false);
                }}
                className="relative h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center text-slate-600 transition-colors"
                aria-label="Notifications"
              >
                <Bell className="w-4 h-4" />
                {alerts.length > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[10px] font-semibold flex items-center justify-center">
                    {alerts.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">Actionable Alerts</span>
                    <span className="text-[11px] text-slate-500">{alerts.length} active</span>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      All caught up. No pending items need attention.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {alerts.map((al) => (
                        <Link
                          key={al.id}
                          href={al.href}
                          onClick={() => setNotifOpen(false)}
                          className="flex items-start gap-3 p-3.5 hover:bg-slate-50 transition-colors"
                        >
                          <AlertCircle
                            className={cn(
                              "w-4 h-4 mt-0.5 shrink-0",
                              al.tone === "warning" ? "text-amber-500" : "text-blue-500"
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-medium text-slate-900">{al.title}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{al.detail}</div>
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Profile Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setProfileOpen((v) => !v);
                  setNotifOpen(false);
                }}
                className="flex items-center gap-2 h-9 pl-1.5 pr-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
              >
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-semibold flex items-center justify-center">
                  {getInitials(user.full_name || user.username)}
                </span>
                <span className="hidden md:inline text-xs font-medium text-slate-700 max-w-[120px] truncate">
                  {user.full_name || user.username}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {user.full_name || user.username}
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                    <div className="mt-1.5 inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-medium">
                      {getRoleLabel(primaryRole)}
                    </div>
                  </div>
                  <div className="p-1.5 space-y-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        setPwOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                      Change Password
                    </button>
                    {isManagerOrAboveUser(user.roles, user.is_superuser) && (
                      <Link
                        href="/kiosk"
                        onClick={() => setProfileOpen(false)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <Camera className="w-3.5 h-3.5 text-slate-500" />
                        Launch Live Kiosk
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setProfileOpen(false);
                        logout();
                        router.replace("/login");
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">{children}</main>
      </div>

      {/* Global Search Modal */}
      <Modal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        title="Quick Navigation & Search"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Jump to a page or search employees by name/code…"
              className="pl-9"
            />
          </div>

          <div className="space-y-3 max-h-80 overflow-y-auto">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Workspace Pages
              </div>
              <div className="space-y-1">
                {filteredPages.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.href}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        router.push(p.href);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 text-left transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon className="w-4 h-4 text-slate-500" />
                        <span className="text-sm font-medium text-slate-800">{p.label}</span>
                      </span>
                      <span className="text-xs text-slate-400">{p.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {isManagerOrAboveUser(user.roles, user.is_superuser) && employeeHits.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Employees
                </div>
                <div className="space-y-1">
                  {employeeHits.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        setSearchOpen(false);
                        setSearchQuery("");
                        if (isAdminOrHrUser(user.roles, user.is_superuser)) {
                          router.push(`/employees?employeeId=${emp.id}`);
                        } else {
                          router.push(`/attendance?search=${encodeURIComponent(emp.employee_code)}`);
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-100 text-left transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold flex items-center justify-center">
                          {getInitials(emp.full_name)}
                        </span>
                        <span>
                          <span className="text-sm font-medium text-slate-800 block leading-tight">
                            {emp.full_name}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {emp.employee_code} · {emp.department?.name || "Unassigned"}
                          </span>
                        </span>
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Change Password Modal */}
      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title="Change Password"
        subtitle="Update your account sign-in credentials."
        maxWidth="max-w-md"
        footer={
          <>
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="change-pw-form" loading={pwSaving}>
              Update Password
            </Button>
          </>
        }
      >
        <form id="change-pw-form" onSubmit={handlePasswordChange} className="space-y-4">
          <Field label="Current Password" required>
            <Input
              type="password"
              required
              value={pwForm.current}
              onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })}
            />
          </Field>
          <Field label="New Password" required hint="Minimum 6 characters">
            <Input
              type="password"
              required
              value={pwForm.next}
              onChange={(e) => setPwForm({ ...pwForm, next: e.target.value })}
            />
          </Field>
          <Field label="Confirm New Password" required>
            <Input
              type="password"
              required
              value={pwForm.confirm}
              onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
