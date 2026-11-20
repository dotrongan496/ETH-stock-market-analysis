"use client";

import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type FormEvent,
  type ReactNode,
} from "react";

import {
  AUTH_CONFIGURED,
  resendConfirmation,
  signInWithGoogle,
  signInWithPassword,
  signUpWithPassword,
  type AuthFailure,
} from "@/lib/auth";

type Mode = "signIn" | "signUp" | "checkEmail";
export type AuthReason = "market" | null;

const MIN_PASSWORD = 8;
const RESEND_COOLDOWN_MS = 60_000;

/**
 * Sign-in / sign-up modal (native <dialog>: focus trap, Escape and top layer for free).
 * It closes itself through `onClose`; the dashboard also closes it once a session arrives.
 */
export default function AuthDialog({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: AuthReason;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="auth-title"
      onClose={onClose}
      // A click on the dialog element itself is a click on the backdrop (the panel fills it).
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-line bg-panel p-0 text-ink shadow-2xl shadow-black/50 backdrop:bg-black/55 backdrop:backdrop-blur-[2px]"
    >
      {open && <AuthPanel reason={reason} onDismiss={() => ref.current?.close()} />}
    </dialog>
  );
}

function AuthPanel({ reason, onDismiss }: { reason: AuthReason; onDismiss: () => void }) {
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<null | "password" | "google" | "resend">(null);
  const [error, setError] = useState<AuthFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cooldown = useCooldown();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setPassword("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy("password");
    const address = email.trim();
    if (mode === "signIn") {
      const result = await signInWithPassword(address, password);
      // Success: the session arrives and the dashboard closes the dialog.
      if (!result.ok) {
        setError(result);
        setBusy(null);
      }
      return;
    }
    const result = await signUpWithPassword(address, password);
    setBusy(null);
    if (!result.ok) {
      setError(result);
    } else if (result.needsConfirmation) {
      setMode("checkEmail");
      cooldown.start(RESEND_COOLDOWN_MS);
    }
  };

  const google = async () => {
    setError(null);
    setBusy("google");
    const result = await signInWithGoogle(); // navigates away on success
    if (!result.ok) {
      setError(result);
      setBusy(null);
    }
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setBusy("resend");
    const result = await resendConfirmation(email.trim());
    setBusy(null);
    if (!result.ok) {
      setError(result);
      return;
    }
    setMode("checkEmail");
    setNotice("Đã gửi lại email xác thực.");
    cooldown.start(RESEND_COOLDOWN_MS);
  };

  const title = mode === "signIn" ? "Đăng nhập" : mode === "signUp" ? "Tạo tài khoản" : "Kiểm tra hộp thư";
  const subtitle =
    mode === "checkEmail"
      ? null
      : reason === "market"
        ? "Đăng nhập để xem chế độ Thị trường: giá trần, sàn và tham chiếu."
        : mode === "signIn"
          ? "Đăng nhập để mở thêm chế độ Thị trường."
          : "Miễn phí, dùng email hoặc tài khoản Google.";

  // Error with a follow-up action (resend the confirmation, or go to sign-in).
  const errorAction =
    error?.code === "email_not_confirmed" ? (
      <InlineAction onClick={resend} disabled={busy !== null}>
        Gửi lại email xác thực
      </InlineAction>
    ) : error?.code === "user_already_exists" && mode === "signUp" ? (
      <InlineAction onClick={() => switchMode("signIn")}>Đăng nhập</InlineAction>
    ) : null;

  return (
    <div className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="auth-title" className="text-lg font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Đóng"
          className="-mr-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-4">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!AUTH_CONFIGURED ? (
        <p className="mt-5 rounded-lg border border-line bg-canvas p-4 text-sm text-muted">
          Chức năng đăng nhập chưa được cấu hình: thiếu biến môi trường{" "}
          <code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> và{" "}
          <code className="text-ink">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>.
        </p>
      ) : mode === "checkEmail" ? (
        <div className="mt-5">
          <div className="flex gap-3 rounded-lg border border-line bg-canvas p-4 text-sm">
            <MailIcon />
            <p className="min-w-0">
              Chúng tôi đã gửi liên kết xác thực tới{" "}
              <span className="font-semibold text-ink wrap-anywhere">{email.trim()}</span>. Mở thư và
              bấm vào liên kết để kích hoạt tài khoản.
            </p>
          </div>
          <p className="mt-3 text-xs text-muted">
            Không thấy thư? Xem thư mục Spam hoặc Quảng cáo, hoặc gửi lại sau ít phút.
          </p>
          {notice && <p className="mt-2 text-xs text-up">{notice}</p>}
          {error && <ErrorBox error={error} className="mt-3" />}
          <div className="mt-5 flex flex-col gap-2">
            <PrimaryButton
              type="button"
              onClick={resend}
              busy={busy === "resend"}
              disabled={busy !== null || cooldown.secondsLeft > 0}
            >
              {cooldown.secondsLeft > 0 ? `Gửi lại email (${cooldown.secondsLeft}s)` : "Gửi lại email"}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => switchMode("signIn")}
              className="h-10 rounded-lg text-sm font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
            >
              Quay lại đăng nhập
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={google}
            disabled={busy !== null}
            className="mt-5 flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-raised text-sm font-medium transition-colors hover:border-muted/50 disabled:opacity-60"
          >
            {busy === "google" ? <Spinner /> : <GoogleLogo />}
            Tiếp tục với Google
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line" />
            hoặc dùng email
            <span className="h-px flex-1 bg-line" />
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3.5">
            <Field label="Email">
              <input
                data-autofocus
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ban@email.com"
                className={INPUT}
              />
            </Field>
            <Field label="Mật khẩu" hint={mode === "signUp" ? `Ít nhất ${MIN_PASSWORD} ký tự.` : undefined}>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                  required
                  minLength={mode === "signUp" ? MIN_PASSWORD : undefined}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className={`${INPUT} pr-16`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-pressed={showPassword}
                  className="absolute inset-y-1 right-1 rounded-md px-2.5 text-xs font-medium text-muted transition-colors hover:bg-raised hover:text-ink"
                >
                  {showPassword ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </Field>

            {error && <ErrorBox error={error} action={errorAction} />}

            <PrimaryButton type="submit" busy={busy === "password"} disabled={busy !== null}>
              {mode === "signIn" ? "Đăng nhập" : "Tạo tài khoản"}
            </PrimaryButton>
          </form>

          <p className="mt-5 text-center text-sm text-muted">
            {mode === "signIn" ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "signIn" ? "signUp" : "signIn")}
              className="font-medium text-accent hover:underline"
            >
              {mode === "signIn" ? "Đăng ký" : "Đăng nhập"}
            </button>
          </p>
        </>
      )}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink outline-none transition-colors placeholder:text-muted/60 focus:border-accent";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function PrimaryButton({
  busy,
  children,
  ...props
}: { busy: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

function ErrorBox({
  error,
  action,
  className = "",
}: {
  error: AuthFailure;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={`rounded-lg bg-down/10 px-3 py-2.5 text-sm text-down ${className}`}>
      {error.message}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  );
}

function InlineAction({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-semibold underline underline-offset-2 hover:no-underline disabled:opacity-60"
    >
      {children}
    </button>
  );
}

/** Seconds left before "Gửi lại email" can be used again. */
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (until === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= until) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);
  return {
    secondsLeft: Math.max(0, Math.ceil((until - now) / 1000)),
    start(ms: number) {
      const t = Date.now();
      setNow(t);
      setUntil(t + ms);
    },
  };
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent opacity-80"
    />
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 size-5 shrink-0 text-accent">
      <rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 7l8 6 8-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Google "G" mark (as required on "Sign in with Google" buttons). */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-[18px]">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
