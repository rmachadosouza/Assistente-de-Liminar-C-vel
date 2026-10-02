/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { motion } from 'motion/react';

export default function App() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [complementaryInfo, setComplementaryInfo] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleAnalyze = async () => {
    if (!files) return;
    setLoading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    formData.append('complementaryInfo', complementaryInfo);

    try {
      const res = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao processar a análise.');
      }
      setAnalysis(data.analysis);
      setShowConfirm(true);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDraftLiminar = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/draft-liminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Erro ao gerar a minuta.');
      }
      setDraft(data.draft);
      setShowConfirm(false); // Hide confirmation after generating
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-8 space-y-8">
      <h1 className="text-3xl font-bold">Assistente de Liminar Cível</h1>
      
      <div className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
        <label className="block text-sm font-medium text-slate-700">Adicionar Arquivos (PDF, MD, TXT)</label>
        <input type="file" multiple onChange={(e) => setFiles(e.target.files)} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        
        <label className="block text-sm font-medium text-slate-700">Informações Complementares (Opcional)</label>
        <textarea value={complementaryInfo} onChange={(e) => setComplementaryInfo(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" rows={4} />

        <button onClick={handleAnalyze} disabled={loading || !files} className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-50">
          {loading ? 'Processando...' : 'Análise FIRAC+'}
        </button>
      </div>

      {analysis && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-slate-50 p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Análise FIRAC+</h2>
          <pre className="whitespace-pre-wrap text-sm">{analysis}</pre>
          {showConfirm && (
            <div className="flex items-center gap-4">
              <p>Deseja gerar a minuta da decisão liminar?</p>
              <button onClick={handleDraftLiminar} className="px-4 py-2 bg-green-600 text-white rounded-md">Confirmar e Gerar</button>
            </div>
          )}
        </motion.div>
      )}

      {draft && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-lg border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-xl font-semibold">Minuta da Decisão Liminar</h2>
          <pre className="whitespace-pre-wrap text-sm">{draft}</pre>
        </motion.div>
      )}
    </div>
  );
}

