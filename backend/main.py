from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
import os
import json
import traceback
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

gemini_key = os.getenv("GEMINI_API_KEY")
app_url = os.getenv("APP_URL")

app = FastAPI(title="Text-2-Dash Backend")

# Allowing CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Gemini Client
# Assumes GEMINI_API_KEY is in the environment
client = genai.Client()

# Globals to act as a simple in-memory session (Not recommended for prod)
# We store dataframes mapped by a session_id or just a single global df for simplicity
current_df = None

class ChatRequest(BaseModel):
    message: str

SYSTEM_INSTRUCTION = """Você é o agente de inteligência artificial do Text-2-Dash, um especialista em análise e visualização de dados. Suas regras estritas são:
1. Restrição de Escopo: Você deve responder APENAS a comandos relacionados à análise dos dados fornecidos e geração de gráficos. Se o usuário perguntar sobre qualquer outro assunto, recuse educadamente e lembre-o de que seu propósito é exclusivamente gerar dashboards e analisar o dataset carregado.
2. Geração de Código: Para gerar gráficos, você deve escrever e retornar código Python válido utilizando Pandas e uma das seguintes bibliotecas: Plotly (recomendado para interatividade), Seaborn ou Matplotlib.
3. Bibliotecas Não Suportadas: Se o usuário pedir um gráfico ou biblioteca fora do escopo de Plotly, Seaborn ou Matplotlib, avise-o que a ferramenta não é suportada e sugira uma alternativa usando as bibliotecas disponíveis.
4. Design e Estilização: Se o usuário não fornecer instruções claras sobre o design (cores, temas, rótulos), você deve adotar de forma autônoma as melhores práticas de Data Visualization (ex: usar paletas de cores acessíveis, adicionar títulos explicativos, rotular os eixos de forma clara, inclinar textos longos no eixo X). Escolha o tipo de gráfico que melhor represente a relação dos dados pedidos.
5. Formato de Saída: Forneça o código Python limpo. Assuma que o dataframe já está carregado na variável `df`.

EXTREME IMPORTANCE: Your output must be a valid JSON with three keys: "message", "python_code", and "plotly_json" (if applicable).
For "python_code", ensure you assign the plotly figure object to a variable named 'fig'. Do NOT use fig.show().
"""

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    global current_df
    try:
        content = await file.read()
        if len(content) > 5 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="O arquivo excede o limite de 5MB.")
            
        file_ext = os.path.splitext(file.filename)[1].lower()
        if file_ext == '.csv':
            current_df = pd.read_csv(io.BytesIO(content))
        elif file_ext == '.json':
            current_df = pd.read_json(io.BytesIO(content))
        elif file_ext in ['.xls', '.xlsx']:
            current_df = pd.read_excel(io.BytesIO(content))
        else:
            raise HTTPException(status_code=400, detail="Formato não suportado. Use CSV, JSON ou XLSX.")
        
        # Limiting to 50,000 for performance
        if len(current_df) > 50000:
            current_df = current_df.head(50000)

        schema = {
            "columns": current_df.columns.tolist(),
            "sample": current_df.head(5).to_dict(orient="records"),
            "size": len(content)
        }
        
        return {"fileName": file.filename, "schema": schema}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/chat")
async def chat(request: ChatRequest):
    global current_df
    if current_df is None:
        raise HTTPException(status_code=400, detail="Nenhum dataset carregado.")
        
    try:
        columns_info = current_df.columns.tolist()
        sample_info = current_df.head(5).to_dict(orient="records")
        
        prompt = f"""
Schema do Dataset:
Colunas: {columns_info}
Amostra (5 linhas):
{sample_info}

Usuário: {request.message}
"""
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.1,
                response_mime_type="application/json"
            )
        )
        
        result_json = json.loads(response.text)
        
        python_code = result_json.get("python_code", "")
        plotly_json = {}
        
        # Execution of the code for Plotly
        if python_code:
            # We create a restricted local scope and pass ONLY 'df' and standard modules
            # WARNING: Using exec() can be dangerous in production. Use a sandbox or restrict imports.
            local_vars = {"df": current_df}
            try:
                exec(python_code, globals(), local_vars)
                # We expect the agent to assign the Plotly figure to a variable 'fig'
                if 'fig' in local_vars:
                    # Converting plotly figure to JSON
                    fig = local_vars['fig']
                    # Using to_json then parsing to dict so it can be returned via FastAPI
                    plotly_json = json.loads(fig.to_json())
                    result_json["plotly_json"] = plotly_json
            except Exception as exec_e:
                print("Error executing code:", traceback.format_exc())
                result_json["error"] = f"Erro ao executar o código gerado: {exec_e}"

        return result_json
        
    except Exception as e:
        print("Chat endpoint error:", traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))
