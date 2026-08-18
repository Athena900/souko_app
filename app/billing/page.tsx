import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { BillingCandidateReview } from "@/src/features/billing/billing-candidate-review";
import { AppFrame } from "@/src/features/layout/app-shell";
import { isDemoMode } from "@/src/lib/env";
import { getTrialStatus, trialWriteDisabledMessage } from "@/src/lib/trial";
import { loadActiveScope } from "@/src/server/auth/active-scope";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const scope = await loadActiveScope(["office", "manager", "admin"]);
  const trial = getTrialStatus();
  return (
    <AppFrame active="billing">
      <div className="screen-page billing-page">
        <main className="main screen-main">
        <DemoEnvironmentBanner />
        <BillingCandidateReview scope={scope} writeDisabled={!trial.writeAllowed} writeDisabledReason={trialWriteDisabledMessage(trial)} />
        </main>
      </div>
    </AppFrame>
  );
}
