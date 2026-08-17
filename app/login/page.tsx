import Link from "next/link";
import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { LoginForm } from "@/src/features/auth/login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="shell auth-shell">
      <header className="topbar">
        <Link className="brand" href="/">CSロジネット 倉庫業務</Link>
      </header>
      <main className="main auth-main">
        <DemoEnvironmentBanner />
        <LoginForm />
      </main>
    </div>
  );
}
