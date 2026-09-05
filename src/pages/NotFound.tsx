import { Link } from "react-router";

export function NotFound() {
  return (
    <p className="text-neutral-400">
      That page does not exist. <Link to="/" className="underline">Go home</Link>.
    </p>
  );
}
