import { FleetView } from "@/components/fleet-view";
import { PageTransition } from "@/components/page-transition";

export default function FleetPage() {
  return (
    <PageTransition>
      <FleetView />
    </PageTransition>
  );
}
