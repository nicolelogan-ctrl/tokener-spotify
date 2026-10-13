import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSecrets } from '../src/services/secret.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSecretUpdate() {
  console.log('[Secret Update] Extracting secrets from Spotify Web Player...');
  const result = await extractSecrets();

  if (!result.success) {
    console.error('[Secret Update] Extraction failed:', result.message);
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..');
  const secretsDir = path.join(projectRoot, 'secrets');

  if (!fs.existsSync(secretsDir)) {
    fs.mkdirSync(secretsDir, { recursive: true });
  }

  fs.writeFileSync(
    path.join(secretsDir, 'secrets.json'),
    JSON.stringify(result.secrets, null, 2)
  );

  fs.writeFileSync(
    path.join(secretsDir, 'secretsBytes.json'),
    JSON.stringify(result.secretsBytes)
  );

  fs.writeFileSync(
    path.join(secretsDir, 'secretDict.json'),
    JSON.stringify(result.secretsDict)
  );

  console.log(`[Secret Update] Successfully extracted and saved ${result.secrets?.length || 0} secret(s) to ${secretsDir}`);
}

runSecretUpdate();
