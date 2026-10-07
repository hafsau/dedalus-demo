"use client";

import { Command } from "cmdk";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { availability, hostname, phaseLabel, type Action } from "@/lib/client/rules";
import { getEngine, resetSimulator } from "@/lib/sim/store";
import { OPEN_CREATE_EVENT } from "./new-machine-dialog";
import { OPEN_PALETTE_EVENT } from "./palette-button";
import { useFleet, useFleetStore } from "./providers";
import { FOCUS_TERMINAL_EVENT } from "./terminal";

const item =
  "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm text-muted data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40 data-[selected=true]:bg-accent/10 data-[selected=true]:text-fg";
const group = "[&_[cmdk-group-heading]]:eyebrow [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const fleet = useFleet();
  const store = useFleetStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  const currentId = pathname.match(/^\/machines\/([^/]+)/)?.[1];
  const current = currentId ? fleet.machines[currentId] : undefined;

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const machineAction = (action: Action, label: string, fn: () => void) => {
    if (!current) return null;
    const a = availability(action, current.item.phase, current.item.desired_state);
    return (
      <Command.Item key={action} className={item} disabled={!a.allowed} onSelect={() => run(fn)} keywords={[action]}>
        <span>{label}</span>
        {!a.allowed && <span className="text-[11px] text-dim">{a.reason}</span>}
      </Command.Item>
    );
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      overlayClassName="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
      contentClassName="fixed top-[18vh] left-1/2 z-50 w-[min(560px,calc(100vw-32px))] -translate-x-1/2 border border-line-strong bg-raised shadow-2xl"
      loop
    >
      <Command.Input
        placeholder="Type a command or search machines…"
        className="w-full border-b border-line bg-transparent px-4 py-3.5 text-sm text-fg outline-none placeholder:text-dim"
      />
      <Command.List className="max-h-[50vh] overflow-y-auto py-1">
        <Command.Empty className="px-4 py-6 text-center text-sm text-dim">No matches.</Command.Empty>

        {current && (
          <Command.Group heading={`${hostname(current.item.machine_id)} · ${phaseLabel(current.item.phase)}`} className={group}>
            {machineAction("exec", "Run a command…", () => window.dispatchEvent(new Event(FOCUS_TERMINAL_EVENT)))}
            {machineAction("wake", "Wake", () => store.wake(current.item.machine_id))}
            {machineAction("sleep", "Sleep", () => store.sleep(current.item.machine_id))}
            {machineAction("reboot", "Reboot (fresh memory, keeps files)", () => store.reboot(current.item.machine_id))}
            {machineAction("destroy", "Destroy", () => {
              void store.destroy(current.item.machine_id);
              router.push("/");
            })}
          </Command.Group>
        )}

        <Command.Group heading="Fleet" className={group}>
          <Command.Item className={item} onSelect={() => run(() => window.dispatchEvent(new Event(OPEN_CREATE_EVENT)))}>
            New machine
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => router.push("/"))}>
            Go to fleet
          </Command.Item>
          {fleet.order
            .map((id) => fleet.machines[id])
            .filter((m) => m && m.item.phase !== "destroyed" && m.item.machine_id !== currentId)
            .map((m) => (
              <Command.Item
                key={m.item.machine_id}
                className={item}
                value={`open ${hostname(m.item.machine_id)} ${m.item.machine_id}`}
                onSelect={() => run(() => router.push(`/machines/${m.item.machine_id}`))}
              >
                <span className="font-mono">Open {hostname(m.item.machine_id)}</span>
                <span className="text-[11px] text-dim">{phaseLabel(m.item.phase)}</span>
              </Command.Item>
            ))}
        </Command.Group>

        <Command.Group heading="Simulator" className={group}>
          {current && (
            <Command.Item
              className={item}
              value="inject boot failure"
              onSelect={() =>
                run(() => {
                  getEngine().failNextWake(current.item.machine_id, Date.now());
                  store.kick();
                })
              }
            >
              <span>Fail the next boot of {hostname(current.item.machine_id)}</span>
              <span className="text-[11px] text-dim">see the error state</span>
            </Command.Item>
          )}
          <Command.Item
            className={item}
            value="reset simulator"
            onSelect={() =>
              run(() => {
                resetSimulator();
                store.kick();
                router.push("/");
              })
            }
          >
            <span>Reset simulator</span>
            <span className="text-[11px] text-dim">destroys everything</span>
          </Command.Item>
          <Command.Item className={item} onSelect={() => run(() => router.push("/about"))}>
            About this project
          </Command.Item>
        </Command.Group>
      </Command.List>
      <div className="flex justify-between border-t border-line px-4 py-2 font-mono text-[10px] text-dim">
        <span>↑↓ navigate · ↵ select · esc close</span>
        <span>actions the API would reject are disabled</span>
      </div>
    </Command.Dialog>
  );
}
