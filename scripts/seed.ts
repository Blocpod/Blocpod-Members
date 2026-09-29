import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execute, migrate, closeDb } from '../server/db';
import { hashPassword, demoEnabled } from '../server/auth';
import { seedFeatures } from '../server/seed-features';

export async function seedCore() {
  const plans = [
    [
      'operator',
      'Operator',
      49,
      490,
      'Get organized. Build momentum.',
      {
        resource_level: 1,
        room_level: 1,
        voting: false,
        submissions_monthly: 1,
        ai_monthly: 10,
        private_spaces: false,
        consultation: false,
        implementation: false,
      },
    ],
    [
      'builder',
      'Builder',
      179,
      1790,
      'Ship better systems with a working network.',
      {
        resource_level: 2,
        room_level: 2,
        voting: true,
        submissions_monthly: 3,
        ai_monthly: 50,
        private_spaces: false,
        consultation: false,
        implementation: false,
      },
    ],
    [
      'founder',
      'Founder',
      499,
      4990,
      'Build with experienced operators beside you.',
      {
        resource_level: 3,
        room_level: 3,
        voting: true,
        submissions_monthly: 10,
        ai_monthly: 200,
        private_spaces: true,
        consultation: true,
        implementation: false,
      },
    ],
    [
      'foundry',
      'Foundry',
      null,
      null,
      'A dedicated implementation partnership. By application.',
      {
        resource_level: 4,
        room_level: 4,
        voting: true,
        submissions_monthly: 25,
        ai_monthly: 500,
        private_spaces: true,
        consultation: true,
        implementation: true,
      },
    ],
  ] as const;
  for (const [id, name, monthly, annual, description, entitlements] of plans)
    await execute(
      'INSERT INTO plans(id,name,monthly_price,annual_price,description,entitlements) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING',
      [id, name, monthly, annual, description, JSON.stringify(entitlements)],
    );
  if (demoEnabled())
    for (const role of ['member', 'admin']) {
      const password = await hashPassword(randomUUID() + randomUUID());
      await execute(
        "INSERT INTO users(id,email,name,password_hash,role,plan_id,membership_status,onboarded,profile) VALUES($1,$2,$3,$4,$5,'founder','active',true,$6) ON CONFLICT(email) DO NOTHING",
        [
          `demo-${role}`,
          `demo-${role}@blocpod.local`,
          role === 'admin' ? 'Alex Morgan' : 'Jordan Lee',
          password,
          role,
          JSON.stringify({
            business_name: role === 'admin' ? 'Blocpod' : 'Studio North',
            stage: 'Growing',
            goal: 'Systemize my client delivery',
            industry: 'Professional services',
          }),
        ],
      );
      await execute('UPDATE users SET email_verified=true WHERE id=$1', [
        `demo-${role}`,
      ]);
    }
}
export async function seed() {
  await seedCore();
  await seedFeatures();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (existsSync('.env')) process.loadEnvFile('.env');
  await migrate();
  if (process.argv.includes('--core')) await seedCore();
  else await seed();
  await closeDb();
  console.log('Seed completed. Demo accounts require local DEMO_MODE=true.');
}
