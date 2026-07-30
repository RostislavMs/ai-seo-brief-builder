import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Не знайдено елемент #root у index.html");
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      {/* AuthProvider — над роутером сторінок: стан входу потрібен і
          сторінкам застосунку, і формам /login, /register. */}
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
