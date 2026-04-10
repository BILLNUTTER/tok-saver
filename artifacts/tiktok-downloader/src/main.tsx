import { createRoot } from "react-dom/client";
import { setBaseUrl } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";

// The API is served at /api on the same host as the frontend — no configuration
// needed. VITE_API_URL can optionally override this for non-standard setups.
const apiUrl = import.meta.env.VITE_API_URL ?? null;
setBaseUrl(apiUrl);

createRoot(document.getElementById("root")!).render(<App />);
