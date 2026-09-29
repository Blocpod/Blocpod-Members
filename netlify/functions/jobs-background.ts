import { authorizeJobRequest } from '../../server/job-dispatch';
import { runDueJobs } from '../../server/jobs';

export default async (request: Request) => {
  // Netlify acknowledges background invocation before executing this handler. Unauthorized calls do no work.
  if (request.method !== 'POST' || !authorizeJobRequest(request)) {
    console.warn(JSON.stringify({ event: 'job_dispatch_rejected' }));
    return;
  }
  const result = await runDueJobs();
  console.log(JSON.stringify({ event: 'job_batch_completed', ...result }));
};
export const config = { background: true };
