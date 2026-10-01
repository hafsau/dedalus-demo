import type { Metadata } from "next";
import { MachineDetail } from "@/components/machine-detail";
import { PageTransition } from "@/components/page-transition";
import { hostname } from "@/lib/client/rules";

export async function generateMetadata({ params }: PageProps<"/machines/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: hostname(id) };
}

export default async function MachinePage({ params }: PageProps<"/machines/[id]">) {
  const { id } = await params;
  return (
    <PageTransition>
      <MachineDetail id={id} />
    </PageTransition>
  );
}
