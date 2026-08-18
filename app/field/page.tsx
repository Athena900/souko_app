import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { FieldRecordForm } from "@/src/features/field/field-record-form";
import { AppFrame } from "@/src/features/layout/app-shell";
import { isDemoMode, usesSupabaseStorage } from "@/src/lib/env";
import { getTrialStatus, trialWriteDisabledMessage } from "@/src/lib/trial";
import { loadActiveScope } from "@/src/server/auth/active-scope";

export const dynamic = "force-dynamic";

export default async function FieldPage() {
  const scope = await loadActiveScope(["field", "office", "manager", "admin"]);
  const trial = getTrialStatus();
  return (
    <AppFrame active="field">
      <div className="screen-page field-page">
        <main className="main screen-main field-page-main">
        <DemoEnvironmentBanner />
        <FieldRecordForm scope={scope} demoMode={isDemoMode()} requiresRegisteredShipment={usesSupabaseStorage()} writeDisabled={!trial.writeAllowed} writeDisabledReason={trialWriteDisabledMessage(trial)} />
        </main>
      </div>
    </AppFrame>
  );
}
