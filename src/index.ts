import { createApp } from "./http/app";
import { config } from "./config/env";

const app = createApp();

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[bbps-go] listening on :${config.port} (BBPS_MODE=${config.bbpsMode})`);
});
