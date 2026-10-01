import { MachineDetail } from "@/components/machine-detail";
import { PageTransition } from "@/components/page-transition";

export default async function MachinePage({ params }: PageProps<"/machines/[id]">) {
  const { id } = await params;
  return (
    <PageTransition>
      <MachineDetail id={id} />
    </PageTransition>
  );
}
