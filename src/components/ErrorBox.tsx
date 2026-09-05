import { WarningCircle } from "@phosphor-icons/react";

export function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="mt-4 flex items-start gap-2 text-sm text-red-400 whitespace-pre-wrap">
      <WarningCircle className="mt-0.5 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
