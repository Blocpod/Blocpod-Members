import { app } from '../../server/app';
export default (request: Request) => app.fetch(request);
export const config = { path: '/api/*' };
