// apps/ai-chat/api.js
// Serverless Function для проксирования запросов к Hugging Face API
// Vercel Node.js 18+ поддерживает глобальный fetch — node-fetch не нужен

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb', // Лимит на размер запроса
    },
  },
};

export default async function handler(req, res) {
  // === CORS Headers ===
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // === Preflight Request ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === Method Check ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // === Parse Request ===
  const { token, model, inputs, parameters } = req.body;

  if (!token || !model || !inputs) {
    return res.status(400).json({ 
      error: 'Missing required fields: token, model, inputs' 
    });
  }

  try {
    // === Запрос к Hugging Face API ===
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

    // === Обработка ошибок от HF ===
    if (!hfResponse.ok) {
      const errorMsg = data.error || `HF API returned ${hfResponse.status}`;
      return res.status(hfResponse.status).json({ error: errorMsg });
    }

    // === Парсинг ответа ===
    let result = '';

    if (Array.isArray(data) && data[0]?.generated_text) {
      // Стандартный формат: [{ generated_text: "..." }]
      result = data[0].generated_text;
    } else if (typeof data === 'string') {
      // Редко: прямой строковый ответ
      result = data;
    } else if (data?.generated_text) {
      // Альтернативный формат: { generated_text: "..." }
      result = data.generated_text;
    } else if (data?.[0]?.text) {
      // Другой вариант: [{ text: "..." }]
      result = data[0].text;
    } else {
      // Фоллбэк: сериализуем всё, что пришло
      result = JSON.stringify(data);
    }

    // === Успешный ответ ===
    return res.status(200).json({
      success: true,
      result: result.trim(),
      generated_text: result.trim(), // для совместимости
      model,
    });

  } catch (err) {
    console.error('Proxy error:', err);

    // === Обработка сетевых ошибок ===
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