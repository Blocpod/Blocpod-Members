import { randomUUID } from 'node:crypto';
import { query, one, execute, transaction } from './db';
import { aiConfigured, generateText, type Provider } from './ai';
import { deliverEmail } from './email';

export async function triageRequest(requestId: string) {
  const request = await one<any>(
    `UPDATE build_requests SET ai_state='running',updated_at=NOW() WHERE id=$1 AND ai_state IN('pending','unconfigured') RETURNING id,title,summary`,
    [requestId],
  );
  if (!request) return { skipped: true };
  try {
    // Public idea fields only. Confidential business context is not sent to any AI provider.
    const result = await generateText(
      `Classify this public build idea, identify duplicate themes, suggest next steps, and flag commercial scope without commitments. Return an explanation for human review.\n${JSON.stringify(request)}`,
    );
    await execute(
      `UPDATE build_requests SET ai_state='review',ai_analysis=$2 WHERE id=$1`,
      [requestId, result.text],
    );
    return { analysis: result.text, state: 'review' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI triage failed';
    await execute(
      `UPDATE build_requests SET ai_state='failed',ai_analysis=$2 WHERE id=$1`,
      [requestId, message],
    );
    return { error: message, state: 'failed' };
  }
}

export async function queueWorkflow(workflowId: string, scheduled = false) {
  return transaction(async (db) => {
    const workflow = await db.one<any>(
      `SELECT * FROM workflows WHERE id=$1 ${scheduled ? 'AND enabled=TRUE AND next_run_at<=NOW()' : ''} FOR UPDATE`,
      [workflowId],
    );
    if (!workflow)
      return { skipped: true, reason: 'Workflow missing or not due' };
    const pending = await db.one<{ id: string; status: string }>(
      `SELECT id,status FROM job_runs WHERE workflow_id=$1 AND status IN('queued','running') ORDER BY queued_at LIMIT 1`,
      [workflowId],
    );
    if (pending)
      return { job_id: pending.id, status: pending.status, existing: true };
    const jobId = randomUUID();
    await db.execute(
      `INSERT INTO job_runs(id,workflow_id,status,provider,model) VALUES($1,$2,'queued',$3,$4)`,
      [jobId, workflowId, workflow.provider, workflow.model],
    );
    await db.execute(
      `UPDATE workflows SET next_run_at=NOW()+schedule_minutes*INTERVAL '1 minute' WHERE id=$1`,
      [workflowId],
    );
    return { job_id: jobId, status: 'queued' };
  });
}

async function executeWorkflow(jobId: string) {
  const claimed = await transaction(async (db) => {
    const job = await db.one<any>(
      `SELECT * FROM job_runs WHERE id=$1 AND status='queued' FOR UPDATE`,
      [jobId],
    );
    if (!job) return null;
    const workflow = await db.one<any>(
      `UPDATE workflows SET lease_until=NOW()+INTERVAL '5 minutes' WHERE id=$1 AND(lease_until IS NULL OR lease_until<NOW()) RETURNING *`,
      [job.workflow_id],
    );
    if (!workflow) return null;
    await db.execute(
      `UPDATE job_runs SET status='running',started_at=NOW(),provider=$2,model=$3,error=NULL WHERE id=$1`,
      [jobId, workflow.provider, workflow.model],
    );
    return workflow;
  });
  if (!claimed)
    return { skipped: true, reason: 'Already claimed or currently leased' };
  const workflow = claimed;
  try {
    const result = await generateText(
      `${workflow.prompt}\n\nWrite useful Markdown with an explicit assumptions and verification section. This workflow has no web-research tool; do not imply live research.`,
      workflow.provider as Provider,
      workflow.model,
    );
    const resourceId = randomUUID();
    await transaction(async (db) => {
      await db.execute(
        `INSERT INTO resources(id,title,summary,body,category,level,status,ai_provider,ai_model) VALUES($1,$2,$3,$4,$5,$6,'review',$7,$8)`,
        [
          resourceId,
          `${workflow.name} · ${new Date().toISOString().slice(0, 10)}`,
          'AI-prepared draft. Requires editorial verification and approval.',
          result.text,
          workflow.category,
          workflow.level,
          result.provider,
          result.model,
        ],
      );
      await db.execute(
        `UPDATE job_runs SET status='succeeded',artifact_id=$2,tokens=$3,finished_at=NOW() WHERE id=$1`,
        [jobId, resourceId, result.tokens],
      );
    });
    return { job_id: jobId, status: 'succeeded', artifact_id: resourceId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workflow failed';
    await execute(
      `UPDATE job_runs SET status='failed',error=$2,finished_at=NOW() WHERE id=$1`,
      [jobId, message],
    );
    return { job_id: jobId, status: 'failed', error: message };
  } finally {
    await execute('UPDATE workflows SET lease_until=NULL WHERE id=$1', [
      workflow.id,
    ]);
  }
}

// Direct runner is for local scripts/tests; HTTP handlers only queue durable work.
export async function runWorkflow(id: string, scheduled = false) {
  const queued = await queueWorkflow(id, scheduled);
  if (!queued.job_id || queued.status === 'running')
    return { skipped: true, reason: 'Not available for execution' };
  return executeWorkflow(queued.job_id);
}

export async function runDueJobs() {
  // Stop starting work after ten minutes; the final 90-second provider request still fits Netlify's 15-minute background limit.
  const deadline = Date.now() + 10 * 60_000;
  // Remove only long-expired authentication/abuse-control records; member content has no automatic retention deletion.
  await execute(`DELETE FROM sessions WHERE expires_at<NOW()-INTERVAL '1 day'`);
  await execute(
    `DELETE FROM password_resets WHERE expires_at<NOW()-INTERVAL '1 day'`,
  );
  await execute(
    `DELETE FROM email_verifications WHERE expires_at<NOW()-INTERVAL '1 day'`,
  );
  await execute(
    `DELETE FROM rate_limits WHERE window_start<NOW()-INTERVAL '1 day'`,
  );
  // Expired leases leave an honest failed record before a later scheduled retry.
  await execute(
    `UPDATE job_runs SET status='failed',error='Execution lease expired; execution was interrupted',finished_at=NOW() WHERE status='running' AND started_at<NOW()-INTERVAL '5 minutes'`,
  );
  const published = await query<{ id: string }>(
    `UPDATE resources SET status='published',updated_at=NOW() WHERE status='scheduled' AND approved=TRUE AND publish_at<=NOW() RETURNING id`,
  );
  const due = await query<{ id: string }>(
    'SELECT id FROM workflows WHERE enabled=TRUE AND next_run_at<=NOW() ORDER BY next_run_at LIMIT 5',
  );
  for (const workflow of due) await queueWorkflow(workflow.id, true);
  const queued = await query<{ id: string }>(
    `SELECT id FROM job_runs WHERE status='queued' ORDER BY queued_at LIMIT 5`,
  );
  const results = [];
  for (const job of queued) {
    if (Date.now() >= deadline) break;
    results.push(await executeWorkflow(job.id));
  }
  await execute(
    `UPDATE build_requests SET ai_state='failed',ai_analysis='Triage interrupted; retry from administration' WHERE ai_state='running' AND updated_at<NOW()-INTERVAL '5 minutes'`,
  );
  const triaged = [];
  const pendingTriage = await query<{ id: string }>(
    `SELECT id FROM build_requests WHERE ai_state='pending' OR($1::boolean AND ai_state='unconfigured') ORDER BY created_at LIMIT 3`,
    [aiConfigured()],
  );
  for (const request of pendingTriage) {
    if (Date.now() >= deadline) break;
    triaged.push(await triageRequest(request.id));
  }
  let emails = 0;
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
    await execute(
      `UPDATE email_outbox SET status='failed',last_error='Sending interrupted; retrying with provider idempotency key' WHERE status='sending' AND claimed_at<NOW()-INTERVAL '5 minutes'`,
    );
    const pending = await query<{ id: string }>(
      `SELECT id FROM email_outbox WHERE status IN('pending','failed','blocked') AND attempts<5 ORDER BY created_at LIMIT 20`,
    );
    for (const mail of pending) {
      if (Date.now() >= deadline) break;
      await deliverEmail(mail.id);
      emails++;
    }
  }
  return {
    results,
    published: published.length,
    triaged: triaged.length,
    emails,
  };
}
