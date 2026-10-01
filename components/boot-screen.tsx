export function BootScreen({ error }: { error?: string }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center gap-3 px-4 font-mono text-sm" role="status">
      {error ? (
        <>
          <p className="text-danger">Couldn&apos;t start the simulated control plane.</p>
          <p className="text-muted">{error}</p>
          <p className="text-dim">
            Workshop runs its API in a Service Worker. Private browsing or blocked site data can prevent that. Try a
            normal window.
          </p>
        </>
      ) : (
        <p className="text-muted">
          <span className="text-accent">▍</span> starting simulated control plane<span className="caret">…</span>
        </p>
      )}
    </div>
  );
}
