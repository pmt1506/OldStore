import { app } from "./app.js";
import { config } from "./config.js";

const server = app.listen(config.port, () => {
  console.log(`OldStore dang chay tai http://localhost:${config.port}`);
});

// IPA downloads can legitimately take minutes on a slow connection.
server.requestTimeout = 30 * 60 * 1000;
server.headersTimeout = 30 * 60 * 1000 + 5000;
