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
    { label: "8–128 символів", met: password.length >= 8 && password.length <= 128 },
    { label: "Великі та малі літери", met: /[A-Z]/.test(password) && /[a-z]/.test(password) },
    { label: "Принаймні одна цифра", met: /\d/.test(password) },
    { label: "Принаймні один спеціальний символ", met: /[^A-Za-z0-9\s]/.test(password) },
  ];
  const otherModeUrl = `${isRegistration ? "/login" : "/register"}?next=${encodeURIComponent(nextPath)}`;
  const displayedError = error ?? oauthError;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (isRegistration && requirements.some((requirement) => !requirement.met)) {
      setError("Виберіть пароль, що відповідає всім вимогам.");
      return;
    }
    if (isRegistration && password !== confirmPassword) {
      setError("Паролі не збігаються.");
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
          isRegistration ? "Не вдалося створити обліковий запис." : "Не вдалося увійти.",
        ));
      }

      router.replace(nextPath);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Щось пішло не так. Спробуйте ще раз.");
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-story" aria-label="Better Tracker">
        <Link className="brand auth-brand" href="/" aria-label="Головна Better Tracker">
          <span className="brand-mark"><BrandMark /></span>
          <span className="brand-wordmark">BETTER TRACKER</span>
        </Link>
        <div className="auth-story-copy">
          <p className="auth-eyebrow"><ShieldCheck size={15} /> Ваш особистий простір</p>
          <h1>Увесь ваш прогрес.<br />Лише ваш.</h1>
          <p>Фінанси, тренування, харчування та дані про здоров’я захищені вашим обліковим записом.</p>
          <div className="auth-proof">
            <span><LockKeyhole size={17} /></span>
            <div><strong>Захищена сесія</strong><small>Токен сесії зберігається в приватному HttpOnly cookie й недоступний JavaScript.</small></div>
          </div>
        </div>
        <p className="auth-story-footer">Спокійний погляд на всі сфери життя.</p>
      </section>

      <section className="auth-panel">
        <div className="auth-card">
          <div className="auth-card-heading">
            <p className="eyebrow">{isRegistration ? "Почніть відстежувати" : "З поверненням"}</p>
            <h2>{isRegistration ? "Створіть обліковий запис" : "Увійдіть до свого простору"}</h2>
            <p>{isRegistration
              ? "Налаштуйте особисту панель менш ніж за хвилину."
              : "Введіть електронну адресу й пароль вашого трекера."}</p>
          </div>

          {sessionExpired && !displayedError && (
            <div className="auth-notice" role="status">
              <LockKeyhole size={16} />
              <span>Термін дії сесії минув. Увійдіть знову, щоб продовжити.</span>
            </div>
          )}
          {displayedError && (
            <div className="auth-error" role="alert">
              <span>{displayedError}</span>
            </div>
          )}

          <a className="auth-google" href={`/api/auth/google?mode=${mode}&next=${encodeURIComponent(nextPath)}`}>
            <span aria-hidden="true">G</span>
            Продовжити з Google
          </a>
          <div className="auth-divider"><span>або скористайтеся електронною поштою</span></div>

          <form className="auth-form" onSubmit={handleSubmit} aria-busy={submitting}>
            <label>
              <span>Електронна адреса</span>
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
              <label htmlFor="auth-password">Пароль</label>
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
                  placeholder={isRegistration ? "Створіть надійний пароль" : "Введіть пароль"}
                  aria-describedby={isRegistration ? "password-requirements" : undefined}
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  aria-label={showPassword ? "Приховати пароль" : "Показати пароль"}
                  disabled={submitting}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>

            {isRegistration && (
              <>
                <label>
                  <span>Підтвердьте пароль</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(event) => { setConfirmPassword(event.target.value); setError(null); }}
                    autoComplete="new-password"
                    minLength={8}
                    maxLength={128}
                    placeholder="Повторіть пароль"
                    required
                    disabled={submitting}
                  />
                </label>
                <ul className="password-requirements" id="password-requirements" aria-label="Вимоги до пароля">
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
                ? (isRegistration ? "Створюємо обліковий запис…" : "Входимо…")
                : (isRegistration ? "Створити обліковий запис" : "Увійти")}</span>
            </button>
          </form>

          <p className="auth-switch">
            {isRegistration ? "Уже маєте обліковий запис?" : "Вперше в Better Tracker?"}{" "}
            <Link href={otherModeUrl}>{isRegistration ? "Увійти" : "Створити обліковий запис"}</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
