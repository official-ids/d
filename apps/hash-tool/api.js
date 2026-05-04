// apps/hash-tool/api.js
// Этот файл будет скопирован скриптом в api-internal/

const crypto = require('crypto');

module.exports = function handler(req, res) {
  // === CORS HEADERS ===
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // === PREFLIGHT ===
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === METHOD CHECK ===
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, fileBase64, algorithm } = req.body;

    // === VALIDATION ===
    if (!algorithm || !['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm)) {
      return res.status(400).json({ error: 'Invalid or missing algorithm' });
    }
    if (!text && !fileBase64) {
      return res.status(400).json({ error: 'Missing text or fileBase64' });
    }

    // === HASH LOGIC ===
    const hashInstance = crypto.createHash(algorithm);
    let dataToHash;

    if (fileBase64) {
      // Удаляем префикс data URL если есть (data:image/png;base64,...)
      const base64Data = fileBase64.includes(',') 
        ? fileBase64.split(',')[1] 
        : fileBase64;
      dataToHash = Buffer.from(base64Data, 'base64');
    } else {
      dataToHash = text;
    }

    const hash = hashInstance.update(dataToHash).digest('hex');

    // === SUCCESS RESPONSE ===
    return res.status(200).json({
      success: true,
      data: {
        algorithm: algorithm.toUpperCase(),
        inputLength: typeof dataToHash === 'string' 
          ? dataToHash.length 
          : dataToHash.length + ' bytes',
        hash: hash,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Hash Error:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message 
    });
  }
};