import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../lib/useAuth";
import { loginUser } from "../../lib/api";

type LoginForm = {
  email: string;
  password: string;
  remember: boolean;
};

export default function LoginPage() {
  const [form, setForm] = useState<LoginForm>({ email: "", password: "", remember: true });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginForm, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const emailValid = useMemo(() => /.+@.+\..+/.test(form.email), [form.email]);
  const passwordValid = useMemo(() => form.password.length >= 8, [form.password]);

  function validate(): boolean {
    const next: Partial<Record<keyof LoginForm, string>> = {};
    if (!emailValid) next.email = "Enter a valid email address";
    if (!passwordValid) next.password = "Password must be at least 8 characters";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
  const user = await loginUser({ email: form.email, password: form.password });
  // Persist via context; name fields come from backend
  login({ id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName });
  navigate('/dashboard');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px-64px)] bg-academic grid place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-fade-up">
        <div className="relative rounded-2xl border border-black/5 bg-white/80 backdrop-blur-sm shadow-xl shadow-black/5 overflow-hidden">
          {/* Decorative brand strip */}
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[color:var(--brand)] via-[color:var(--accent)] to-[color:var(--support)]" />

          <div className="p-6 sm:p-8">
            {/* Header */}
            <div className="mb-6 flex items-center gap-3">
              <div className="relative inline-flex items-center justify-center size-9 rounded-full ring-2 ring-[color:var(--brand)]/20 bg-[color:var(--brand)]/5">
                <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-[color:var(--accent)]" />
                <svg viewBox="0 0 24 24" className="size-5 text-[color:var(--brand)]" fill="currentColor" aria-hidden>
                  <path d="M4 6h16v2H4zM4 11h16v2H4zM4 16h10v2H4z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-semibold text-[color:var(--brand)]">Sign in</h1>
                <p className="text-sm text-[var(--ink-600)]">Access your CCS Lost & Found account</p>
              </div>
            </div>

            {/* Form */}
            <form className="space-y-4" noValidate onSubmit={onSubmit}>
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[var(--ink)]">
                  Email
                </label>
                <div className="mt-1 relative">
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
                    className={`w-full rounded-lg border px-3 py-2.5 bg-white/90 text-[var(--ink)] placeholder:text-[var(--ink-600)] transition-shadow focus:outline-none focus:ring-2 focus:ring-[color:var(--brand)]/40 ${
                      errors.email ? "border-red-500/60" : "border-black/10 hover:border-black/15"
                    }`}
                    placeholder="name@lspu.edu.ph"
                  />
                </div>
                {errors.email && (
                  <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="password" className="block text-sm font-medium text-[var(--ink)]">
                    Password
                  </label>
                  <a href="#" className="text-xs text-[color:var(--support)] hover:underline">
                    Forgot password?
                  </a>
                </div>
                <div className="mt-1 relative">
                  <input
                    id="password"
                    name="password"
                    type={showPw ? "text" : "password"}
                    autoComplete="current-password"
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
                    {showPw ? (
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="m3 3 18 18" />
                        <path d="M10.6 10.65a3 3 0 0 0 3.7 3.7" />
                        <path d="M9.88 4.08A11.6 11.6 0 0 1 12 4c5.5 0 9 6 9 6a17.9 17.9 0 0 1-4.16 4.56M6.22 6.22A17.7 17.7 0 0 0 3 10s3.5 6 9 6c1.06 0 2.06-.2 3-.56" />
                      </svg>
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p id="password-error" className="mt-1 text-sm text-red-600" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>

              {/* Remember me */}
              <label className="flex items-center gap-2 text-sm text-[var(--ink-600)] select-none">
                <input
                  type="checkbox"
                  checked={form.remember}
                  onChange={(e) => setForm({ ...form, remember: e.target.checked })}
                  className="size-4 rounded border-black/20 text-[color:var(--brand)] focus:ring-[color:var(--brand)]/40"
                />
                Remember me
              </label>

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
                Sign in
              </button>

              {/* Secondary actions */}
              <div className="pt-1 text-sm text-[var(--ink-600)]">
                <span className="mr-1">New here?</span>
                <Link to="/register" className="font-medium text-[color:var(--support)] hover:underline">Create an account</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
