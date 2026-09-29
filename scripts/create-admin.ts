import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
if (existsSync('.env')) process.loadEnvFile('.env');
const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (
  !email ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
  !password ||
  password.length < 16
) {
  throw new Error(
    'Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 16 characters) in your shell. These values are never printed.',
  );
}
const { hashPassword } = await import('../server/auth');
const { execute, one, closeDb } = await import('../server/db');
try {
  if (await one('SELECT id FROM users WHERE email=$1', [email]))
    throw new Error(
      'Account already exists. Use an existing administrator to change its role.',
    );
  await execute(
    "INSERT INTO users(id,email,name,password_hash,role,plan_id,membership_status,onboarded,email_verified) VALUES($1,$2,$3,$4,'admin','founder','active',TRUE,TRUE)",
    [
      randomUUID(),
      email,
      process.env.ADMIN_NAME || 'Blocpod Administrator',
      await hashPassword(password),
    ],
  );
  console.log(
    'Administrator created. Remove ADMIN_PASSWORD from your shell after this command.',
  );
} finally {
  await closeDb();
}
