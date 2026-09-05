import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { CalendarBlank, Stack } from "@phosphor-icons/react";
import { getProfile, type Profile as ProfileData } from "../api.ts";
import { QuizCardView } from "../components/QuizCardView.tsx";
import { ErrorBox } from "../components/ErrorBox.tsx";
import { Loading } from "../components/Loading.tsx";

export function Profile() {
  const { username } = useParams();
  const [data, setData] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    getProfile(username!)
      .then((d) => alive && setData(d))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [username]);

  if (error) return <ErrorBox message={error} />;
  if (!data) return <Loading />;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <img src={data.avatarUrl} alt="" className="h-16 w-16 rounded-full bg-neutral-800" />
        <div>
          <h1 className="text-2xl font-semibold">{data.username}</h1>
          <p className="flex items-center gap-1.5 text-sm text-neutral-400">
            <CalendarBlank aria-hidden /> Member since {new Date(data.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>
      {data.quizzes.length === 0 ? (
        <p className="flex items-center gap-2 text-neutral-400">
          <Stack aria-hidden /> No published quizzes yet.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.quizzes.map((q) => (
            <QuizCardView key={q.id} quiz={q} />
          ))}
        </div>
      )}
    </div>
  );
}
