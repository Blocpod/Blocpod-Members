import { randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { query, one, execute, transaction, isProduction } from './db';
import {
  requireUser,
  requireFeature,
  requireStaff,
  rateLimit,
  resolveEntitlements,
} from './auth';
import type { AppEnv, User } from './types';
import { aiConfigured } from './ai';
import { queueWorkflow, runDueJobs } from './jobs';
import { dispatchJobs } from './job-dispatch';

export const featureRoutes = new Hono<AppEnv>();
const id = () => randomUUID();
const short = z.string().trim().min(1).max(200);
const text = z.string().trim().min(1).max(12000);
const optionalText = z.string().trim().max(12000).default('');
const safeUrl = z
  .string()
  .url()
  .refine((v) => /^https?:\/\//i.test(v), 'Use an HTTP or HTTPS URL');
async function body<T>(c: Context<AppEnv>, schema: z.ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: 'Invalid JSON body' });
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new HTTPException(400, {
      message: parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; '),
    });
  return parsed.data;
}
function fail(status: 400 | 403 | 404 | 409 | 429, message: string): never {
  throw new HTTPException(status, { message });
}
function staff(c: Context<AppEnv>, adminOnly = false) {
  const user = requireStaff(c);
  if (
    !(adminOnly
      ? user.role === 'admin'
      : ['staff', 'admin'].includes(user.role))
  )
    fail(403, 'This operation requires Blocpod staff access');
  return user;
}
async function event(user: User, action: string, entityId?: string) {
  await execute(
    'INSERT INTO product_events(id,user_id,event,entity_id) VALUES($1,$2,$3,$4)',
    [id(), user.id, action, entityId || null],
  );
}
async function audit(user: User, action: string, entityId: string) {
  await execute(
    'INSERT INTO admin_audit(id,user_id,action,entity_id) VALUES($1,$2,$3,$4)',
    [id(), user.id, action, entityId],
  );
}
async function notify(
  userId: string | null,
  title: string,
  message: string,
  href: string,
) {
  if (userId)
    await execute(
      'INSERT INTO notifications(id,user_id,title,body,href) VALUES($1,$2,$3,$4,$5)',
      [id(), userId, title, message, href],
    );
}
const resourceFields =
  'r.id,r.title,r.summary,r.category,r.tags,r.level,r.status,r.updated_at,r.reading_minutes,r.demo';
async function resources(user: User, q = '', category = '', saved = false) {
  return query<any>(
    `SELECT ${resourceFields},(s.user_id IS NOT NULL) AS saved,(r.level>$2) AS locked FROM resources r
    LEFT JOIN resource_saves s ON s.resource_id=r.id AND s.user_id=$1
    WHERE r.status='published' AND r.approved=TRUE AND ($3='' OR r.title ILIKE $4 OR r.summary ILIKE $4 OR r.tags::text ILIKE $4)
    AND ($5='' OR REPLACE(LOWER(r.category),' ','-')=REPLACE(LOWER($5),' ','-')) AND ($6=FALSE OR s.user_id IS NOT NULL) ORDER BY r.updated_at DESC LIMIT 100`,
    [
      user.id,
      Number(user.entitlements.resource_level || 0),
      q,
      `%${q}%`,
      category,
      saved,
    ],
  );
}
async function accessibleResource(user: User, resourceId: string) {
  const resource = await one<any>(
    `SELECT * FROM resources WHERE id=$1 AND status='published' AND approved=TRUE`,
    [resourceId],
  );
  if (!resource) fail(404, 'Resource not found');
  if (resource.level > Number(user.entitlements.resource_level || 0))
    fail(403, 'This resource requires a higher membership level');
  return resource;
}
featureRoutes.get('/resources', async (c) =>
  c.json({
    resources: await resources(
      requireUser(c),
      (c.req.query('q') || '').slice(0, 200),
      c.req.query('category'),
      c.req.query('saved') === '1',
    ),
  }),
);
featureRoutes.get('/resources/:id', async (c) => {
  const user = requireUser(c),
    resource = await accessibleResource(user, c.req.param('id'));
  await event(user, 'resource_view', resource.id);
  resource.saved = !!(await one(
    'SELECT 1 FROM resource_saves WHERE user_id=$1 AND resource_id=$2',
    [user.id, resource.id],
  ));
  const related = (await resources(user, '', resource.category))
    .filter((r) => r.id !== resource.id)
    .slice(0, 3);
  return c.json({ resource, related });
});
featureRoutes.post('/resources/:id/save', async (c) => {
  const user = requireUser(c),
    resource = await accessibleResource(user, c.req.param('id'));
  const deleted = await query(
    'DELETE FROM resource_saves WHERE user_id=$1 AND resource_id=$2 RETURNING resource_id',
    [user.id, resource.id],
  );
  if (!deleted.length)
    await execute(
      'INSERT INTO resource_saves(user_id,resource_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [user.id, resource.id],
    );
  return c.json({ saved: !deleted.length });
});

