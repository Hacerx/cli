import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerCommands } from './cli.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


await registerCommands({dirPath: path.join(__dirname, 'commands')});