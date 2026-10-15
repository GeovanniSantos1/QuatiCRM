/** Shared brand mark: decorative beside the visible Quati wordmark. */
export function QuatiMark({ className = "size-10" }: { className?: string }) {
  return (
    <img
      src="/quati-mark.svg"
      width={40}
      height={40}
      className={`shrink-0 ${className}`}
      alt=""
      aria-hidden="true"
    />
  );
}
