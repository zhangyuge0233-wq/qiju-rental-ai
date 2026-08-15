import { createApp } from './app.js';
import { createServerConfig } from './config.js';

const config = createServerConfig(process.env);
const app = createApp(process.env);

app.listen(config.port, () => {
  console.log(`Qiju rental AI server listening on port ${config.port}`);
});
