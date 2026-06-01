// Loading-state primitives. These render inside each route's loading.tsx; the
// app shell lives in app/layout.tsx and stays put, so only the page body
// (the <main>) is replaced by a skeleton while the server data loads.

/** A single shimmering block. Size it with className (w-/h-) or style. */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

/**
 * Generic page skeleton for the lighter data pages (Files, Categories,
 * Accounts, Settings, Transfers, Payroll, Credit Cards, Review). A title row +
 * a row of stat tiles + a tall content block — enough to hold the layout
 * without pretending to match every page exactly. Wrap in the page's own
 * <main className> so width/padding match and nothing shifts on load.
 */
export function GenericPageSkeleton({ tiles = 3 }: { tiles?: number }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 opacity-60" />
      </div>
      {tiles > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}>
          {Array.from({ length: tiles }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}
      <Skeleton className="h-[420px] w-full rounded-xl" />
    </div>
  );
}
