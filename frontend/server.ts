import express from 'express';
import multer from 'multer';
import cors from 'cors';
import Papa from 'papaparse';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const storage = multer.memoryStorage();
const upload = multer({ 
  storage, 
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

let ai: GoogleGenAI | null = null;
function getAI() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set. Por favor, verifique se o arquivo .env existe e possui a variável GEMINI_API_KEY devidamente configurada.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

// System prompt exactly as requested by user
const SYSTEM_INSTRUCTION = `Você é o agente de inteligência artificial do Text-2-Dash, um especialista em análise e visualização de dados. Suas regras estritas são:
1. Restrição de Escopo: Responda APENAS a comandos relacionados à análise dos dados fornecidos e geração de visualizações. Recuse educadamente outros assuntos.
2. Geração de Visualizações (Opcional): Gere gráficos APENAS se a pergunta do usuário solicitar uma visualização ou se a resposta for melhor compreendida visualmente. Para perguntas objetivas (ex: "Qual cidade tem mais vagas?"), responda em texto e NÃO gere nenhum gráfico ou código.
3. Bibliotecas e Formatos: Quando precisar gerar uma visualização (gráfico ou tabela), escreva e retorne código Python válido utilizando Pandas e Plotly. Você tem permissão para gerar tabelas utilizando \`plotly.graph_objects.Table\` caso o usuário solicite uma tabela ou se os dados pedirem formato tabular.
4. Design e Estilização: Quando gerar visualizações, adote as melhores práticas (paletas acessíveis, rótulos claros, etc.).
5. Formato de Saída: O dataframe já está carregado na variável 'df'.`;

const NODE_PREVIEW_INSTRUCTION = `
Additionally, verify your output exactly matches this JSON schema:
{
  "message": "A friendly message answering the user's question. If the user asks a simple question, answer it directly here without generating a chart unless requested.",
  "python_code": "OPTIONAL. The raw Python code string. Omit or set to null if no visualization is needed.",
  "plotly_json": null // OPTIONAL. Object containing { "data": [], "layout": {} } matching the python code. Omit or set to null if no visualization is needed.
}
Do NOT wrap the JSON in markdown code blocks. Output ONLY valid JSON.
`;

app.post('/api/upload', upload.single('dataset'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const fileContent = req.file.buffer.toString('utf-8');
    const fileName = req.file.originalname;

    // Basic CSV parsing using PapaParse
    if (fileName.endsWith('.csv')) {
      const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true, dynamicTyping: true, preview: 1000 });
      const columns = parsed.meta.fields || [];
      const sample = parsed.data.slice(0, 5);
      
      const columnStats = columns.map(col => {
        const values = parsed.data.map((row: any) => row[col]).filter((v: any) => v !== null && v !== undefined && v !== '');
        const uniqueValues = new Set(values);
        let type = 'string';
        if (values.length > 0 && typeof values[0] === 'number') type = 'number';
        return {
          name: col,
          type: type,
          uniqueCount: uniqueValues.size,
          sampleValues: Array.from(uniqueValues).slice(0, 5)
        };
      });
      
      return res.json({ 
        fileName,
        size: req.file.size,
        schema: {
          columns,
          columnStats,
          sample
        }
      });
    } else {
        return res.json({
            fileName,
            size: req.file.size,
            schema: {
                columns: ['id', 'value', 'category'],
                sample: [{ id: 1, value: 10, category: 'A' }]
            }
        });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar o arquivo.' });
  }
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, schema, history } = req.body;

    if (!message || !schema) {
      return res.status(400).json({ error: 'Mensagem e schema são obrigatórios.' });
    }

    const promptContext = `
Informações do Dataset (Até 1000 linhas inferidas):
Estatísticas de Colunas: ${JSON.stringify(schema.columnStats || schema.columns, null, 2)}

Amostra de dados (5 linhas):
${JSON.stringify(schema.sample, null, 2)}

Mensagem do usuário:
${message}
    `;

    let response;
    try {
      const aiClient = getAI();
      response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: promptContext,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION + NODE_PREVIEW_INSTRUCTION,
          temperature: 0.1,
        }
      });
    } catch (apiError: any) {
      console.error("Gemini API Error:", apiError);
      if (apiError?.status === 429) {
         return res.status(429).json({ error: "Limite de taxa (Quota Exceeded) da API do Gemini atingido. Por favor, aguarde um minuto e tente novamente." });
      }
      throw apiError;
    }

    const text = response.text || "{}";
    
    // Clean up potential markdown wrapper
    const jsonStr = text.replace(/^`+json\s*/, '').replace(/\s*`+$/, '');
    
    try {
        const parsedResponse = JSON.parse(jsonStr);
        res.json(parsedResponse);
    } catch (parseError) {
        console.error("Failed to parse Gemini output as JSON", text);
        res.status(500).json({ error: 'A resposta da IA não pôde ser processada.' });
    }

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao comunicar com a inteligência artificial.' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
