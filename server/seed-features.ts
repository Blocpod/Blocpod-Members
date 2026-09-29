import { execute, one } from './db';

const resources = [
  {
    id: 'qualification-system',
    title: 'A better first conversation.',
    summary:
      'Turn inbound leads into a clear next action with a qualification system that keeps humans in control.',
    category: 'systems',
    tags: ['sales', 'qualification', 'automation', 'CRM'],
    level: 2,
    reading_minutes: 8,
    body: `# An inbound qualification system

> Demonstration blueprint. This is an implementation guide, not a deployed agent or a claim of customer results.

Most lead qualification problems begin before the model is involved: incomplete forms, unclear fit criteria, and an inbox with no owner. Start there.

## The operating contract

Collect five things: the contact's stated problem, business type, current process, desired timeline, and permission to follow up. Avoid collecting sensitive personal information. Define three possible outcomes: ready for a conversation, missing information, and outside scope.

The system must never promise pricing, availability, or a result. A person approves each first-contact message until a representative evaluation set shows acceptable performance.

## Build the workflow

1. Receive an authenticated form event with a unique submission ID.
2. Save the original submission before processing it.
3. Validate required fields and normalize the email address.
4. Match the company against the existing CRM to avoid duplicates.
5. Ask a model to extract evidence into a strict schema. Every judgment must reference something the prospect actually wrote.
6. Apply explicit business rules to the extracted fields.
7. Create an internal review task with the evidence and proposed response.
8. Send only after approval. Record the delivery result.

## A useful decision record

~~~json
{
  "submission_id": "your-unique-id",
  "fit": "needs_information",
  "evidence": ["The prospect mentioned onboarding delays"],
  "missing_fields": ["weekly_volume"],
  "next_action": "request_clarification",
  "human_approval_required": true
}
~~~

## Before enabling automation

Test duplicate webhooks, absent fields, hostile instructions inside the form, invalid contact addresses, provider timeouts, and changed consent. Keep an exception queue with a named owner. A failed model call must leave the submission safely stored and visible.

Measure review time and incorrect routing on your own sample. Compare against a simple rules-only baseline before adding more AI. A useful first milestone is a reliable internal recommendation, not autonomous outreach.`,
  },
  {
    id: 'signal-before-software',
    title: 'Find the signal before you build.',
    summary:
      'A practical framework for separating expensive recurring problems from interesting ideas.',
    category: 'intelligence',
    tags: ['research', 'validation', 'opportunity', 'business'],
    level: 1,
    reading_minutes: 6,
    body: `# Find the signal before you build

> Demonstration intelligence note. The examples are hypothetical and no market-size or financial claims are asserted.

An attractive opportunity is not simply a process that can be automated. It is a repeated problem with an identifiable owner, measurable cost, and a credible path to adoption.

## The four questions

**Frequency:** How often does the problem occur? Observe one real cycle rather than relying only on estimates.

**Consequence:** What happens when it is not solved? Look for missed revenue, delayed work, errors, or hours of avoidable effort. Record the evidence and distinguish it from opinion.

**Ownership:** Who has authority to change the process? The frustrated user, budget owner, and system administrator may be three different people.

**Access:** Can the necessary information be used lawfully and reliably? An elegant workflow dependent on an inaccessible data source is not yet an opportunity.

## A one-week discovery exercise

Choose one narrow business process. Interview five people who perform it. Ask each to walk through the last occurrence, including the tools, handoffs, exceptions, and outcome. Do not pitch the product during the walkthrough.

Create a table with one row per interview: trigger, input, owner, current workaround, elapsed time, error mode, and buying constraint. Mark whether each fact was directly observed or self-reported.

## Decide with evidence

Advance only if you can describe the same costly pattern across multiple independent observations. Create a small manual service or prototype that changes one measurable result. Set a stop condition before building.

Your output is a decision memo: problem, evidence, proposed intervention, adoption obstacle, test, and stop condition. Uncertainty belongs in the memo; concealing it does not improve the opportunity.`,
  },
  {
    id: 'research-agent',
    title: 'Research that remembers its sources.',
    summary:
      'An evidence-first research agent pattern with citation checks, uncertainty and a review queue.',
    category: 'agents',
    tags: ['research', 'agents', 'sources', 'reliability'],
    level: 2,
    reading_minutes: 7,
    body: `# Evidence-first research agent

> Demonstration architecture. No crawler or research service is activated by reading this guide.

A research agent is useful when its outputs can be checked. Build the evidence ledger before the prose generator.

## Separate retrieval and judgment

Retrieve from an explicit source allowlist. Save the source URL, retrieval time, title, publication date when available, and a short supporting excerpt. Deduplicate by canonical URL and content hash. Respect source access requirements and retention rules.

Give the synthesis model only the evidence relevant to the current question. Each proposed finding must contain evidence IDs. Reject unsupported IDs mechanically before editorial review.

~~~typescript
type Finding = {
  claim: string;
  evidence_ids: string[];
  confidence: 'low' | 'medium' | 'high';
  limitations: string[];
};

function supported(finding: Finding, available: Set<string>) {
  return finding.evidence_ids.length > 0 &&
    finding.evidence_ids.every(id => available.has(id));
}
~~~

## Handle difficult cases

Do not silently replace an unavailable primary source with an aggregator. Mark the retrieval failure and ask whether the evidence is sufficient. When sources disagree, preserve both claims and explain the disagreement. A publication date is not always the date of the event.

## Evaluation and release

Assemble ten questions with known evidence, five conflicting-source cases, and five questions that should produce insufficient evidence. Score citation accuracy, factual support, freshness, and usefulness independently.

Require human review for business-sensitive recommendations. An article with correct formatting is not necessarily correct research. Keep the ledger and the approved version together so later updates can show exactly what changed.`,
  },
  {
    id: 'local-ai-playbook',
    title: 'Local AI, without the guesswork.',
    summary:
      'Choose a bounded workload, measure the hardware you have, and establish a practical local-model baseline.',
    category: 'playbooks',
    tags: ['local AI', 'models', 'privacy', 'deployment'],
    level: 1,
    reading_minutes: 5,
    body: `# A practical local AI evaluation

> Demonstration playbook. Hardware requirements and model licenses must be checked for the exact model version you choose.

Start with the workload, not the model leaderboard. Document input length, acceptable latency, required output structure, concurrency, and data-handling requirements.

## Make a representative test set

Create twenty examples from the actual task after removing private data that you do not need. Include short and long inputs, missing fields, mixed languages if relevant, malformed content, and instructions embedded in documents. Define an acceptable answer for each before running the model.

## Measure the full system

Record time to first token, completion time, memory usage, error rate, and task quality. Cold-start performance differs from a warmed process. Run with the intended context window and with two concurrent requests if the use case requires concurrency.

Quantization may reduce memory while changing quality. Compare the exact quantized artifact you plan to run, not only its uncompressed parent model.

## Deployment boundaries

Keep the inference endpoint on a trusted network, require authentication, bound request size, and avoid logging sensitive prompts. Local execution does not automatically make the surrounding application private. Inspect telemetry, download sources, backup policy, and the model's license.

## The decision

Choose local inference when it satisfies your own quality and operational constraints. Keep a manual fallback for unavailable hardware. Re-run the evaluation after any model, prompt, runtime, or quantization change. Save the versioned results with the decision so the team can reproduce it.`,
  },
  {
    id: 'workflow-starter',
    title: 'The reliable workflow starter.',
    summary:
      'An implementation blueprint for idempotency, retries and human review in a small automation service.',
    category: 'build-kits',
    tags: ['automation', 'workflow', 'code', 'onboarding', 'deployment'],
    level: 2,
    reading_minutes: 9,
    body: `# Reliable workflow starter

> Demonstration build kit. The snippets illustrate a pattern; adapt authentication, schema and operations to your system.

Start with a durable jobs table and one worker. Add infrastructure when throughput demands it, after the failure behavior is correct.

## The durable boundary

Accept each event with a unique upstream key. Insert it under a database uniqueness constraint before acknowledging receipt. Retries should retrieve the existing job instead of creating a second business action.

~~~sql
CREATE TABLE incoming_jobs (
  id text PRIMARY KEY,
  source_key text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  payload jsonb NOT NULL
);
~~~

## Worker behavior

Claim work atomically with a bounded lease. Validate the payload again at the boundary where it is used. Attach the source key as the external provider's idempotency key when supported. Store the external response ID before declaring success.

Retry temporary network errors with bounded exponential backoff. Send invalid inputs and exhausted retries to an exception queue. Distinguish blocked configuration from transient failures: retrying an absent credential every second is not useful recovery.

## Human approval

For actions that send messages, spend money, alter customer records, or publish advice, generate a proposal first. The approval record should identify the exact version approved, who approved it, and when. Editing a proposal after approval must invalidate that approval.

## Deployment checks

Replay the same event twice. Interrupt the worker after the external action succeeds. Restart during a lease. Remove provider credentials. Feed malformed JSON. The expected behavior in every case is a recoverable record, no duplicate side effects, and a visible error with an owner.`,
  },
  {
    id: 'acquisition-map',
    title: 'An acquisition system you can inspect.',
    summary:
      'Map one customer journey from first signal to qualified conversation before automating the handoffs.',
    category: 'systems',
    tags: ['acquisition', 'sales', 'customer', 'outbound', 'CRM'],
    level: 1,
    reading_minutes: 6,
    body: `# Acquisition as an operating system

> Demonstration framework. No conversion rates, customer endorsements, or performance results are claimed.

Pick a single audience and a single problem you understand. A focused acquisition system has a clear source of relevant contacts, a useful reason to engage, and an observable next step.

## Map the journey

Write down discovery, first interaction, qualification, conversation, decision, and onboarding. For every transition, specify an owner, an input, a decision rule, and a recorded outcome.

Start with permission-based channels and information you are authorized to use. Keep suppression and consent records close to the delivery system. Do not let an AI invent personalized facts about a prospect.

## Create one useful asset

Build a diagnostic checklist, teardown, calculator, or short guide that helps the audience make a decision. State the limits of the asset. The call to action should match the next natural question rather than forcing every visitor into a sales meeting.

## Measure decisions

Track qualified conversations per source, time to response, reasons for disqualification, and onboarding completion. Define the denominator of every rate. Separate new observations from historical baselines and identify the attribution window.

## Automate the stable parts

Once the process works manually, automate assignment, reminders, approved follow-ups, and reporting. Leave ambiguous qualification and commitments with people. Review a sample of automated outcomes weekly and keep a direct way to pause the workflow.`,
  },
  {
    id: 'architecture-review',
    title: 'Before the architecture hardens.',
    summary:
      'A structured architecture review for founders deciding what to own, buy and postpone.',
    category: 'playbooks',
    tags: ['founder', 'architecture', 'SaaS', 'product', 'customization'],
    level: 3,
    reading_minutes: 7,
    body: `# Founder architecture review

> Demonstration review worksheet. Submitting a request does not reserve consultation time or create an implementation engagement.

The highest-value architecture question is often which decisions need to be made now. Draw the shortest path from a customer's action to a stored business outcome.

## Review the critical path

Describe the identity boundary, the data owner, the transaction, the external dependency, and what the user sees when the dependency fails. If you cannot explain a failure path, it is not yet designed.

Create a decision table: decision, current choice, reason, evidence, reversal cost, and review date. A reversible choice with low operational risk does not need a month of architecture work.

## Questions worth answering

- What data would be costly or impossible to reconstruct?
- Which actions must be idempotent?
- Where is authorization enforced?
- Which customer information can cross an organization boundary?
- What happens after a payment event is duplicated or delayed?
- Who can stop an automated action?
- How will a new operator know a job failed?

## Prepare a useful review request

Share the business outcome, current constraints, a concise data-flow diagram, expected volume, and two or three decisions you need help making. Keep secrets out of diagrams. Include known tradeoffs and a proposed direction.

The output should be a small decision record with an owner and verification step. A growing stack diagram is not itself progress. Prefer decisions that preserve data integrity and keep the team able to change course.`,
  },
  {
    id: 'codex-build-prompt',
    title: 'A build prompt with a definition of done.',
    summary:
      'A reusable engineering brief that turns a business outcome into a scoped, verifiable implementation.',
    category: 'prompts',
    tags: ['Codex', 'Claude', 'build', 'prompt', 'engineering'],
    level: 1,
    reading_minutes: 4,
    body: `# A better engineering brief

> Demonstration prompt template. Replace every bracketed section with your real context.

~~~text
Outcome
Build [one observable user outcome] for [specific user].

Repository context
Read the current implementation and repository instructions first.
Trace the affected path before editing. Reuse existing dependencies.

Current behavior
[What happens now, including the failure or missing capability.]

Expected behavior
[The exact trigger and the visible result.]

Constraints
[Privacy, authorization, accessibility, runtime, deployment and cost.]
Do not remove validation or error handling to simplify the change.

Acceptance checks
1. [Primary journey with concrete input and expected result.]
2. [Unauthorized user or organization boundary.]
3. [External failure, retry, and recovery.]
4. [Empty state and keyboard navigation.]

Complete the implementation, run the relevant checks, and inspect
the result. Report what changed, what was verified, and remaining
configuration required for production. Do not claim unrun checks.

Out of scope
[Decisions and features that do not serve this outcome.]

~~~

## Use the template well

Attach evidence: an error message, a route, an example record with secrets removed, or a reproduction. A narrow acceptance test usually improves an engineering prompt more than a long list of adjectives.

Ask for the whole user journey rather than individual files. Review the security boundary and the resulting behavior before debating implementation style. If the task discovers a larger problem, preserve the completed work and explicitly redefine scope.`,
  },
];

