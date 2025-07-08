const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const ffmpegPath = require('ffmpeg-static');
const ffmpeg = require('fluent-ffmpeg');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json());

function hkdf(mediaKey, info, length = 112) {
  const salt = Buffer.alloc(32, 0);
  const prk = crypto.createHmac('sha256', salt).update(mediaKey).digest();
  let okm = Buffer.alloc(0);
  let prev = Buffer.alloc(0);

  for (let i = 0; i < Math.ceil(length / 32); i++) {
    const hmac = crypto.createHmac('sha256', prk);
    hmac.update(Buffer.concat([prev, Buffer.from(info), Buffer.from([i + 1])]));
    prev = hmac.digest();
    okm = Buffer.concat([okm, prev]);
  }

  return okm.slice(0, length);
}

async function decryptMedia(filePath, mediaKeyB64, mediaType = 'Audio') {
  const enc = fs.readFileSync(filePath);
  const mac = enc.slice(-10);
  const cipherText = enc.slice(0, -10);

  const mediaKey = Buffer.from(mediaKeyB64, 'base64');
  const info = `WhatsApp ${mediaType} Keys`;
  const keys = hkdf(mediaKey, info);
  const iv = keys.slice(0, 16);
  const cipherKey = keys.slice(16, 48);
  const macKey = keys.slice(48, 80);

  const macCalc = crypto.createHmac('sha256', macKey).update(Buffer.concat([iv, cipherText])).digest().slice(0, 10);
  if (!mac.equals(macCalc)) throw new Error('MAC inválido – mediaKey ou arquivo incorreto');

  const decipher = crypto.createDecipheriv('aes-256-cbc', cipherKey, iv);
  const decrypted = Buffer.concat([decipher.update(cipherText), decipher.final()]);
  const padding = decrypted[decrypted.length - 1];
  return decrypted.slice(0, -padding);
}

function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .toFormat('mp3')
      .on('error', reject)
      .on('end', resolve)
      .save(outputPath);
  });
}

app.post('/decrypt', async (req, res) => {
  const { url, mediaKey, mediaType = 'Audio' } = req.body;

  if (!url || !mediaKey) {
    return res.status(400).json({ error: 'Parâmetros "url" e "mediaKey" são obrigatórios.' });
  }

  const tempEncPath = path.join('/tmp', `${uuidv4()}.enc`);
  const tempOggPath = path.join('/tmp', `${uuidv4()}.ogg`);
  const tempMp3Path = path.join('/tmp', `${uuidv4()}.mp3`);

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      headers: {
        'User-Agent': 'WhatsApp/2.23.11.77 A',
        'Referer': 'https://web.whatsapp.com/',
        'Origin': 'https://web.whatsapp.com'
      }
    });

    fs.writeFileSync(tempEncPath, response.data);

    const decryptedBuffer = await decryptMedia(tempEncPath, mediaKey, mediaType);
    fs.writeFileSync(tempOggPath, decryptedBuffer);

    await convertToMp3(tempOggPath, tempMp3Path);

    const finalBase64 = fs.readFileSync(tempMp3Path).toString('base64');

    res.json({ base64: finalBase64 });
  } catch (err) {
    console.error('❌ Erro:', err);
    res.status(500).json({ error: err.message });
  } finally {
    [tempEncPath, tempOggPath, tempMp3Path].forEach(file => {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    });
  }
});
