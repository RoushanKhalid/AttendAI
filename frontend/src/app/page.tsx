"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Users,
  Camera,
  UserCheck,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  LogOut,
  LogIn,
  Search,
  Plus,
  Shield,
  Activity,
  Award,
  Calendar,
  CalendarDays,
  FileSpreadsheet,
  Sliders,
  Download,
  Volume2,
  Trash2,
  Check,
  X
} from "lucide-react";
import {
  api,
  DashboardSummary,
  Employee,
  AttendanceLog,
  Shift,
  LeaveRequest,
  Holiday,
  MonthlyReportResponse,
  AuditLog
} from "@/lib/api";

// Synthesized Kiosk Audio Chime (Web Audio API)
function playKioskChime(success: boolean) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (success) {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.4);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    console.warn("Audio chime gesture requirement:", e);
  }
}

// Browser Text-to-Speech greeting
function speakKioskGreeting(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<
    "dashboard" | "kiosk" | "enroll" | "employees" | "shifts" | "leaves" | "reports" | "logs"
  >("dashboard");
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Login Modal State
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [loginEmail, setLoginEmail] = useState("admin@company.com");
  const [loginPassword, setLoginPassword] = useState("admin123");
  const [loginError, setLoginError] = useState("");

  // Dashboard State
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(false);

  // Employee State
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddEmpModal, setShowAddEmpModal] = useState(false);
  const [metadata, setMetadata] = useState<{ branches: any[]; departments: any[]; shifts: any[] }>({
    branches: [],
    departments: [],
    shifts: [],
  });
  const [newEmp, setNewEmp] = useState({
    employee_code: "",
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    designation: "",
    branch_id: "",
    department_id: "",
    default_shift_id: "",
  });

  // Shifts State
  const [shiftsList, setShiftsList] = useState<Shift[]>([]);
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [newShift, setNewShift] = useState({
    name: "",
    code: "",
    start_time: "09:00:00",
    end_time: "18:00:00",
    grace_period_mins: 15,
    half_day_late_mins: 120,
    break_duration_mins: 60,
    is_overnight: false,
    shift_day_boundary: "12:00:00"
  });

  // Leaves & Holidays State
  const [leavesList, setLeavesList] = useState<LeaveRequest[]>([]);
  const [holidaysList, setHolidaysList] = useState<Holiday[]>([]);
  const [showApplyLeaveModal, setShowApplyLeaveModal] = useState(false);
  const [newLeave, setNewLeave] = useState({
    employee_id: "",
    leave_type: "ANNUAL",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    reason: ""
  });
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [newHoliday, setNewHoliday] = useState({
    branch_id: "",
    holiday_date: new Date().toISOString().split("T")[0],
    name: "",
    is_recurring: false
  });

  // Reports State
  const [reportYear, setReportYear] = useState<number>(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState<number>(new Date().getMonth() + 1);
  const [reportDept, setReportDept] = useState<string>("");
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReportResponse | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // Enrollment State
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [enrollQuality, setEnrollQuality] = useState<any>(null);
  const [enrollSamples, setEnrollSamples] = useState<string[]>([]);
  const [isCapturingSamples, setIsCapturingSamples] = useState<boolean>(false);
  const [enrollStatus, setEnrollStatus] = useState<string>("");

  // Kiosk / Recognition State
  const [isKioskRunning, setIsKioskRunning] = useState<boolean>(false);
  const [attendanceMode, setAttendanceMode] = useState<string>("AUTO");
  const [latestRecognition, setLatestRecognition] = useState<any>(null);
  const [recentPunchesFeed, setRecentPunchesFeed] = useState<any[]>([]);
  const [audioFeedbackEnabled, setAudioFeedbackEnabled] = useState<boolean>(true);

  // Logs & Regularization State
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceLog[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [logViewMode, setLogViewMode] = useState<"punches" | "audit">("punches");
  const [showRegularizeModal, setShowRegularizeModal] = useState(false);
  const [regForm, setRegForm] = useState({
    employee_id: "",
    attendance_date: new Date().toISOString().split("T")[0],
    check_in_time: "",
    check_out_time: "",
    status: "PRESENT",
    reason: ""
  });

  // Video Refs
  const kioskVideoRef = useRef<HTMLVideoElement>(null);
  const kioskCanvasRef = useRef<HTMLCanvasElement>(null);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const enrollCanvasRef = useRef<HTMLCanvasElement>(null);

  // On mount check auth
  useEffect(() => {
    const user = api.getUser();
    if (user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
    }
    loadMetadata();
    loadDashboard();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const data = await api.login(loginEmail, loginPassword);
      setIsAuthenticated(true);
      setCurrentUser(data);
      setShowLoginModal(false);
      loadDashboard();
      loadEmployees();
    } catch (err: any) {
      setLoginError(err.message || "Failed to login");
    }
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  const loadMetadata = async () => {
    try {
      const meta = await api.getMetadata();
      setMetadata(meta);
      if (meta.branches.length > 0) {
        setNewEmp((prev) => ({
          ...prev,
          branch_id: meta.branches[0].id,
          department_id: meta.departments[0]?.id || "",
          default_shift_id: meta.shifts[0]?.id || "",
        }));
        setNewHoliday((prev) => ({
          ...prev,
          branch_id: meta.branches[0].id
        }));
      }
    } catch (e) {
      console.error("Failed to load metadata:", e);
    }
  };

  const loadDashboard = async () => {
    setLoadingDashboard(true);
    try {
      const data = await api.getDashboardSummary();
      setSummary(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDashboard(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const data = await api.getEmployees(searchTerm);
      setEmployees(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadShifts = async () => {
    try {
      const data = await api.getShifts();
      setShiftsList(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadLeavesAndHolidays = async () => {
    try {
      const [leaves, hols] = await Promise.all([api.getLeaves(), api.getHolidays()]);
      setLeavesList(leaves);
      setHolidaysList(hols);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMonthlyReport = async () => {
    setLoadingReport(true);
    try {
      const data = await api.getMonthlySummary(reportYear, reportMonth, reportDept || undefined);
      setMonthlyReport(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReport(false);
    }
  };

  const loadAttendanceLogs = async () => {
    try {
      const logs = await api.getAttendanceLogs();
      setAttendanceLogs(logs);
      const audits = await api.getAuditLogs();
      setAuditLogs(audits);
    } catch (e) {
      console.error(e);
    }
  };

  // Reload tab-specific data
  useEffect(() => {
    if (activeTab === "dashboard") loadDashboard();
    if (activeTab === "employees") loadEmployees();
    if (activeTab === "shifts") loadShifts();
    if (activeTab === "leaves") loadLeavesAndHolidays();
    if (activeTab === "reports") loadMonthlyReport();
    if (activeTab === "logs") loadAttendanceLogs();
  }, [activeTab]);

  // Kiosk Camera Stream Lifecycle
  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: any = null;

    if (activeTab === "kiosk" && isKioskRunning) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 640, height: 480 } })
        .then((s) => {
          stream = s;
          if (kioskVideoRef.current) {
            kioskVideoRef.current.srcObject = s;
            kioskVideoRef.current.play();
          }

          // Recognition polling frame every 650ms
          intervalId = setInterval(() => {
            processKioskFrame();
          }, 650);
        })
        .catch((err) => {
          console.error("Kiosk camera access error:", err);
          alert("Could not access webcam. Please verify camera permissions.");
          setIsKioskRunning(false);
        });
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [activeTab, isKioskRunning, attendanceMode]);

  const processKioskFrame = async () => {
    if (!kioskVideoRef.current || !kioskCanvasRef.current) return;
    const video = kioskVideoRef.current;
    const canvas = kioskCanvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameBase64 = canvas.toDataURL("image/jpeg", 0.85);

    try {
      const res = await api.recognizeAndRecord(frameBase64, attendanceMode);
      if (res.detections && res.detections.length > 0) {
        const topDet = res.detections[0];
        setLatestRecognition({
          ...topDet,
          timestamp: new Date().toLocaleTimeString(),
          attendance_event: res.attendance_event,
        });

        if (res.attendance_event) {
          if (!res.attendance_event.is_duplicate) {
            setRecentPunchesFeed((prev) => [res.attendance_event, ...prev.slice(0, 9)]);
            if (audioFeedbackEnabled) {
              playKioskChime(true);
              speakKioskGreeting(`Welcome, ${topDet.employee_name || "Employee"}. Attendance recorded.`);
            }
            loadDashboard();
          }
        } else if (!topDet.is_matched && topDet.is_live) {
          // Unknown face detected
        }
      }
    } catch (e) {
      console.error("Recognition error:", e);
    }
  };

  // Enrollment Camera Stream Lifecycle
  useEffect(() => {
    let stream: MediaStream | null = null;
    let qualityInterval: any = null;

    if (activeTab === "enroll") {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 640, height: 480 } })
        .then((s) => {
          stream = s;
          if (enrollVideoRef.current) {
            enrollVideoRef.current.srcObject = s;
            enrollVideoRef.current.play();
          }

          qualityInterval = setInterval(() => {
            checkEnrollmentQuality();
          }, 1000);
        })
        .catch((err) => {
          console.error("Enrollment camera error:", err);
        });
    }

    return () => {
      if (qualityInterval) clearInterval(qualityInterval);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [activeTab]);

  const checkEnrollmentQuality = async () => {
    if (!enrollVideoRef.current || !enrollCanvasRef.current) return;
    const video = enrollVideoRef.current;
    const canvas = enrollCanvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frameBase64 = canvas.toDataURL("image/jpeg", 0.8);

    try {
      const res = await api.checkFaceQuality(frameBase64);
      if (res.faces && res.faces.length > 0) {
        setEnrollQuality(res.faces[0]);
      } else {
        setEnrollQuality({ is_valid: false, message: "No face detected" });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Guided 3-Sample Capture
  const startEnrollmentCapture = async () => {
    if (!selectedEmpId) {
      alert("Please select an employee first!");
      return;
    }
    setIsCapturingSamples(true);
    setEnrollStatus("Capturing Sample 1 of 3: Look straight at the camera...");
    setEnrollSamples([]);

    const samples: string[] = [];
    for (let i = 1; i <= 3; i++) {
      await new Promise((r) => setTimeout(r, 1200));
      if (enrollVideoRef.current && enrollCanvasRef.current) {
        const v = enrollVideoRef.current;
        const c = enrollCanvasRef.current;
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const snap = c.toDataURL("image/jpeg", 0.9);
          samples.push(snap);
          setEnrollSamples([...samples]);
          setEnrollStatus(
            i === 1
              ? "Sample 1 Captured! Turn head slightly to the left..."
              : i === 2
              ? "Sample 2 Captured! Turn head slightly to the right..."
              : "Sample 3 Captured! Finalizing biometric template..."
          );
        }
      }
    }

    try {
      setEnrollStatus("Generating normalized SFace/ArcFace feature vectors...");
      const res = await api.enrollFace(selectedEmpId, samples);
      setEnrollStatus(`Success! ${res.message}`);
      loadEmployees();
    } catch (err: any) {
      setEnrollStatus(`Error: ${err.message || "Enrollment failed"}`);
    } finally {
      setIsCapturingSamples(false);
    }
  };

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createEmployee(newEmp);
      setShowAddEmpModal(false);
      loadEmployees();
      loadDashboard();
      alert("Employee created successfully!");
    } catch (err: any) {
      alert(err.message || "Error creating employee");
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createShift(newShift);
      setShowAddShiftModal(false);
      loadShifts();
      alert("Shift created successfully!");
    } catch (err: any) {
      alert(err.message || "Error creating shift");
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm("Are you sure you want to delete this shift?")) return;
    try {
      await api.deleteShift(id);
      loadShifts();
    } catch (err: any) {
      alert(err.message || "Error deleting shift");
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.applyLeave(newLeave);
      setShowApplyLeaveModal(false);
      loadLeavesAndHolidays();
      alert("Leave application submitted!");
    } catch (err: any) {
      alert(err.message || "Error applying for leave");
    }
  };

  const handleUpdateLeaveStatus = async (id: string, status: string) => {
    try {
      await api.updateLeaveStatus(id, status);
      loadLeavesAndHolidays();
    } catch (err: any) {
      alert(err.message || "Error updating leave status");
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createHoliday(newHoliday);
      setShowAddHolidayModal(false);
      loadLeavesAndHolidays();
      alert("Holiday added to calendar!");
    } catch (err: any) {
      alert(err.message || "Error adding holiday");
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    if (!confirm("Remove this holiday from the schedule?")) return;
    try {
      await api.deleteHoliday(id);
      loadLeavesAndHolidays();
    } catch (err: any) {
      alert(err.message || "Error deleting holiday");
    }
  };

  const handleRegularizeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, unknown> = {
        employee_id: regForm.employee_id,
        attendance_date: regForm.attendance_date,
        status: regForm.status,
        reason: regForm.reason,
      };
      if (regForm.check_in_time) {
        payload.check_in_time = `${regForm.attendance_date}T${regForm.check_in_time}:00`;
      }
      if (regForm.check_out_time) {
        payload.check_out_time = `${regForm.attendance_date}T${regForm.check_out_time}:00`;
      }
      await api.regularizeAttendance(payload);
      setShowRegularizeModal(false);
      loadAttendanceLogs();
      alert("Attendance regularized and logged to immutable audit trail!");
    } catch (err: any) {
      alert(err.message || "Error regularizing attendance");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/30">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                AI Attendance Tracker
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                  v2.0 Enterprise
                </span>
              </div>
              <div className="text-xs text-slate-400">MediaPipe · SFace/ArcFace ONNX · MiniFASNet</div>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <span className="text-xs text-slate-300 bg-slate-800/80 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {currentUser?.full_name || currentUser?.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-xs text-slate-400 hover:text-white p-2 hover:bg-slate-800 rounded-lg transition"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 py-2 rounded-lg flex items-center gap-1.5 transition shadow"
              >
                <LogIn className="w-4 h-4" /> Admin Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-800 bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 flex items-center space-x-1 overflow-x-auto">
          {[
            { id: "dashboard", label: "Executive Dashboard", icon: Activity },
            { id: "kiosk", label: "AI Attendance Kiosk", icon: Camera },
            { id: "enroll", label: "Face Enrollment Studio", icon: UserCheck },
            { id: "employees", label: "Employee Directory", icon: Users },
            { id: "shifts", label: "Shifts & Schedules", icon: Sliders },
            { id: "leaves", label: "Leaves & Holidays", icon: CalendarDays },
            { id: "reports", label: "Reports & Statutory Export", icon: FileSpreadsheet },
            { id: "logs", label: "Audit & Regularization", icon: Clock },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-3.5 text-xs font-semibold whitespace-nowrap transition border-b-2 ${
                  isActive
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/40"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {/* ================= TAB 1: EXECUTIVE DASHBOARD ================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Attendance Overview</h1>
                <p className="text-xs text-slate-400">Real-time daily KPI indicators and punch activity</p>
              </div>
              <button
                onClick={loadDashboard}
                disabled={loadingDashboard}
                className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDashboard ? "animate-spin" : ""}`} /> Refresh
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-400 flex items-center justify-between">
                  <span>Total Employees</span>
                  <Users className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-2xl font-bold text-white mt-2">{summary?.total_employees || 0}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-emerald-400 flex items-center justify-between">
                  <span>Present Today</span>
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                </div>
                <div className="text-2xl font-bold text-emerald-400 mt-2">{summary?.present_today || 0}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-rose-400 flex items-center justify-between">
                  <span>Absent Today</span>
                  <XCircle className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-2xl font-bold text-rose-400 mt-2">{summary?.absent_today || 0}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-amber-400 flex items-center justify-between">
                  <span>Late Arrivals</span>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
                <div className="text-2xl font-bold text-amber-400 mt-2">{summary?.late_today || 0}</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 col-span-2 md:col-span-1">
                <div className="text-xs text-blue-400 flex items-center justify-between">
                  <span>Attendance Rate</span>
                  <Award className="w-4 h-4 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-blue-400 mt-2">
                  {summary?.attendance_percentage?.toFixed(1) || "0.0"}%
                </div>
              </div>
            </div>

            {/* Department Breakdown & Recent Punch Feed */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Department Statistics */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">Department Attendance</h2>
                <div className="space-y-3">
                  {summary?.department_stats?.map((dept) => (
                    <div key={dept.department_id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-300 font-medium">{dept.department_name}</span>
                        <span className="text-slate-400">
                          {dept.present}/{dept.total_employees} ({dept.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${dept.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Punch Audit Feed */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">Recent Punches (Today)</h2>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {summary?.recent_punches?.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500">No punch records recorded yet today.</div>
                  ) : (
                    summary?.recent_punches?.map((punch) => (
                      <div
                        key={punch.id}
                        className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-7 h-7 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                            {punch.employee_name?.charAt(0) || "E"}
                          </div>
                          <div>
                            <div className="font-medium text-slate-200">{punch.employee_name}</div>
                            <div className="text-[10px] text-slate-400">
                              {punch.employee_code} · {punch.department_name}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              punch.punch_type === "CHECK_IN"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : punch.punch_type === "CHECK_OUT"
                                ? "bg-amber-500/20 text-amber-400"
                                : "bg-blue-500/20 text-blue-400"
                            }`}
                          >
                            {punch.punch_type}
                          </span>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {new Date(punch.punch_time).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: AI ATTENDANCE KIOSK ================= */}
        {activeTab === "kiosk" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Camera Viewport */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Camera className="w-5 h-5 text-blue-500" />
                    AI Face Recognition Kiosk Terminal
                  </h2>
                  <p className="text-xs text-slate-400">Continuous video stream with multi-factor anti-spoofing</p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setAudioFeedbackEnabled(!audioFeedbackEnabled)}
                    className={`p-2 rounded-lg border text-xs flex items-center gap-1 ${
                      audioFeedbackEnabled
                        ? "bg-blue-600/20 border-blue-500 text-blue-400"
                        : "bg-slate-800 border-slate-700 text-slate-500"
                    }`}
                    title="Toggle Audio Feedback"
                  >
                    <Volume2 className="w-4 h-4" />
                  </button>

                  <select
                    value={attendanceMode}
                    onChange={(e) => setAttendanceMode(e.target.value)}
                    className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="AUTO">Auto Mode (First-in / Last-out)</option>
                    <option value="CHECK_IN">Force Check-In</option>
                    <option value="CHECK_OUT">Force Check-Out</option>
                  </select>

                  <button
                    onClick={() => setIsKioskRunning(!isKioskRunning)}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                      isKioskRunning
                        ? "bg-rose-600 hover:bg-rose-500 text-white"
                        : "bg-emerald-600 hover:bg-emerald-500 text-white"
                    }`}
                  >
                    {isKioskRunning ? "Stop Kiosk" : "Start Kiosk"}
                  </button>
                </div>
              </div>

              {/* Video Surface Container */}
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                <video
                  ref={kioskVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform scale-x-[-1] ${!isKioskRunning ? "hidden" : ""}`}
                />
                <canvas ref={kioskCanvasRef} className="hidden" />

                {!isKioskRunning && (
                  <div className="text-center p-8 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-600">
                      <Camera className="w-8 h-8" />
                    </div>
                    <p className="text-sm text-slate-400">Kiosk terminal camera is paused.</p>
                    <button
                      onClick={() => setIsKioskRunning(true)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow-lg"
                    >
                      Activate Camera Stream
                    </button>
                  </div>
                )}

                {/* HUD Targeting Reticle */}
                {isKioskRunning && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-80 border-2 border-dashed border-blue-500/60 rounded-3xl relative">
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-blue-600/90 text-white text-[10px] font-bold rounded-full tracking-wide">
                        FACE TARGET
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Real-time Recognition Feedback Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-emerald-400" /> Live Recognition Feedback
              </h3>

              {latestRecognition ? (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-xl border ${
                      latestRecognition.is_matched
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                        : latestRecognition.is_live === false
                        ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                        : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                    }`}
                  >
                    <div className="flex items-center space-x-2 font-bold text-sm">
                      {latestRecognition.is_matched ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-emerald-400" />
                          <span>Matched: {latestRecognition.employee_name}</span>
                        </>
                      ) : latestRecognition.is_live === false ? (
                        <>
                          <AlertCircle className="w-5 h-5 text-rose-400" />
                          <span>Rejected: Presentation Attack Suspected</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                          <span>Unknown / Unregistered Individual</span>
                        </>
                      )}
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Match Confidence:</span>{" "}
                        <span className="font-mono text-white">
                          {(latestRecognition.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Liveness Score:</span>{" "}
                        <span className="font-mono text-white">
                          {(latestRecognition.liveness_score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {latestRecognition.attendance_event && (
                      <div className="mt-3 p-2.5 rounded bg-slate-950/80 border border-slate-800 text-xs text-slate-200">
                        <div className="font-semibold text-blue-400">
                          {latestRecognition.attendance_event.punch_type} CONFIRMED
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {latestRecognition.attendance_event.message}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-xs text-slate-500">
                  Stand inside the targeting reticle to log attendance.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 3: FACE ENROLLMENT STUDIO ================= */}
        {activeTab === "enroll" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-blue-500" />
                Biometric Enrollment
              </h2>
              <p className="text-xs text-slate-400">
                Capture 3 distinct facial samples for mathematical embedding generation.
              </p>

              <div>
                <label className="text-xs text-slate-300 font-semibold mb-1 block">Select Employee</label>
                <select
                  value={selectedEmpId}
                  onChange={(e) => setSelectedEmpId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200"
                >
                  <option value="">-- Choose Employee --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.full_name} ({emp.employee_code}) - {emp.enrollment_status}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quality Checklist */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="text-xs font-semibold text-slate-300">MediaPipe Quality Analysis:</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Face Detected:</span>
                    <span className={enrollQuality ? "text-emerald-400" : "text-rose-400"}>
                      {enrollQuality ? "Yes" : "No"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Sharpness / Blur:</span>
                    <span className={enrollQuality?.is_sharp ? "text-emerald-400" : "text-amber-400"}>
                      {enrollQuality?.is_sharp ? "Sharp" : "Blurry"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400">Head Alignment:</span>
                    <span className={enrollQuality?.is_facing_camera ? "text-emerald-400" : "text-amber-400"}>
                      {enrollQuality?.is_facing_camera ? "Good" : "Tilted"}
                    </span>
                  </div>
                </div>
              </div>

              <button
                disabled={isCapturingSamples || !selectedEmpId}
                onClick={startEnrollmentCapture}
                className="w-full py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition shadow"
              >
                {isCapturingSamples ? "Capturing Samples..." : "Begin Guided 3-Sample Capture"}
              </button>

              {enrollStatus && (
                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-xs text-blue-300">
                  {enrollStatus}
                </div>
              )}
            </div>

            {/* Enrollment Video Viewport */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                <video
                  ref={enrollVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover transform scale-x-[-1]"
                />
                <canvas ref={enrollCanvasRef} className="hidden" />
              </div>

              {/* Sample Snapshots */}
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className="aspect-square bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center relative"
                  >
                    {enrollSamples[idx] ? (
                      <img src={enrollSamples[idx]} alt={`Sample ${idx + 1}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-[11px] text-slate-600 font-medium">Sample {idx + 1}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 4: EMPLOYEE DIRECTORY ================= */}
        {activeTab === "employees" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Employee Directory</h1>
                <p className="text-xs text-slate-400">Manage workforce profiles and shift assignments</p>
              </div>
              <button
                onClick={() => setShowAddEmpModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Add Employee
              </button>
            </div>

            {/* Search Input */}
            <div className="relative max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, code or email..."
                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200"
              />
            </div>

            {/* Employees Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Designation</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Biometrics</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">{emp.full_name}</td>
                      <td className="p-3 text-slate-400 font-mono">{emp.employee_code}</td>
                      <td className="p-3 text-slate-300">{emp.department?.name || "—"}</td>
                      <td className="p-3 text-slate-300">{emp.designation || "—"}</td>
                      <td className="p-3 text-slate-300">{emp.default_shift?.name || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            emp.enrollment_status === "ENROLLED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {emp.enrollment_status}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            emp.status === "ACTIVE"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-rose-500/20 text-rose-400"
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 5: SHIFTS & SCHEDULES ================= */}
        {activeTab === "shifts" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Shifts & Working Schedules</h1>
                <p className="text-xs text-slate-400">Configure standard, evening, and overnight shifts with grace periods</p>
              </div>
              <button
                onClick={() => setShowAddShiftModal(true)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Add Shift
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shiftsList.map((shift) => (
                <div key={shift.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-white text-sm">{shift.name}</h3>
                      <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                        {shift.code}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteShift(shift.id)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                      title="Delete Shift"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Scheduled Time:</span>
                      <span className="font-mono text-white">
                        {shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Grace Period:</span>
                      <span>{shift.grace_period_mins} mins</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Break Duration:</span>
                      <span>{shift.break_duration_mins} mins</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Shift Type:</span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          shift.is_overnight ? "bg-purple-500/20 text-purple-400" : "bg-emerald-500/20 text-emerald-400"
                        }`}
                      >
                        {shift.is_overnight ? "Overnight Shift" : "Day Shift"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= TAB 6: LEAVES & HOLIDAYS ================= */}
        {activeTab === "leaves" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Leave Applications & Holiday Calendar</h1>
                <p className="text-xs text-slate-400">Approve leaves and manage official company holidays</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowAddHolidayModal(true)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1 border border-slate-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Holiday
                </button>
                <button
                  onClick={() => setShowApplyLeaveModal(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1 shadow"
                >
                  <Plus className="w-3.5 h-3.5" /> Apply for Leave
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Leave Applications */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-blue-500" /> Pending & Approved Leave Requests
                </h2>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {leavesList.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-500">No leave requests found.</div>
                  ) : (
                    leavesList.map((leave) => (
                      <div
                        key={leave.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-950/70 border border-slate-800 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="font-semibold text-white">{leave.employee_name} ({leave.employee_code})</div>
                          <div className="text-[11px] text-slate-400">
                            {leave.leave_type} · {leave.start_date} to {leave.end_date}
                          </div>
                          {leave.reason && <div className="text-[10px] text-slate-500 italic">&quot;{leave.reason}&quot;</div>}
                        </div>

                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              leave.status === "APPROVED"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : leave.status === "REJECTED"
                                ? "bg-rose-500/20 text-rose-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {leave.status}
                          </span>

                          {leave.status === "PENDING" && (
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => handleUpdateLeaveStatus(leave.id, "APPROVED")}
                                className="p-1 rounded bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white"
                                title="Approve"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleUpdateLeaveStatus(leave.id, "REJECTED")}
                                className="p-1 rounded bg-rose-600/20 hover:bg-rose-600 text-rose-400 hover:text-white"
                                title="Reject"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Holiday Calendar */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-purple-400" /> Official Holidays
                </h2>

                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {holidaysList.map((hol) => (
                    <div
                      key={hol.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{hol.name}</div>
                        <div className="text-[10px] text-purple-400 font-mono">{hol.holiday_date}</div>
                      </div>
                      <button
                        onClick={() => handleDeleteHoliday(hol.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 7: REPORTS & EXPORTS ================= */}
        {activeTab === "reports" && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-white">Monthly Attendance & Statutory Reports</h1>
                <p className="text-xs text-slate-400">
                  Compliant with Bangladesh Labour Act 2006 (Form 9 Register) and APPI data standards
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <select
                  value={reportYear}
                  onChange={(e) => setReportYear(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>

                <select
                  value={reportMonth}
                  onChange={(e) => setReportMonth(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                >
                  {[
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December"
                  ].map((m, idx) => (
                    <option key={idx + 1} value={idx + 1}>{m}</option>
                  ))}
                </select>

                <button
                  onClick={loadMonthlyReport}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold"
                >
                  Generate
                </button>

                <a
                  href={api.getExportCsvUrl(reportYear, reportMonth, reportDept)}
                  download
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
                >
                  <Download className="w-3.5 h-3.5" /> Download CSV
                </a>
              </div>
            </div>

            {/* Monthly Timesheet Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Department</th>
                    <th className="p-3">Working Days</th>
                    <th className="p-3">Present</th>
                    <th className="p-3">Late</th>
                    <th className="p-3">Absent</th>
                    <th className="p-3">Leaves</th>
                    <th className="p-3">Work (Hrs)</th>
                    <th className="p-3">Overtime</th>
                    <th className="p-3">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {monthlyReport?.summaries?.map((row) => (
                    <tr key={row.employee_id} className="hover:bg-slate-800/30">
                      <td className="p-3 font-medium text-white">{row.full_name} ({row.employee_code})</td>
                      <td className="p-3 text-slate-300">{row.department_name}</td>
                      <td className="p-3 text-slate-400 font-mono">{row.working_days}</td>
                      <td className="p-3 text-emerald-400 font-bold font-mono">{row.present_days}</td>
                      <td className="p-3 text-amber-400 font-mono">{row.late_days}</td>
                      <td className="p-3 text-rose-400 font-mono">{row.absent_days}</td>
                      <td className="p-3 text-blue-400 font-mono">{row.leave_days}</td>
                      <td className="p-3 font-mono">{row.total_work_hours}h</td>
                      <td className="p-3 font-mono text-purple-400">{row.overtime_hours}h</td>
                      <td className="p-3 font-semibold text-blue-400">{row.attendance_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ================= TAB 8: AUDIT & REGULARIZATION ================= */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Attendance Audit & Manual Overrides</h1>
                <p className="text-xs text-slate-400">
                  Immutable audit records and administrative attendance regularization
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setLogViewMode(logViewMode === "punches" ? "audit" : "punches")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                >
                  {logViewMode === "punches" ? "View Audit Log History" : "View Raw Punch Feed"}
                </button>

                <button
                  onClick={() => setShowRegularizeModal(true)}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow"
                >
                  <Plus className="w-3.5 h-3.5" /> Regularize Attendance
                </button>
              </div>
            </div>

            {logViewMode === "punches" ? (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Punch Timestamp</th>
                      <th className="p-3">Employee</th>
                      <th className="p-3">Department</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Terminal</th>
                      <th className="p-3">Confidence</th>
                      <th className="p-3">Liveness</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {attendanceLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-slate-300">
                          {new Date(log.punch_time).toLocaleString()}
                        </td>
                        <td className="p-3 font-medium text-white">
                          {log.employee_name} ({log.employee_code})
                        </td>
                        <td className="p-3 text-slate-400">{log.department_name}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              log.punch_type === "CHECK_IN"
                                ? "bg-emerald-500/20 text-emerald-400"
                                : "bg-amber-500/20 text-amber-400"
                            }`}
                          >
                            {log.punch_type}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-slate-500">{log.device_id}</td>
                        <td className="p-3 font-mono">{(log.confidence_score * 100).toFixed(1)}%</td>
                        <td className="p-3 font-mono">{(log.liveness_score * 100).toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Audit Timestamp</th>
                      <th className="p-3">Actor / Admin</th>
                      <th className="p-3">Action</th>
                      <th className="p-3">Entity</th>
                      <th className="p-3">Reason / Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {auditLogs.map((audit) => (
                      <tr key={audit.id} className="hover:bg-slate-800/30">
                        <td className="p-3 font-mono text-slate-400">
                          {new Date(audit.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 font-semibold text-blue-400">{audit.username}</td>
                        <td className="p-3 font-mono text-xs">{audit.action}</td>
                        <td className="p-3 text-slate-300">{audit.entity_name}</td>
                        <td className="p-3 text-slate-300 italic">
                          {String(audit.new_values?.reason || "Administrative update")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ================= MODALS ================= */}

      {/* REGULARIZE MODAL */}
      {showRegularizeModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-blue-500" /> Regularize Attendance Record
            </h3>
            <p className="text-xs text-slate-400">
              Manually adjust employee check-in / check-out times with mandatory audit reason.
            </p>

            <form onSubmit={handleRegularizeSubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Employee</label>
                <select
                  required
                  value={regForm.employee_id}
                  onChange={(e) => setRegForm({ ...regForm, employee_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Date</label>
                <input
                  type="date"
                  required
                  value={regForm.attendance_date}
                  onChange={(e) => setRegForm({ ...regForm, attendance_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Check-In Time</label>
                  <input
                    type="time"
                    value={regForm.check_in_time}
                    onChange={(e) => setRegForm({ ...regForm, check_in_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Check-Out Time</label>
                  <input
                    type="time"
                    value={regForm.check_out_time}
                    onChange={(e) => setRegForm({ ...regForm, check_out_time: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reason (Required for Audit Trail)</label>
                <textarea
                  required
                  rows={2}
                  value={regForm.reason}
                  onChange={(e) => setRegForm({ ...regForm, reason: e.target.value })}
                  placeholder="e.g., Physical terminal maintenance, client deployment, or forgotten punch"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRegularizeModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Save Regularization
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD SHIFT MODAL */}
      {showAddShiftModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-500" /> Create Working Shift
            </h3>

            <form onSubmit={handleAddShift} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Shift Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Evening Roster"
                  value={newShift.name}
                  onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Shift Code (Unique)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. SHIFT-EVENING-01"
                  value={newShift.code}
                  onChange={(e) => setNewShift({ ...newShift, code: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 uppercase"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start Time</label>
                  <input
                    type="time"
                    required
                    value={newShift.start_time.slice(0, 5)}
                    onChange={(e) => setNewShift({ ...newShift, start_time: `${e.target.value}:00` })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End Time</label>
                  <input
                    type="time"
                    required
                    value={newShift.end_time.slice(0, 5)}
                    onChange={(e) => setNewShift({ ...newShift, end_time: `${e.target.value}:00` })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Grace Period (Minutes)</label>
                  <input
                    type="number"
                    value={newShift.grace_period_mins}
                    onChange={(e) => setNewShift({ ...newShift, grace_period_mins: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Break (Minutes)</label>
                  <input
                    type="number"
                    value={newShift.break_duration_mins}
                    onChange={(e) => setNewShift({ ...newShift, break_duration_mins: Number(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddShiftModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPLY LEAVE MODAL */}
      {showApplyLeaveModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" /> Apply For Leave
            </h3>

            <form onSubmit={handleApplyLeave} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Employee</label>
                <select
                  required
                  value={newLeave.employee_id}
                  onChange={(e) => setNewLeave({ ...newLeave, employee_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="">-- Select Employee --</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Leave Type</label>
                <select
                  value={newLeave.leave_type}
                  onChange={(e) => setNewLeave({ ...newLeave, leave_type: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  <option value="ANNUAL">Annual Leave</option>
                  <option value="CASUAL">Casual Leave</option>
                  <option value="SICK">Sick Leave</option>
                  <option value="UNPAID">Unpaid Leave</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
                  <input
                    type="date"
                    required
                    value={newLeave.start_date}
                    onChange={(e) => setNewLeave({ ...newLeave, start_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">End Date</label>
                  <input
                    type="date"
                    required
                    value={newLeave.end_date}
                    onChange={(e) => setNewLeave({ ...newLeave, end_date: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Reason</label>
                <textarea
                  rows={2}
                  value={newLeave.reason}
                  onChange={(e) => setNewLeave({ ...newLeave, reason: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowApplyLeaveModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD HOLIDAY MODAL */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-purple-400" /> Schedule Official Holiday
            </h3>

            <form onSubmit={handleAddHoliday} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Holiday Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Independence Day"
                  value={newHoliday.name}
                  onChange={(e) => setNewHoliday({ ...newHoliday, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Branch</label>
                <select
                  required
                  value={newHoliday.branch_id}
                  onChange={(e) => setNewHoliday({ ...newHoliday, branch_id: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                >
                  {metadata.branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Holiday Date</label>
                <input
                  type="date"
                  required
                  value={newHoliday.holiday_date}
                  onChange={(e) => setNewHoliday({ ...newHoliday, holiday_date: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="recurringCheck"
                  checked={newHoliday.is_recurring}
                  onChange={(e) => setNewHoliday({ ...newHoliday, is_recurring: e.target.checked })}
                  className="rounded bg-slate-950 border-slate-800 text-blue-600"
                />
                <label htmlFor="recurringCheck" className="text-xs text-slate-300">
                  Annual Recurring Holiday
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHolidayModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD EMPLOYEE MODAL */}
      {showAddEmpModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" /> Register Employee Profile
            </h3>

            <form onSubmit={handleAddEmployee} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">First Name</label>
                  <input
                    type="text"
                    required
                    value={newEmp.first_name}
                    onChange={(e) => setNewEmp({ ...newEmp, first_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last Name</label>
                  <input
                    type="text"
                    required
                    value={newEmp.last_name}
                    onChange={(e) => setNewEmp({ ...newEmp, last_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Employee Code</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP-1001"
                    value={newEmp.employee_code}
                    onChange={(e) => setNewEmp({ ...newEmp, employee_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Designation</label>
                  <input
                    type="text"
                    value={newEmp.designation}
                    onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Email Address</label>
                  <input
                    type="email"
                    required
                    value={newEmp.email}
                    onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Phone Number</label>
                  <input
                    type="tel"
                    value={newEmp.phone}
                    onChange={(e) => setNewEmp({ ...newEmp, phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Branch</label>
                  <select
                    value={newEmp.branch_id}
                    onChange={(e) => setNewEmp({ ...newEmp, branch_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    {metadata.branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Department</label>
                  <select
                    value={newEmp.department_id}
                    onChange={(e) => setNewEmp({ ...newEmp, department_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    {metadata.departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Default Shift</label>
                  <select
                    value={newEmp.default_shift_id}
                    onChange={(e) => setNewEmp({ ...newEmp, default_shift_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-slate-200"
                  >
                    {metadata.shifts.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Save Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-500" /> Administrator Sign In
            </h3>
            <p className="text-xs text-slate-400">
              Default credentials: <span className="text-slate-200 font-mono">admin@company.com</span> /{" "}
              <span className="text-slate-200 font-mono">admin123</span>
            </p>

            {loginError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Username or Email</label>
                <input
                  type="text"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow"
                >
                  Sign In
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
