import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";
import { startAppStore } from "./store/app-store";
import { startUpdateStore } from "./store/update-store";

void startAppStore();
void startUpdateStore();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
