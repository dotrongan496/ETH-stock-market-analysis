"use client";

// Sign-in state (Supabase Auth) shared by every component, plus the auth actions.
// Signed out: prices only. Signed in: also "Cổ phiếu VN → Thị trường".

import {
  isAuthError,
  isAuthPKCECodeVerifierMissingError,
  isAuthRetryableFetchError,
  type EmailOtpType,
  type Session,
  type User,
} from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";

import { AUTH_CONFIGURED, getSupabase } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  /** "email" or "google". */
  provider: string;
}

export type AuthState =
  | { status: "loading"; user: null }
  | { status: "signedOut"; user: null }
  | { status: "signedIn"; user: AuthUser };

export interface AuthFailure {
  ok: false;
  code: string | null;
  message: string;
}
export type AuthResult = { ok: true } | AuthFailure;

const LOADING: AuthState = { status: "loading", user: null };
const SIGNED_OUT: AuthState = { status: "signedOut", user: null };

let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();
const signInListeners = new Set<() => void>();

const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

function toAuthUser(user: User): AuthUser {
  const meta = user.user_metadata ?? {};
  const email = user.email ?? "";
  return {
    id: user.id,
    email,
    name: text(meta.full_name) ?? text(meta.name) ?? email.split("@")[0],
    avatarUrl: text(meta.avatar_url) ?? text(meta.picture),
    provider: text(user.app_metadata?.provider) ?? "email",
  };
}

function sameUser(a: AuthUser, b: AuthUser) {
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.name === b.name &&
    a.avatarUrl === b.avatarUrl &&
    a.provider === b.provider
  );
}

function setSession(session: Session | null) {
  const next: AuthState = session
    ? { status: "signedIn", user: toAuthUser(session.user) }
    : SIGNED_OUT;
  // Token refreshes re-send the same user: keep the old object so nothing re-renders.
  if (next.status === state.status && (!next.user || (state.user && sameUser(next.user, state.user)))) {
    return;
  }
  const wasSignedIn = state.status === "signedIn";
  state = next;
  listeners.forEach((listener) => listener());
  if (next.status === "signedIn" && !wasSignedIn) signInListeners.forEach((listener) => listener());
}

function start() {
  if (started) return;
  started = true;
  const supabase = getSupabase();
  if (!supabase) {
    setSession(null);
    return;
  }
  // Fires INITIAL_SESSION (from localStorage) first, then every sign-in / sign-out / refresh,
  // including those from other tabs.
  supabase.auth.onAuthStateChange((_event, session) => setSession(session));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** Current sign-in state; "loading" until the stored session has been read. */
export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => LOADING);
}

/** Calls `listener` whenever someone signs in (and right away if already signed in). */
export function onSignedIn(listener: () => void): () => void {
  start();
  signInListeners.add(listener);
  if (state.status === "signedIn") queueMicrotask(listener);
  return () => {
    signInListeners.delete(listener);
  };
}

// What to open once the sign-in finishes. Kept in sessionStorage so it survives the Google
// redirect (same tab), and is dropped when the tab closes.
const NEXT_KEY = "auth.next";
export type AfterSignIn = "market";

export function setAfterSignIn(next: AfterSignIn | null) {
  try {
    if (next) sessionStorage.setItem(NEXT_KEY, next);
    else sessionStorage.removeItem(NEXT_KEY);
  } catch {
    // Storage blocked: the user just lands on the default view.
  }
}

export function takeAfterSignIn(): AfterSignIn | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    sessionStorage.removeItem(NEXT_KEY);
    return next === "market" ? next : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Actions

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email hoặc mật khẩu không đúng.",
  email_not_confirmed: "Email này chưa được xác thực. Hãy mở thư xác thực trong hộp thư của bạn.",
  user_already_exists: "Email này đã có tài khoản. Hãy đăng nhập.",
  email_exists: "Email này đã có tài khoản. Hãy đăng nhập.",
  weak_password: "Mật khẩu quá yếu. Hãy dùng ít nhất 8 ký tự, gồm cả chữ và số.",
  over_email_send_rate_limit: "Đã gửi quá nhiều email. Vui lòng thử lại sau ít phút.",
  over_request_rate_limit: "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.",
  signup_disabled: "Hiện chưa mở đăng ký tài khoản mới.",
  email_provider_disabled: "Đăng nhập bằng email đang tắt.",
  provider_disabled: "Đăng nhập bằng Google chưa được bật.",
  email_address_invalid: "Email không hợp lệ.",
  email_address_not_authorized: "Chưa gửi được email tới địa chỉ này (máy chủ email chưa được cấu hình).",
  otp_expired: "Liên kết xác thực đã hết hạn hoặc đã được dùng. Hãy gửi lại email xác thực.",
  flow_state_not_found: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  flow_state_expired: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  bad_code_verifier: "Phiên đăng nhập đã hết hạn. Vui lòng thử lại.",
  access_denied: "Bạn đã hủy đăng nhập.",
};

