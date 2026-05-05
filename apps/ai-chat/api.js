// apps/ai-chat/api.js
// Serverless Function for Hugging Face API proxy
// Vercel Node.js 18+ has global fetch - no imports needed

export const config = {
  api: {
    bodyParser: { sizeLimit: '2mb' },
  },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { token, model, inputs, parameters } = req.body;

    if (!token || !model || !inputs) {
      res.status(400).json({ error: 'Missing token, model, or inputs' });
      return;
    }

    // Call Hugging Face API using global fetch
    const hfResponse = await fetch(
      `https://api-inference.huggingface.co/models/${model}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs,
          parameters: parameters || {
            max_new_tokens: 1024,
            temperature: 0.7,
            return_full_text: false,
          },
        }),
      }
    );

    const data = await hfResponse.json();

    if (!hfResponse.ok) {
      res.status(hfResponse.status).json({ error: data.error || 'HF API error' });
      return;
    }

    // Parse HF response
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

    // Success
    res.status(200).json({
      success: true,
      result: result.trim(),
      generated_text: result.trim(),
      model,
    });

  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ 
      error: 'Internal error', 
      message: err.message 
    });
  }
}