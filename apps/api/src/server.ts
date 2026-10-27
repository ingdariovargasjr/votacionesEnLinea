import "dotenv/config";
import { app } from "./app.js";
import { config } from "./config.js";

app.listen(config.port, "0.0.0.0", () => {
  console.log(`Gala API listening on port ${config.port}`);
  if (!config.supabaseUrl || !config.supabaseAnonKey || !config.supabaseServiceRoleKey) {
    console.warn("Supabase is not configured; database routes will return 503.");
  }
});
