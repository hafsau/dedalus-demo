export function BootScreen({ error }: { error: string }) {
  return (
    <div className="reticle flex max-w-xl flex-col gap-3 p-8 font-mono text-sm" role="alert">
      <p className="text-danger">Couldn&apos;t start the simulated control plane.</p>
      <p className="text-muted">{error}</p>
      <p className="text-dim">
        Workshop runs its API in a Service Worker. Private browsing or blocked site data can prevent that. Try a normal
        window.
      </p>
    </div>
  );
}
