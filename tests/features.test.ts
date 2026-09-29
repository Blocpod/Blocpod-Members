import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { featureRoutes, rankResources } from '../server/features';
import { migrate, execute, one, closeDb } from '../server/db';
import { getUser } from '../server/auth';
import { seedCore } from '../scripts/seed';
import { seedFeatures } from '../server/seed-features';
import { runDueJobs, runWorkflow, queueWorkflow } from '../server/jobs';
import { authorizeJobRequest, dispatchJobs } from '../server/job-dispatch';
import backgroundWorker from '../netlify/functions/jobs-background';
import type { AppEnv } from '../server/types';

process.env.NODE_ENV = 'test';
process.env.PGLITE_PATH = 'memory://';
delete process.env.DATABASE_URL;
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.DEMO_MODE;
const app = new Hono<AppEnv>();
app.use('*', async (c, next) => {
  c.set('user', await getUser(c.req.header('x-test-user') || ''));
  await next();
});
app.route('/api', featureRoutes);
app.onError((error, c) =>
  c.json(
    { error: error.message },
    error instanceof HTTPException ? error.status : 500,
  ),
);
async function request(
  path: string,
  user = 'builder',
  method = 'GET',
  body?: unknown,
) {
  return app.request('/api' + path, {
    method,
    headers: { 'x-test-user': user, 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
async function json(
  path: string,
  user = 'builder',
  method = 'GET',
  body?: unknown,
) {
  const response = await request(path, user, method, body);
  const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}
before(async () => {
  await migrate();
  await seedCore();
  await seedFeatures();
  for (const [userId, plan, role] of [
    ['operator', 'operator', 'member'],
    ['builder', 'builder', 'member'],
    ['founder', 'founder', 'member'],
    ['other', 'founder', 'member'],
    ['admin', 'foundry', 'admin'],
    ['staff', 'foundry', 'staff'],
  ])
    await execute(
      `INSERT INTO users(id,email,name,password_hash,plan_id,role,membership_status,email_verified) VALUES($1,$2,$1,'unused',$3,$4,'active',TRUE)`,
      [userId, `${userId}@example.test`, plan, role],
    );
});
after(async () => {
  await closeDb();
});

test('resource details, bookmarks and drafts enforce access on the server', async () => {
  assert.equal((await request('/resources', '')).status, 401);
  const list = await json('/resources', 'operator');
  assert.equal(
    list.resources.find((r: any) => r.id === 'qualification-system').locked,
    true,
  );
  assert.equal(
    list.resources.some((r: any) => 'body' in r),
    false,
  );
  assert.equal(
    (await request('/resources/qualification-system', 'operator')).status,
    403,
  );
  assert.equal(
    (await request('/resources/qualification-system/save', 'operator', 'POST'))
      .status,
    403,
  );
  assert.match(
    (await json('/resources/qualification-system')).resource.body,
    /qualification/,
  );
  assert.equal(
    (await json('/resources/qualification-system/save', 'builder', 'POST'))
      .saved,
    true,
  );
  assert.equal((await json('/resources?saved=1')).resources.length, 1);
  assert.equal(
    (await json('/resources/qualification-system/save', 'builder', 'POST'))
      .saved,
    false,
  );
  await execute(
    "UPDATE users SET membership_status='past_due' WHERE id='builder'",
  );
  assert.equal((await request('/resources/qualification-system')).status, 403);
  await execute(
    "UPDATE users SET membership_status='active' WHERE id='builder'",
  );
});

let buildId = '';
test('Build Queue isolates private context, counts monthly quota and gates voting', async () => {
  const input = {
    title: 'Qualification workflow',
    summary: 'I need an internal qualification workflow with human review.',
    context: {
      industry: 'SECRET-INDUSTRY',
      current_process: 'SECRET-PROCESS',
      tools: 'CRM',
      bottleneck: 'manual',
      outcome: 'faster',
      urgency: 'month',
      links: [],
    },
  };
  const created = await json('/requests', 'operator', 'POST', input);
  buildId = created.request.id;
  assert.equal(created.request.context.industry, 'SECRET-INDUSTRY');
  assert.equal(
    (await request('/requests', 'operator', 'POST', input)).status,
    429,
  );
  const other = await json('/requests', 'other');
  const serialized = JSON.stringify(other);
  assert.equal(serialized.includes('SECRET-'), false);
  assert.equal(other.requests.find((r: any) => r.id === buildId).context, null);
  assert.equal(
    (await request(`/requests/${buildId}/vote`, 'operator', 'POST')).status,
    403,
  );
  assert.equal(
    (await json(`/requests/${buildId}/vote`, 'builder', 'POST')).voted,
    true,
  );
  assert.equal(
    (await json(`/requests/${buildId}/vote`, 'builder', 'POST')).voted,
    false,
  );
  assert.equal((await request('/admin/requests', 'builder')).status, 403);
  assert.match(
    JSON.stringify(await json('/admin/requests', 'admin')),
    /SECRET-INDUSTRY/,
  );
});

test('private and organization rooms stay scoped in room lists, threads, reactions and search', async () => {
  await execute(
    "INSERT INTO organizations(id,name) VALUES('org-one','One'),('org-two','Two')",
  );
  await execute(
    "UPDATE users SET organization_id='org-one' WHERE id='founder'",
  );
  await execute("UPDATE users SET organization_id='org-two' WHERE id='other'");
  const { room } = await json('/admin/rooms', 'admin', 'POST', {
    name: 'Private room',
    description: 'Sensitive',
    is_private: true,
    level: 3,
    organization_id: 'org-one',
    members: ['founder', 'other'],
  });
  const posted = await json(`/rooms/${room.id}/messages`, 'founder', 'POST', {
    body: 'CONFIDENTIAL-MARKER',
  });
  assert.equal(
    (await request(`/rooms/${room.id}/messages`, 'other')).status,
    404,
  );
  assert.equal(
    (await json('/rooms', 'other')).rooms.some((r: any) => r.id === room.id),
    false,
  );
  assert.equal(
    JSON.stringify(await json('/search?q=CONFIDENTIAL', 'other')).includes(
      'CONFIDENTIAL-MARKER',
    ),
    false,
  );
  assert.equal(
    (
      await request(
        `/messages/${posted.message.id}/reaction`,
        'other',
        'POST',
        { emoji: '👍' },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await request('/rooms/ai-systems/messages', 'founder', 'POST', {
        body: 'Cross-room reply',
        parent_id: posted.message.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (await request('/rooms/builders/messages', 'operator')).status,
    403,
  );
  const first = await json('/rooms/ai-systems/messages', 'builder', 'POST', {
    body: 'A useful public discussion',
  });
  const reply = await json('/rooms/ai-systems/messages', 'founder', 'POST', {
    body: 'A threaded reply',
    parent_id: first.message.id,
  });
  assert.equal(reply.message.parent_id, first.message.id);
  assert.equal(
    (
      await json(`/messages/${first.message.id}/reaction`, 'founder', 'POST', {
        emoji: '💡',
      })
    ).reacted,
    true,
  );
  const messages = await json('/rooms/ai-systems/messages');
  assert.equal(
    messages.messages.find((m: any) => m.id === first.message.id).reactions[0]
      .count,
    1,
  );
  assert.ok(
    (await json('/notifications', 'builder')).notifications.some((n: any) =>
      n.title.includes('reply'),
    ),
  );
});

test('report resolution hides messages and member/plan administration requires admin role', async () => {
  const message = (
    await json('/rooms/ai-systems/messages', 'builder', 'POST', {
      body: 'A reportable message',
    })
  ).message;
  await json(`/messages/${message.id}/report`, 'founder', 'POST', {
    reason: 'Review this demonstration message',
  });
  const report = (await json('/admin/reports', 'admin')).reports.find(
    (r: any) => r.message_id === message.id,
  );
  await json(`/admin/reports/${report.id}`, 'admin', 'PATCH', {
    status: 'resolved',
    action: 'hide_message',
  });
  assert.equal(
    (await json('/rooms/ai-systems/messages')).messages.some(
      (m: any) => m.id === message.id,
    ),
    false,
  );
  assert.equal(
    (
      await request('/admin/members/operator', 'staff', 'PATCH', {
        plan_id: 'founder',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request('/admin/plans/operator', 'staff', 'PATCH', {
        monthly_price: 0,
      })
    ).status,
    403,
  );
  await json('/admin/members/operator', 'admin', 'PATCH', {
    entitlement_overrides: { resource_level: 2 },
  });
  assert.equal(
    (await request('/resources/qualification-system', 'operator')).status,
    200,
  );
});

test('authoring enforces human approval and preserves previous content versions', async () => {
  const draft = {
    title: 'A new guide',
    summary: 'Useful and approved content',
    body: '# First version',
    category: 'intelligence',
    level: 1,
  };
  assert.equal(
    (await request('/admin/resources', 'builder', 'POST', draft)).status,
    403,
  );
  assert.equal(
    (
      await request('/admin/resources', 'admin', 'POST', {
        ...draft,
        status: 'published',
      })
    ).status,
    400,
  );
  const { resource } = await json('/admin/resources', 'admin', 'POST', draft);
  assert.equal((await request(`/resources/${resource.id}`)).status, 404);
  await json(`/admin/resources/${resource.id}`, 'admin', 'PATCH', {
    status: 'published',
    approved: true,
  });
  assert.equal((await request(`/resources/${resource.id}`)).status, 200);
  await json(`/admin/resources/${resource.id}`, 'admin', 'PATCH', {
    body: '# Changed content',
  });
  assert.equal((await request(`/resources/${resource.id}`)).status, 404);
  assert.equal(
    (
      await one<any>(
        'SELECT COUNT(*)::int AS count FROM resource_versions WHERE resource_id=$1',
        [resource.id],
      )
    )?.count,
    2,
  );
  await json(`/admin/resources/${resource.id}`, 'admin', 'PATCH', {
    status: 'scheduled',
    approved: true,
    publish_at: new Date(Date.now() - 1000).toISOString(),
  });
  const run = await runDueJobs();
  assert.equal(run.published, 1);
  assert.equal((await request(`/resources/${resource.id}`)).status, 200);
});

test('request administration merges votes and clears optional assignments', async () => {
  const target = (
    await json('/requests', 'builder', 'POST', {
      title: 'Related qualification idea',
      summary: 'An idea for human reviewed qualification.',
    })
  ).request;
  await json(`/requests/${buildId}/vote`, 'builder', 'POST');
  await json(`/admin/requests/${buildId}`, 'admin', 'PATCH', {
    assigned_to: 'admin',
    resource_id: 'qualification-system',
    status: 'reviewing',
    update_note: 'Investigating the workflow.',
  });
  await json(`/admin/requests/${buildId}`, 'admin', 'PATCH', {
    assigned_to: null,
    resource_id: null,
  });
  const updated = await one<any>('SELECT * FROM build_requests WHERE id=$1', [
    buildId,
  ]);
  assert.equal(updated.assigned_to, null);
  assert.equal(updated.resource_id, null);
  await json(`/admin/requests/${buildId}/merge`, 'admin', 'POST', {
    target_id: target.id,
  });
  const list = await json('/requests');
  assert.equal(
    list.requests.some((r: any) => r.id === buildId),
    false,
  );
  assert.equal(list.requests.find((r: any) => r.id === target.id).votes, 1);
});

test('projects and notifications are owner-scoped; Foundry context remains private', async () => {
  assert.equal(
    (
      await request('/projects', 'operator', 'POST', {
        name: 'Unauthorized workspace',
      })
    ).status,
    403,
  );
  const project = (
    await json('/projects', 'founder', 'POST', {
      name: 'My private project',
      goal: 'PRIVATE-GOAL',
      resource_ids: ['qualification-system'],
    })
  ).project;
  assert.equal((await json('/projects', 'other')).projects.length, 0);
  assert.equal(
    (
      await request(`/projects/${project.id}`, 'other', 'PATCH', {
        name: 'Hijack',
      })
    ).status,
    404,
  );
  await json('/foundry', 'founder', 'POST', {
    company: 'Private Co',
    goal: 'PRIVATE-FOUNDRY-SCOPE',
    scope: 'Confidential implementation',
  });
  assert.equal(
    JSON.stringify(await json('/search?q=PRIVATE', 'other')).includes(
      'PRIVATE-FOUNDRY-SCOPE',
    ),
    false,
  );
  const notifications = (await json('/notifications', 'founder')).notifications;
  assert.ok(notifications.length > 0);
  await json('/notifications', 'other', 'PATCH', { id: notifications[0].id });
  assert.equal(
    (
      await one<any>('SELECT read_at FROM notifications WHERE id=$1', [
        notifications[0].id,
      ])
    ).read_at,
    null,
  );
  await json('/notifications', 'founder', 'PATCH', { all: true });
  assert.equal(
    (await json('/notifications', 'founder')).notifications.every(
      (n: any) => n.read_at !== null,
    ),
    true,
  );
});

test('jobs fail visibly without credentials, lease execution, and create only review drafts', async () => {
  const failure = await runWorkflow('weekly-intelligence');
  assert.equal(failure.status, 'failed');
  assert.match(failure.error || '', /not configured/);
  await execute(
    "UPDATE workflows SET lease_until=NOW()+INTERVAL '5 minutes' WHERE id='weekly-intelligence'",
  );
  assert.equal((await runWorkflow('weekly-intelligence')).skipped, true);
  await execute(
    "UPDATE workflows SET lease_until=NULL WHERE id='weekly-intelligence'",
  );
  const fetchOriginal = globalThis.fetch;
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.OPENAI_MODEL = 'test-model';
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        output: [
          {
            content: [
              { type: 'output_text', text: '# Draft from a mocked provider' },
            ],
          },
        ],
        usage: { total_tokens: 10 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  try {
    const success = await runWorkflow('weekly-intelligence');
    assert.equal(success.status, 'succeeded');
    const resource = await one<any>('SELECT * FROM resources WHERE id=$1', [
      success.artifact_id,
    ]);
    assert.equal(resource.status, 'review');
    assert.equal(resource.approved, false);
    assert.equal(
      (await request(`/resources/${success.artifact_id}`)).status,
      404,
    );
  } finally {
    globalThis.fetch = fetchOriginal;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  }
});

test('goal routing is labeled honestly and only recommends accessible resources', async () => {
  assert.equal(
    rankResources('qualification', [
      { title: 'Qualifying nothing', summary: '', tags: [] },
    ]).length,
    0,
  );
  const route = await json('/route-goal', 'builder', 'POST', {
    goal: 'I need to automate sales qualification',
  });
  assert.equal(route.method, 'keyword_rules');
  assert.ok(route.resources.length > 0);
  assert.equal(
    route.resources.some((r: any) => r.locked),
    false,
  );
  assert.equal(
    (
      await json('/route-goal', 'builder', 'POST', {
        goal: 'A custom implementation across multiple departments',
      })
    ).route,
    'foundry',
  );
  const analytics = await json('/admin/analytics', 'admin');
  assert.ok(analytics.stats.members >= 4);
  assert.ok(analytics.events.some((e: any) => e.event === 'goal_routed'));
});

test('shared queue and search omit community data after membership expiry, while own requests remain accessible', async () => {
  await execute(
    "UPDATE users SET membership_status='past_due' WHERE id='builder'",
  );
  try {
    const list = await json('/requests');
    assert.ok(list.requests.every((r: any) => r.own));
    assert.equal(
      list.requests.some((r: any) => r.demo),
      false,
    );
    assert.equal(
      (await json('/search?q=qualification')).requests.some((r: any) => !r.own),
      false,
    );
  } finally {
    await execute(
      "UPDATE users SET membership_status='active' WHERE id='builder'",
    );
  }
  assert.ok(
    (await json('/resources?category=Build%20Kits')).resources.some(
      (r: any) => r.id === 'workflow-starter',
    ),
  );
  assert.equal(
    (await json('/notifications', 'operator')).notifications
      .filter(
        (n: any) => n.title.includes('Request') || n.title.includes('Queue'),
      )
      .every((n: any) => n.href === '/app/build'),
    true,
  );
});

test('manual execution durably queues, deduplicates, and background worker rejects untrusted dispatch', async () => {
  const response = await request(
    '/admin/workflows/weekly-intelligence/run',
    'admin',
    'POST',
  );
  assert.equal(response.status, 202);
  const queued = await response.json();
  assert.equal(queued.status, 'queued');
  const again = await queueWorkflow('weekly-intelligence');
  assert.equal(again.job_id, queued.job_id);
  assert.equal(again.existing, true);
  assert.equal(
    (await one<any>('SELECT status FROM job_runs WHERE id=$1', [queued.job_id]))
      .status,
    'queued',
  );
  process.env.JOBS_SECRET = 'a-strong-test-secret-with-more-than-32-characters';
  try {
    assert.equal(
      authorizeJobRequest(
        new Request('https://example.test', {
          headers: { authorization: 'Bearer wrong' },
        }),
      ),
      false,
    );
    await backgroundWorker(
      new Request('https://example.test', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong' },
      }),
    );
    assert.equal(
      (
        await one<any>('SELECT status FROM job_runs WHERE id=$1', [
          queued.job_id,
        ])
      ).status,
      'queued',
    );
    await backgroundWorker(
      new Request('https://example.test', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.JOBS_SECRET}` },
      }),
    );
    assert.equal(
      (
        await one<any>('SELECT status FROM job_runs WHERE id=$1', [
          queued.job_id,
        ])
      ).status,
      'failed',
    );
  } finally {
    delete process.env.JOBS_SECRET;
  }
});

test('Netlify dispatch sends only authenticated work initiation and validates the 202 acknowledgement', async () => {
  const originalFetch = globalThis.fetch;
  process.env.NETLIFY = 'true';
  process.env.JOBS_SECRET = 'a-strong-test-secret-with-more-than-32-characters';
  process.env.URL = 'https://network.example.test';
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        String(url),
        'https://network.example.test/.netlify/functions/jobs-background',
      );
      assert.equal(options?.method, 'POST');
      assert.equal(
        new Headers(options?.headers).get('authorization'),
        `Bearer ${process.env.JOBS_SECRET}`,
      );
      return new Response(null, { status: 202 });
    };
    assert.equal((await dispatchJobs()).dispatch, 'accepted');
    globalThis.fetch = async () => new Response(null, { status: 500 });
    await assert.rejects(() => dispatchJobs(), /HTTP 500/);
    process.env.JOBS_SECRET = 'short';
    await assert.rejects(() => dispatchJobs(), /at least 32/);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.NETLIFY;
    delete process.env.JOBS_SECRET;
    delete process.env.URL;
  }
});

test('dashboard shows community demand, search scopes projects and tiered content, analytics exclude staff', async () => {
  const dashboard = await json('/dashboard', 'other');
  assert.ok(dashboard.requests.some((r: any) => r.demo));
  const ownDashboard = await json('/dashboard', 'builder');
  assert.equal(ownDashboard.requests[0].own, true);
  assert.ok(
    (await json('/search?q=PRIVATE-GOAL', 'founder')).projects.length > 0,
  );
  assert.equal(
    (await json('/search?q=PRIVATE-GOAL', 'other')).projects.length,
    0,
  );
  assert.equal(
    (await json('/search?q=architecture', 'builder')).resources.some(
      (r: any) => r.level > 2,
    ),
    false,
  );
  const stats = (await json('/admin/analytics', 'admin')).stats;
  assert.equal(stats.members, 4);
  assert.equal(stats.active_members, 4);
  assert.ok(stats.onboarded_members <= stats.members);
});

test('message history paginates stably across equal timestamps and microseconds without crossing access boundaries', async () => {
  const { room } = await json('/admin/rooms', 'admin', 'POST', {
    name: 'History test',
    is_private: true,
    level: 3,
    members: ['founder'],
  });
  await execute(
    `INSERT INTO messages(id,room_id,user_id,author_name,body,created_at)
    SELECT 'history-'||lpad(n::text,3,'0'),$1,'founder','Founder','History item '||n,
    '2026-01-01 00:00:00.123000+00'::timestamptz+(n/4)*INTERVAL '1 microsecond' FROM generate_series(1,237) n`,
    [room.id],
  );
  let cursor: string | null = null;
  let all: any[] = [];
  let pages = 0;
  let firstCursor = '';
  do {
    const page = await json(
      `/rooms/${room.id}/messages?limit=100${cursor ? `&before=${cursor}` : ''}`,
      'founder',
    );
    assert.ok(page.messages.length <= 100);
    assert.equal(
      page.messages.some((m: any) => 'cursor_timestamp' in m),
      false,
    );
    if (!pages) {
      assert.equal(page.messages.length, 100);
      firstCursor = page.next_cursor;
      // A concurrent new arrival must not shift historical page boundaries.
      await execute(
        "INSERT INTO messages(id,room_id,author_name,body) VALUES('history-new',$1,'Founder','New arrival')",
        [room.id],
      );
    }
    all = [...page.messages, ...all];
    cursor = page.next_cursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.equal(all.length, 237);
  assert.equal(new Set(all.map((m) => m.id)).size, 237);
  assert.deepEqual(
    all.map((m) => m.id),
    Array.from(
      { length: 237 },
      (_, i) => `history-${String(i + 1).padStart(3, '0')}`,
    ),
  );
  assert.equal(
    (await json(`/rooms/${room.id}/messages?limit=50`, 'founder')).messages
      .length,
    50,
  );
  assert.equal(
    (await request(`/rooms/${room.id}/messages?before=${firstCursor}`, 'other'))
      .status,
    404,
  );
  assert.equal(
    (
      await request(
        `/rooms/${room.id}/messages?before=invalid-cursor`,
        'founder',
      )
    ).status,
    400,
  );
  assert.equal(
    (await request(`/rooms/${room.id}/messages?limit=10000`, 'founder')).status,
    400,
  );
});

test('mentions use eligible room participants, canonical names and one notification per person', async () => {
  await execute(
    "UPDATE users SET organization_id='org-one',name='Builder User' WHERE id='builder'",
  );
  const { room } = await json('/admin/rooms', 'admin', 'POST', {
    name: 'Mention scope',
    level: 2,
    is_private: true,
    organization_id: 'org-one',
    members: ['founder', 'builder', 'other', 'operator'],
  });
  const participants = (await json(`/rooms/${room.id}/participants`, 'founder'))
    .participants;
  assert.deepEqual(participants.map((p: any) => p.id).sort(), [
    'builder',
    'founder',
  ]);
  assert.deepEqual(Object.keys(participants[0]).sort(), ['id', 'name']);
  assert.equal(
    (await request(`/rooms/${room.id}/participants`, 'staff')).status,
    404,
  );
  assert.equal(
    (await request(`/rooms/${room.id}/participants`, 'other')).status,
    404,
  );
  const count = async (userId: string) =>
    Number(
      (
        await one<any>(
          'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id=$1',
          [userId],
        )
      ).count,
    );
  const before = await count('builder'),
    selfBefore = await count('founder');
  const posted = (
    await json(`/rooms/${room.id}/messages`, 'founder', 'POST', {
      body: 'Hi @[Impersonated CEO](user:builder) and @[Again](user:builder), from @[Me](user:founder)',
    })
  ).message;
  assert.match(posted.body, /@\[Builder User\]\(user:builder\)/);
  assert.equal(posted.body.includes('Impersonated CEO'), false);
  assert.equal(posted.body.includes('Again'), false);
  assert.equal(await count('builder'), before + 1);
  assert.equal(await count('founder'), selfBefore);
  const outsidersBefore = await count('other');
  assert.equal(
    (
      await request(`/rooms/${room.id}/messages`, 'founder', 'POST', {
        body: '@[Other](user:other) should not be notified',
      })
    ).status,
    400,
  );
  assert.equal(await count('other'), outsidersBefore);
  await execute(
    "UPDATE users SET membership_status='past_due' WHERE id='builder'",
  );
  try {
    assert.equal(
      (
        await json(`/rooms/${room.id}/participants`, 'founder')
      ).participants.some((p: any) => p.id === 'builder'),
      false,
    );
    assert.equal(
      (
        await request(`/rooms/${room.id}/messages`, 'founder', 'POST', {
          body: '@[Builder](user:builder)',
        })
      ).status,
      400,
    );
  } finally {
    await execute(
      "UPDATE users SET membership_status='active' WHERE id='builder'",
    );
  }
  const parent = (
    await json(`/rooms/${room.id}/messages`, 'builder', 'POST', {
      body: 'An initial message',
    })
  ).message;
  const replyBefore = await count('builder');
  await json(`/rooms/${room.id}/messages`, 'founder', 'POST', {
    body: '@[Wrong label](user:builder) a reply',
    parent_id: parent.id,
  });
  assert.equal(await count('builder'), replyBefore + 1);
  const publicParticipants = (
    await json('/rooms/builders/participants', 'builder')
  ).participants;
  assert.equal(
    publicParticipants.some((p: any) => p.id === 'operator'),
    false,
  );
});

test('job maintenance removes only authentication and rate-limit records expired for more than a day', async () => {
  for (const table of ['sessions', 'password_resets', 'email_verifications']) {
    await execute(
      `INSERT INTO ${table}(token_hash,user_id,expires_at) VALUES($1,'founder',NOW()-INTERVAL '2 days'),($2,'founder',NOW()-INTERVAL '1 hour'),($3,'founder',NOW()+INTERVAL '1 day')`,
      [`${table}-old`, `${table}-recent`, `${table}-valid`],
    );
  }
  await execute(
    "INSERT INTO rate_limits(key,window_start) VALUES('cleanup-old',NOW()-INTERVAL '2 days'),('cleanup-recent',NOW()-INTERVAL '1 hour')",
  );
  const messageBefore = await one<any>(
    "SELECT body FROM messages WHERE id='history-001'",
  );
  await runDueJobs();
  for (const table of ['sessions', 'password_resets', 'email_verifications']) {
    assert.equal(
      await one(`SELECT token_hash FROM ${table} WHERE token_hash=$1`, [
        `${table}-old`,
      ]),
      undefined,
    );
    assert.ok(
      await one(`SELECT token_hash FROM ${table} WHERE token_hash=$1`, [
        `${table}-recent`,
      ]),
    );
    assert.ok(
      await one(`SELECT token_hash FROM ${table} WHERE token_hash=$1`, [
        `${table}-valid`,
      ]),
    );
  }
  assert.equal(
    await one("SELECT key FROM rate_limits WHERE key='cleanup-old'"),
    undefined,
  );
  assert.ok(
    await one("SELECT key FROM rate_limits WHERE key='cleanup-recent'"),
  );
  assert.deepEqual(
    await one("SELECT body FROM messages WHERE id='history-001'"),
    messageBefore,
  );
});
