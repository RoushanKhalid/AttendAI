"use client";

import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Sparkles } from "lucide-react";
import { api, Department, Shift } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select } from "@/components/ui/FormControls";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function QuickRegisterModal({
  open,
  onClose,
  onSuccess,
  departments,
  shifts,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (employeeName: string) => void;
  departments: Department[];
  shifts: Shift[];
}) {
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    designation: "",
    email: "",
    department_id: "",
    default_shift_id: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        first_name: "",
        last_name: "",
        designation: "",
        email: "",
        department_id: departments[0]?.id || "",
        default_shift_id: shifts[0]?.id || "",
      });
      setError("");
    }
  }, [open, departments, shifts]);

  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let active = true;

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
        }
      })
      .catch(() => {
        setError("Could not access webcam. Please check browser camera permissions.");
      });

    return () => {
      active = false;
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoRef.current || !canvasRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (v.videoWidth === 0 || v.videoHeight === 0) {
      setError("Camera is still initializing. Wait a second and look directly at the lens.");
      return;
    }

    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, c.width, c.height);
    const faceImage = c.toDataURL("image/jpeg", 0.9);

    setSubmitting(true);
    setError("");
    try {
      const res = await api.quickRegister({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        designation: form.designation.trim() || undefined,
        email: form.email.trim() || undefined,
        department_id: form.department_id || departments[0]?.id || undefined,
        default_shift_id: form.default_shift_id || shifts[0]?.id || undefined,
        face_image: faceImage,
      });
      toast.success("Employee registered", `${res.employee.full_name} is enrolled and ready to check in.`);
      onSuccess?.(res.employee.full_name);
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Could not capture a clear face. Look at the camera in good lighting."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Quick Register & Face Capture"
      subtitle="Create a new employee profile and set up face recognition in one step."
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="quick-reg-form"
            loading={submitting}
            icon={<Sparkles className="w-4 h-4" />}
          >
            Capture & Register
          </Button>
        </>
      }
    >
      <form id="quick-reg-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <div className="space-y-2">
            <div className="relative aspect-[4/3] bg-slate-900 rounded-xl overflow-hidden border border-slate-200 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-36 h-48 border-2 border-dashed border-emerald-400/80 rounded-[50%]" />
              </div>
              <div className="absolute bottom-2 inset-x-2 text-center pointer-events-none">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900/80 text-white text-[11px]">
                  <Camera className="w-3 h-3" /> Look straight at camera
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center">
              Keep your face centered with clear lighting before submitting.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="First Name" required>
                <Input
                  required
                  placeholder="e.g. Sarah"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                />
              </Field>
              <Field label="Last Name" required>
                <Input
                  required
                  placeholder="e.g. Ahmed"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                />
              </Field>
            </div>

            <Field label="Job Title / Role">
              <Input
                placeholder="e.g. Product Designer"
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
              />
            </Field>

            <Field label="Work Email" hint="Optional — auto-generated if left blank">
              <Input
                type="email"
                placeholder="sarah@company.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Department">
                <Select
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value })}
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Shift">
                <Select
                  value={form.default_shift_id}
                  onChange={(e) => setForm({ ...form, default_shift_id: e.target.value })}
                >
                  {shifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}

