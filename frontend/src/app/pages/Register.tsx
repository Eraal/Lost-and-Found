import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerStudent } from "../../lib/api";

type RegisterForm = {
  studentId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  password: string;
  confirm: string;
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<RegisterForm>({
    studentId: "",
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegisterForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const emailValid = useMemo(() => /.+@.+\..+/.test(form.email), [form.email]);
  const passwordValid = useMemo(() => form.password.length >= 8, [form.password]);
  const namePartsOk = useMemo(() => form.firstName.trim().length >= 1 && form.lastName.trim().length >= 1, [form.firstName, form.lastName]);
  // Accept exactly 4 digits, hyphen, 4 digits e.g., 0222-1756
  const studentIdOk = useMemo(() => /^\d{4}-\d{4}$/.test(form.studentId.trim()), [form.studentId]);
  const confirmOk = useMemo(() => form.confirm === form.password && form.confirm.length > 0, [form.confirm, form.password]);

  function validate(): boolean {
    const next: Partial<Record<keyof RegisterForm, string>> = {};
    if (!namePartsOk) {
      if (!form.firstName) next.firstName = "First name is required";
      if (!form.lastName) next.lastName = "Last name is required";
    }
    if (!studentIdOk) next.studentId = "Student ID must be in the format 0000-0000";
    if (!emailValid) next.email = "Enter a valid email";
    if (!passwordValid) next.password = "At least 8 characters";
    if (!confirmOk) next.confirm = "Passwords do not match";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  // Formats Student ID as XXXX-XXXX while typing
  function handleStudentIdChange(value: string) {
    const digits = value.replace(/\D+/g, "").slice(0, 8);
    const formatted = digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
    setForm((prev) => ({ ...prev, studentId: formatted }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload = {
        studentId: form.studentId.trim(),
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      };
      await registerStudent(payload);
      navigate("/login", { replace: true, state: { toast: "Account created. Please sign in." } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      setErrors((prev) => ({ ...prev, email: msg }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px-64px)] bg-academic grid place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="relative rounded-2xl border border-black/5 bg-white/80 backdrop-blur-sm shadow-xl shadow-black/5 overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />
          <div className="p-6 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <div className="relative inline-flex items-center justify-center size-9 rounded-full ring-2 ring-[color:var(--brand)]/20 bg-[color:var(--brand)]/5">
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[color:var(--accent)]" />
                <svg viewBox="0 0 24 24" className="size-5 text-[color:var(--brand)]" fill="currentColor" aria-hidden>
                  <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-[color:var(--brand)]">Create account</h1>
                <p className="text-sm text-[var(--ink-600)]">Join CCS Lost & Found</p>
              </div>
            </div>

            <form className="space-y-4" noValidate onSubmit={onSubmit}>
              {/* Student ID */}
              <div>
                <label htmlFor="studentId" className="block text-sm font-medium text-[var(--ink)]">Student ID</label>
                <input
                  id="studentId"
                  name="studentId"
                  type="text"
                  autoComplete="off"
                  value={form.studentId}
                  onChange={(e) => handleStudentIdChange(e.target.value)}
                  onBlur={validate}
                  aria-invalid={!!errors.studentId}
                  aria-describedby={errors.studentId ? "studentId-error" : undefined}
                  inputMode="numeric"
                  maxLength={9}
                  className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                    errors.studentId ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                  }`}
                  placeholder="e.g., 0222-1756"
                />
                {errors.studentId && (
                  <p id="studentId-error" className="mt-1 text-sm text-red-600" role="alert">{errors.studentId}</p>
                )}
                {!errors.studentId && (
                  <p className="mt-1 text-xs text-[var(--ink-600)]">Use your LSPU Student ID format: 0000-0000</p>
                )}
              </div>

              {/* Name (split) */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="sm:col-span-1">
                  <label htmlFor="firstName" className="block text-sm font-medium text-[var(--ink)]">First name</label>
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    autoComplete="given-name"
                    value={form.firstName}
                    onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                    onBlur={validate}
                    aria-invalid={!!errors.firstName}
                    aria-describedby={errors.firstName ? "firstName-error" : undefined}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                      errors.firstName ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                    }`}
                    placeholder="Juan"
                  />
                  {errors.firstName && (
                    <p id="firstName-error" className="mt-1 text-sm text-red-600" role="alert">{errors.firstName}</p>
                  )}
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="middleName" className="block text-sm font-medium text-[var(--ink)]">Middle name</label>
                  <input
                    id="middleName"
                    name="middleName"
                    type="text"
                    autoComplete="additional-name"
                    value={form.middleName}
                    onChange={(e) => setForm({ ...form, middleName: e.target.value })}
                    className="mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 border-black/10 hover:border-black/15"
                    placeholder="Santos"
                  />
                </div>
                <div className="sm:col-span-1">
                  <label htmlFor="lastName" className="block text-sm font-medium text-[var(--ink)]">Last name</label>
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    autoComplete="family-name"
                    value={form.lastName}
                    onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                    onBlur={validate}
                    aria-invalid={!!errors.lastName}
                    aria-describedby={errors.lastName ? "lastName-error" : undefined}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                      errors.lastName ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                    }`}
                    placeholder="Dela Cruz"
                  />
                  {errors.lastName && (
                    <p id="lastName-error" className="mt-1 text-sm text-red-600" role="alert">{errors.lastName}</p>
                  )}
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--ink)]">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  onBlur={validate}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                    errors.email ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                  }`}
                  placeholder="name@lspu.edu.ph"
                />
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">{errors.email}</p>
                )}
              </div>

              {/* Passwords */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--ink)]">Password</label>
                  <div className="mt-1 relative">
                    <input
                      id="password"
                      name="password"
                      type={showPw ? "text" : "password"}
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      onBlur={validate}
                      aria-invalid={!!errors.password}
                      aria-describedby={errors.password ? "password-error" : undefined}
                      className={`w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                        errors.password ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                      }`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center size-8 rounded-md text-[var(--ink-600)] hover:text-[color:var(--brand)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                  {errors.password && (
                    <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">{errors.password}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="confirm" className="block text-sm font-medium text-[var(--ink)]">Confirm password</label>
                  <input
                    id="confirm"
                    name="confirm"
                    type={showPw ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.confirm}
                    onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                    onBlur={validate}
                    aria-invalid={!!errors.confirm}
                    aria-describedby={errors.confirm ? "confirm-error" : undefined}
                    className={`mt-1 w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                      errors.confirm ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                    }`}
                    placeholder="Repeat password"
                  />
                  {errors.confirm && (
                    <p id="confirm-error" className="mt-1 text-sm text-red-600" role="alert">{errors.confirm}</p>
                  )}
                </div>
              </div>

              {/* Terms removed per requirements */}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-[color:var(--brand)] text-white px-4 py-2.5 font-medium shadow-sm shadow-[color:var(--brand)]/20 ring-1 ring-[color:var(--brand)]/20 transition-all hover:bg-[color:var(--brand-strong)] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[color:var(--brand)]/50 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {submitting && (
                  <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="12" cy="12" r="9" className="opacity-25" />
                    <path d="M21 12a9 9 0 0 1-9 9" />
                  </svg>
                )}
                Create account
              </button>

              {/* Secondary */}
              <div className="pt-1 text-sm text-[var(--ink-600)]">
                <span className="mr-1">Already have an account?</span>
                <Link to="/login" className="font-medium text-[color:var(--support)] hover:underline">Sign in</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
