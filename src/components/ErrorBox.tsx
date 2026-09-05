export function ErrorBox({ message }: { message: string }) {
  return <div className="mt-4 text-sm text-red-400 whitespace-pre-wrap">{message}</div>;
}
