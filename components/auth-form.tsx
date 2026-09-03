"use client";

import {
  ArrowRight,
  Check,
  Circle,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { type ApiProblem, apiProblemMessage } from "@/lib/auth";

type AuthMode = "login" | "register";

type PasswordRequirement = {
  label: string;
  met: boolean;
};

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M7 22.5 12.2 16.9 16.5 19.2 24 10.5" />
      <path d="M20 10.5h4v4" />
      <circle cx="7" cy="22.5" r="1.35" />
      <circle cx="12.2" cy="16.9" r="1.35" />
      <circle cx="16.5" cy="19.2" r="1.35" />
    </svg>
  );
}

export function AuthForm({
  mode,
  nextPath,
  sessionExpired = false,
  oauthError,
}: {
  mode: AuthMode;
  nextPath: string;
  sessionExpired?: boolean;
  oauthError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegistration = mode === "register";
  const requirements: PasswordRequirement[] = [
    { label: "8–128 characters", met: password.length >= 8 && password.length <= 128 },
    { label: "Upper and lowercase", met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "At least one number", met: /\d/.test(password) },
    { label: "At least one symbol", met: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const otherModeUrl = `${isRegistration ? "/login" : "/register"}?next=${encodeURIComponent(nextPath)}`;
  const displayedError = error ?? oauthError;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (isRegistration && requirements.some((requirement) => !requirement.met)) {
      setError("Choose a password that meets every requirement.");
      return;
    }
    if (isRegistration && password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null) as ApiProblem | null;
      if (!response.ok) {
        throw new Error(apiProblemMessage(
          payload,
          isRegistration ? "Could not create your account." : "Could not sign you in.",
        ));
      }

      router.replace(nextPath);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Better Tracker">
        <Link className="brand auth-brand" href="/" aria-label="Better Tracker home">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="auth-story-copy">
          <p className="auth-eyebrow"><ShieldCheck size={15} /> Your private workspace</p>
          <h1>All of your progress.<br />Only yours.</h1>
          <p>Money, training, nutrition, and health records stay separated behind your secure account.</p>
          <div className="auth-proof">
            <span><LockKeyhole size={17} /></span>
            <div><strong>Protected end to end</strong><small>Your session is stored in a secure, private browser cookie.</small></div>
          </div>
        </div>
        <p className="auth-story-footer">A calmer way to see your whole life.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <p className="eyebrow">{isRegistration ? "Start tracking" : "Welcome back"}</p>
            <h2>{isRegistration ? "Create your account" : "Sign in to your workspace"}</h2>
            <p>{isRegistration
              ? "Set up a private dashboard in less than a minute."
              : "Use the email and password tied to your tracker."}</p>
          </div>

          {sessionExpired && !displayedError && (
            <div className="auth-notice" role="status">
              <LockKeyhole size={16} />
              <span>Your session expired. Sign in again to continue.</span>
            </div>
          )}
          {displayedError && (
            <div className="auth-error" role="alert">
              <span>{displayedError}</span>
            </div>
          )}

          <a className="auth-google" href={`/api/auth/google?mode=${mode}&next=${encodeURIComponent(nextPath)}`}>
            <span aria-hidden="true">G</span>
            Continue with Google
          </a>
          <div className="auth-divider"><span>or continue with email</span></div>

          <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
            <label>
              <span>Email address</span>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(event) => { setEmail(event.target.value); setError(null); }}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={254}
                placeholder="you@example.com"
                required
                autoFocus
                disabled={submitting}
              />
            </label>

            <div className="auth-field">
              <label htmlFor="auth-password">Password</label>
              <span className="password-field">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={password}
                  onChange={(event) => { setPassword(event.target.value); setError(null); }}
                  autoComplete={isRegistration ? "new-password" : "current-password"}
                  minLength={isRegistration ? 8 : 1}
                  maxLength={128}
                  placeholder={isRegistration ? "Create a strong password" : "Enter your password"}
                  aria-describedby={isRegistration ? "password-requirements" : undefined}
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>

            {isRegistration && (
              <>
                <label>
                  <span>Confirm password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(event) => { setConfirmPassword(event.target.value); setError(null); }}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    placeholder="Repeat your password"
                    required
                    disabled={submitting}
                  />
                </label>
                <ul className="password-requirements" id="password-requirements" aria-label="Password requirements">
                  {requirements.map((requirement) => (
                    <li className={requirement.met ? "met" : ""} key={requirement.label}>
                      {requirement.met ? <Check size={13} /> : <Circle size={9} />}
                      <span>{requirement.label}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />}
              <span>{submitting
                ? (isRegistration ? "Creating account…" : "Signing in…")
                : (isRegistration ? "Create account" : "Sign in")}</span>
            </button>
          </form>

          <p className="auth-switch">
            {isRegistration ? "Already have an account?" : "New to Better Tracker?"}{" "}
            <Link href={otherModeUrl}>{isRegistration ? "Sign in" : "Create an account"}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
