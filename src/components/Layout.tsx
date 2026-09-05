import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from "react-router";
import { CaretDown, FileArrowUp, GithubLogo, IconContext, MagnifyingGlass, PlusCircle, SignOut, Stack, UserCircle } from "@phosphor-icons/react";
import { MeProvider, useMe } from "../me.tsx";
import { logout } from "../api.ts";

export function Layout() {
  return (
    <MeProvider>
      <IconContext.Provider value={{ size: 18, weight: "duotone" }}>
        <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 flex flex-col">
          <Header />
          <main className="flex-1 mx-auto max-w-5xl w-full px-4 py-8">
            <Outlet />
          </main>
        </div>
      </IconContext.Provider>
    </MeProvider>
  );
}

const menuItem = "flex items-center gap-2 px-4 py-2 hover:bg-neutral-800";

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
        <Link to="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight whitespace-nowrap">
          <img src="/icon.svg" alt="" className="h-7 w-7" />
          Questionary
        </Link>
        <form
          className="flex-1 relative"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/");
          }}
        >
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search quizzes"
            aria-label="Search quizzes"
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
          />
        </form>
        <Link to="/local" className="flex items-center gap-1.5 text-sm text-neutral-300 hover:text-white whitespace-nowrap">
          <FileArrowUp aria-hidden />
          <span className="hidden sm:inline">Play a file</span>
        </Link>
        {loading ? null : me ? (
          <details key={location.pathname} className="relative">
            <summary className="list-none cursor-pointer flex items-center gap-2">
              <img src={me.avatarUrl} alt="" className="h-8 w-8 rounded-full bg-neutral-800" />
              <span className="text-sm hidden sm:inline">{me.username}</span>
              <CaretDown size={14} weight="bold" className="text-neutral-400" aria-hidden />
            </summary>
            <div className="absolute right-0 mt-2 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-xl py-1 text-sm">
              <Link to="/me" className={menuItem}>
                <Stack aria-hidden /> My quizzes
              </Link>
              <Link to="/new" className={menuItem}>
                <PlusCircle aria-hidden /> New quiz
              </Link>
              <Link to={`/u/${me.username}`} className={menuItem}>
                <UserCircle aria-hidden /> Profile
              </Link>
              <button
                onClick={async () => {
                  await logout();
                  await refresh();
                  navigate("/");
                }}
                className={`${menuItem} w-full text-left`}
              >
                <SignOut aria-hidden /> Sign out
              </button>
            </div>
          </details>
        ) : (
          <a href="/api/auth/github" className="flex items-center gap-2 rounded-xl px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-sm font-medium whitespace-nowrap">
            <GithubLogo weight="fill" aria-hidden />
            <span className="hidden sm:inline">Sign in with GitHub</span>
            <span className="sm:hidden">Sign in</span>
          </a>
        )}
      </div>
      {params.get("error") === "auth" && (
        <div className="mx-auto max-w-5xl px-4 pb-3 text-sm text-red-400">GitHub sign-in failed. Try again.</div>
      )}
    </header>
  );
}
