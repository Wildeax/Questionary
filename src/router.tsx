import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { Local } from "./pages/Local.tsx";
import { NotFound } from "./pages/NotFound.tsx";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <Local /> },
      { path: "local", element: <Local /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);
