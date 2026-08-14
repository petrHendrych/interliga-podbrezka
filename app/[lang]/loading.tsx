// This boundary is what `<Link>` prefetches as the route shell, so it is also what renders
// when a navigation is held pending by `experimental.useOffline`.
export default function Loading() {
  return (
    <div className="p-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto w-full">
      <div className="h-9 w-56 animate-pulse rounded-xl bg-surface-2" />
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
        <div className="h-32 animate-pulse rounded-2xl bg-surface-2" />
      </div>
    </div>
  );
}
