// apps/ai-chat/api.js
// MINIMAL TEST - если это работает, значит проблема в основном коде

export const config = {
  api: { bodyParser: { sizeLimit: '1mb' } }
};

export const runtime = 'nodejs';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'POST only' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ 
    ok: true, 
    method: req.method,
    url: req.url,
    time: Date.now()
  }));
}