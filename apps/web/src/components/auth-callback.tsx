"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import Logo from "@/components/logo";
import { completeSignIn, type AuthFailure } from "@/lib/auth";

/** Finishes the sign-in from the URL, then goes back to the dashboard. */
export default function AuthCallback() {
  const router = useRouter();
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // A code can be exchanged only once (React dev mode runs effects twice).
    if (started.current) return;
    started.current = true;
    completeSignIn(window.location.href).then((result) => {
      if (result.ok) router.replace("/");
      else setFailure(result);
    });
  }, [router]);

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 text-center shadow-xl shadow-black/30">
        <div className="flex justify-center">
          <Logo />
        </div>
        {failure ? (
          <>
            <h1 className="mt-4 text-lg font-semibold">
              {failure.code === "verifier_missing" ? "Đã xác thực email" : "Chưa đăng nhập được"}
            </h1>
            <p className="mt-2 text-sm text-muted">{failure.message}</p>
            <Link
              href="/"
              replace
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-semibold text-canvas transition-opacity hover:opacity-90"
            >
              Về trang chủ
            </Link>
          </>
        ) : (
          <p role="status" className="mt-4 text-sm text-muted">
            Đang đăng nhập…
          </p>
        )}
      </div>
    </main>
  );
}
