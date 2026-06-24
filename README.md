# Text-2-Dash

O Text-2-Dash é um assistente de análise e visualização de dados movido a IA. Ele permite que os usuários façam o upload de conjuntos de dados (CSV, JSON, Excel) e interajam com seus dados usando linguagem natural. A aplicação utiliza o modelo de IA Gemini 2.5 para interpretar as solicitações do usuário, analisar a estrutura de dados (schema) fornecida e gerar dinamicamente código Python e gráficos Plotly que são renderizados diretamente no navegador.

## Recursos

- **Upload de Dataset**: Suporta o upload de arquivos `.csv`, `.json` e Excel (até 5MB).
- **Consultas em Linguagem Natural**: Faça perguntas sobre seus dados (ex: "Mostre a distribuição de receita por região").
- **Visualizações Dinâmicas**: Gera e renderiza automaticamente gráficos Plotly interativos com base em seus prompts.
- **Explicabilidade**: Visualize o script Python gerado e utilizado pela IA para estruturar os dados e a configuração do Plotly.
- **Exportação**: Baixe os gráficos gerados como imagens PNG.
- **Interface em Modo Escuro (Dark Mode)**: Tema escuro profissional de alto contraste inspirado em ferramentas de desenvolvedor modernas.

## Stack de Tecnologias

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React (Ícones), React Plotly.js.
- **Backend**: Node.js, Express, TypeScript, Multer (leitura de arquivos), PapaParse (leitura de CSV).
- **IA / LLM**: Google Gemini API (SDK `@google/genai`) utilizando o modelo `gemini-2.5-flash`.
- **Ferramenta de Build**: Vite & esbuild.

## Pré-requisitos

Antes de começar, certifique-se de que atendeu aos seguintes requisitos:
- Node.js (v18 ou superior recomendado)
- npm ou yarn
- Uma chave da API do Google Gemini. Você pode obter uma no [Google AI Studio](https://aistudio.google.com/app/apikey).

## Configuração e Instalação

1. **Clone o repositório** (se aplicável) ou baixe os arquivos do projeto.

2. **Instale as Dependências**:
   Abra o terminal no diretório raiz do projeto e execute:
   ```bash
   npm install
   ```

3. **Configure as Variáveis de Ambiente**:
   Crie um arquivo `.env` no diretório raiz e adicione sua chave de API do Gemini. Você pode usar o arquivo `.env.example` fornecido como modelo.
   ```env
   # .env
   GEMINI_API_KEY="sua_chave_api_do_gemini_aqui"
   ```

## Executando a Aplicação

### Modo de Desenvolvimento

Para executar a aplicação em modo de desenvolvimento com recarga dinâmica (hot-reloading):

```bash
npm run dev
```

Isso iniciará simultaneamente o servidor backend Express e o servidor de desenvolvimento Vite em `http://localhost:3000`.

### Build de Produção

Para gerar o build da aplicação para produção:

```bash
npm run build
```

Este comando irá:
1. Compilar o frontend React em arquivos estáticos no diretório `dist/`.
2. Empacotar o servidor backend (`server.ts`) em um único arquivo executável `dist/server.cjs` usando o esbuild.

Para iniciar o servidor de produção compilado:

```bash
npm run start
```
O servidor estará disponível em `http://localhost:3000`, rodando tanto as rotas da API quanto os arquivos estáticos gerados do frontend.

## Como Funciona

1. **Upload**: Quando um usuário faz o upload de um arquivo, o backend analisa uma amostra dos dados, extrai o schema (nomes das colunas, tipos e valores de amostra) e retorna esses metadados para o frontend.
2. **Prompt (Perguntas)**: O usuário digita uma pergunta. O frontend envia a pergunta para o backend junto com o contexto da estrutura do dataset extraído.
3. **Processamento da IA**: O backend instrui explicitamente o modelo Gemini a atuar como um especialista em visualização de dados. O modelo gera:
   - Uma resposta amigável em linguagem natural.
   - (Opcional) Código Python usando Pandas e Plotly para resolver conceitualmente o problema.
   - (Opcional) A configuração exata em JSON para o Plotly (arrays `data` e `layout`) para renderizar o elemento na tela.
4. **Renderização**: O frontend recebe a resposta, exibe o texto explicativo e usa o `react-plotly.js` para renderizar visualmente a configuração do gráfico recebida em JSON.

## Solução de Problemas

- **"API key should be set when using the Gemini API"**: Certifique-se de que o arquivo `.env` está no diretório raiz, nomeado corretamente, e que a variável `GEMINI_API_KEY` está preenchida.
- **"Limite de taxa (Quota Exceeded)"**: Você excedeu os limites do plano gratuito da API do Gemini. Por favor, aguarde um minuto antes de enviar outra mensagem ou faça um upgrade no plano de faturamento do seu Google AI Studio.
