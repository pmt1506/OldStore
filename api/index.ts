import { app } from "../src/app.js";

// Vercel's Node.js runtime accepts any (req, res) => void handler, and an
// Express app instance already is one — no separate adapter needed. Do NOT
// call app.listen() here; Vercel owns the HTTP server.
export default app;
