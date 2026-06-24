import React, { useState, useRef, useEffect } from 'react';
import { 
  Paperclip, 
  Send, 
  Trash2, 
  Download, 
  Code, 
  Bot, 
  User, 
  FileSpreadsheet, 
  BarChartBig,
  Loader2
} from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import createPlotlyComponent from 'react-plotly.js/factory';

const Plot = createPlotlyComponent(Plotly);

interface Message {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  code?: string;
  chartData?: any;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Bem-vindo ao Text-2-Dash! 🚀\nEu sou o seu assistente de dados focado em visualização. Faça o upload de um dataset (CSV, JSON, XLSX - Máx 5MB) para começarmos. Depois, é só pedir o gráfico que você deseja ver (Ex: "Mostre o faturamento por mês em um gráfico de barras").'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [datasetSchema, setDatasetSchema] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCodeFor, setShowCodeFor] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  useEffect(() => scrollToBottom(), [messages]);

  // Session Timeout logic
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const resetTimeout = () => {
      clearTimeout(timeoutId);
      // 30 minutes in milliseconds
      timeoutId = setTimeout(() => {
        handleClearSession('Sua sessão expirou por inatividade (30 minutos). O chat e o arquivo foram limpos por segurança.');
      }, 30 * 60 * 1000); 
    };

    const handleClearSession = (alertMsg?: string) => {
      setUploadedFile(null);
      setDatasetSchema(null);
      setMessages([{
        id: 'welcome-reset',
        sender: 'bot',
        text: alertMsg || 'Sessão reiniciada.'
      }]);
    };

    window.addEventListener('mousemove', resetTimeout);
    window.addEventListener('keypress', resetTimeout);
    resetTimeout();

