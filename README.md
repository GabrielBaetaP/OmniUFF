# Dashboard Acadêmico UFF

Backend em Python (FastAPI + SQLite) e frontend em HTML/CSS/JavaScript puro.

## Requisitos

- **Python 3.9 ou superior**
- Um navegador moderno (Chrome, Firefox, Edge...)
- Conexão com a internet (a fonte *Inter* é carregada do Google Fonts)

## Bibliotecas

### Backend (instalar com pip)

| Biblioteca | Para quê |
|---|---|
| `fastapi` | Framework da API (já instala o `pydantic`) |
| `uvicorn[standard]` | Servidor que roda a API |

O `sqlite3` já vem com o Python, não precisa instalar.

### Frontend

Nenhuma. Não há `npm install` nem build: o frontend é só abrir os arquivos HTML.

## Estrutura de pastas

```
uff-dashboard-web/
├── backend/
│   ├── api.py
│   ├── init_db.py
│   └── faculdade.db        (criado automaticamente se não existir)
└── frontend/
    ├── index.html
    ├── ranking.html
    ├── aluno.html
    ├── admin.html
    ├── common.js
    ├── script.js
    ├── ranking.js
    ├── aluno.js
    ├── admin.js
    ├── style.css
    ├── admin.css
    └── aluno.css
```

Os arquivos `api.py`, `init_db.py` e `faculdade.db` precisam ficar **na mesma pasta**.

## Como rodar (Linux/macOS, com ambiente virtual)

> Está no Windows ou não quer usar venv? Pule para [Rodando no Windows (sem venv)](#rodando-no-windows-sem-venv).

### 1. Instalar as dependências

Na raiz do projeto, crie um ambiente virtual (recomendado) e instale as bibliotecas:

```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install fastapi "uvicorn[standard]"
```

> No Ubuntu/Debian, se o comando `venv` falhar: `sudo apt install python3-venv`

### 2. Iniciar o backend

```bash
uvicorn api:app --reload
```

A API sobe em **http://127.0.0.1:8000**. O banco de dados é criado e atualizado
automaticamente ao iniciar, então não é preciso rodar mais nada antes.

Para conferir que está funcionando, abra http://127.0.0.1:8000/docs
(documentação interativa gerada pelo FastAPI).

### 3. Abrir o frontend

Com o backend rodando, abra o arquivo `frontend/index.html` no navegador
(duplo clique, ou arraste para a janela do navegador).

Se preferir servir por HTTP, em **outro terminal**:

```bash
cd frontend
python3 -m http.server 5500
```

e acesse http://localhost:5500.

## Rodando no Windows (sem venv)

As bibliotecas ficam instaladas direto no Python do sistema. Use o PowerShell ou o CMD.

### 1. Instalar as bibliotecas

```powershell
py -m pip install fastapi "uvicorn[standard]"
```

Se `py` não for reconhecido, troque por `python`. Se nenhum dos dois funcionar, o Python
não está no PATH: reinstale pelo instalador do [python.org](https://www.python.org/downloads/)
e marque a opção **Add python.exe to PATH**.

### 2. Iniciar o backend

```powershell
cd caminho\do\projeto\backend
py -m uvicorn api:app --reload
```

Use `py -m uvicorn` em vez de apenas `uvicorn`. Sem venv, o comando `uvicorn` costuma
dar *"não é reconhecido como um comando"*, porque a pasta de scripts do Python não está
no PATH. Chamar pelo módulo evita o problema.

A API sobe em **http://127.0.0.1:8000** e o banco é criado automaticamente.

### 3. Abrir o frontend

Dê duplo clique em `frontend\index.html`. Se preferir servir por HTTP, em outro terminal:

```powershell
cd caminho\do\projeto\frontend
py -m http.server 5500
```

e acesse http://localhost:5500.

## Problemas comuns

- **"Não foi possível conectar com a API"**: o backend não está rodando. Confira se
  o `uvicorn api:app --reload` está ativo e sem erros no terminal.
- **`ModuleNotFoundError: No module named 'fastapi'`**: as bibliotecas não foram instaladas
  (ou, se usa venv, ele não está ativado). Rode o `pip install` de novo; com venv, ative-o antes
  (`source venv/bin/activate`).
- **`uvicorn` não é reconhecido (Windows)**: use `py -m uvicorn api:app --reload`.
- **`Address already in use`**: já existe algo usando a porta 8000. Use outra porta
  (`uvicorn api:app --reload --port 8001`, ou `py -m uvicorn ...` no Windows) e troque o valor de `API_URL` na primeira
  linha do `frontend/common.js`.
- **Quer começar com o banco do zero**: pare a API, apague o `faculdade.db` e inicie
  de novo; ele será recriado com as matrizes de Ciência da Computação e Sistemas de
  Informação.