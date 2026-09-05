import { CircleNotch } from "@phosphor-icons/react";

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-neutral-400">
      <CircleNotch className="animate-spin" aria-hidden />
      {label}…
    </p>
  );
}
