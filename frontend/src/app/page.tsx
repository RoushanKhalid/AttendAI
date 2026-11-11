"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  CalendarOff,
  Percent,
  Camera,
  RefreshCw,
  UserPlus,
  CalendarCheck2,
  FileCheck2,
  BarChart3,
  ArrowRight,
  LogIn,
  LogOut,
  CalendarDays,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, StatCard } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { EmptyState, Skeleton } from "@/components/ui/DataHelpers";
import { useAuth } from "@/components/providers/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import {
  api,
  DashboardSummary,
  DailyAttendance,
  Holiday,
  LeaveRequest,
  RegularizationRequestItem,
} from "@/lib/api";
import {
  cn,
  formatDate,
  formatDurationMins,
  formatTime,
  getInitials,
  isAdminOrHrUser,
  isManagerOrAboveUser,
  toLocalDateInputValue,
} from "@/lib/utils";

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const toast = useToast();

  const isManager = isManagerOrAboveUser(user?.roles, user?.is_superuser);
  const isHrOrAdmin = isAdminOrHrUser(user?.roles, user?.is_superuser);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [pendingLeaves, setPendingLeaves] = useState<LeaveRequest[]>([]);
  const [pendingRegs, setPendingRegs] = useState<RegularizationRequestItem[]>([]);
  const [myToday, setMyToday] = useState<DailyAttendance | null>(null);
  const [myRecentDaily, setMyRecentDaily] = useState<DailyAttendance[]>([]);
  const [upcomingHolidays, setUpcomingHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(
    async (silent = false) => {
      if (!isAuthenticated || !user) return;
      if (silent) setRefreshing(true);
      else setLoading(true);

      try {
        const todayStr = toLocalDateInputValue();
        if (isManager) {
          const [dash, leaves, regs] = await Promise.all([
            api.getDashboardSummary(),
            api.getLeaves(undefined, "PENDING").catch(() => []),
            api.getRegularizationRequests("PENDING").catch(() => []),
          ]);
          setSummary(dash);
          setPendingLeaves(leaves);
          setPendingRegs(regs);
        } else {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 14);
          const [dailyList, leaves, hols] = await Promise.all([
            api.getDailyAttendance({
              start_date: toLocalDateInputValue(thirtyDaysAgo),
              end_date: todayStr,
              limit: 20,
            }),
            api.getLeaves().catch(() => []),
            api.getHolidays(undefined, new Date().getFullYear()).catch(() => []),
          ]);
          setMyRecentDaily(dailyList);
          setMyToday(dailyList.find((d) => d.attendance_date === todayStr) || null);
          setPendingLeaves(leaves.filter((l) => l.status === "PENDING"));
          setUpcomingHolidays(hols.filter((h) => h.holiday_date >= todayStr).slice(0, 4));
        }
      } catch (err: unknown) {
        if (!silent) {
          toast.error("Unable to load dashboard", err instanceof Error ? err.message : undefined);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated, user, isManager, toast]
  );

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Gentle live refresh every 20 seconds for live attendance activity
  useEffect(() => {
    if (!isAuthenticated || !isManager) return;
    const timer = setInterval(() => loadData(true), 20000);
    return () => clearInterval(timer);
  }, [isAuthenticated, isManager, loadData]);

  const greetingHour = new Date().getHours();
  const greeting =
    greetingHour < 12 ? "Good morning" : greetingHour < 17 ? "Good afternoon" : "Good evening";

  return (
    <AppShell title="Dashboard">
      <PageHeader
        title={`${greeting}, ${user?.full_name?.split(" ")[0] || user?.username || "there"}`}
        subtitle={
          isManager
            ? `Real-time attendance overview for ${formatDate(toLocalDateInputValue())}`
            : `Your personal attendance and schedule summary for ${formatDate(toLocalDateInputValue())}`
        }
        secondaryActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadData(true)}
            loading={refreshing}
            icon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
        primaryAction={
          isManager ? (
            <Link href="/kiosk">
              <Button size="sm" icon={<Camera className="w-3.5 h-3.5" />}>
                Open Live Kiosk
              </Button>
            </Link>
          ) : (
            <Link href="/leaves?action=apply">
              <Button size="sm" icon={<CalendarDays className="w-3.5 h-3.5" />}>
                Request Leave
              </Button>
            </Link>
          )
        }
      />

      {isManager ? (
        <>
          {/* KPI Summary Row */}
          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Card key={idx} className="p-4 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-14" />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard
                label="Total Employees"
                value={summary?.total_employees ?? 0}
                hint="Active workforce"
                icon={<Users className="w-4 h-4" />}
                tone="neutral"
                onClick={isHrOrAdmin ? () => router.push("/employees") : undefined}
              />
              <StatCard
                label="Present Today"
                value={summary?.present_today ?? 0}
                hint="Checked in today"
                icon={<UserCheck className="w-4 h-4" />}
                tone="success"
                onClick={() => router.push("/attendance")}
              />
              <StatCard
                label="Absent Today"
                value={summary?.absent_today ?? 0}
                hint="No check-in yet"
                icon={<UserX className="w-4 h-4" />}
                tone="danger"
                onClick={() => router.push("/attendance")}
              />
              <StatCard
                label="Late Arrivals"
                value={summary?.late_today ?? 0}
                hint="Past shift grace period"
                icon={<Clock className="w-4 h-4" />}
                tone="warning"
                onClick={() => router.push("/attendance?tab=late")}
              />
              <StatCard
                label="On Leave"
                value={summary?.on_leave_today ?? 0}
                hint="Approved leave today"
                icon={<CalendarOff className="w-4 h-4" />}
                tone="info"
                onClick={() => router.push("/leaves")}
              />
              <StatCard
                label="Attendance Rate"
                value={`${(summary?.attendance_percentage ?? 0).toFixed(1)}%`}
                hint="Present vs. total active"
                icon={<Percent className="w-4 h-4" />}
                tone="info"
                onClick={() => router.push("/reports")}
              />
            </div>
          )}

          {/* Quick Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Quick Actions
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/kiosk">
                    <Button variant="outline" size="sm" icon={<Camera className="w-3.5 h-3.5 text-blue-600" />}>
                      Live Attendance Kiosk
                    </Button>
                  </Link>
                  {isHrOrAdmin && (
                    <Link href="/employees?action=register">
                      <Button variant="outline" size="sm" icon={<UserPlus className="w-3.5 h-3.5 text-emerald-600" />}>
                        Add Employee
                      </Button>
                    </Link>
                  )}
                  <Link href="/leaves?status=PENDING">
                    <Button variant="outline" size="sm" icon={<CalendarCheck2 className="w-3.5 h-3.5 text-amber-600" />}>
                      Review Leaves
                      {pendingLeaves.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
                          {pendingLeaves.length}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link href="/regularization">
                    <Button variant="outline" size="sm" icon={<FileCheck2 className="w-3.5 h-3.5 text-slate-600" />}>
                      Regularization
                      {pendingRegs.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-800 text-[11px] font-semibold">
                          {pendingRegs.length}
                        </span>
                      )}
                    </Button>
                  </Link>
                  <Link href="/reports">
                    <Button variant="outline" size="sm" icon={<BarChart3 className="w-3.5 h-3.5 text-blue-600" />}>
                      Reports & CSV
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Main Grid: Department Breakdown + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Department-wise Attendance Overview */}
            <Card className="lg:col-span-6 flex flex-col">
              <CardHeader
                title="Department-Wise Attendance"
                subtitle="Today's presence and punctuality across teams"
                action={
                  <Link href="/reports" className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                    Full breakdown <ArrowRight className="w-3 h-3" />
                  </Link>
                }
              />
              <CardContent className="flex-1">
                {loading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-2.5 w-full" />
                      </div>
                    ))}
                  </div>
                ) : !summary?.department_stats?.length ? (
                  <EmptyState
                    icon={<Users className="w-5 h-5" />}
                    title="No departments configured"
                    description="Create departments in Settings and assign employees to track team attendance."
                  />
                ) : (
                  <div className="space-y-4">
                    {summary.department_stats.map((dept) => {
                      const onTime = Math.max(0, dept.present - dept.late);
                      const total = Math.max(1, dept.total_employees);
                      const onTimePct = (onTime / total) * 100;
                      const latePct = (dept.late / total) * 100;

                      return (
                        <div key={dept.department_id} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800">{dept.department_name}</span>
                            <div className="flex items-center gap-3 tabular-nums text-slate-500">
                              <span>
                                <strong className="text-slate-900">{dept.present}</strong>/{dept.total_employees} present
                              </span>
                              {dept.late > 0 && (
                                <span className="text-amber-600 font-medium">{dept.late} late</span>
                              )}
                              <span className="font-semibold text-slate-900 w-11 text-right">
                                {dept.percentage.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
                            <div
                              className="bg-emerald-500 h-full transition-all duration-500"
                              style={{ width: `${onTimePct}%` }}
                              title={`On time: ${onTime}`}
                            />
                            <div
                              className="bg-amber-400 h-full transition-all duration-500"
                              style={{ width: `${latePct}%` }}
                              title={`Late: ${dept.late}`}
                            />
                          </div>
                        </div>
                      );
                    })}

                    <div className="pt-3 border-t border-slate-100 flex items-center gap-4 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> On Time
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-amber-400" /> Late
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-200" /> Not Checked In
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Live Attendance Activity / Recent Check-Ins & Check-Outs */}
            <Card className="lg:col-span-6 flex flex-col">
              <CardHeader
                title={
                  <span className="inline-flex items-center gap-2">
                    Live Attendance Activity
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Live
                    </span>
                  </span>
                }
                subtitle="Most recent check-ins and check-outs"
                action={
                  <Link href="/attendance?tab=logs" className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                    All records <ArrowRight className="w-3 h-3" />
                  </Link>
                }
              />
              <CardContent className="p-0 flex-1">
                {loading ? (
                  <div className="p-5 space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-8 h-8 rounded-full" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3.5 w-32" />
                            <Skeleton className="h-3 w-20" />
                          </div>
                        </div>
                        <Skeleton className="h-5 w-16" />
                      </div>
                    ))}
                  </div>
                ) : !summary?.recent_punches?.length ? (
                  <EmptyState
                    icon={<Clock className="w-5 h-5" />}
                    title="No check-ins recorded yet"
                    description="As employees check in or out at the kiosk, their activity will appear here in real time."
                    action={
                      <Link href="/kiosk">
                        <Button size="sm" variant="outline" icon={<Camera className="w-3.5 h-3.5" />}>
                          Open Live Kiosk
                        </Button>
                      </Link>
                    }
                  />
                ) : (
                  <div className="divide-y divide-slate-100 max-h-[380px] overflow-y-auto">
                    {summary.recent_punches.map((punch) => (
                      <div
                        key={punch.id}
                        className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center shrink-0">
                            {getInitials(punch.employee_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900 truncate">
                              {punch.employee_name}
                            </div>
                            <div className="text-xs text-slate-500 truncate">
                              <span className="font-mono">{punch.employee_code}</span> · {punch.department_name}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div className="hidden sm:block text-xs text-slate-500 tabular-nums">
                            {formatTime(punch.punch_time)}
                          </div>
                          <StatusBadge status={punch.punch_type} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        /* ================= EMPLOYEE SELF-SERVICE DASHBOARD ================= */
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Today's Status"
              value={myToday ? <StatusBadge status={myToday.status} /> : "Not Checked In"}
              hint={myToday?.shift_name ? `Shift: ${myToday.shift_name}` : "Check in at the kiosk"}
              icon={<UserCheck className="w-4 h-4" />}
              tone={myToday?.status === "PRESENT" ? "success" : myToday?.status === "LATE" ? "warning" : "neutral"}
            />
            <StatCard
              label="Check-In Time"
              value={formatTime(myToday?.check_in_time)}
              hint={myToday?.late_minutes ? `${myToday.late_minutes}m late` : "On schedule"}
              icon={<LogIn className="w-4 h-4" />}
              tone="info"
            />
            <StatCard
              label="Check-Out Time"
              value={formatTime(myToday?.check_out_time)}
              hint={myToday?.total_work_minutes ? `Worked ${formatDurationMins(myToday.total_work_minutes)}` : "Pending check-out"}
              icon={<LogOut className="w-4 h-4" />}
              tone="neutral"
            />
            <StatCard
              label="Pending Leave Requests"
              value={pendingLeaves.length}
              hint="Awaiting review"
              icon={<CalendarDays className="w-4 h-4" />}
              tone="warning"
              onClick={() => router.push("/leaves")}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <Card className="lg:col-span-7">
              <CardHeader
                title="My Recent Attendance"
                subtitle="Last 14 days of check-ins and work hours"
                action={
                  <Link href="/attendance" className="text-xs font-medium text-blue-600 hover:underline">
                    View full history
                  </Link>
                }
              />
              <CardContent className="p-0">
                {myRecentDaily.length === 0 ? (
                  <EmptyState
                    icon={<Clock className="w-5 h-5" />}
                    title="No attendance records yet"
                    description="Your check-ins and daily hours will appear here once recorded at a terminal."
                  />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {myRecentDaily.slice(0, 7).map((row) => (
                      <div key={row.id} className="px-5 py-3 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-slate-900">{formatDate(row.attendance_date)}</div>
                          <div className="text-slate-500 mt-0.5 tabular-nums">
                            In: {formatTime(row.check_in_time)} · Out: {formatTime(row.check_out_time)}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-600 tabular-nums">
                            {formatDurationMins(row.total_work_minutes)}
                          </span>
                          <StatusBadge status={row.status} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-5">
              <CardHeader
                title="Upcoming Holidays"
                subtitle="Scheduled company holidays"
                action={
                  <Link href="/leaves" className="text-xs font-medium text-blue-600 hover:underline">
                    Leave calendar
                  </Link>
                }
              />
              <CardContent className="p-0">
                {upcomingHolidays.length === 0 ? (
                  <EmptyState
                    icon={<CalendarDays className="w-5 h-5" />}
                    title="No upcoming holidays"
                    description="Scheduled branch holidays will appear here."
                  />
                ) : (
                  <div className="divide-y divide-slate-100">
                    {upcomingHolidays.map((h) => (
                      <div key={h.id} className="px-5 py-3.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-medium text-slate-900">{h.name}</div>
                          <div className="text-slate-500">{h.branch_name}</div>
                        </div>
                        <span className="font-medium text-slate-700 tabular-nums">
                          {formatDate(h.holiday_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
