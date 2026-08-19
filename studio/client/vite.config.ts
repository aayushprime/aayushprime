import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Mounted by studio/server in middleware mode, so there is deliberately no
// `server` block here: the port, the /api routes and the /preview proxy are
// all owned by the server, which also sets appType. Running vite standalone
// against this config would serve the UI with no backend behind it.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact()],
});
