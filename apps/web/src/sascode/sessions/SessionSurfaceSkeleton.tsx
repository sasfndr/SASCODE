// FILE: sascode/sessions/SessionSurfaceSkeleton.tsx
// Purpose: The quiet placeholder shown while a session surface loads.
// Layer: Presentation.
//
// Deliberately still: a shimmering skeleton in a calm workspace reads as noise.
// Shape and hierarchy are suggested, nothing moves.

export function SessionSurfaceSkeleton() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-6" aria-hidden="true">
      <div className="flex items-center gap-3">
        <div
          className="h-3 w-32 rounded-full"
          style={{ backgroundColor: "var(--sas-line-strong)" }}
        />
        <div
          className="ms-auto h-3 w-20 rounded-full"
          style={{ backgroundColor: "var(--sas-line)" }}
        />
      </div>
      <div className="flex-1 space-y-3">
        {[72, 88, 54, 80, 40].map((width) => (
          <div
            key={width}
            className="h-2.5 rounded-full"
            style={{ width: `${width}%`, backgroundColor: "var(--sas-line)" }}
          />
        ))}
      </div>
      <div
        className="h-14 rounded-[var(--sas-radius-md)]"
        style={{ backgroundColor: "var(--sas-surface-sunken)" }}
      />
      <span className="sas-sr-only">Loading session</span>
    </div>
  );
}

export function ProjectSpaceSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <div
          className="size-8 rounded-[var(--sas-radius-sm)]"
          style={{ backgroundColor: "var(--sas-surface-raised)" }}
        />
        <p className="text-[12px]" style={{ color: "var(--sas-text-on-canvas-secondary)" }}>
          Opening workspace
        </p>
      </div>
    </div>
  );
}
