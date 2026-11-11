"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CheckCircle2, AlertCircle, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { api, Employee } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

const CAPTURE_STEPS = [
  { title: "Look Straight", instruction: "Look directly at the camera lens with a neutral expression." },
  { title: "Slight Left", instruction: "Turn your head slightly to the left (about 10 degrees)." },
  { title: "Slight Right", instruction: "Turn your head slightly to the right (about 10 degrees)." },
];

export function FaceSetupModal({
  open,
  employee,
  onClose,
  onCompleted,
}: {
  open: boolean;
  employee: Employee | null;
  onClose: () => void;
  onCompleted?: () => void;
}) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraError, setCameraError] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [quality, setQuality] = useState<{
    faceDetected: boolean;
    sharp: boolean;
    centered: boolean;
    goodLighting: boolean;
    guidance: string;
  }>({
    faceDetected: false,
    sharp: false,
    centered: false,
    goodLighting: false,
    guidance: "Position your face inside the frame",
  });

  const [samples, setSamples] = useState<string[]>([]);
  const [capturing, setCapturing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [stepPrompt, setStepPrompt] = useState("");

  useEffect(() => {
    if (!open) {
      setSamples([]);
      setCapturing(false);
      setSubmitting(false);
      setStepPrompt("");
      setCameraError("");
      setCameraReady(false);
      return;
    }

    let stream: MediaStream | null = null;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const checkFrame = async () => {
      if (!active || !videoRef.current || !canvasRef.current) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v.videoWidth > 0 && v.videoHeight > 0) {
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.drawImage(v, 0, 0, c.width, c.height);
          const frame = c.toDataURL("image/jpeg", 0.78);
          try {
            const res = await api.checkFaceQuality(frame);
            if (!active) return;
            if (res.faces && res.faces.length > 0) {
              const f = res.faces[0];
              const blur = f.blur_score ?? 0;
              const bright = f.brightness ?? 100;
              const yaw = Math.abs(f.yaw ?? 0);
              const pitch = Math.abs(f.pitch ?? 0);
              setQuality({
                faceDetected: true,
                sharp: blur >= 40,
                centered: yaw <= 20 && pitch <= 18,
                goodLighting: bright >= 40 && bright <= 230,
                guidance: f.is_valid
                  ? "Great! Hold steady and start capture."
                  : translateQualityGuidance(f.message),
              });
            } else {
              setQuality({
                faceDetected: false,
                sharp: false,
                centered: false,
                goodLighting: false,
                guidance: "No face detected — move into the frame.",
              });
            }
          } catch {
            // keep polling quietly
          }
        }
      }
      if (active) {
        timeoutId = setTimeout(checkFrame, 900);
      }
    };

    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" } })
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
        timeoutId = setTimeout(checkFrame, 600);
      })
      .catch(() => {
        setCameraError("Unable to access webcam. Please allow camera permission in your browser.");
      });

    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const snapPhoto = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v.videoWidth === 0) return null;
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  };

  const runGuidedCapture = async () => {
    if (!employee) return;
    setCapturing(true);
    setSamples([]);
    const captured: string[] = [];

    for (let i = 0; i < 3; i++) {
      setStepPrompt(`Photo ${i + 1} of 3: ${CAPTURE_STEPS[i].instruction}`);
      await new Promise((r) => setTimeout(r, 1100));
      const snap = snapPhoto();
      if (snap) {
        captured.push(snap);
        setSamples([...captured]);
      }
    }
    setCapturing(false);
    setStepPrompt("All 3 photos captured. Review below or save now.");
  };

  const handleManualCapture = () => {
    const snap = snapPhoto();
    if (!snap) return;
    if (samples.length < 3) {
      setSamples((prev) => [...prev, snap]);
    } else {
      setSamples((prev) => [...prev.slice(0, 2), snap]);
    }
  };

  const handleSave = async () => {
    if (!employee || samples.length === 0) return;
    setSubmitting(true);
    try {
      await api.enrollFace(employee.id, samples);
      toast.success("Face setup complete", `${employee.full_name} is ready for kiosk check-in.`);
      onCompleted?.();
      onClose();
    } catch (err: unknown) {
      toast.error(
        "Face setup unsuccessful",
        err instanceof Error ? err.message : "Ensure good lighting and look directly at the camera."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Face Setup — ${employee?.full_name || "Employee"}`}
      subtitle="Capture 3 clear photos so the live kiosk can recognize this employee instantly."
      maxWidth="max-w-3xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={capturing || submitting}>
            Cancel
          </Button>
          {samples.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setSamples([]);
                setStepPrompt("");
              }}
              disabled={capturing || submitting}
              icon={<RefreshCw className="w-3.5 h-3.5" />}
            >
              Retake Photos
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={samples.length === 0 || capturing}
            loading={submitting}
            icon={<CheckCircle2 className="w-4 h-4" />}
          >
            Save Face Profile
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
        {/* Left: Live Camera */}
        <div className="md:col-span-7 space-y-3">
          <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
            {cameraError ? (
              <div className="p-6 text-center text-white space-y-2">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-xs text-slate-200">{cameraError}</p>
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
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={cn(
                      "w-44 h-56 rounded-[50%] border-2 border-dashed transition-colors",
                      quality.faceDetected && quality.centered && quality.sharp
                        ? "border-emerald-400"
                        : "border-white/70"
                    )}
                  />
                </div>
                <div className="absolute bottom-3 inset-x-3 flex justify-center pointer-events-none">
                  <div className="px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur text-white text-xs font-medium text-center">
                    {stepPrompt || quality.guidance}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Capture Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="flex-1"
              onClick={runGuidedCapture}
              disabled={!cameraReady || capturing || submitting}
              loading={capturing}
              icon={<Sparkles className="w-4 h-4" />}
            >
              {capturing ? "Capturing 3 Photos…" : "Start Guided 3-Photo Capture"}
            </Button>
            <Button
              variant="outline"
              onClick={handleManualCapture}
              disabled={!cameraReady || capturing || submitting || samples.length >= 3}
              icon={<Camera className="w-4 h-4" />}
            >
              Snap Single ({samples.length}/3)
            </Button>
          </div>
        </div>

        {/* Right: Quality Checklist & Previews */}
        <div className="md:col-span-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="text-xs font-semibold text-slate-900">Camera Readiness</div>
            <div className="space-y-2 text-xs">
              <CheckRow ok={quality.faceDetected} label="Face visible in frame" />
              <CheckRow ok={quality.centered} label="Looking straight ahead" />
              <CheckRow ok={quality.sharp} label="Image clear & steady" />
              <CheckRow ok={quality.goodLighting} label="Balanced lighting" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900">Captured Samples ({samples.length}/3)</div>
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map((idx) => (
                <div
                  key={idx}
                  className="aspect-square rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex flex-col items-center justify-center relative"
                >
                  {samples[idx] ? (
                    <img
                      src={samples[idx]}
                      alt={`Capture ${idx + 1}`}
                      className="w-full h-full object-cover transform scale-x-[-1]"
                    />
                  ) : (
                    <span className="text-[11px] text-slate-400 text-center px-1">
                      {CAPTURE_STEPS[idx].title}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 flex items-start gap-2 text-[11px] text-blue-800 leading-relaxed">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Privacy first: Raw photos are discarded immediately after saving — only a secure mathematical face profile is stored.
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1 font-medium",
          ok ? "text-emerald-600" : "text-slate-400"
        )}
      >
        <CheckCircle2 className="w-3.5 h-3.5" />
        {ok ? "Ready" : "Waiting"}
      </span>
    </div>
  );
}

function translateQualityGuidance(raw?: string): string {
  if (!raw) return "Look directly at the camera";
  if (raw.includes("too far")) return "Move slightly closer to the camera";
  if (raw.includes("Yaw") || raw.includes("Pitch")) return "Keep your head straight and level";
  if (raw.includes("blurry")) return "Hold steady for a clearer capture";
  if (raw.includes("dark")) return "Move to a brighter area";
  if (raw.includes("glare")) return "Reduce bright light behind or on your face";
  return raw;
}

