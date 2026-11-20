"use client";

import { useEffect, useRef, useState } from "react";

import { signOut, useAuth, type AuthUser } from "@/lib/auth";

/** Top-right corner: "Đăng nhập" when signed out, the avatar with its menu when signed in. */
export default function AccountMenu({ onSignIn }: { onSignIn: () => void }) {
  const auth = useAuth();

  if (auth.status === "loading") {
    return <span aria-hidden className="block size-8 animate-pulse rounded-full bg-raised" />;
  }
  if (auth.status === "signedOut") {
    return (
      <button
        type="button"
        onClick={onSignIn}
        className="h-8 rounded-lg border border-line bg-raised px-3 text-sm font-medium transition-colors hover:border-accent/60 hover:text-accent"
      >
        Đăng nhập
      </button>
    );
  }
  return <UserMenu user={auth.user} />;
}

function UserMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Click outside / Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const leave = async () => {
    setLeaving(true);
    await signOut(); // the signed-out state unmounts this menu
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản: ${user.name}`}
        title={user.email}
        className="block rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-canvas transition-shadow hover:ring-line focus-visible:outline-none focus-visible:ring-accent aria-expanded:ring-accent/70"
      >
        <Avatar user={user} className="size-8 text-xs" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Tài khoản"
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-line bg-panel p-1.5 shadow-xl shadow-black/40"
        >
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar user={user} className="size-10 text-sm" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{user.name}</div>
              <div className="truncate text-xs text-muted">{user.email}</div>
            </div>
          </div>
          <div className="px-2.5 pb-2 text-[11px] text-muted">
            {user.provider === "google" ? "Đăng nhập bằng Google" : "Đăng nhập bằng email"}
          </div>
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={leave}
            disabled={leaving}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none disabled:opacity-60"
          >
            <SignOutIcon />
            {leaving ? "Đang đăng xuất…" : "Đăng xuất"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Google photo, or initials when there is none (email accounts) or it fails to load. */
function Avatar({ user, className }: { user: AuthUser; className: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (user.avatarUrl && failed !== user.avatarUrl) {
    return (
      // Plain <img>: a 32px remote avatar does not need next/image's optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(user.avatarUrl)}
        className={`shrink-0 rounded-full bg-raised object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`grid shrink-0 place-items-center rounded-full bg-accent/20 font-semibold text-accent ${className}`}
    >
      {initials(user.name || user.email)}
    </span>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toLocaleUpperCase("vi");
}

function SignOutIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="size-4 text-muted">
      <path
        d="M8 4H5.5A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8M12.5 13.5L16 10l-3.5-3.5M16 10H8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
