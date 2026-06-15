/** Temporary stub for routes filled in later phases. */
export function Placeholder({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center">
        <h1 className="text-lg font-semibold text-slate-200">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Arriving in {phase}.</p>
      </div>
    </div>
  )
}
