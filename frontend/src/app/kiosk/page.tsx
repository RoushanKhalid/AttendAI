"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  AlertCircle,
  Clock,
  LogIn,
} from "lucide-react";
import { api, Department, Shift } from "@/lib/api";
import { useAuth } from "@/components/providers/AuthProvider";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Input, Select } from "@/components/ui/FormControls";
import { SlideOverDrawer } from "@/components/ui/Modal";
import { QuickRegisterModal } from "@/components/biometric/QuickRegisterModal";
import { cn, formatDurationMins, formatTime, getInitials } from "@/lib/utils";

function playKioskChime(success: boolean) {
  if (typeof window === "undefined") return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (success) {
      osc.frequency.setValueAtTime(587.33, ctx.currentTime);
      osc.frequency.setValueAtTime(880, ctx.currentTime + 0.14);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.38);
    } else {
      osc.frequency.setValueAtTime(220, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    // ignore autoplay restriction
  }
}

function speakGreeting(text: string) {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.0;
      u.pitch = 1.02;
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  }
}

interface KioskConfirmation {
  status: "success" | "duplicate" | "unrecognized" | "lighting";
  employeeName?: string;
  employeeCode?: string;
  punchType?: string;
  dailyStatus?: string;
  message: string;
  detail?: string;
  photoDataUrl?: string;
  recordedAt: string;
}