export async function seedFeatures() {
  for (const r of resources)
    await execute(
      `INSERT INTO resources(id,title,summary,body,category,tags,level,status,approved,reading_minutes,demo) VALUES($1,$2,$3,$4,$5,$6,$7,'published',TRUE,$8,TRUE) ON CONFLICT(id) DO NOTHING`,
      [
        r.id,
        r.title,
        r.summary,
        r.body,
        r.category,
        JSON.stringify(r.tags),
        r.level,
        r.reading_minutes,
      ],
    );
  const roomRows = [
    [
      'ai-systems',
      'AI Systems',
      'Practical patterns for reliable agents and intelligent operations.',
      1,
    ],
    [
      'builders',
      'Builders',
      'Implementation questions, useful experiments, and things that shipped.',
      2,
    ],
    [
      'acquisition',
      'Acquisition',
      'Find customers. Earn attention. Build repeatable systems.',
      1,
    ],
    [
      'local-ai',
      'Local AI',
      'Private inference, local models, and honest hardware tradeoffs.',
      1,
    ],
    [
      'founder-strategy',
      'Founder Strategy',
      'Product decisions, architecture tradeoffs, and company building.',
      3,
    ],
  ] as const;
  for (const [roomId, name, description, level] of roomRows)
    await execute(
      'INSERT INTO rooms(id,name,description,level) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO NOTHING',
      [roomId, name, description, level],
    );
  const demoMessages = [
    [
      'demo-message-1',
      'ai-systems',
      'Blocpod · demo',
      'Start here: describe the business outcome you are trying to create. Include the current process and the part that breaks. Remove confidential details before sharing.',
    ],
    [
      'demo-message-2',
      'ai-systems',
      'Example member · demo',
      'I am exploring an inbound qualification workflow. My first milestone is an internal recommendation with evidence, before anything emails a prospect. What failure cases should I test?',
    ],
    [
      'demo-message-3',
      'builders',
      'Blocpod · demo',
      'A useful build review includes the trigger, expected result, authorization boundary, and a reproducible failure. The reliable workflow starter in the library has a small verification checklist.',
    ],
    [
      'demo-message-4',
      'acquisition',
      'Blocpod · demo',
      'This week’s discussion prompt: which handoff between first contact and onboarding creates the most friction? Share the process, not private customer records.',
    ],
    [
      'demo-message-5',
      'local-ai',
      'Blocpod · demo',
      'Before choosing a model, write down the workload and acceptable latency. The local AI playbook describes a small evaluation set you can run on your own hardware.',
    ],
    [
      'demo-message-6',
      'founder-strategy',
      'Blocpod · demo',
      'Which architecture decision is most expensive to reverse in your current product? Start with data ownership, authorization, and external side effects.',
    ],
  ];
  for (const [messageId, roomId, author, content] of demoMessages)
    await execute(
      'INSERT INTO messages(id,room_id,author_name,body,demo) VALUES($1,$2,$3,$4,TRUE) ON CONFLICT(id) DO NOTHING',
      [messageId, roomId, author, content],
    );
  const requests = [
    [
      'demo-request-1',
      'A qualification agent that explains its decisions',
      'A reusable workflow that classifies an inbound inquiry, cites the supplied evidence, and queues the response for approval.',
      'qualification',
      'planned',
    ],
    [
      'demo-request-2',
      'One onboarding checklist across client projects',
      'A way to turn an approved proposal into a project checklist, record missing inputs, and track handoffs without sending duplicate reminders.',
      'onboarding',
      'reviewing',
    ],
    [
      'demo-request-3',
      'A public bid monitoring workflow',
      'An agent pattern that monitors authorized public procurement sources, records provenance, and flags potentially relevant opportunities for a person to assess.',
      'research',
      'submitted',
    ],
  ];
  for (const [requestId, title, summary, cluster, status] of requests)
    await execute(
      "INSERT INTO build_requests(id,title,summary,cluster,status,demo,ai_state) VALUES($1,$2,$3,$4,$5,TRUE,'demo') ON CONFLICT(id) DO NOTHING",
      [requestId, title, summary, cluster, status],
    );
  await execute(
    `INSERT INTO workflows(id,name,prompt,category,schedule_minutes,enabled) VALUES('weekly-intelligence','Opportunity intelligence','Prepare a practical business opportunity analysis. Distinguish assumptions from verified evidence. Do not claim to have performed live research. Provide a concrete validation exercise.','intelligence',10080,FALSE) ON CONFLICT(id) DO NOTHING`,
  );
  if (await one("SELECT id FROM users WHERE id='demo-member'")) {
    await execute(
      `INSERT INTO projects(id,user_id,name,goal,resource_ids) VALUES('demo-project','demo-member','A calmer client onboarding','Design a reliable handoff from signed proposal to project kickoff.','["workflow-starter","qualification-system"]') ON CONFLICT(id) DO NOTHING`,
    );
    await execute(
      `INSERT INTO resource_saves(user_id,resource_id) VALUES('demo-member','workflow-starter') ON CONFLICT DO NOTHING`,
    );
    await execute(
      `INSERT INTO notifications(id,user_id,title,body,href) VALUES('demo-welcome','demo-member','Welcome to the operating network','This workspace contains clearly marked demonstration content. Save a system, describe a goal, or join a conversation.','/app/library') ON CONFLICT(id) DO NOTHING`,
    );
  }
}
