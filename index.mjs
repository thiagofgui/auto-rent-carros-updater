import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
const CACHE_FILE = './imageCache.json';

function loadCache() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return [];                    // arquivo ainda não existe
  }
}

function saveCache(data) {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const app = express();
const PORT = 3333;

// CORS “liberado”
app.use((_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

const CARQUERY_API = 'https://www.carqueryapi.com/api/0.3/?';

/* -------------------------------------------------- */
/* Utils                                              */
/* -------------------------------------------------- */
const parseResponseData = data => {
  if (typeof data !== 'string') return data;
  const str = data.trim();
  if (str.startsWith('{') || str.startsWith('[')) return JSON.parse(str);
  const m = str.match(/\(([^]*?)\)/);
  if (m?.[1]) return JSON.parse(m[1]);
  throw new Error('Formato de resposta inválido');
};

async function fetchMakes() {
  const res = await axios.get(`${CARQUERY_API}cmd=getMakes`, { responseType: 'text' });
  return parseResponseData(res.data).Makes.map(m => m.make_id);
}

async function fetchRandomTrim(make, year) {
  const res = await axios.get(
    `${CARQUERY_API}cmd=getTrims&make=${encodeURIComponent(make)}&year=${year}`,
    { responseType: 'text' }
  );
  let { Trims: trims } = parseResponseData(res.data);

  if (!trims?.length) {
    const alt = await axios.get(`${CARQUERY_API}cmd=getModels&make=${encodeURIComponent(make)}`,
      { responseType: 'text' });
    const models = parseResponseData(alt.data).Models;
    trims = models.map(m => ({
      model_name: m.model_name,
      model_year: year,
      body: m.model_body || 'compacto'
    }));
  }
  return trims[Math.floor(Math.random() * trims.length)];
}

/* -------------------------------------------------- */
/* Imagem (DALL·E 3 + fallback)                        */
/* -------------------------------------------------- */
async function generateCarImage(trim) {
  const carro = trim.body || 'sedan';
  const modelo = trim.model_name;

  const prompt = [
    `A sleek ${carro} car design concept in ${trim.model_year},`,
    'front three-quarter view,',
    'photorealistic rendering,',
    'professional automotive photography,',
    'studio lighting, clean white background,',
    'modern design, high detail'
  ].join(' ');

  try {
    const { data } = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    });
    console.log('DALL·E response:', data);
    return data[0].url;
  } catch (err) {
    console.error('DALL·E error:', err.error.message);
    return null;
  }
}

/* -------------------------------------------------- */
/* Endpoint                                           */
/* -------------------------------------------------- */
app.get('/carros', async (req, res) => {
  const quantidade = parseInt(req.query.quantidade);
  const forceGenerate = false;

  try {
    // 1. Lê (ou inicializa) o cache de URLs
    let cache = loadCache();                 // ex: ["https://...png", ...]
    const urlsDisponiveis = [...cache];      // cópia p/ manipular

    // 2. Decide quantas imagens precisamos gerar
    const faltam = forceGenerate
      ? quantidade                   // força gerar todas
      : Math.max(0, quantidade - cache.length);

    // 3. Gera as que faltam (se necessário)
    const novasUrls = [];
    if (faltam > 0) {
      const makes = await fetchMakes();            // usar p/ prompts
      for (let i = 0; i < faltam; i++) {
        const make = makes[Math.floor(Math.random() * makes.length)];
        const year = Math.floor(Math.random() * (2024 - 2018 + 1)) + 2018;
        const trim = await fetchRandomTrim(make, year);
        const url = await generateCarImage(trim);
        if (url) novasUrls.push(url);
      }
      cache = forceGenerate ? novasUrls : [...cache, ...novasUrls];
      saveCache(cache);                             // persiste
      urlsDisponiveis.push(...novasUrls);
    }

    // 4. Embaralha URLs e seleciona as que serão usadas nesta resposta
    const imagensParaUsar = shuffle(urlsDisponiveis).slice(0, quantidade);

    // 5. Para cada imagem, gera NOVOS metadados de carro
    const makes = await fetchMakes();               // usar de novo p/ detalhes
    const carros = [];

    for (let i = 0; i < quantidade; i++) {
      const make = makes[Math.floor(Math.random() * makes.length)];
      const year = Math.floor(Math.random() * (2024 - 2018 + 1)) + 2018;
      const trim = await fetchRandomTrim(make, year);

      carros.push({
        imageUrl: imagensParaUsar[i],
        marcaModelo: `${trim.model_name}`,
        ano: trim.model_year,
        valorDiario: `R$${(Math.random() * 180 + 120).toFixed(2)}/dia`,
        combustivel: trim.engine_fuel || 'Flex',
        lugares: 5,
        cambio: trim.transmission_type || 'Automático',
        motor: trim.engine_size ? `${trim.engine_size}L` : '1.6'
      });
    }

    res.json(shuffle(cache).slice(0, quantidade));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Image proxy
app.get('/proxy-image', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('URL obrigatória');
  try {
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    res.set('Content-Type', 'image/png');
    res.set('Access-Control-Allow-Origin', '*');
    res.send(resp.data);
  } catch {
    res.status(500).send('Erro ao proxy');
  }
});

app.listen(PORT, () => console.log(`API rodando em http://localhost:${PORT}`));
