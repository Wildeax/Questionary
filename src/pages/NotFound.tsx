import { Link } from "react-router";
import { Ghost, House } from "@phosphor-icons/react";

export function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-neutral-400">
      <Ghost size={56} aria-hidden />
      <p>That page does not exist.</p>
      <Link to="/" className="flex items-center gap-1.5 underline">
        <House aria-hidden /> Go home
      </Link>
    </div>
  );
}