export default function KioskPage() {
  const { isAuthenticated } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const processingRef = useRef(false);

  const [nowClock, setNowClock] = useState<Date>(new Date());
  const [cameraActive, setCameraActive] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Kiosk configuration
  const [configOpen, setConfigOpen] = useState(false);
  const [attendanceMode, setAttendanceMode] = useState("AUTO");
  const [relaxedLighting, setRelaxedLighting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [terminalId, setTerminalId] = useState("main_entrance_kiosk");
  const [welcomeMessage, setWelcomeMessage] = useState("Look at the camera to record your attendance");
  const [allowQuickRegister, setAllowQuickRegister] = useState(true);

  // Live recognition state
  const [facePresent, setFacePresent] = useState(false);
  const [confirmation, setConfirmation] = useState<KioskConfirmation | null>(null);
  const [recentActivity, setRecentActivity] = useState<
    Array<{ id: string; name: string; code: string; punchType: string; time: string }>
  >([]);

  // Quick register support
  const [quickRegOpen, setQuickRegOpen] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    const clockTimer = setInterval(() => setNowClock(new Date()), 1000);
    return () => {
      isMountedRef.current = false;
      clearInterval(clockTimer);
    };
  }, []);

  // Load persisted kiosk preferences & metadata
  useEffect(() => {
    api
      .getPreferences()
      .then((prefs) => {
        if (!isMountedRef.current) return;
        setTerminalId(prefs.kiosk.default_terminal_id || "main_entrance_kiosk");
        setAttendanceMode(prefs.kiosk.default_attendance_mode || "AUTO");
        setRelaxedLighting(Boolean(prefs.kiosk.relaxed_lighting_mode));
        setAudioEnabled(Boolean(prefs.kiosk.audio_feedback_enabled));
        setVoiceEnabled(Boolean(prefs.kiosk.voice_greeting_enabled));
        setAllowQuickRegister(prefs.kiosk.allow_quick_register ?? true);
        setWelcomeMessage(prefs.kiosk.welcome_message || "Look at the camera to record your attendance");
      })
      .catch(() => {});

    api
      .getMetadata()
      .then((m) => {
        if (!isMountedRef.current) return;
        setDepartments(m.departments);
        setShifts(m.shifts);
      })
      .catch(() => {});
  }, []);

  // Auto-clear confirmation card after 6 seconds
  useEffect(() => {
    if (!confirmation) return;
    const t = setTimeout(() => {
      setConfirmation(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [confirmation]);

  // Listen to fullscreen state
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement && containerRef.current) {
        await containerRef.current.requestFullscreen();
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // ignore if blocked
    }
  };

  const processFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || processingRef.current || quickRegOpen) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v.videoWidth === 0 || v.videoHeight === 0) return;

    processingRef.current = true;
    try {
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, c.width, c.height);
      const frameBase64 = c.toDataURL("image/jpeg", 0.85);

      const res = await api.recognizeAndRecord(frameBase64, attendanceMode, terminalId, relaxedLighting);
      if (!isMountedRef.current) return;

      if (!res.detections || res.detections.length === 0) {
        setFacePresent(false);
        return;
      }

      setFacePresent(true);
      const top = res.detections[0];

      if (top.is_matched && res.attendance_event) {
        const evt = res.attendance_event;
        const punchLabel = evt.punch_type === "CHECK_OUT" ? "Checked Out" : "Checked In";

        setConfirmation({
          status: evt.is_duplicate ? "duplicate" : "success",
          employeeName: evt.employee_name,
          employeeCode: evt.employee_code,
          punchType: evt.punch_type,
          dailyStatus: evt.daily_status,
          message: evt.is_duplicate
            ? `Already recorded, ${evt.employee_name}`
            : `Welcome, ${evt.employee_name}!`,
          detail: evt.is_duplicate
            ? "Your attendance was already logged in the last minute."
            : evt.punch_type === "CHECK_OUT"
            ? `${punchLabel} at ${formatTime(evt.punch_time)} · Total worked: ${formatDurationMins(evt.total_work_minutes)}`
            : `${punchLabel} at ${formatTime(evt.punch_time)}`,
          photoDataUrl: frameBase64,
          recordedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });

        if (!evt.is_duplicate) {
          setRecentActivity((prev) => [
            {
              id: `${evt.employee_id}-${Date.now()}`,
              name: evt.employee_name,
              code: evt.employee_code,
              punchType: evt.punch_type,
              time: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
            },
            ...prev.slice(0, 6),
          ]);
          if (audioEnabled) {
            playKioskChime(true);
            if (voiceEnabled) {
              speakGreeting(
                evt.punch_type === "CHECK_OUT"
                  ? `Goodbye, ${evt.employee_name}. Check out recorded.`
                  : `Welcome, ${evt.employee_name}. Check in recorded.`
              );
            }
          }
        }
      } else if (top.is_live === false) {
        setConfirmation({
          status: "lighting",
          message: "Please look directly at the camera",
          detail: "Avoid strong backlight or screen glare and hold steady for a moment.",
          recordedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
      } else if (!top.is_matched) {
        setConfirmation({
          status: "unrecognized",
          message: "Face not recognized",
          detail: "Try moving closer in clear lighting, or ask HR to complete your face setup.",
          recordedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
        });
      }
    } catch {
      // Keep running quietly on transient network hiccups
    } finally {
      processingRef.current = false;
    }
  }, [attendanceMode, terminalId, relaxedLighting, audioEnabled, voiceEnabled, quickRegOpen]);

  // Camera lifecycle + sequential polling
  useEffect(() => {
    if (!cameraActive) {
      setCameraReady(false);
      setFacePresent(false);
      return;
    }

    let stream: MediaStream | null = null;
    let active = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    setCameraError("");

    const scheduleNext = async () => {
      if (!active) return;
      await processFrame();
      if (active) {
        timerId = setTimeout(scheduleNext, 750);
      }
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } })
      .then((s) => {
        if (!active) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
          setCameraReady(true);
        }
        timerId = setTimeout(scheduleNext, 700);
      })
      .catch(() => {
        setCameraError("Camera access is blocked or unavailable. Please enable webcam permissions and retry.");
        setCameraActive(false);
      });

    return () => {
      active = false;
      if (timerId) clearTimeout(timerId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [cameraActive, processFrame]);

  const modeLabel =
    attendanceMode === "CHECK_IN"
      ? "Check-In Only"
      : attendanceMode === "CHECK_OUT"
      ? "Check-Out Only"
      : "Auto Check-In / Out";

  const frameBorderColor =
    confirmation?.status === "success" || confirmation?.status === "duplicate"
      ? "border-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.22)]"
      : confirmation?.status === "lighting" || confirmation?.status === "unrecognized"
      ? "border-amber-400 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]"
      : facePresent
      ? "border-blue-400 shadow-[0_0_0_4px_rgba(59,130,246,0.18)]"
      : "border-white/60";

  return (
    <div ref={containerRef} className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Clean Kiosk Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {isAuthenticated ? (
            <Link href="/">
              <Button variant="outline" size="sm" icon={<ArrowLeft className="w-3.5 h-3.5" />}>
                Dashboard
              </Button>
            </Link>
          ) : (
            <Link href="/login">
              <Button variant="outline" size="sm" icon={<LogIn className="w-3.5 h-3.5" />}>
                Staff Sign In
              </Button>
            </Link>
          )}

          <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 leading-tight">Attendance Kiosk</div>
              <div className="text-[11px] text-slate-500">{modeLabel}</div>
            </div>
          </div>
        </div>

        {/* Live Clock */}
        <div className="hidden md:flex flex-col items-center">
          <div className="text-lg font-semibold text-slate-900 tabular-nums leading-tight">
            {nowClock.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
          </div>
          <div className="text-[11px] text-slate-500">
            {nowClock.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAudioEnabled((v) => !v)}
            icon={audioEnabled ? <Volume2 className="w-3.5 h-3.5 text-blue-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            aria-label={audioEnabled ? "Mute audio feedback" : "Enable audio feedback"}
          >
            <span className="hidden sm:inline">{audioEnabled ? "Sound On" : "Muted"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCameraActive((v) => !v)}
            icon={cameraActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">{cameraActive ? "Pause" : "Resume"}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            icon={isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            aria-label="Toggle fullscreen"
          />

          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfigOpen(true)}
            icon={<Settings2 className="w-3.5 h-3.5" />}
          >
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>
      </header>

      {/* Main Kiosk Workspace */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Camera Preview Column */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-sm space-y-3">
            <div className="relative aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center">
              {cameraError ? (
                <div className="p-8 text-center max-w-sm space-y-3">
                  <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <p className="text-sm text-slate-200">{cameraError}</p>
                  <Button onClick={() => setCameraActive(true)} icon={<Camera className="w-4 h-4" />}>
                    Enable Camera
                  </Button>
                </div>
              ) : !cameraActive ? (
                <div className="p-8 text-center space-y-3">
                  <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Camera className="w-7 h-7" />
                  </div>
                  <p className="text-sm text-slate-300">Kiosk camera is paused.</p>
                  <Button onClick={() => setCameraActive(true)} icon={<Play className="w-4 h-4" />}>
                    Resume Camera
                  </Button>
                </div>
              ) : (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transform scale-x-[-1]"
                  />
                  <canvas ref={canvasRef} className="hidden" />

                  {/* Top Status Pill */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900/75 backdrop-blur text-white text-xs font-medium">
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full",
                          cameraReady ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                        )}
                      />
                      {cameraReady ? (facePresent ? "Face Detected" : "Ready to Scan") : "Starting Camera…"}
                    </span>

                    <span className="px-3 py-1 rounded-full bg-slate-900/75 backdrop-blur text-white text-xs font-medium">
                      {modeLabel}
                    </span>
                  </div>

                  {/* Calm Face Guide Oval */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div
                      className={cn(
                        "w-52 h-64 sm:w-64 sm:h-80 rounded-[50%] border-2 border-dashed transition-all duration-300",
                        frameBorderColor
                      )}
                    />
                  </div>

                  {/* Simple Positioning Guidance */}
                  <div className="absolute bottom-4 inset-x-4 flex justify-center pointer-events-none">
                    <div className="px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur text-white text-xs sm:text-sm font-medium text-center shadow-lg">
                      {confirmation?.status === "success"
                        ? `Recorded for ${confirmation.employeeName}`
                        : confirmation?.status === "duplicate"
                        ? `${confirmation.employeeName} — Already recorded`
                        : confirmation?.status === "lighting"
                        ? "Look directly at the camera with even lighting"
                        : confirmation?.status === "unrecognized"
                        ? "Face not recognized — move closer or check lighting"
                        : facePresent
                        ? "Hold steady…"
                        : welcomeMessage}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Bottom Helper Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-slate-500">
              <span>Stand 50–80 cm from the camera and remove hats or masks.</span>
              {allowQuickRegister && (
                <button
                  type="button"
                  onClick={() => setQuickRegOpen(true)}
                  className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  New employee? Quick register
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status & Confirmation Column */}
        <div className="lg:col-span-4 space-y-4">
          {/* Active Recognition Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
              Recognition Status
            </div>

            {!confirmation ? (
              <div className="py-8 text-center space-y-2.5">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                  <Camera className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-slate-900">Ready for Check-In</div>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Step in front of the camera and look straight ahead. Attendance is recorded automatically.
                </p>
              </div>
            ) : confirmation.status === "success" || confirmation.status === "duplicate" ? (
              <div className="space-y-4">
                <div
                  className={cn(
                    "p-4 rounded-xl border space-y-3",
                    confirmation.status === "success"
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-blue-50 border-blue-200"
                  )}
                >
                  <div className="flex items-center gap-3">
                    {confirmation.photoDataUrl ? (
                      <img
                        src={confirmation.photoDataUrl}
                        alt={confirmation.employeeName || "Employee"}
                        className="w-14 h-14 rounded-full object-cover border-2 border-white shadow-sm transform scale-x-[-1] shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-full bg-emerald-600 text-white text-base font-semibold flex items-center justify-center shrink-0">
                        {getInitials(confirmation.employeeName)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>
                          {confirmation.status === "success" ? "Attendance Recorded" : "Already Logged"}
                        </span>
                      </div>
                      <div className="text-base font-semibold text-slate-900 truncate mt-0.5">
                        {confirmation.employeeName}
                      </div>
                      <div className="text-xs text-slate-600 font-mono">{confirmation.employeeCode}</div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-black/5 flex items-center justify-between gap-2">
                    <StatusBadge status={confirmation.punchType} />
                    <span className="text-xs font-medium text-slate-700 tabular-nums">
                      {confirmation.recordedAt}
                    </span>
                  </div>

                  {confirmation.detail && (
                    <p className="text-xs text-slate-700 leading-relaxed">{confirmation.detail}</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{confirmation.message}</div>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">{confirmation.detail}</p>
                  </div>
                </div>
                {allowQuickRegister && confirmation.status === "unrecognized" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setQuickRegOpen(true)}
                    icon={<Sparkles className="w-3.5 h-3.5" />}
                  >
                    Register New Employee Face
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Recent Activity Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Session Check-Ins
              </span>
              <span className="text-xs text-slate-500 tabular-nums">{recentActivity.length}</span>
            </div>

            {recentActivity.length === 0 ? (
              <div className="py-5 text-center text-xs text-slate-500 flex flex-col items-center gap-1.5">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>No punches on this terminal yet.</span>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {recentActivity.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{item.name}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{item.code}</div>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <StatusBadge status={item.punchType} />
                      <div className="text-[11px] text-slate-500 tabular-nums">{item.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Kiosk Configuration Drawer */}
      <SlideOverDrawer
        open={configOpen}
        onClose={() => setConfigOpen(false)}
        title="Kiosk Configuration"
        subtitle="Adjust terminal behavior for this check-in station."
        footer={<Button onClick={() => setConfigOpen(false)}>Done</Button>}
      >
        <div className="space-y-4">
          <Field label="Check-In Mode">
            <Select value={attendanceMode} onChange={(e) => setAttendanceMode(e.target.value)}>
              <option value="AUTO">Automatic (First Check-In / Last Check-Out)</option>
              <option value="CHECK_IN">Check-In Only</option>
              <option value="CHECK_OUT">Check-Out Only</option>
            </Select>
          </Field>

          <Field
            label="Lighting Tolerance"
            hint="Use Relaxed Lighting if bright windows or screen reflections cause verification retries."
          >
            <Select
              value={relaxedLighting ? "relaxed" : "standard"}
              onChange={(e) => setRelaxedLighting(e.target.value === "relaxed")}
            >
              <option value="standard">Standard Security Verification (Recommended)</option>
              <option value="relaxed">Relaxed Lighting Mode (High-Glare / Testing)</option>
            </Select>
          </Field>

          <Field label="Terminal Name">
            <Input value={terminalId} onChange={(e) => setTerminalId(e.target.value)} />
          </Field>

          <Field label="On-Screen Greeting Prompt">
            <Input value={welcomeMessage} onChange={(e) => setWelcomeMessage(e.target.value)} />
          </Field>

          <div className="pt-2 space-y-2.5 border-t border-slate-100">
            <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
              <span>Audio Chime Feedback</span>
              <input
                type="checkbox"
                checked={audioEnabled}
                onChange={(e) => setAudioEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </label>

            <label className="flex items-center justify-between text-sm text-slate-700 cursor-pointer">
              <span>Spoken Welcome Greeting</span>
              <input
                type="checkbox"
                checked={voiceEnabled}
                onChange={(e) => setVoiceEnabled(e.target.checked)}
                disabled={!audioEnabled}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
            </label>
          </div>
        </div>
      </SlideOverDrawer>

      <QuickRegisterModal
        open={quickRegOpen}
        onClose={() => setQuickRegOpen(false)}
        onSuccess={() => {
          setConfirmation({
            status: "success",
            message: "Registration complete!",
            detail: "Stand in front of the camera now to record your attendance.",
            recordedAt: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
          });
        }}
        departments={departments}
        shifts={shifts}
      />
    </div>
  );
}
