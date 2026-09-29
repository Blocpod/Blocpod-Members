import { migrate, closeDb } from '../server/db';
import { existsSync } from 'node:fs';
if (existsSync('.env')) process.loadEnvFile('.env');
await migrate();
await closeDb();
console.log('Database migrations applied.');
