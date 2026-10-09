import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);

  // Local API for School Roster Catalog
  if (reqPath === '/api/school-roster') {
    const dataDir = path.join(__dirname, 'data');
    const catalogFile = path.join(dataDir, 'school_roster.json');

    if (req.method === 'GET') {
      if (fs.existsSync(catalogFile)) {
        try {
          const content = fs.readFileSync(catalogFile, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          res.end(content);
          return;
        } catch(e){}
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{}');
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(catalogFile, JSON.stringify(parsed, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, count: Object.keys(parsed).length }));
        } catch(e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  // Local API for School Annual Plans
  if (reqPath === '/api/annual-plans') {
    const dataDir = path.join(__dirname, 'data');
    const plansFile = path.join(dataDir, 'annual_plans.json');

    if (req.method === 'GET') {
      if (fs.existsSync(plansFile)) {
        try {
          const content = fs.readFileSync(plansFile, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          });
          res.end(content);
          return;
        } catch(e){}
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end('{}');
      return;
    } else if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(plansFile, JSON.stringify(parsed, null, 2), 'utf8');
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true }));
        } catch(e) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
  const filePath = path.join(__dirname, reqPath);

  // Security checks: block hidden files, parent traversals, and sensitive folders/files
  const lowerPath = reqPath.toLowerCase();
  const isAllowedPwaJson = lowerPath === '/manifest.json' || lowerPath === '/manifest.webmanifest';

  if (
    reqPath.startsWith('/.') ||
    reqPath.includes('/..') ||
    reqPath.includes('\\..') ||
    lowerPath.startsWith('/scripts') ||
    lowerPath.startsWith('/backups') ||
    lowerPath.startsWith('/sql') ||
    lowerPath.startsWith('/node_modules') ||
    lowerPath.endsWith('.env') ||
    lowerPath.endsWith('.sql') ||
    lowerPath.endsWith('.xlsx') ||
    lowerPath.endsWith('.xls') ||
    lowerPath.endsWith('.mjs') ||
    (lowerPath.endsWith('.json') && !isAllowedPwaJson)
  ) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(resolvedPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': contentType,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN'
    };
    if (lowerPath === '/sw.js') {
      headers['Service-Worker-Allowed'] = '/';
      headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Sunucu aktif: http://localhost:${PORT}`);
});
