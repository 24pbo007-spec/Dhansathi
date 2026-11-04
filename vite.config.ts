import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { pathToFileURL } from 'node:url'

type ApiRequest = IncomingMessage & { query?: Record<string, string>; body?: unknown };
type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse;
  json: (payload: unknown) => void;
  send: (payload: unknown) => void;
};
type ApiModule = { default: (req: ApiRequest, res: ApiResponse) => Promise<void> };

// Vercel serverless functions that the Vite dev server should emulate.
const DEV_API_ROUTES: Record<string, string> = {
  '/api/scholarships': 'api/scholarships.js',
  '/api/schemes': 'api/schemes.js',
  '/api/scheme-detail': 'api/scheme-detail.js',
  '/api/ai': 'api/ai.js',
  '/api/simulate': 'api/simulate.js',
  '/api/quotes': 'api/quotes.js',
  '/api/recommend': 'api/recommend.js',
  '/api/chat': 'api/chat.js',
};

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev',
    configureServer(server: { middlewares: { use: (handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void } }) {
      server.middlewares.use((req, res, next) => {
        const requestUrl = new URL(req.url || '/', 'http://localhost');
        const file = DEV_API_ROUTES[requestUrl.pathname];
        if (!file) return next();

        const query = Object.fromEntries(requestUrl.searchParams.entries());
        const apiRes = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return apiRes;
          },
          json(payload: unknown) {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(payload));
          },
          send(payload: unknown) {
            res.end(payload);
          },
        }) as ApiResponse;

        const modulePath = pathToFileURL(path.resolve(__dirname, file)).href;
        Promise.all([import(/* @vite-ignore */ modulePath), req.method === 'POST' ? readJsonBody(req) : Promise.resolve(undefined)])
          .then(([mod, body]: [ApiModule, unknown]) => mod.default(Object.assign(req, { query, body }), apiRes))
          .catch((error: Error) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: error.message }));
          });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDevPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    open: true,
    allowedHosts: true,
    proxy: {
      '/api/pollination': {
        target: 'https://gen.pollinations.ai',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/pollination/, ''),
      },
      '/api/yahoo-finance': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo-finance/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      },
      '/api/twelve-data': {
        target: 'https://api.twelvedata.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/twelve-data/, ''),
      },
    },
  },
})
