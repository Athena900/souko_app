import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { DashboardOverview } from "@/src/features/dashboard/dashboard-overview";
import { AppFrame } from "@/src/features/layout/app-shell";
import { requireTrialPageAccess } from "@/src/server/auth/trial-page-access";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireTrialPageAccess("/");

  return (
    <AppFrame active="home">
      <main className="dashboard-page">
        <DemoEnvironmentBanner />
        <DashboardOverview />
      </main>
    </AppFrame>
  );
}
