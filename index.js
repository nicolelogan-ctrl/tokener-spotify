import app from './src/app.js';
import { DEFAULT_PORT } from './src/config/constants.js';
import { loadLocalSecretsDict } from './src/services/secret.service.js';

if (process.env.NODE_ENV !== 'test') {
  loadLocalSecretsDict();
  app.listen(DEFAULT_PORT, () => {
    console.log(`[Spotify Token Generator] Listening on port ${DEFAULT_PORT}`);
  });
}

export default app;

