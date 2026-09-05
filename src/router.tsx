import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Local } from "./pages/Local.tsx";
import { NotFound } from "./pages/NotFound.tsx";
import { Catalog } from "./pages/Catalog.tsx";
import { Quiz } from "./pages/Quiz.tsx";
import { Play } from "./pages/Play.tsx";
import { Publish } from "./pages/Publish.tsx";
import { Me } from "./pages/Me.tsx";
import { Profile } from "./pages/Profile.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Catalog /> },
      { path: "local", element: <Local /> },
      { path: "quiz/:id", element: <Quiz /> },
      { path: "quiz/:id/play", element: <Play /> },
      { path: "quiz/:id/edit", element: <Publish /> },
      { path: "new", element: <Publish /> },
      { path: "u/:username", element: <Profile /> },
      { path: "me", element: <Me /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
