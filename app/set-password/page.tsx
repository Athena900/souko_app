import Link from "next/link";
import { SetPasswordForm } from "@/src/features/auth/set-password-form";

export const dynamic = "force-dynamic";

export default function SetPasswordPage() {
  return (
    <div className="shell auth-shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
      </header>
      <main className="main auth-main">
        <SetPasswordForm />
      </main>
    </div>
  );
}