    return () => {
      window.removeEventListener('mousemove', resetTimeout);
      window.removeEventListener('keypress', resetTimeout);
      clearTimeout(timeoutId);
      handleClearSession();
    };
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("O arquivo excede o limite de 5MB.");
      return;
    }

    const validExtensions = ['.csv', '.json', '.xlsx', '.xls'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validExtensions.includes(fileExt)) {
      alert("Formato não suportado. Por favor, envie um arquivo .csv, .json ou .xlsx.");
      return;
    }

    setIsUploading(true);
    setUploadedFile(file);

    const formData = new FormData();
    formData.append('dataset', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        setDatasetSchema(data.schema);
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: 'bot',
          text: `Dataset "${file.name}" carregado com sucesso! Encontrei ${data.schema.columns.length} colunas. O que você gostaria de analisar?`
        }]);
      } else {
        alert(data.error || 'Erro ao fazer upload do arquivo.');
        setUploadedFile(null);
      }
    } catch (error) {
      console.error(error);
      alert('Erro na comunicação com o servidor durante o upload.');
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearFile = () => {
    setUploadedFile(null);
    setDatasetSchema(null);
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !datasetSchema) return;

    const userMessage = inputMessage.trim();
    const newUserMsg: Message = { id: Date.now().toString(), sender: 'user', text: userMessage };
    
    setMessages(prev => [...prev, newUserMsg]);
    setInputMessage('');
    setIsGenerating(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          schema: datasetSchema,
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        const botMsgId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, {
          id: botMsgId,
          sender: 'bot',
          text: data.message || "Aqui está a análise gerada.",
          code: data.python_code,
          chartData: data.plotly_json
        }]);
      } else {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          sender: 'bot',
          text: `Desculpe, ocorreu um erro: ${data.error || 'Erro desconhecido'}`
        }]);
      }
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: 'bot',
        text: 'Desculpe, ocorreu um erro de conexão com o servidor.'
      }]);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadChart = (chartId: string, format: 'png' | 'jpeg') => {
    const gd = document.getElementById(`chart-${chartId}`) as any;
    if (gd) {
      Plotly.downloadImage(gd, { format, filename: 'text-2-dash-chart' });
    } else {
       alert("O gráfico ainda não está pronto.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0B0D0E] text-slate-200 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-14 border-b border-[#1A1D21] px-6 flex items-center justify-between bg-[#0B0D0E] shrink-0 z-10 w-full">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-white">
            <BarChartBig className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">
            Text-2-Dash <span className="text-xs font-normal text-slate-500 ml-2">v1.0.4</span>
          </h1>
        </div>
        
        {/* Dataset Status Badge */}
        {uploadedFile ? (
          <div className="flex items-center gap-3 bg-[#1A1D1F] pl-4 pr-2 py-1.5 rounded-lg border border-blue-500/30">
            <FileSpreadsheet className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium text-slate-300 truncate max-w-[200px]">
              {uploadedFile.name}
            </span>
            <button 
              onClick={clearFile}
              className="p-1 px-1.5 hover:text-red-400 text-slate-500 transition-colors"
              title="Excluir dataset"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="text-sm text-slate-500 font-medium px-4 py-1.5 bg-[#1A1D1F] border border-[#2A2E33] rounded-lg">
            No dataset
          </div>
        )}
      </header>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-8 space-y-8 bg-[#0B0D0E]">
        <div className="max-w-3xl mx-auto space-y-8 pb-10 w-full">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start space-x-4'}`}>
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 rounded-lg bg-[#1A1D21] flex items-center justify-center border border-[#2A2E33] shrink-0">
                  <Bot className="w-4 h-4 text-blue-400" />
                </div>
              )}
              
              <div className={`flex flex-col gap-4 ${msg.sender === 'user' ? 'items-end' : 'items-start flex-1'}`}>
                {msg.sender === 'user' ? (
                  <div className="bg-blue-600 text-white rounded-2xl rounded-tr-none px-5 py-3 text-sm shadow-lg max-w-[80%] whitespace-pre-wrap">
                    {msg.text}
                  </div>
                ) : (
                  <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {msg.text}
                  </div>
                )}

                {/* Render Chart if available */}
                {msg.chartData && msg.chartData.data && (
                  <div className="mt-2 bg-[#141618] border border-[#2A2E33] rounded-2xl p-6 shadow-2xl w-full flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-slate-200">Generated Visualization</h3>
                      {/* Actions */}
                      <div className="flex space-x-2">
                         {msg.code && (
                          <button 
                            onClick={() => setShowCodeFor(showCodeFor === msg.id ? null : msg.id)}
                            className="text-xs bg-[#1A1D21] px-3 py-1.5 rounded-lg border border-[#2A2E33] hover:bg-[#25282D] text-slate-300 transition-colors"
                          >
                            {showCodeFor === msg.id ? 'Hide Script' : 'View Script'}
                          </button>
                        )}
                        <button 
                          onClick={() => downloadChart(msg.id, 'png')}
                          className="text-xs bg-blue-600 px-3 py-1.5 rounded-lg font-medium text-white hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                        >
                          Export PNG
                        </button>
                      </div>
                    </div>
                    
                    <div id={`chart-${msg.id}`} className="w-full h-[400px]">
                      <Plot
                        data={msg.chartData.data || []}
                        layout={{
                          ...msg.chartData.layout,
                          autosize: true,
                          margin: { t: 40, r: 20, l: 40, b:40 },
                          paper_bgcolor: 'transparent',
                          plot_bgcolor: 'transparent',
                          font: { color: '#cbd5e1' }
                        }}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%' }}
                        config={{ responsive: true, displayModeBar: false }}
                      />
                    </div>

                    {/* Code Toggle */}
                    {showCodeFor === msg.id && msg.code && (
                      <div className="mt-4 bg-[#0B0D0E] rounded-xl p-4 overflow-x-auto border border-[#1A1D21]">
                         <pre className="text-sm font-mono text-emerald-400">
                           {msg.code}
                         </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {isGenerating && (
            <div className="flex items-start space-x-4">
              <div className="w-8 h-8 rounded-lg bg-[#1A1D21] flex items-center justify-center border border-[#2A2E33] shrink-0">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-sm text-slate-400 flex items-center gap-2 mt-1">
                <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                Analyzing data...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input Area */}
      <footer className="p-6 bg-[#0B0D0E] border-t border-[#1A1D21] w-full shrink-0">
        <div className="max-w-3xl mx-auto relative flex items-center">
          <input 
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept=".csv,.json,.xlsx,.xls"
            onChange={handleFileUpload}
          />
          
          {/* File Attachment Status (Inside Input visually) */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center space-x-3 pointer-events-none z-10">
            {uploadedFile ? (
              <div className="flex items-center px-2 py-1 bg-blue-500/10 border border-blue-500/30 rounded text-[10px] text-blue-400 font-bold uppercase tracking-tight">
                {uploadedFile.name.substring(uploadedFile.name.lastIndexOf('.') + 1)} Attached
              </div>
            ) : (
               <div className="flex items-center px-2 py-1 bg-slate-500/10 border border-slate-500/30 rounded text-[10px] text-slate-400 font-bold uppercase tracking-tight opacity-0">
                Idle
              </div>
            )}
          </div>
          
          <input
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            disabled={!uploadedFile || isGenerating}
            placeholder={uploadedFile ? "Ask about your data..." : "Attach a dataset first to start..."}
            className="w-full bg-[#141618] border border-[#2A2E33] rounded-2xl py-4 flex pl-[110px] pr-24 text-sm focus:outline-none focus:border-blue-500/50 transition-all text-slate-200 placeholder-slate-500 disabled:opacity-50 disabled:cursor-not-allowed"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />

          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || !!uploadedFile}
              className={`p-2 transition-all ${
                uploadedFile 
                  ? 'text-emerald-500 cursor-not-allowed opacity-50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
              title="Attach Dataset"
            >
               {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Paperclip className="w-5 h-5" />}
            </button>

            <button 
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || !uploadedFile || isGenerating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-all shadow-lg shadow-blue-900/20"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
