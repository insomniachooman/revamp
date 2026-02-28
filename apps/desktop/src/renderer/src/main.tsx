import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppFrame } from "./components/AppFrame";
import { HomePage } from "./pages/HomePage";
import { RecordPage } from "./pages/RecordPage";
import { StudioPage } from "./pages/StudioPage";
import { SettingsPage } from "./pages/SettingsPage";
import "./styles/app.css";

const queryClient = new QueryClient();

const router = createHashRouter([
  {
    path: "/",
    element: <AppFrame />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "record", element: <RecordPage /> },
      { path: "studio/:projectId", element: <StudioPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);

