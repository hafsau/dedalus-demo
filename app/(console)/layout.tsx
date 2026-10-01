import { Providers } from "@/components/providers";

/** Console routes boot the in-browser control plane; /about stays static. */
export default function ConsoleLayout({ children }: LayoutProps<"/">) {
  return <Providers>{children}</Providers>;
}
