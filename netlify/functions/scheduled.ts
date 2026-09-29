import { dispatchJobs } from '../../server/job-dispatch';
// Scheduled functions have a 30-second limit. Only dispatch here; work runs in the background.
export default async () => {
  await dispatchJobs();
  return new Response('Background worker dispatched');
};
export const config = { schedule: '*/15 * * * *' };
