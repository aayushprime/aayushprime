import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
// The server owns the URL split, so the prefix is imported rather than
// repeated. Config is Node-side, so reaching into the server package is fine.
import { EDITOR_PATH } from "../server/src/routes.ts";

// Mounted by studio/server in middleware mode, so there is deliberately no
// `server` block here: the port, the API routes and the site mirror are all
// owned by the server, which also sets appType. Running vite standalone
// against this config would serve the UI with no backend behind it.
export default defineConfig({
  root: import.meta.dirname,
  // Every URL the editor owns lives under this prefix; the rest of the port is
  // a transparent mirror of Hugo. Client code reads it back as
  // import.meta.env.BASE_URL, so the prefix is written down exactly once.
  base: `${EDITOR_PATH}/`,
  plugins: [preact()],
});
