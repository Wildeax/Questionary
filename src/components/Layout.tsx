import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { MeProvider, useMe } from "../me.tsx";
import { logout } from "../api.ts";

export function Layout() {
  return (
    <MeProvider>
      <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col">
        <Header />
        <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8">
          <Outlet />
        </main>
      </div>
    </MeProvider>
  );
}

function Header() {
  const { me, loading, refresh } = useMe();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  useEffect(() => {
    setQ(params.get("q") ?? "");
  }, [params]);

  return (
    <header className="w-full border-b border-neutral-800 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/80">
      <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-4">
        <Link to="/" className="text-lg font-semibold tracking-tight whitespace-nowrap">
          Questionary
        </Link>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search quizzes"
            aria-label="Search quizzes"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </form>
        <Link to="/local" className="text-sm text-neutral-300 hover:text-white whitespace-nowrap">
          Play a file
        </Link>
        {loading ? null : me ? (
          <details key={location.pathname} className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-2">
              <img src={me.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-neutral-800" />
              <span className="text-sm hidden sm:inline">{me.username}</span>
            </summary>
            <div className="absolute right-0 mt-2 w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-1 text-sm">
              <Link to="/me" className="block px-4 py-2 hover:bg-neutral-800">My quizzes</Link>
              <Link to="/new" className="block px-4 py-2 hover:bg-neutral-800">New quiz</Link>
              <Link to={`/u/${me.username}`} className="block px-4 py-2 hover:bg-neutral-800">Profile</Link>
              <button
                onClick={async () => {
                  await logout();
                  await refresh();
                  navigate("/");
                }}
                className="block w-full text-left px-4 py-2 hover:bg-neutral-800"
              >
                Sign out
              </button>
            </div>
          </details>
        ) : (
          <a href="/api/auth/github" className="rounded-xl px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium whitespace-nowrap">
            Sign in with GitHub
          </a>
        )}
      </div>
      {params.get("error") === "auth" && (
        <div className="mx-auto max-w-5xl px-4 pb-3 text-sm text-red-400">GitHub sign-in failed. Try again.</div>
      )}
    </header>
  );
}