// ponytail: deterministic term matching is transparent and inexpensive; add embeddings when the archive outgrows lexical retrieval.
export function rankResources(goal: string, items: any[]) {
  const terms = [
    ...new Set(goal.toLowerCase().match(/[a-z0-9]{3,}/g) || []),
  ].filter(
    (s) =>
      ![
        'want',
        'need',
        'with',
        'that',
        'this',
        'have',
        'build',
        'trying',
        'would',
        'help',
        'company',
      ].includes(s),
  );
  return items
    .map((r) => ({
      ...r,
      score: terms.reduce(
        (n, term) =>
          n +
          (`${r.title} ${r.summary} ${JSON.stringify(r.tags)}`
            .toLowerCase()
            .includes(term)
            ? 1
            : 0),
        0,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
}
export function classifyGoal(goal: string) {
  if (
    /enterprise|departments|custom implementation|complex integration|10000|10,000|million/i.test(
      goal,
    )
  )
    return 'foundry_opportunity';
  if (/customiz|adapt|modify|extend/i.test(goal)) return 'customization';
  return 'new_community_tool';
}
featureRoutes.post('/route-goal', async (c) => {
  const user = requireUser(c),
    input = await body(c, z.object({ goal: text }));
  await rateLimit(`goal:${user.id}`, 30, 60);
  const matches = rankResources(input.goal, await resources(user)).filter(
    (r) => !r.locked,
  );
  const classification = classifyGoal(input.goal);
  const route =
    classification === 'foundry_opportunity'
      ? 'foundry'
      : classification === 'customization'
        ? 'customization'
        : matches.length > 1
          ? 'composable_solution'
          : matches.length
            ? 'existing_solution'
            : 'build_queue';
  await event(user, 'goal_routed');
  return c.json({
    route,
    method: 'keyword_rules',
    explanation:
      route === 'foundry'
        ? 'The scope suggests custom implementation. Submit a private Foundry inquiry for human review.'
        : route === 'customization'
          ? 'An adaptation may be needed. Describe the changes in a private-context Build Queue request.'
          : matches.length
            ? `Found ${matches.length} accessible resources with terms related to your goal. Review fit before implementation.`
            : 'No strong keyword match is available. Submit this need to the Build Queue for review.',
    resources: matches,
    suggested_request: input.goal,
  });
});

async function requestList(user: User) {
  return query<any>(
    `SELECT r.id,r.title,r.summary,r.classification,r.cluster,r.status,r.priority,r.resource_id,r.update_note,r.demo,r.created_at,r.updated_at,
    (r.user_id=$1) AS own,(SELECT COUNT(*)::int FROM request_votes v WHERE v.request_id=r.id) AS votes,
    EXISTS(SELECT 1 FROM request_votes v WHERE v.request_id=r.id AND v.user_id=$1) AS voted,
    CASE WHEN r.user_id=$1 THEN r.context ELSE NULL END AS context,CASE WHEN r.user_id=$1 THEN r.ai_state ELSE NULL END AS ai_state
    FROM build_requests r WHERE r.merged_into IS NULL AND($2::boolean OR r.user_id=$1) ORDER BY r.priority DESC,r.created_at DESC LIMIT 100`,
    [user.id, Number(user.entitlements.resource_level || 0) > 0],
  );
}
featureRoutes.get('/requests', async (c) =>
  c.json({ requests: await requestList(requireUser(c)) }),
);
const requestSchema = z.object({
  title: short,
  summary: z.string().trim().min(10).max(1500),
  context: z
    .object({
      industry: optionalText,
      current_process: optionalText,
      tools: optionalText,
      bottleneck: optionalText,
      outcome: optionalText,
      urgency: optionalText,
      links: z.array(safeUrl).max(10).default([]),
    })
    .default({
      industry: '',
      current_process: '',
      tools: '',
      bottleneck: '',
      outcome: '',
      urgency: '',
      links: [],
    }),
});
featureRoutes.post('/requests', async (c) => {
  const user = requireUser(c);
  requireFeature(c, 'submissions_monthly');
  const input = await body(c, requestSchema),
    requestId = id();
  const classification = classifyGoal(`${input.title} ${input.summary}`);
  const cluster =
    `${input.title} ${input.summary}`
      .toLowerCase()
      .match(
        /sales|qualification|research|onboarding|local ai|construction|acquisition|support/,
      )?.[0] || 'general';
  await transaction(async (db) => {
    await db.one('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user.id]);
    const count = await db.one<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM build_requests WHERE user_id=$1 AND created_at>=date_trunc('month',NOW())`,
      [user.id],
    );
    if (Number(count?.count) >= Number(user.entitlements.submissions_monthly))
      fail(429, 'Monthly Build Queue submission allowance reached');
    await db.execute(
      `INSERT INTO build_requests(id,user_id,title,summary,context,classification,cluster,ai_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        requestId,
        user.id,
        input.title,
        input.summary,
        JSON.stringify(input.context),
        classification,
        cluster,
        aiConfigured() ? 'pending' : 'unconfigured',
      ],
    );
    if (classification === 'foundry_opportunity')
      await db.execute(
        'INSERT INTO opportunities(id,user_id,request_id,goal) VALUES($1,$2,$3,$4)',
        [id(), user.id, requestId, input.summary],
      );
  });
  await notify(
    user.id,
    'Request received',
    'Your public idea is in the Build Queue. Business context is visible only to you and Blocpod staff.',
    '/app/build',
  );
  await event(user, 'request_submitted', requestId);
  return c.json(
    { request: (await requestList(user)).find((r) => r.id === requestId) },
    201,
  );
});
featureRoutes.post('/requests/:id/vote', async (c) => {
  const user = requireUser(c);
  requireFeature(c, 'voting');
  if (
    !(await one(
      'SELECT id FROM build_requests WHERE id=$1 AND merged_into IS NULL',
      [c.req.param('id')],
    ))
  )
    fail(404, 'Request not found');
  const removed = await query(
    'DELETE FROM request_votes WHERE request_id=$1 AND user_id=$2 RETURNING user_id',
    [c.req.param('id'), user.id],
  );
  if (!removed.length)
    await execute(
      'INSERT INTO request_votes(request_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [c.req.param('id'), user.id],
    );
  return c.json({ voted: !removed.length });
});

async function accessibleRoom(user: User, roomId: string) {
  const room = await one<any>(
    `SELECT r.* FROM rooms r WHERE r.id=$1 AND r.archived=FALSE AND
    (r.is_private=FALSE OR EXISTS(SELECT 1 FROM room_members m WHERE m.room_id=r.id AND m.user_id=$2))
    AND (r.organization_id IS NULL OR r.organization_id=$3)`,
    [roomId, user.id, user.organization_id],
  );
  if (!room) fail(404, 'Room not found or not available to your account');
  if (room.level > Number(user.entitlements.room_level || 0))
    fail(403, 'This room requires a higher membership level');
  return room;
}
async function roomParticipants(room: any, ids?: string[]) {
  const candidates = await query<any>(
    `SELECT u.id,u.name,u.role,u.membership_status,u.entitlement_overrides,p.entitlements
    FROM users u JOIN plans p ON p.id=u.plan_id WHERE u.membership_status IN('active','trialing')
    AND($1::boolean=FALSE OR u.email_verified=TRUE)
    AND($2::text IS NULL OR u.organization_id=$2)
    AND($3::boolean=FALSE OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=$4 AND rm.user_id=u.id))
    AND($5::text[] IS NULL OR u.id=ANY($5::text[])) ORDER BY LOWER(u.name),u.id`,
    [
      isProduction(),
      room.organization_id,
      room.is_private,
      room.id,
      ids || null,
    ],
  );
  return candidates
    .filter(
      (member) =>
        Number(
          resolveEntitlements(
            member.entitlements,
            member.entitlement_overrides,
            member.membership_status,
            member.role,
          ).room_level || 0,
        ) >= room.level,
    )
    .map(({ id, name }) => ({ id: id as string, name: name as string }));
}
featureRoutes.get('/rooms/:id/participants', async (c) => {
  const room = await accessibleRoom(requireUser(c), c.req.param('id'));
  return c.json({ participants: await roomParticipants(room) });
});
featureRoutes.get('/rooms', async (c) => {
  const user = requireUser(c);
  return c.json({
    rooms: await query(
      `SELECT r.*,(r.level>$2) AS locked,
    CASE WHEN r.level<=$2 THEN (SELECT COUNT(*)::int FROM messages m WHERE m.room_id=r.id AND m.hidden=FALSE AND m.created_at>COALESCE(rr.last_read_at,'1970-01-01'::timestamptz)) ELSE 0 END AS unread_count
    FROM rooms r LEFT JOIN room_reads rr ON rr.room_id=r.id AND rr.user_id=$1 WHERE r.archived=FALSE
    AND (r.is_private=FALSE OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$1))
    AND (r.organization_id IS NULL OR r.organization_id=$3) ORDER BY r.level,r.name`,
      [
        user.id,
        Number(user.entitlements.room_level || 0),
        user.organization_id,
      ],
    ),
  });
});
featureRoutes.get('/rooms/:id/messages', async (c) => {
  const user = requireUser(c),
    roomId = c.req.param('id');
  await accessibleRoom(user, roomId);
  const before = c.req.query('before');
  const limit = Number(c.req.query('limit') || 100);
  if (![50, 100].includes(limit))
    fail(400, 'Message page size must be 50 or 100');
  let cursor: { at: string; id: string } | undefined;
  if (before) {
    try {
      if (before.length > 500 || !/^[A-Za-z0-9_-]+$/.test(before))
        throw new Error('Invalid cursor');
      cursor = z
        .object({ at: z.string().datetime(), id: z.string().min(1).max(100) })
        .parse(JSON.parse(Buffer.from(before, 'base64url').toString('utf8')));
    } catch {
      fail(400, 'Invalid message history cursor');
    }
  }
  // Preserve PostgreSQL microseconds in the opaque cursor; JavaScript Date alone would truncate them.
  const page = await query<any>(
    `SELECT *,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_timestamp FROM messages
    WHERE room_id=$1 AND hidden=FALSE AND($2::timestamptz IS NULL OR(created_at,id)<($2::timestamptz,$3::text))
    ORDER BY created_at DESC,id DESC LIMIT $4`,
    [roomId, cursor?.at || null, cursor?.id || null, limit + 1],
  );
  const hasMore = page.length > limit,
    items = page.slice(0, limit).reverse();
  const oldest = items[0];
  const next_cursor =
    hasMore && oldest
      ? Buffer.from(
          JSON.stringify({ at: oldest.cursor_timestamp, id: oldest.id }),
        ).toString('base64url')
      : null;
  const reactions = items.length
    ? await query<any>(
        `SELECT message_id,emoji,COUNT(*)::int AS count,BOOL_OR(user_id=$2) AS reacted FROM message_reactions WHERE message_id=ANY($1::text[]) GROUP BY message_id,emoji`,
        [items.map((m) => m.id), user.id],
      )
    : [];
  for (const message of items)
    message.reactions = reactions.filter((r) => r.message_id === message.id);
  if (!before)
    await execute(
      'INSERT INTO room_reads(room_id,user_id) VALUES($1,$2) ON CONFLICT(room_id,user_id) DO UPDATE SET last_read_at=NOW()',
      [roomId, user.id],
    );
  return c.json({
    messages: items.map(({ cursor_timestamp, ...message }) => message),
    next_cursor,
  });
});
featureRoutes.post('/rooms/:id/messages', async (c) => {
  const user = requireUser(c),
    roomId = c.req.param('id'),
    room = await accessibleRoom(user, roomId);
  const input = await body(
    c,
    z.object({
      body: z.string().trim().min(1).max(8000),
      parent_id: z.string().max(100).nullable().optional(),
    }),
  );
  if (
    input.parent_id &&
    !(await one(
      'SELECT id FROM messages WHERE id=$1 AND room_id=$2 AND hidden=FALSE',
      [input.parent_id, roomId],
    ))
  )
    fail(400, 'Reply target must be a visible message in this room');
  await rateLimit(`message:${user.id}`, 20, 60);
  const mentionPattern =
    /@\[([^\]\r\n]{1,200})\]\(user:([A-Za-z0-9_-]{1,100})\)/g;
  const mentionedIds = [
    ...new Set(
      [...input.body.matchAll(mentionPattern)].map((match) => match[2]),
    ),
  ];
  if (mentionedIds.length > 10)
    fail(400, 'Mention up to 10 people per message');
  const participants = mentionedIds.length
    ? await roomParticipants(room, mentionedIds)
    : [];
  if (participants.length !== mentionedIds.length)
    fail(400, 'One or more mentioned people are not eligible for this room');
  const names = new Map(
    participants.map((person) => [
      person.id,
      person.name
        .replace(/[\[\]\r\n\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    ]),
  );
  const content = input.body.replace(
    mentionPattern,
    (_markup, _claimedName, memberId: string) =>
      `@[${names.get(memberId)}](user:${memberId})`,
  );
  const message = await one<any>(
    'INSERT INTO messages(id,room_id,user_id,author_name,body,parent_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [id(), roomId, user.id, user.name, content, input.parent_id || null],
  );
  const notified = new Set([user.id]);
  if (input.parent_id) {
    const parent = await one<{ user_id: string }>(
      'SELECT user_id FROM messages WHERE id=$1',
      [input.parent_id],
    );
    if (parent?.user_id && !notified.has(parent.user_id)) {
      await notify(
        parent.user_id,
        'New reply in your conversation',
        `${user.name} replied to your message.`,
        `/app/community?room=${roomId}`,
      );
      notified.add(parent.user_id);
    }
  }
  for (const person of participants)
    if (!notified.has(person.id))
      await notify(
        person.id,
        'You were mentioned',
        `${user.name} mentioned you in ${room.name}.`,
        `/app/community?room=${roomId}`,
      );
  await event(user, 'message_sent', roomId);
  return c.json({ message: { ...message, reactions: [] } }, 201);
});
featureRoutes.post('/messages/:id/reaction', async (c) => {
  const user = requireUser(c),
    input = await body(
      c,
      z.object({ emoji: z.enum(['👍', '🔥', '💡', '❤️', '✅']) }),
    );
  const message = await one<{ room_id: string }>(
    'SELECT room_id FROM messages WHERE id=$1 AND hidden=FALSE',
    [c.req.param('id')],
  );
  if (!message) fail(404, 'Message not found');
  await accessibleRoom(user, message.room_id);
  const deleted = await query(
    'DELETE FROM message_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3 RETURNING message_id',
    [c.req.param('id'), user.id, input.emoji],
  );
  if (!deleted.length)
    await execute(
      'INSERT INTO message_reactions(message_id,user_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
      [c.req.param('id'), user.id, input.emoji],
    );
  return c.json({ reacted: !deleted.length });
});
featureRoutes.post('/messages/:id/report', async (c) => {
  const user = requireUser(c),
    input = await body(
      c,
      z.object({ reason: z.string().trim().min(3).max(1000) }),
    );
  await rateLimit(`report:${user.id}`, 10, 3600);
  const message = await one<{ room_id: string }>(
    'SELECT room_id FROM messages WHERE id=$1 AND hidden=FALSE',
    [c.req.param('id')],
  );
  if (!message) fail(404, 'Message not found');
  await accessibleRoom(user, message.room_id);
  await execute(
    'INSERT INTO reports(id,message_id,user_id,reason) VALUES($1,$2,$3,$4)',
    [id(), c.req.param('id'), user.id, input.reason],
  );
  return c.json({ reported: true }, 201);
});

featureRoutes.get('/notifications', async (c) =>
  c.json({
    notifications: await query(
      'SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100',
      [requireUser(c).id],
    ),
  }),
);
featureRoutes.patch('/notifications', async (c) => {
  const user = requireUser(c),
    input = await body(
      c,
      z
        .object({ id: z.string().optional(), all: z.boolean().optional() })
        .refine((v) => v.id || v.all, 'Select a notification'),
    );
  await execute(
    'UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND ($2::boolean=TRUE OR id=$3)',
    [user.id, !!input.all, input.id || null],
  );
  return c.json({ ok: true });
});
featureRoutes.get('/projects', async (c) =>
  c.json({
    projects: await query(
      'SELECT * FROM projects WHERE user_id=$1 ORDER BY created_at DESC',
      [requireUser(c).id],
    ),
  }),
);
featureRoutes.post('/projects', async (c) => {
  const user = requireUser(c);
  requireFeature(c, 'private_spaces');
  const input = await body(
    c,
    z.object({
      name: short,
      goal: optionalText,
      resource_ids: z.array(z.string()).max(30).default([]),
    }),
  );
  for (const resourceId of input.resource_ids)
    await accessibleResource(user, resourceId);
  return c.json(
    {
      project: await one(
        'INSERT INTO projects(id,user_id,name,goal,resource_ids) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [
          id(),
          user.id,
          input.name,
          input.goal,
          JSON.stringify(input.resource_ids),
        ],
      ),
    },
    201,
  );
});
featureRoutes.patch('/projects/:id', async (c) => {
  const user = requireUser(c),
    input = await body(
      c,
      z.object({
        name: short.optional(),
        goal: optionalText.optional(),
        status: z.enum(['active', 'completed', 'archived']).optional(),
      }),
    );
  const project = await one(
    'UPDATE projects SET name=COALESCE($3,name),goal=COALESCE($4,goal),status=COALESCE($5,status) WHERE id=$1 AND user_id=$2 RETURNING *',
    [
      c.req.param('id'),
      user.id,
      input.name ?? null,
      input.goal ?? null,
      input.status ?? null,
    ],
  );
  if (!project) fail(404, 'Project not found');
  return c.json({ project });
});
featureRoutes.post('/foundry', async (c) => {
  const user = requireUser(c),
    input = await body(
      c,
      z.object({
        company: short,
        goal: text,
        scope: optionalText,
        budget: z.string().max(200).default(''),
        timeline: z.string().max(200).default(''),
      }),
    );
  await rateLimit(`foundry:${user.id}`, 5, 86400);
  const opportunity = await one(
    'INSERT INTO opportunities(id,user_id,company,goal,scope,budget,timeline) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,status',
    [
      id(),
      user.id,
      input.company,
      input.goal,
      input.scope,
      input.budget,
      input.timeline,
    ],
  );
  await notify(
    user.id,
    'Foundry inquiry received',
    'Your private inquiry is queued for human review. This is not an engagement commitment.',
    '/app/workspace',
  );
  await event(user, 'foundry_inquiry');
  return c.json({ opportunity }, 201);
});
featureRoutes.get('/search', async (c) => {
  const user = requireUser(c),
    term = (c.req.query('q') || '').trim().slice(0, 200);
  if (term.length < 2)
    return c.json({ resources: [], requests: [], messages: [], projects: [] });
  const matches = (await resources(user, term)).filter(
    (resource) => !resource.locked,
  );
  const requests = (await requestList(user)).filter((r) =>
    `${r.title} ${r.summary}`.toLowerCase().includes(term.toLowerCase()),
  );
  const messages = await query(
    `SELECT m.id,m.body,m.created_at,m.room_id,m.author_name,r.name AS room_name FROM messages m JOIN rooms r ON r.id=m.room_id
    WHERE m.hidden=FALSE AND r.archived=FALSE AND r.level<=$2 AND m.body ILIKE $3
    AND(r.is_private=FALSE OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$1))
    AND(r.organization_id IS NULL OR r.organization_id=$4) ORDER BY m.created_at DESC LIMIT 30`,
    [
      user.id,
      Number(user.entitlements.room_level || 0),
      `%${term}%`,
      user.organization_id,
    ],
  );
  const projects = await query(
    'SELECT id,name,goal,status FROM projects WHERE user_id=$1 AND(name ILIKE $2 OR goal ILIKE $2) ORDER BY created_at DESC LIMIT 30',
    [user.id, `%${term}%`],
  );
  await event(user, 'search');
  return c.json({ resources: matches, requests, messages, projects });
});
featureRoutes.get('/dashboard', async (c) => {
  const user = requireUser(c),
    all = await resources(user),
    profileGoal = String(
      user.profile?.goals ||
        user.profile?.goal ||
        user.profile?.interests ||
        '',
    );
  const matches = profileGoal ? rankResources(profileGoal, all) : [];
  const stats = await one(
    `SELECT (SELECT COUNT(*)::int FROM resource_saves WHERE user_id=$1) AS saved_resources,
    (SELECT COUNT(*)::int FROM projects WHERE user_id=$1 AND status='active') AS active_projects,
    (SELECT COUNT(*)::int FROM build_requests WHERE user_id=$1 AND status NOT IN('completed','declined') AND merged_into IS NULL) AS open_requests,
    (SELECT COUNT(*)::int FROM notifications WHERE user_id=$1 AND read_at IS NULL) AS unread_notifications`,
    [user.id],
  );
  const requests = await requestList(user);
  return c.json({
    resources: (matches.length ? matches : all).slice(0, 6),
    requests: [
      ...requests.filter((r) => r.own),
      ...requests.filter((r) => !r.own),
    ].slice(0, 5),
    stats,
    recommendation_reason: matches.length
      ? 'Matched to the goals in your profile'
      : 'The latest releases in the network',
  });
});

const resourceSchema = z.object({
  title: short,
  summary: z.string().trim().min(1).max(1500),
  body: z.string().max(150000),
  category: short,
  tags: z.array(z.string().max(60)).max(20).default([]),
  level: z.number().int().min(1).max(4).default(1),
  status: z
    .enum(['draft', 'review', 'scheduled', 'published', 'archived'])
    .default('draft'),
  approved: z.boolean().default(false),
  publish_at: z.string().datetime().nullable().optional(),
  external_url: safeUrl.nullable().optional(),
  reading_minutes: z.number().int().min(1).max(120).default(5),
});
function validatePublishing(input: {
  status?: string;
  approved?: boolean;
  publish_at?: string | null;
}) {
  if (
    ['published', 'scheduled'].includes(input.status || '') &&
    !input.approved
  )
    fail(400, 'Explicit human approval is required before publishing');
  if (input.status === 'scheduled' && !input.publish_at)
    fail(400, 'Scheduled content requires a publish date');
}
const roomSchema = z.object({
  name: short,
  description: z.string().max(1500).default(''),
  level: z.number().int().min(1).max(4).default(1),
  is_private: z.boolean().default(false),
  organization_id: z.string().nullable().optional(),
  archived: z.boolean().default(false),
  members: z.array(z.string()).max(1000).default([]),
});
const workflowSchema = z.object({
  name: short,
  prompt: text,
  category: short.default('Intelligence'),
  level: z.number().int().min(1).max(4).default(1),
  provider: z.enum(['openai', 'anthropic']).default('openai'),
  model: z.string().trim().max(100).default(''),
  schedule_minutes: z.number().int().min(15).max(525600).default(10080),
  enabled: z.boolean().default(false),
  next_run_at: z.string().datetime().optional(),
});

featureRoutes.get('/admin/analytics', async (c) => {
  staff(c);
  const stats =
    await one(`SELECT (SELECT COUNT(*)::int FROM users WHERE role='member') AS members,(SELECT COUNT(*)::int FROM users WHERE role='member' AND membership_status IN('active','trialing')) AS active_members,
    (SELECT COUNT(*)::int FROM users WHERE role='member' AND onboarded=TRUE) AS onboarded_members,(SELECT COUNT(*)::int FROM resources WHERE status='published') AS published_resources,
    (SELECT COUNT(*)::int FROM build_requests WHERE status NOT IN('completed','declined') AND merged_into IS NULL) AS open_requests,(SELECT COUNT(*)::int FROM reports WHERE status='open') AS open_reports,
    (SELECT COUNT(*)::int FROM opportunities WHERE status NOT IN('closed')) AS open_opportunities,(SELECT COUNT(*)::int FROM job_runs WHERE status='failed') AS failed_jobs,
    (SELECT COUNT(DISTINCT user_id)::int FROM product_events WHERE created_at>NOW()-INTERVAL '7 days') AS active_7d`);
  return c.json({
    stats,
    events: await query(
      `SELECT event,COUNT(*)::int AS count FROM product_events WHERE created_at>NOW()-INTERVAL '30 days' GROUP BY event ORDER BY count DESC`,
    ),
    demand: await query(
      `SELECT cluster,COUNT(*)::int AS count FROM build_requests WHERE merged_into IS NULL GROUP BY cluster ORDER BY count DESC`,
    ),
    popular_resources: await query(
      `SELECT r.title,COUNT(*)::int AS views FROM product_events e JOIN resources r ON r.id=e.entity_id WHERE e.event='resource_view' GROUP BY r.title ORDER BY views DESC LIMIT 10`,
    ),
    plans: await query(
      'SELECT plan_id,COUNT(*)::int AS count FROM users GROUP BY plan_id',
    ),
    email_status: await query(
      'SELECT status,COUNT(*)::int AS count FROM email_outbox GROUP BY status',
    ),
  });
});
featureRoutes.get('/admin/members', async (c) => {
  staff(c);
  return c.json({
    members: await query(
      'SELECT id,name,email,role,organization_id,plan_id,membership_status,onboarded,profile,entitlement_overrides,notes,created_at FROM users ORDER BY created_at DESC LIMIT 500',
    ),
  });
});
featureRoutes.patch('/admin/members/:id', async (c) => {
  const actor = staff(c, true),
    input = await body(
      c,
      z.object({
        plan_id: z.string().optional(),
        membership_status: z
          .enum([
            'inactive',
            'active',
            'trialing',
            'past_due',
            'canceled',
            'suspended',
          ])
          .optional(),
        role: z.enum(['member', 'moderator', 'staff', 'admin']).optional(),
        entitlement_overrides: z
          .record(
            z.string(),
            z.union([z.boolean(), z.number().min(0).max(100000)]),
          )
          .optional(),
        notes: z.string().max(12000).optional(),
      }),
    );
  if (actor.id === c.req.param('id') && input.role && input.role !== 'admin')
    fail(400, 'Ask another administrator to change your role');
  if (
    input.plan_id &&
    !(await one('SELECT id FROM plans WHERE id=$1', [input.plan_id]))
  )
    fail(400, 'Unknown plan');
  const member = await one(
    `UPDATE users SET plan_id=COALESCE($2,plan_id),membership_status=COALESCE($3,membership_status),role=COALESCE($4,role),entitlement_overrides=COALESCE($5::jsonb,entitlement_overrides),notes=COALESCE($6,notes) WHERE id=$1 RETURNING id,name,email,plan_id,membership_status,role,entitlement_overrides,notes`,
    [
      c.req.param('id'),
      input.plan_id ?? null,
      input.membership_status ?? null,
      input.role ?? null,
      input.entitlement_overrides
        ? JSON.stringify(input.entitlement_overrides)
        : null,
      input.notes ?? null,
    ],
  );
  if (!member) fail(404, 'Member not found');
  await audit(actor, 'member_updated', c.req.param('id'));
  return c.json({ member });
});
featureRoutes.get('/admin/plans', async (c) => {
  staff(c);
  return c.json({
    plans: await query('SELECT * FROM plans ORDER BY monthly_price'),
  });
});
featureRoutes.patch('/admin/plans/:id', async (c) => {
  const actor = staff(c, true),
    input = await body(
      c,
      z.object({
        name: short.optional(),
        description: z.string().max(2000).optional(),
        monthly_price: z.number().nonnegative().optional(),
        annual_price: z.number().nonnegative().optional(),
        active: z.boolean().optional(),
        entitlements: z
          .record(
            z.string(),
            z.union([z.boolean(), z.number().min(0).max(100000)]),
          )
          .optional(),
      }),
    );
  const plan = await one(
    `UPDATE plans SET name=COALESCE($2,name),description=COALESCE($3,description),monthly_price=COALESCE($4,monthly_price),annual_price=COALESCE($5,annual_price),active=COALESCE($6,active),entitlements=COALESCE($7::jsonb,entitlements) WHERE id=$1 RETURNING *`,
    [
      c.req.param('id'),
      input.name ?? null,
      input.description ?? null,
      input.monthly_price ?? null,
      input.annual_price ?? null,
      input.active ?? null,
      input.entitlements ? JSON.stringify(input.entitlements) : null,
    ],
  );
  if (!plan) fail(404, 'Plan not found');
  await audit(actor, 'plan_updated', c.req.param('id'));
  return c.json({ plan });
});
featureRoutes.get('/admin/resources', async (c) => {
  staff(c);
  return c.json({
    resources: await query(
      'SELECT * FROM resources ORDER BY updated_at DESC LIMIT 500',
    ),
  });
});
featureRoutes.post('/admin/resources', async (c) => {
  const actor = staff(c),
    input = await body(c, resourceSchema);
  validatePublishing(input);
  const resource = await one(
    `INSERT INTO resources(id,title,summary,body,category,tags,level,status,approved,publish_at,external_url,reading_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [
      id(),
      input.title,
      input.summary,
      input.body,
      input.category,
      JSON.stringify(input.tags),
      input.level,
      input.status,
      input.approved,
      input.publish_at || null,
      input.external_url || null,
      input.reading_minutes,
    ],
  );
  await audit(actor, 'resource_created', String(resource?.id));
  return c.json({ resource }, 201);
});
featureRoutes.patch('/admin/resources/:id', async (c) => {
  const actor = staff(c),
    changes = await body(c, resourceSchema.partial());
  const resource = await transaction(async (db) => {
    const existing = await db.one<any>(
      'SELECT * FROM resources WHERE id=$1 FOR UPDATE',
      [c.req.param('id')],
    );
    if (!existing) fail(404, 'Resource not found');
    const input = { ...existing, ...changes };
    // Editing reviewed content invalidates its approval unless the editor explicitly approves this new version.
    if (
      ['body', 'title', 'summary', 'external_url'].some(
        (key) =>
          key in changes &&
          (changes as Record<string, unknown>)[key] !== existing[key],
      ) &&
      changes.approved !== true
    ) {
      input.approved = false;
      if (['published', 'scheduled'].includes(input.status))
        input.status = 'review';
    }
    validatePublishing(input);
    await db.execute(
      'INSERT INTO resource_versions(id,resource_id,version,body,editor_id) VALUES($1,$2,$3,$4,$5)',
      [id(), existing.id, existing.version, existing.body, actor.id],
    );
    return db.one(
      `UPDATE resources SET title=$2,summary=$3,body=$4,category=$5,tags=$6,level=$7,status=$8,approved=$9,publish_at=$10,external_url=$11,reading_minutes=$12,version=version+1,updated_at=NOW() WHERE id=$1 RETURNING *`,
      [
        existing.id,
        input.title,
        input.summary,
        input.body,
        input.category,
        JSON.stringify(input.tags),
        input.level,
        input.status,
        input.approved,
        input.publish_at || null,
        input.external_url || null,
        input.reading_minutes,
      ],
    );
  });
  await audit(actor, 'resource_updated', c.req.param('id'));
  return c.json({ resource });
});
featureRoutes.get('/admin/requests', async (c) => {
  staff(c);
  return c.json({
    requests: await query(
      `SELECT r.*,u.name AS member_name,u.email AS member_email,(SELECT COUNT(*)::int FROM request_votes v WHERE v.request_id=r.id) AS votes FROM build_requests r LEFT JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 500`,
    ),
  });
});
featureRoutes.patch('/admin/requests/:id', async (c) => {
  const actor = staff(c),
    input = await body(
      c,
      z.object({
        status: z
          .enum([
            'submitted',
            'reviewing',
            'planned',
            'building',
            'completed',
            'declined',
          ])
          .optional(),
        classification: short.optional(),
        priority: z.number().int().min(0).max(100).optional(),
        assigned_to: z.string().max(200).nullable().optional(),
        update_note: z.string().max(12000).optional(),
        resource_id: z.string().nullable().optional(),
      }),
    );
  const request = await one<any>(
    `UPDATE build_requests SET status=COALESCE($2,status),classification=COALESCE($3,classification),priority=COALESCE($4,priority),assigned_to=CASE WHEN $8 THEN $5 ELSE assigned_to END,update_note=COALESCE($6,update_note),resource_id=CASE WHEN $9 THEN $7 ELSE resource_id END,updated_at=NOW() WHERE id=$1 RETURNING *`,
    [
      c.req.param('id'),
      input.status ?? null,
      input.classification ?? null,
      input.priority ?? null,
      input.assigned_to ?? null,
      input.update_note ?? null,
      input.resource_id ?? null,
      'assigned_to' in input,
      'resource_id' in input,
    ],
  );
  if (!request) fail(404, 'Request not found');
  await notify(
    request.user_id,
    'Build Queue update',
    input.update_note || `Your request is now ${request.status}.`,
    '/app/build',
  );
  await audit(actor, 'request_updated', request.id);
  return c.json({ request });
});
featureRoutes.post('/admin/requests/:id/merge', async (c) => {
  const actor = staff(c),
    input = await body(c, z.object({ target_id: z.string().min(1) }));
  if (input.target_id === c.req.param('id'))
    fail(400, 'A request cannot be merged into itself');
  await transaction(async (db) => {
    const rows = await db.query<any>(
      'SELECT id,user_id FROM build_requests WHERE id IN($1,$2) AND merged_into IS NULL FOR UPDATE',
      [c.req.param('id'), input.target_id],
    );
    if (rows.length !== 2)
      fail(404, 'Both requests must exist and remain unmerged');
    await db.execute(
      'INSERT INTO request_votes(request_id,user_id) SELECT $2,user_id FROM request_votes WHERE request_id=$1 ON CONFLICT DO NOTHING',
      [c.req.param('id'), input.target_id],
    );
    await db.execute(
      "UPDATE build_requests SET merged_into=$2,status='declined',updated_at=NOW() WHERE id=$1",
      [c.req.param('id'), input.target_id],
    );
  });
  await audit(actor, 'request_merged', c.req.param('id'));
  return c.json({ ok: true });
});
featureRoutes.post('/admin/requests/:id/triage', async (c) => {
  const actor = staff(c),
    request = await one<any>('SELECT * FROM build_requests WHERE id=$1', [
      c.req.param('id'),
    ]);
  if (!request) fail(404, 'Request not found');
  await rateLimit(`triage:${actor.id}`, 20, 3600);
  if (request.ai_state !== 'running')
    await execute(
      `UPDATE build_requests SET ai_state='pending',ai_analysis=NULL WHERE id=$1`,
      [request.id],
    );
  await audit(actor, 'request_ai_triage_queued', request.id);
  return c.json(
    {
      state: request.ai_state === 'running' ? 'running' : 'pending',
      ...(await requestWorker()),
    },
    202,
  );
});
featureRoutes.get('/admin/rooms', async (c) => {
  staff(c);
  return c.json({
    rooms: await query(
      `SELECT r.*,COALESCE((SELECT jsonb_agg(m.user_id) FROM room_members m WHERE m.room_id=r.id),'[]'::jsonb) AS members FROM rooms r ORDER BY r.created_at`,
    ),
  });
});
featureRoutes.post('/admin/rooms', async (c) => {
  const actor = staff(c),
    input = await body(c, roomSchema),
    roomId = id();
  await transaction(async (db) => {
    await db.execute(
      'INSERT INTO rooms(id,name,description,level,is_private,organization_id,archived) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        roomId,
        input.name,
        input.description,
        input.level,
        input.is_private,
        input.organization_id || null,
        input.archived,
      ],
    );
    for (const member of input.members)
      await db.execute(
        'INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
        [roomId, member],
      );
  });
  await audit(actor, 'room_created', roomId);
  return c.json({ room: { id: roomId, ...input } }, 201);
});
featureRoutes.patch('/admin/rooms/:id', async (c) => {
  const actor = staff(c),
    changes = await body(c, roomSchema.partial()),
    roomId = c.req.param('id');
  await transaction(async (db) => {
    const existing = await db.one<any>(
      'SELECT * FROM rooms WHERE id=$1 FOR UPDATE',
      [roomId],
    );
    if (!existing) fail(404, 'Room not found');
    const input = { ...existing, ...changes };
    await db.execute(
      'UPDATE rooms SET name=$2,description=$3,level=$4,is_private=$5,organization_id=$6,archived=$7 WHERE id=$1',
      [
        roomId,
        input.name,
        input.description,
        input.level,
        input.is_private,
        input.organization_id || null,
        input.archived,
      ],
    );
    if (changes.members) {
      await db.execute('DELETE FROM room_members WHERE room_id=$1', [roomId]);
      for (const member of changes.members)
        await db.execute(
          'INSERT INTO room_members(room_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [roomId, member],
        );
    }
  });
  await audit(actor, 'room_updated', roomId);
  return c.json({ ok: true });
});
featureRoutes.get('/admin/reports', async (c) => {
  const user = requireStaff(c);
  return c.json({
    reports: await query(
      `SELECT r.*,m.body AS message_body,m.author_name,m.room_id FROM reports r JOIN messages m ON m.id=r.message_id JOIN rooms room ON room.id=m.room_id
    WHERE $1::boolean=TRUE OR(room.level<=$2 AND(room.organization_id IS NULL OR room.organization_id=$3) AND(room.is_private=FALSE OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=room.id AND rm.user_id=$4)))
    ORDER BY r.created_at DESC LIMIT 500`,
      [
        user.role !== 'moderator',
        Number(user.entitlements.room_level || 0),
        user.organization_id,
        user.id,
      ],
    ),
  });
});
featureRoutes.patch('/admin/reports/:id', async (c) => {
  const user = requireStaff(c);
  const input = await body(
    c,
    z.object({
      status: z.enum(['open', 'resolved', 'dismissed']),
      action: z.literal('hide_message').optional(),
    }),
  );
  if (user.role === 'moderator') {
    const report = await one<{ room_id: string }>(
      'SELECT m.room_id FROM reports r JOIN messages m ON m.id=r.message_id WHERE r.id=$1',
      [c.req.param('id')],
    );
    if (!report) fail(404, 'Report not found');
    await accessibleRoom(user, report.room_id);
  }
  await transaction(async (db) => {
    const report = await db.one<any>(
      'UPDATE reports SET status=$2 WHERE id=$1 RETURNING *',
      [c.req.param('id'), input.status],
    );
    if (!report) fail(404, 'Report not found');
    if (input.action === 'hide_message')
      await db.execute('UPDATE messages SET hidden=TRUE WHERE id=$1', [
        report.message_id,
      ]);
  });
  await audit(user, 'report_updated', c.req.param('id'));
  return c.json({ ok: true });
});
featureRoutes.get('/admin/opportunities', async (c) => {
  staff(c);
  return c.json({
    opportunities: await query(
      'SELECT o.*,u.name AS member_name,u.email AS member_email FROM opportunities o LEFT JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 500',
    ),
  });
});
featureRoutes.patch('/admin/opportunities/:id', async (c) => {
  const actor = staff(c),
    input = await body(
      c,
      z.object({
        status: z.enum(['new', 'reviewing', 'qualified', 'closed']).optional(),
        notes: z.string().max(12000).optional(),
        value_estimate: z.number().int().nonnegative().nullable().optional(),
      }),
    );
  const opportunity = await one(
    'UPDATE opportunities SET status=COALESCE($2,status),notes=COALESCE($3,notes),value_estimate=CASE WHEN $5 THEN $4 ELSE value_estimate END WHERE id=$1 RETURNING *',
    [
      c.req.param('id'),
      input.status ?? null,
      input.notes ?? null,
      input.value_estimate ?? null,
      'value_estimate' in input,
    ],
  );
  if (!opportunity) fail(404, 'Opportunity not found');
  await audit(actor, 'opportunity_updated', c.req.param('id'));
  return c.json({ opportunity });
});
featureRoutes.get('/admin/workflows', async (c) => {
  staff(c);
  return c.json({
    workflows: await query('SELECT * FROM workflows ORDER BY created_at'),
    ai_configured: aiConfigured(),
  });
});
featureRoutes.post('/admin/workflows', async (c) => {
  const actor = staff(c),
    input = await body(c, workflowSchema);
  const workflow = await one(
    'INSERT INTO workflows(id,name,prompt,category,level,provider,model,schedule_minutes,enabled,next_run_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::timestamptz,NOW())) RETURNING *',
    [
      id(),
      input.name,
      input.prompt,
      input.category,
      input.level,
      input.provider,
      input.model,
      input.schedule_minutes,
      input.enabled,
      input.next_run_at || null,
    ],
  );
  await audit(actor, 'workflow_created', String(workflow?.id));
  return c.json({ workflow }, 201);
});
featureRoutes.patch('/admin/workflows/:id', async (c) => {
  const actor = staff(c),
    changes = await body(c, workflowSchema.partial()),
    existing = await one<any>('SELECT * FROM workflows WHERE id=$1', [
      c.req.param('id'),
    ]);
  if (!existing) fail(404, 'Workflow not found');
  const input = { ...existing, ...changes };
  const workflow = await one(
    'UPDATE workflows SET name=$2,prompt=$3,category=$4,level=$5,provider=$6,model=$7,schedule_minutes=$8,enabled=$9,next_run_at=$10 WHERE id=$1 RETURNING *',
    [
      existing.id,
      input.name,
      input.prompt,
      input.category,
      input.level,
      input.provider,
      input.model,
      input.schedule_minutes,
      input.enabled,
      input.next_run_at,
    ],
  );
  await audit(actor, 'workflow_updated', existing.id);
  return c.json({ workflow });
});
async function requestWorker() {
  try {
    const dispatch = await dispatchJobs();
    if (dispatch.dispatch === 'local' && process.env.NODE_ENV !== 'test')
      void runDueJobs().catch((error) =>
        console.error(
          JSON.stringify({
            event: 'local_job_worker_failed',
            error: error.message,
          }),
        ),
      );
    return dispatch;
  } catch (error) {
    // Durable queue insertion succeeded. A later scheduled worker can recover a failed immediate dispatch.
    return {
      dispatch: 'scheduled',
      dispatch_error:
        error instanceof Error
          ? error.message
          : 'Background dispatch unavailable',
    };
  }
}
featureRoutes.post('/admin/workflows/:id/run', async (c) => {
  const actor = staff(c);
  if (!(await one('SELECT id FROM workflows WHERE id=$1', [c.req.param('id')])))
    fail(404, 'Workflow not found');
  await rateLimit(`workflow:${actor.id}`, 10, 3600);
  const queued = await queueWorkflow(c.req.param('id'));
  await audit(actor, 'workflow_queued', c.req.param('id'));
  return c.json({ ...queued, ...(await requestWorker()) }, 202);
});
featureRoutes.get('/admin/jobs', async (c) => {
  staff(c);
  return c.json({
    jobs: await query(
      'SELECT j.*,w.name AS workflow_name FROM job_runs j LEFT JOIN workflows w ON w.id=j.workflow_id ORDER BY j.started_at DESC LIMIT 200',
    ),
  });
});
