// apps/ai-chat/api.js
// Serverless Function for proxying requests to Hugging Face API
// Vercel Node.js 18+ supports global fetch - no node-fetch needed

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Preflight Request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Method Check
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Parse Request
  const { token, model, inputs, parameters } = req.body;

  if (!token || !model || !inputs) {
    return res.status(400).json({ 
      error: 'Missing required fields: token, model, inputs' 
    });
  }

  try {
    // Request to Hugging Face API
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

    // Handle errors from HF
    if (!hfResponse.ok) {
      const errorMsg = data.error || `HF API returned ${hfResponse.status}`;
      return res.status(hfResponse.status).json({ error: errorMsg });
    }

    // Parse response
    let result = '';

    if (Array.isArray(data) && data[0]?.generated_text) {
      result = data[0].generated_text;
    } else if (typeof data === 'string') {
      result = data;
    } else if (data?.generated_text) {
      result = data.generated_text;
    } else if (data?.[0]?.text) {
      result = data[0].text;
    } else {
      result = JSON.stringify(data);
    }

    // Success response
    return res.status(200).json({
      success: true,
      result: result.trim(),
      generated_text: result.trim(),
      model,
    });

  } catch (err) {
    console.error('Proxy error:', err);

    let errorMsg = 'Internal server error';
    if (err instanceof TypeError && err.message.includes('fetch')) {
      errorMsg = 'Failed to connect to Hugging Face API';
    } else if (err.message) {
      errorMsg = err.message;
    }

    return res.status(500).json({ 
      error: errorMsg,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
}