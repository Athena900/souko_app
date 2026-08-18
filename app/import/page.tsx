import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { ExcelImportPreview } from "@/src/features/import/excel-import-preview";
import { AppFrame } from "@/src/features/layout/app-shell";
import { isDemoMode } from "@/src/lib/env";
import { getTrialStatus, trialWriteDisabledMessage } from "@/src/lib/trial";
import { loadActiveScope } from "@/src/server/auth/active-scope";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const scope = await loadActiveScope(["office", "manager", "admin"]);
  const trial = getTrialStatus();
  return (
    <AppFrame active="import">
      <div className="screen-page import-page">
        <main className="main screen-main">
        <DemoEnvironmentBanner />
        <ExcelImportPreview demoMode={isDemoMode()} scope={scope} writeDisabled={!trial.writeAllowed} writeDisabledReason={trialWriteDisabledMessage(trial)} />
        </main>
      </div>
    </AppFrame>
  );
}
