import { DemoEnvironmentBanner } from "@/src/features/demo/demo-environment-banner";
import { AppFrame } from "@/src/features/layout/app-shell";
import { ShipmentList } from "@/src/features/shipments/shipment-list";
import { loadActiveScope } from "@/src/server/auth/active-scope";

export const dynamic = "force-dynamic";

export default async function ShipmentsPage() {
  const scope = await loadActiveScope(["field", "office", "manager", "admin"]);
  return (
    <AppFrame active="shipments">
      <div className="screen-page shipments-page">
        <main className="main screen-main">
          <DemoEnvironmentBanner />
          <ShipmentList scope={scope} />
        </main>
      </div>
    </AppFrame>
  );
}
