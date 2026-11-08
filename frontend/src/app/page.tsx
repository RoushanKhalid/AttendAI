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
  Award
} from "lucide-react";
import { api, DashboardSummary, Employee } from "@/lib/api";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "kiosk" | "enroll" | "employees" | "logs">("dashboard");
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

  // Enrollment State
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [enrollSamples, setEnrollSamples] = useState<string[]>([]);
  const [enrollStatus, setEnrollStatus] = useState<string>("");
  const [enrollQuality, setEnrollQuality] = useState<any>(null);
  const [isCapturingSamples, setIsCapturingSamples] = useState<boolean>(false);

  // Kiosk / Camera State
  const [kioskActive, setKioskActive] = useState<boolean>(false);
  const [attendanceMode, setAttendanceMode] = useState<string>("AUTO");
  const [latestRecognition, setLatestRecognition] = useState<any>(null);
  const [recentPunchesFeed, setRecentPunchesFeed] = useState<any[]>([]);

  // Video & Canvas Refs
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const enrollCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Auth & Data
  useEffect(() => {
    const user = api.getUser();
    if (user) {
      setIsAuthenticated(true);
      setCurrentUser(user);
    }
    loadDashboard();
    loadEmployees();
    loadMetadata();
  }, []);

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
      const emps = await api.getEmployees(searchTerm);
      setEmployees(emps);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMetadata = async () => {
    try {
      const meta = await api.getMetadata();
      setMetadata(meta);
      if (meta.branches.length && meta.departments.length && meta.shifts.length) {
        setNewEmp((prev) => ({
          ...prev,
          branch_id: meta.branches[0].id,
          department_id: meta.departments[0].id,
          default_shift_id: meta.shifts[0].id,
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Login handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      const res = await api.login(loginEmail, loginPassword);
      setIsAuthenticated(true);
      setCurrentUser(res);
      setShowLoginModal(false);
      loadDashboard();
      loadEmployees();
    } catch (err: any) {
      setLoginError(err.message || "Invalid credentials");
    }
  };

  const handleLogout = () => {
    api.logout();
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // Start / Stop Kiosk Camera
  useEffect(() => {
    let stream: MediaStream | null = null;
    let intervalId: any = null;

    if (activeTab === "kiosk" && kioskActive) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { width: 640, height: 480 } })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play();
          }

          // Continuously capture and process frames every 800ms
          intervalId = setInterval(() => {
            captureAndRecognize();
          }, 800);
        })
        .catch((err) => {
          console.error("Webcam error:", err);
          alert("Could not access camera. Please allow camera permissions in browser.");
          setKioskActive(false);
        });
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [activeTab, kioskActive, attendanceMode]);

  const captureAndRecognize = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
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

        if (res.attendance_event && !res.attendance_event.is_duplicate) {
          setRecentPunchesFeed((prev) => [res.attendance_event, ...prev.slice(0, 9)]);
          loadDashboard(); // Refresh stats
        }
      }
    } catch (e) {
      console.error("Recognition error:", e);
    }
  };

  // Start / Stop Enrollment Camera
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

          // Check quality feedback every 1000ms
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

  // Automated 3-sample capture sequence for enrollment
  const startEnrollmentCapture = async () => {
    if (!selectedEmpId) {
      alert("Please select an employee first!");
      return;
    }
    setIsCapturingSamples(true);
    setEnrollStatus("Capturing Sample 1 of 3: Look directly at the camera...");
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
      setEnrollStatus("Processing ArcFace feature embeddings & saving vector...");
      const res = await api.enrollFace(selectedEmpId, samples);
      setEnrollStatus(`Success! ${res.message}`);
      loadEmployees();
    } catch (err: any) {
      setEnrollStatus(`Error: ${err.message || "Enrollment failed"}`);
    } finally {
      setIsCapturingSamples(false);
    }
  };

  // Handle Add Employee
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header & Navigation */}
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
                  MediaPipe + ArcFace
                </span>
              </div>
              <p className="text-xs text-slate-400">Enterprise Biometric Attendance Management</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex space-x-1 bg-slate-800/60 p-1 rounded-xl border border-slate-700/50">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === "dashboard" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab("kiosk")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "kiosk" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              <Camera className="w-4 h-4" /> Live Kiosk
            </button>
            <button
              onClick={() => setActiveTab("enroll")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "enroll" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              <UserCheck className="w-4 h-4" /> Face Enrollment
            </button>
            <button
              onClick={() => setActiveTab("employees")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "employees" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              <Users className="w-4 h-4" /> Employees
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                activeTab === "logs" ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
              }`}
            >
              <Clock className="w-4 h-4" /> Attendance Logs
            </button>
          </nav>

          {/* User Profile / Auth Action */}
          <div className="flex items-center space-x-3">
            {isAuthenticated ? (
              <div className="flex items-center space-x-3">
                <div className="text-right">
                  <div className="text-xs font-semibold text-white">{currentUser?.full_name || currentUser?.username}</div>
                  <div className="text-[11px] text-emerald-400 font-mono">Administrator</div>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <LogIn className="w-4 h-4" /> Admin Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Body Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Daily Attendance Dashboard</h1>
                <p className="text-sm text-slate-400">Real-time attendance overview & departmental compliance</p>
              </div>
              <button
                onClick={loadDashboard}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingDashboard ? "animate-spin" : ""}`} /> Refresh Stats
              </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Staff</span>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-3xl font-bold text-white mt-2">{summary?.total_employees ?? 0}</div>
                <div className="text-xs text-slate-500 mt-1">Active employee profiles</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">Present Today</span>
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-3xl font-bold text-emerald-400 mt-2">{summary?.present_today ?? 0}</div>
                <div className="text-xs text-slate-500 mt-1">Checked in successfully</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-amber-400 uppercase tracking-wider">Late Arrivals</span>
                  <Clock className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-3xl font-bold text-amber-400 mt-2">{summary?.late_today ?? 0}</div>
                <div className="text-xs text-slate-500 mt-1">Past shift grace period</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-rose-400 uppercase tracking-wider">Absent Today</span>
                  <XCircle className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-3xl font-bold text-rose-400 mt-2">{summary?.absent_today ?? 0}</div>
                <div className="text-xs text-slate-500 mt-1">Missing check-in record</div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-purple-400 uppercase tracking-wider">Attendance %</span>
                  <Activity className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-3xl font-bold text-purple-400 mt-2">
                  {summary?.attendance_percentage ?? 0}%
                </div>
                <div className="text-xs text-slate-500 mt-1">Daily organizational rate</div>
              </div>
            </div>

            {/* Department Breakdown & Live Punches Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Department Attendance Cards */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
                <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
                  <Award className="w-4 h-4 text-blue-400" /> Department Breakdown
                </h2>
                <div className="space-y-4">
                  {summary?.department_stats?.map((dept) => (
                    <div key={dept.department_id} className="p-3 bg-slate-950/60 rounded-lg border border-slate-800/80">
                      <div className="flex items-center justify-between text-sm mb-1.5">
                        <span className="font-medium text-slate-200">{dept.department_name}</span>
                        <span className="text-xs font-mono text-slate-400">
                          {dept.present} / {dept.total_employees} ({dept.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${Math.min(100, dept.percentage)}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-4 text-[11px] text-slate-400 mt-2">
                        <span className="text-emerald-400 font-medium">Present: {dept.present}</span>
                        <span className="text-amber-400 font-medium">Late: {dept.late}</span>
                        <span className="text-rose-400 font-medium">Absent: {dept.absent}</span>
                      </div>
                    </div>
                  ))}
                  {(!summary?.department_stats || summary.department_stats.length === 0) && (
                    <div className="text-center py-6 text-xs text-slate-500">No departments configured yet.</div>
                  )}
                </div>
              </div>

              {/* Real-Time Live Punch Feed */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col">
                <h2 className="text-base font-semibold text-white mb-4 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-400" /> Recent Punches
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 animate-pulse">
                    Live
                  </span>
                </h2>
                <div className="space-y-3 flex-1 overflow-y-auto max-h-[360px] pr-1">
                  {summary?.recent_punches?.map((punch) => (
                    <div
                      key={punch.id}
                      className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-200">{punch.employee_name}</div>
                        <div className="text-[11px] text-slate-500">{punch.department_name} • {punch.employee_code}</div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            punch.punch_type === "CHECK_IN"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {punch.punch_type}
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono mt-1">
                          {new Date(punch.punch_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(!summary?.recent_punches || summary.recent_punches.length === 0) && (
                    <div className="text-center py-10 text-xs text-slate-500">
                      No attendance scans recorded today yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LIVE AI ATTENDANCE KIOSK */}
        {activeTab === "kiosk" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <Camera className="w-6 h-6 text-blue-400" /> Live AI Attendance Kiosk
                </h1>
                <p className="text-sm text-slate-400">
                  Continuous webcam facial recognition terminal powered by MediaPipe and ArcFace
                </p>
              </div>

              {/* Mode Selector & Power Button */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs">
                  <span className="text-slate-400 px-2">Mode:</span>
                  <button
                    onClick={() => setAttendanceMode("AUTO")}
                    className={`px-2.5 py-1 rounded font-medium ${
                      attendanceMode === "AUTO" ? "bg-blue-600 text-white" : "text-slate-300"
                    }`}
                  >
                    Auto First-In / Last-Out
                  </button>
                  <button
                    onClick={() => setAttendanceMode("CHECK_IN")}
                    className={`px-2.5 py-1 rounded font-medium ${
                      attendanceMode === "CHECK_IN" ? "bg-blue-600 text-white" : "text-slate-300"
                    }`}
                  >
                    Check-In Only
                  </button>
                  <button
                    onClick={() => setAttendanceMode("CHECK_OUT")}
                    className={`px-2.5 py-1 rounded font-medium ${
                      attendanceMode === "CHECK_OUT" ? "bg-blue-600 text-white" : "text-slate-300"
                    }`}
                  >
                    Check-Out Only
                  </button>
                </div>

                <button
                  onClick={() => setKioskActive(!kioskActive)}
                  className={`px-4 py-2 rounded-lg font-semibold text-xs flex items-center gap-1.5 shadow-lg transition ${
                    kioskActive
                      ? "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/20"
                      : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20"
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  {kioskActive ? "Stop Camera" : "Activate Kiosk Camera"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Camera Video Viewport */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center justify-center relative overflow-hidden min-h-[440px]">
                {kioskActive ? (
                  <div className="relative w-full h-[400px] flex items-center justify-center bg-black rounded-xl overflow-hidden border border-slate-800">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* HUD Target Frame */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div className="w-64 h-80 border-2 border-dashed border-blue-400/60 rounded-3xl relative">
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                          Face Target Zone
                        </div>
                      </div>
                    </div>

                    {/* Live Processing Indicator */}
                    <div className="absolute bottom-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700/60 flex items-center gap-2 text-xs text-slate-300 font-mono">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      MediaPipe Live Stream (800ms)
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div className="text-base font-semibold text-slate-200">Kiosk Terminal Camera Offline</div>
                    <p className="text-xs text-slate-400 max-w-sm">
                      Click the &quot;Activate Kiosk Camera&quot; button above to start continuous facial detection and recognition.
                    </p>
                  </div>
                )}
              </div>

              {/* Real-time Result Card & Debounce Status */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
                <div>
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" /> Live Recognition Feedback
                  </h3>

                  {latestRecognition ? (
                    <div className="space-y-4">
                      {latestRecognition.is_matched ? (
                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                          <div className="flex items-center gap-2 text-base font-bold text-emerald-400">
                            <CheckCircle className="w-5 h-5" />
                            {latestRecognition.employee_name}
                          </div>
                          <div className="text-xs text-slate-300">
                            Employee ID: <span className="font-mono">{latestRecognition.employee_code}</span>
                          </div>
                          <div className="text-xs text-slate-300">
                            Confidence Match: <span className="font-mono font-bold">{(latestRecognition.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Liveness Verification: <span className="text-emerald-400 font-semibold">Passed (Score: {latestRecognition.liveness_score})</span>
                          </div>

                          {latestRecognition.attendance_event && (
                            <div className="mt-3 pt-2 border-t border-emerald-500/20 text-xs">
                              {latestRecognition.attendance_event.is_duplicate ? (
                                <div className="text-amber-400 flex items-center gap-1.5 font-medium">
                                  <AlertCircle className="w-4 h-4" /> Duplicate Debounced (Recorded within 60s)
                                </div>
                              ) : (
                                <div className="text-emerald-400 font-bold">
                                  ✓ {latestRecognition.attendance_event.message}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-2">
                          <div className="flex items-center gap-2 text-base font-bold text-rose-400">
                            <AlertCircle className="w-5 h-5" />
                            Access Denied: Unknown Face
                          </div>
                          <p className="text-xs text-slate-300">{latestRecognition.match_message}</p>
                          <div className="text-xs text-slate-400">
                            Highest similarity was below acceptance threshold (0.72).
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-16 text-slate-500 text-xs">
                      Awaiting face detection in video frame...
                    </div>
                  )}
                </div>

                {/* Debounce Rule Notice */}
                <div className="mt-6 p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">Debounce Rule Enforcement:</div>
                  <p>Repeated scans within 60 seconds are debounced to prevent duplicate attendance writes.</p>
                </div>

                {recentPunchesFeed.length > 0 && (
                  <div className="mt-3 p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs">
                    <div className="font-semibold text-slate-300 mb-2">Live Session Punches:</div>
                    <div className="space-y-1 text-[11px] text-slate-400">
                      {recentPunchesFeed.map((p, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{p.employee_name}</span>
                          <span className="text-emerald-400 font-mono">{p.punch_type}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: WEBCAM FACE ENROLLMENT STUDIO */}
        {activeTab === "enroll" && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                <UserCheck className="w-6 h-6 text-blue-400" /> Biometric Face Enrollment Studio
              </h1>
              <p className="text-sm text-slate-400">
                Webcam-based multi-sample enrollment with MediaPipe landmark alignment and ArcFace vector generation
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Camera Preview with Face Landmarker Guide */}
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col items-center">
                <div className="relative w-full h-[400px] bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
                  <video ref={enrollVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <canvas ref={enrollCanvasRef} className="hidden" />

                  {/* Guidance Target Box */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-64 h-80 border-2 border-emerald-400/70 rounded-3xl relative">
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded font-mono">
                        Center Face Here
                      </div>
                    </div>
                  </div>

                  {/* Real-time Quality Badge */}
                  <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs font-mono">
                    {enrollQuality ? (
                      <span className={enrollQuality.is_valid ? "text-emerald-400" : "text-amber-400"}>
                        {enrollQuality.message}
                      </span>
                    ) : (
                      <span className="text-slate-400">Initializing face detector...</span>
                    )}
                  </div>
                </div>

                {/* 3-Sample Preview Slots */}
                <div className="w-full mt-4 flex items-center justify-center gap-4">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className="w-24 h-24 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center overflow-hidden text-xs text-slate-500 relative"
                    >
                      {enrollSamples[idx] ? (
                        <img src={enrollSamples[idx]} alt={`Sample ${idx + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <span>Sample {idx + 1}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Enrollment Controls */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                    Select Employee for Enrollment
                  </h3>

                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Registered Employee</label>
                    <select
                      value={selectedEmpId}
                      onChange={(e) => setSelectedEmpId(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Choose Employee --</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name} ({emp.employee_code}) - {emp.enrollment_status}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs space-y-1.5">
                    <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                      <Shield className="w-4 h-4 text-emerald-400" /> Biometric Template Protection
                    </div>
                    <p className="text-slate-400 text-[11px]">
                      Raw face captures are used exclusively in-memory to compute a 128D/512D ArcFace feature vector.
                      The raw photos are never stored in the database.
                    </p>
                  </div>

                  {enrollStatus && (
                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300 font-mono">
                      {enrollStatus}
                    </div>
                  )}
                </div>

                <button
                  disabled={!selectedEmpId || isCapturingSamples}
                  onClick={startEnrollmentCapture}
                  className="w-full py-3 rounded-xl font-bold text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 mt-6"
                >
                  <Camera className="w-4 h-4" />
                  {isCapturingSamples ? "Capturing 3 Samples..." : "Start 3-Sample Enrollment"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EMPLOYEES DIRECTORY */}
        {activeTab === "employees" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <Users className="w-6 h-6 text-blue-400" /> Employee Directory
                </h1>
                <p className="text-sm text-slate-400">Manage employee records, shifts, and biometric enrollment</p>
              </div>
              <button
                onClick={() => setShowAddEmpModal(true)}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Add Employee
              </button>
            </div>

            {/* Filter Bar */}
            <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 p-3 rounded-xl">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, employee ID, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadEmployees()}
                className="bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none flex-1"
              />
              <button
                onClick={loadEmployees}
                className="px-3 py-1 rounded bg-slate-800 text-xs text-slate-300 hover:text-white"
              >
                Search
              </button>
            </div>

            {/* Employee Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">ID Code</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Shift</th>
                    <th className="px-5 py-3">Biometric</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-200">{emp.full_name}</div>
                        <div className="text-xs text-slate-400">{emp.email}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-300">{emp.employee_code}</td>
                      <td className="px-5 py-3.5 text-slate-300 text-xs">{emp.department?.name || "-"}</td>
                      <td className="px-5 py-3.5 text-slate-300 text-xs">{emp.default_shift?.name || "-"}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            emp.enrollment_status === "ENROLLED"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-amber-500/20 text-amber-400"
                          }`}
                        >
                          {emp.enrollment_status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            emp.status === "ACTIVE"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-slate-700 text-slate-400"
                          }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedEmpId(emp.id);
                            setActiveTab("enroll");
                          }}
                          className="px-2.5 py-1 rounded bg-blue-600/30 hover:bg-blue-600 text-blue-300 hover:text-white text-xs transition"
                        >
                          {emp.enrollment_status === "ENROLLED" ? "Re-Enroll" : "Enroll"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-xs text-slate-500">
                        No employees found. Click &quot;Add Employee&quot; to register the first team member.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: ATTENDANCE LOGS & HISTORY */}
        {activeTab === "logs" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  <Clock className="w-6 h-6 text-blue-400" /> Chronological Attendance Logs
                </h1>
                <p className="text-sm text-slate-400">Raw physical timestamps and device audit trail</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950/70 border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Timestamp</th>
                    <th className="px-5 py-3">Employee</th>
                    <th className="px-5 py-3">Department</th>
                    <th className="px-5 py-3">Punch Type</th>
                    <th className="px-5 py-3">Device ID</th>
                    <th className="px-5 py-3">Match Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {summary?.recent_punches?.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-300">
                        {new Date(log.punch_time).toLocaleString()}
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-slate-200">
                        {log.employee_name} <span className="font-mono text-xs text-slate-400">({log.employee_code})</span>
                      </td>
                      <td className="px-5 py-3.5 text-slate-300 text-xs">{log.department_name}</td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            log.punch_type === "CHECK_IN"
                              ? "bg-emerald-500/20 text-emerald-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {log.punch_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">{log.device_id}</td>
                      <td className="px-5 py-3.5 text-xs font-mono text-emerald-400 font-bold">
                        {(log.confidence_score * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {(!summary?.recent_punches || summary.recent_punches.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-xs text-slate-500">
                        No physical scans logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: ADD EMPLOYEE */}
      {showAddEmpModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-400" /> Register New Employee
            </h2>

            <form onSubmit={handleAddEmployee} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Employee ID *</label>
                  <input
                    required
                    placeholder="e.g. EMP-105"
                    value={newEmp.employee_code}
                    onChange={(e) => setNewEmp({ ...newEmp, employee_code: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Designation</label>
                  <input
                    placeholder="e.g. Lead Engineer"
                    value={newEmp.designation}
                    onChange={(e) => setNewEmp({ ...newEmp, designation: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">First Name *</label>
                  <input
                    required
                    value={newEmp.first_name}
                    onChange={(e) => setNewEmp({ ...newEmp, first_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Last Name *</label>
                  <input
                    required
                    value={newEmp.last_name}
                    onChange={(e) => setNewEmp({ ...newEmp, last_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email Address *</label>
                <input
                  type="email"
                  required
                  value={newEmp.email}
                  onChange={(e) => setNewEmp({ ...newEmp, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Department *</label>
                  <select
                    value={newEmp.department_id}
                    onChange={(e) => setNewEmp({ ...newEmp, department_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    {metadata.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Shift *</label>
                  <select
                    value={newEmp.default_shift_id}
                    onChange={(e) => setNewEmp({ ...newEmp, default_shift_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                  >
                    {metadata.shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddEmpModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
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

      {/* MODAL: ADMIN LOGIN */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-white font-bold text-lg">
              <Shield className="w-5 h-5 text-blue-500" /> Administrator Sign In
            </div>
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Password</label>
                <input
                  type="password"
                  required
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200"
                />
              </div>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium"
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
