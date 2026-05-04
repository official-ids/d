// apps/hash-tool/api.js
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

export default function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, fileBase64, algorithm } = req.body;

    if (!algorithm || !['md5', 'sha1', 'sha256', 'sha512'].includes(algorithm)) {
      return res.status(400).json({ error: 'Invalid or missing algorithm' });
    }
    if (!text && !fileBase64) {
      return res.status(400).json({ error: 'Missing text or fileBase64' });
    }

    const hashInstance = crypto.createHash(algorithm);
    let dataToHash;

    if (fileBase64) {
      const base64Data = fileBase64.includes(',') 
        ? fileBase64.split(',')[1] 
        : fileBase64;
      dataToHash = Buffer.from(base64Data, 'base64');
    } else {
      dataToHash = text;
    }

    const hash = hashInstance.update(dataToHash).digest('hex');

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
}