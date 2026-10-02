import express from 'express';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

app.use(express.json());

// Helper function for retrying with exponential backoff
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 5, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Robustly check for 503 in various error structures
    const is503 = error.status === 503 || 
                  error.code === 503 || 
                  (error.error && error.error.code === 503);
    
    if (retries > 0 && is503) {
      console.warn(`Gemini API 503, retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// API routes
app.post('/api/analyze', upload.array('files'), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const complementaryInfo = req.body.complementaryInfo;

    const contents = files.map(file => ({
      inlineData: {
        mimeType: file.mimetype,
        data: file.buffer.toString('base64'),
      },
    }));

    const firacPrompt = `
You are an expert in LAW, LINGUISTICS, COGNITIVE AND SOCIAL SCIENCES.
Consult all provided documents in their entirety. They may have contradictory information. Therefore, read holistically to capture all controverted points and all legal issues in their depth and totality.
Provide a detailed legal analysis of the provided case. Incorporate nuances and provide LOGICAL ARGUMENTATION.
Use FIRAC+ format:
## DADOS DO PROCESSO - COURT - TYPE OF APPEAL OR ACTION - CASE NUMBER - REPORTER - JUDGMENT DATE
## FATOS - LIST with all facts with DEPTH, DETAILS and MINUTIAE
## PROBLEMA JURÍDICO
## QUESTÃO CENTRAL - ESTABLISH DEPTH the central question
## PONTOS CONTROVERTIDOS - LIST delimiting controverted points based on nuances
## DIREITO APLICÁVEL - LIST applicable norms referenced in the documents
## ANÁLISE E APLICAÇÃO
## ARGUMENTOS E PROVAS DO AUTORES - LIST all plaintiff arguments and proofs with LOGICAL INFERENCE
## ARGUMENTOS E PROVAS DO RÉU - LIST all defendant arguments and proofs with LOGICAL INFERENCE
## NOTAS - Provide unbiased and holistic guidance and analysis.
Go step by step. Be professional and authoritative.
Contexto adicional: ${complementaryInfo}
    `;

    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [...contents, { text: firacPrompt }],
    }));

    res.json({ analysis: response.text });
  } catch (error: any) {
    console.error('Error in /api/analyze:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze documents' });
  }
});

app.post('/api/draft-liminar', async (req, res) => {
  try {
    const { analysis } = req.body;

    const liminarPrompt = `
CONTEXTO:
Você é um Juiz de Primeira Instância, elaborando decisão interlocutória em pedido de tutela de urgência (art. 300 do CPC). Receberá como entrada os dados da petição inicial e documentos anexos (análise prévia FIRAC+).

TAREFA:
Redija a decisão liminar completa, percorrendo obrigatoriamente estas etapas na ordem indicada:

1. RELATÓRIO
   - Identificação das partes (requerente e requerido)
   - Síntese objetiva do pedido principal e do pedido liminar
   - Valor da causa declarado
   - Documentos relevantes apresentados

2. FUNDAMENTAÇÃO
   A. Valor da Causa (art. 290 do CPC)
      - Verifique se o valor declarado corresponde ao benefício econômico efetivamente pretendido pelo requerente
      - Se inadequado, indique o valor correto e fundamente a correção
      - Decida: manter o valor declarado, corrigi-lo de ofício ou determinar emenda à petição inicial

   B. Gratuidade da Justiça (somente se requerida)
      - Análise da hipossuficiência com base nos documentos juntados
      - Decisão motivada de deferimento ou indeferimento

   C. Tutela de Urgência — analise cada requisito separadamente:
      - Probabilidade do direito (fumus boni iuris)
      - Perigo de dano ou risco ao resultado útil do processo (periculum in mora)
      - Reversibilidade ou irreversibilidade da medida
      - Jurisprudência aplicável (STF/STJ)

3. DISPOSITIVO
   - Decisão sobre o valor da causa (manutenção, correção ou emenda)
   - Decisão sobre a gratuidade (se houver pedido)
   - Decisão sobre a liminar: deferimento total, parcial ou indeferimento, com extensão exata da medida e condições específicas

4. PROVIDÊNCIAS
   - Designação de audiência de mediação (plataforma, data, prazo)
   - Intimação do requerente
   - Citação do requerido com prazo de resposta
   - Outras determinações cartoriais pertinentes

RESTRIÇÕES:
- Não inclua conteúdo de fundamentação no Relatório; mantenha cada seção estrita.
- Não use linguagem genérica como "conforme o caso" ou "se necessário"; todas as determinações devem ser específicas e prontas para cumprimento imediato.
- Não omita nenhuma das quatro seções, mesmo que o conteúdo seja resumido.
- Não invente fatos ou documentos ausentes na entrada; sinalize lacunas explicitamente com [DADO AUSENTE: descreva o que falta].
- Cite precedentes apenas de STF e STJ; não cite doutrina como fundamento isolado da decisão.

FORMATO DE SAÍDA:
- Texto corrido em linguagem jurídica formal, padrão TJGO
- Cabeçalho: comarca, vara, número do processo, partes, natureza da ação
- Seções numeradas conforme a estrutura acima
- Sem bullet points no corpo da decisão — apenas texto em parágrafos
- Extensão proporcional à complexidade do caso: decisões simples em até 400 palavras; casos com múltiplos pedidos podem ultrapassar este limite.

Análise base para a decisão: ${analysis}
    `;

    const response = await retryWithBackoff(() => ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ text: liminarPrompt }],
    }));

    res.json({ draft: response.text });
  } catch (error: any) {
    console.error('Error in /api/draft-liminar:', error);
    res.status(500).json({ error: error.message || 'Failed to draft liminar' });
  }
});



// Vite middleware setup
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
