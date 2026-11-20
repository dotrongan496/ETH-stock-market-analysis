import type { Metadata } from "next";

import AuthCallback from "@/components/auth-callback";

export const metadata: Metadata = {
  title: "Đăng nhập · ETH Market",
  robots: { index: false },
};

// Landing page of the Google sign-in and of the email confirmation link.
export default function AuthCallbackPage() {
  return <AuthCallback />;
}