const NOT_CONFIGURED: AuthFailure = {
  ok: false,
  code: "not_configured",
  message: "Chức năng đăng nhập chưa được cấu hình trên máy chủ này.",
};

function failure(error: unknown): AuthFailure {
  if (isAuthRetryableFetchError(error)) {
    return { ok: false, code: "network", message: "Không kết nối được máy chủ đăng nhập. Kiểm tra mạng rồi thử lại." };
  }
  const code = isAuthError(error) ? (error.code ?? null) : null;
  return {
    ok: false,
    code,
    message: (code && MESSAGES[code]) || "Có lỗi xảy ra, vui lòng thử lại.",
  };
}

const callbackUrl = () => `${window.location.origin}/auth/callback`;

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? failure(error) : { ok: true };
}

export type SignUpResult = { ok: true; needsConfirmation: boolean } | AuthFailure;

/** Creates the account; Supabase then emails a confirmation link (unless confirmation is off). */
export async function signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) return failure(error);
  // An already confirmed email gets a fake user with no identities (no account enumeration).
  if (data.user && data.user.identities?.length === 0) {
    return { ok: false, code: "user_already_exists", message: MESSAGES.user_already_exists };
  }
  return { ok: true, needsConfirmation: data.session === null };
}

export async function resendConfirmation(email: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl() },
  });
  return error ? failure(error) : { ok: true };
}

/** Leaves the page for Google; comes back to /auth/callback. Resolves only on error. */
export async function signInWithGoogle(): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callbackUrl(), queryParams: { prompt: "select_account" } },
  });
  return error ? failure(error) : { ok: true };
}

/** Signs out of this browser only (other devices stay signed in). */
export async function signOut(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.auth.signOut({ scope: "local" });
  // Offline: the local session is cleared anyway; make sure the UI follows.
  if (error) setSession(null);
}

const EMAIL_OTP_TYPES: ReadonlyArray<EmailOtpType> = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
];

/**
 * Finishes a sign-in on /auth/callback:
 * - `?code=` from Google or from the default confirmation email (PKCE, same browser),
 * - `?token_hash=&type=` from a custom confirmation email template (works on any device),
 * - `?error_code=` / `#error_code=` when Supabase or Google refused.
 */
export async function completeSignIn(href: string): Promise<AuthResult> {
  const supabase = getSupabase();
  if (!supabase) return NOT_CONFIGURED;
  const url = new URL(href);
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));

  const errorCode = query.get("error_code") ?? hash.get("error_code") ?? query.get("error");
  if (errorCode) {
    const detail = query.get("error_description") ?? hash.get("error_description");
    return { ok: false, code: errorCode, message: MESSAGES[errorCode] ?? detail ?? "Đăng nhập không thành công." };
  }

  const tokenHash = query.get("token_hash");
  const type = query.get("type") as EmailOtpType | null;
  if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? failure(error) : { ok: true };
  }

  const code = query.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return { ok: true };
    // The confirmation link was opened in another browser / device than the sign-up:
    // the email is confirmed, but this browser cannot finish the sign-in by itself.
    if (isAuthPKCECodeVerifierMissingError(error)) {
      return {
        ok: false,
        code: "verifier_missing",
        message: "Email của bạn đã được xác thực. Vì liên kết được mở ở trình duyệt khác lúc đăng ký, hãy đăng nhập lại bằng email và mật khẩu.",
      };
    }
    return failure(error);
  }

  return { ok: false, code: null, message: "Liên kết đăng nhập không hợp lệ hoặc đã hết hạn." };
}

export { AUTH_CONFIGURED };
