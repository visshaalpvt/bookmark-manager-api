import { createYogaServer } from './server';

const port = Number(process.env.PORT) || 4000;
const yoga = createYogaServer();

const server = Bun.serve({
  port,
  fetch(req: Request): Response | Promise<Response> {
    return yoga.fetch(req);
  },
});

console.log(
  `🚀 Bookmark Manager GraphQL API server is running at http://${server.hostname}:${server.port}/graphql`
);
