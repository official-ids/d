// apps/ai-chat/api.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token, model, inputs, parameters } = req.body;
  
  if (!token || !model || !inputs) {
    return res.status(400).json({ error: 'Missing token, model, or inputs' });
  }

  try {
    const hfResponse = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs, parameters })
    });

    const data = await hfResponse.json();
    
    if (!hfResponse.ok) {
      return res.status(hfResponse.status).json({ error: data.error || 'HF API error' });
    }

    let result = '';
    if (Array.isArray(data) && data[0]?.generated_text) {
      result = data[0].generated_text;
    } else if (typeof data === 'string') {
      result = data;
    } else if (data?.generated_text) {
      result = data.generated_text;
    } else {
      result = JSON.stringify(data);
    }

    // Возвращаем в формате { result: "...", generated_text: "..." }
    return res.status(200).json({ 
      result: result.trim(),
      generated_text: result.trim()
    });

  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Internal error: ' + err.message });
  }
};