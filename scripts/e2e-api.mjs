import { createServer } from 'node:http';

// Browser-test fixture. Individual specs mock catalogue and account responses.
const port = Number(process.argv[2] ?? 18082);
const readiness = {
    ready: false,
    connected: false,
    connections: [],
    blockers: [
        'Authenticated brand-owner sign-in and brand membership are not configured.',
        'Shopify app installation is not configured in browser tests.',
    ],
};
const directory = {
    connected: false,
    shops: [
        { key: 'mock', name: 'Mock Shop' },
        { key: 'apparel', name: 'Elysian Thread' },
    ],
};
const responses = new Map([
    ['/api/merchant/shopify/readiness', readiness],
    ['/api/integrations/shopify/status', directory],
]);

createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' });
        response.end(JSON.stringify({ error: 'Test fixture rejects writes' }));
        return;
    }
    const payload = responses.get(request.url);
    if (!payload) {
        response.writeHead(404);
        response.end(JSON.stringify({ error: 'No fixture: mock this request explicitly in the test' }));
        return;
    }
    response.end(JSON.stringify(payload));
}).listen(port, '127.0.0.1');
