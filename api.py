import base64
import datetime
import math
import re
import sqlite3
import unicodedata
import uuid
from collections import deque
from contextlib import asynccontextmanager
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from init_db import DB_PATH, inicializar_banco


# ==========================================
# INICIALIZAÇÃO
# ==========================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    inicializar_banco()  # cria/migra o banco automaticamente
    yield


app = FastAPI(title="API Dashboard Acadêmico UFF", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


# Logs guardados em memória (os últimos 50; zeram ao reiniciar a API)
logs_execucao = deque(maxlen=50)


def registrar_log(acao: str):
    agora = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    logs_execucao.append({"tempo": agora, "acao": acao})


def normalizar_periodo(valor: str) -> str:
    """Aceita '2023.2' ou '23.2' e devolve sempre '2023.2'."""
    m = re.fullmatch(r"(\d{2}|\d{4})\.(\d)", (valor or "").strip())
    if not m:
        raise HTTPException(status_code=400, detail="Período letivo inválido. Use o formato 2023.2 (ou 23.2).")
    ano = m.group(1) if len(m.group(1)) == 4 else "20" + m.group(1)
    return f"{ano}.{m.group(2)}"


class FotoUpload(BaseModel):
    imagem: str = Field(max_length=3_000_000)  # data URL JPEG (o front redimensiona)


class PeriodoEspecialCreate(BaseModel):
    periodo: str


class FaltasUpdate(BaseModel):
    faltas: int = Field(ge=0, le=999)


TIPOS_EVENTO = ("Prova", "Trabalho", "Entrega", "Outro")


class EventoCreate(BaseModel):
    materia_id: Optional[str] = None
    titulo: Optional[str] = Field(default=None, max_length=120)
    tipo: Literal["Prova", "Trabalho", "Entrega", "Outro"] = "Outro"
    data: str  # AAAA-MM-DD
    hora: Optional[str] = None  # HH:MM
    obs: Optional[str] = Field(default=None, max_length=500)
    compartilhar_com: List[str] = []  # outros alunos que também têm este compromisso


class ConquistaIn(BaseModel):
    nome: str = Field(max_length=60)
    icone: str = Field(default="🏅", max_length=8)
    categoria: str = Field(default="Geral", max_length=40)
    descricao: str = Field(default="", max_length=160)
    metrica: str
    parametro: Optional[str] = Field(default=None, max_length=40)
    metas: List[float]
    ativa: bool = True


# ==========================================
# MODELOS
# ==========================================
class AlunoCreate(BaseModel):
    nome: str = Field(min_length=1)
    curso: str


class HistoricoCreate(BaseModel):
    aluno: str
    materia_id: str
    status: Literal["Concluída", "Inscrito", "Reprovado"]
    nota: Optional[float] = Field(default=None, ge=0, le=10)
    professor: Optional[str] = None
    periodo_letivo: Optional[str] = None  # ex: 2023.2


class TentativaUpdate(BaseModel):
    status: Literal["Concluída", "Inscrito", "Reprovado"]
    nota: Optional[float] = Field(default=None, ge=0, le=10)
    professor: Optional[str] = None
    periodo_letivo: Optional[str] = None


class MateriaCreate(BaseModel):
    id: str = Field(min_length=1)
    nome: str = Field(min_length=1)
    horas: int = Field(gt=0)
    periodo: Optional[int] = Field(default=None, ge=1, le=12)  # só para matérias normais
    curso: Optional[str] = None  # só para matérias normais
    optativa: bool = False
    tipo: Optional[str] = None  # só para optativas: "Tecnológica" ou "Humanística"
    cursos: list[str] = []  # cursos em que a optativa pode ser usada
    horas_extensao: int = Field(default=0, ge=0, le=999)  # parte da carga horária que conta como extensão


class MateriaUpdate(BaseModel):
    nome: str = Field(min_length=1, max_length=150)
    horas: int = Field(gt=0, le=999)
    horas_extensao: int = Field(default=0, ge=0, le=999)
    periodo: Optional[int] = Field(default=None, ge=1, le=12)  # só matérias normais
    curso: Optional[str] = None  # só matérias normais
    tipo: Optional[str] = None  # só optativas
    cursos: list[str] = []  # só optativas


class RequisitosIn(BaseModel):
    horas_complementares: int = Field(ge=0, le=9999)
    horas_extensao: int = Field(ge=0, le=9999)


class AtividadeIn(BaseModel):
    atividade: str
    quantidade: float = Field(gt=0, le=10000)
    descricao: Optional[str] = Field(default=None, max_length=200)
    data: Optional[str] = Field(default=None, max_length=20)  # AAAA-MM-DD
    comprovante_b64: Optional[str] = Field(default=None, max_length=8_000_000)
    comprovante_nome: Optional[str] = Field(default=None, max_length=150)
    remover_comprovante: bool = False


class BackupImport(BaseModel):
    dados: dict


DIAS_SEMANA = ("Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Remoto")


def _apelido(nome: str, apelido: Optional[str]) -> str:
    """Nome curto usado nas etiquetas do planejamento (padrão: primeiro nome)."""
    return (apelido or "").strip() or nome.split()[0]


def _sem_acento(texto: str) -> str:
    return unicodedata.normalize("NFD", texto).encode("ascii", "ignore").decode().lower().strip()


class TurmaIn(BaseModel):
    semestre: str
    codigo: str = Field(min_length=1, max_length=20)
    nome: Optional[str] = Field(default=None, max_length=150)
    dias: list[str] = []
    inicio: Optional[str] = None  # HH:MM
    fim: Optional[str] = None  # HH:MM
    professor: Optional[str] = Field(default=None, max_length=120)
    sala: Optional[str] = Field(default=None, max_length=40)
    ch: Optional[int] = Field(default=None, ge=0, le=999)
    periodo: Optional[int] = Field(default=None, ge=0, le=12)
    escolhas: Optional[list[str]] = None  # None = não mexer nas escolhas (na edição)
    alunos_auto: Optional[bool] = None  # True = "Alunos" calculado pelos pré-requisitos; None = não mexer
    alunos: Optional[list[str]] = None  # lista manual de alunos que podem cursar (quando alunos_auto = False)


class EscolhaIn(BaseModel):
    aluno: str
    turma_id: int
    escolhido: bool = True


class ApelidoIn(BaseModel):
    apelido: Optional[str] = Field(default=None, max_length=30)


class TurmasImport(BaseModel):
    semestre: str
    linhas: list[dict]


FORMATO_BACKUP = "uff-dashboard-backup"

TIPOS_OPTATIVA = ("Tecnológica", "Humanística")
CARD_HORAS = 60  # na grade, cada card de optativa representa até 60h do bloco


def _bloco(db, curso, tipo):
    return db.execute(
        "SELECT horas, periodo FROM optativas_blocos WHERE curso = ? AND tipo = ?", (curso, tipo)
    ).fetchone()


def _horas_no_bloco(db, aluno, tipo, ignorar=None):
    """Horas do bloco de optativas já ocupadas (Concluída ou Inscrito), sem contar a optativa `ignorar`."""
    rows = db.execute(
        "SELECT DISTINCT o.id, o.horas FROM historico h JOIN optativas o ON o.id = h.materia_id "
        "WHERE h.aluno = ? AND o.tipo = ? AND h.status IN ('Concluída', 'Inscrito')",
        (aluno, tipo),
    ).fetchall()
    return sum(r["horas"] for r in rows if r["id"] != ignorar)


# ==========================================
# ROTAS PÚBLICAS
# ==========================================
@app.get("/")
def read_root():
    return {"status": "API rodando"}


@app.get("/alunos")
def listar_alunos(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT nome, curso, apelido FROM alunos ORDER BY nome").fetchall()
    return [{"nome": r["nome"], "curso": r["curso"], "apelido": _apelido(r["nome"], r["apelido"])} for r in rows]


@app.post("/alunos")
def cadastrar_aluno(aluno: AlunoCreate, db: sqlite3.Connection = Depends(get_db)):
    nome = aluno.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Informe o nome do aluno.")
    if not db.execute("SELECT 1 FROM materias WHERE curso = ? LIMIT 1", (aluno.curso,)).fetchone():
        raise HTTPException(status_code=400, detail="Curso inexistente.")
    try:
        db.execute("INSERT INTO alunos (nome, curso) VALUES (?, ?)", (nome, aluno.curso))
        db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Este aluno já está cadastrado!")
    registrar_log(f"NOVO ALUNO: '{nome}' ({aluno.curso}).")
    return {"mensagem": f"Aluno '{nome}' matriculado em {aluno.curso} com sucesso!"}


@app.post("/historico")
def lancar_historico(lanc: HistoricoCreate, db: sqlite3.Connection = Depends(get_db)):
    """Registra uma tentativa da matéria no histórico (o histórico guarda todas as tentativas).
    Optativas são lançadas pelo código da própria optativa do catálogo."""
    aluno = db.execute("SELECT curso FROM alunos WHERE nome = ?", (lanc.aluno,)).fetchone()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")
    optativa = db.execute("SELECT id, tipo FROM optativas WHERE id = ?", (lanc.materia_id,)).fetchone()
    if not optativa and not db.execute("SELECT 1 FROM materias WHERE id = ?", (lanc.materia_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")

    periodo = normalizar_periodo(lanc.periodo_letivo) if lanc.periodo_letivo and lanc.periodo_letivo.strip() else None

    if optativa:
        if not db.execute(
            "SELECT 1 FROM optativas_cursos WHERE optativa_id = ? AND curso = ?", (optativa["id"], aluno["curso"])
        ).fetchone():
            raise HTTPException(status_code=400, detail="Esta optativa não é oferecida para o curso do aluno.")
        bloco = _bloco(db, aluno["curso"], optativa["tipo"])
        if not bloco:
            raise HTTPException(status_code=400, detail=f"O curso não tem bloco de optativas {optativa['tipo']}s.")
        if lanc.status != "Reprovado" and \
                _horas_no_bloco(db, lanc.aluno, optativa["tipo"], optativa["id"]) >= bloco["horas"]:
            raise HTTPException(status_code=400, detail=f"O bloco de optativas {optativa['tipo']}s já está completo.")

    # Salvar o "estado atual" substitui o anterior: uma inscrição pendente vira Concluída/Reprovada e
    # corrigir uma Concluída não cria outra tentativa. Reprovações são sempre acrescentadas ao histórico.
    apagar = ("Inscrito", "Concluída") if lanc.status != "Reprovado" else ("Inscrito",)
    # As faltas da matéria em curso acompanham a inscrição: salvar de novo não pode zerá-las
    anterior = db.execute(
        "SELECT faltas FROM historico WHERE aluno = ? AND materia_id = ? AND status = 'Inscrito'",
        (lanc.aluno, lanc.materia_id),
    ).fetchone()
    faltas = anterior["faltas"] if anterior else 0
    db.execute(
        f"DELETE FROM historico WHERE aluno = ? AND materia_id = ? AND status IN ({','.join('?' * len(apagar))})",
        (lanc.aluno, lanc.materia_id, *apagar),
    )
    db.execute(
        "INSERT INTO historico (aluno, materia_id, status, nota, professor, periodo_letivo, faltas) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (lanc.aluno, lanc.materia_id, lanc.status, lanc.nota, lanc.professor, periodo, faltas),
    )
    db.commit()
    return {"mensagem": "Informações salvas com sucesso!"}


@app.delete("/historico/{aluno}/{materia_id}")
def limpar_historico_materia(aluno: str, materia_id: str, db: sqlite3.Connection = Depends(get_db)):
    """Volta a matéria para 'Disponível' desfazendo inscrição/conclusão.
    As reprovações NUNCA são apagadas: continuam no histórico do aluno."""
    db.execute(
        "DELETE FROM historico WHERE aluno = ? AND materia_id = ? AND status IN ('Inscrito', 'Concluída')",
        (aluno, materia_id),
    )
    db.commit()
    return {"mensagem": "Matéria restaurada para Disponível."}


# Prioridade entre tentativas da mesma matéria (menor = melhor)
PRIORIDADE = {"Concluída": 1, "Inscrito": 2, "Reprovado": 3}


def _melhores_tentativas(tentativas):
    """Para cada matéria, escolhe a tentativa mais relevante (status, depois maior nota)."""
    melhores = {}
    for t in tentativas:
        chave = (PRIORIDADE.get(t["status"], 99), -(t["nota"] or 0.0))
        atual = melhores.get(t["materia_id"])
        if atual is None or chave < atual[0]:
            melhores[t["materia_id"]] = (chave, dict(t))
    return {m_id: dados for m_id, (_, dados) in melhores.items()}


@app.put("/tentativas/{tentativa_id}")
def editar_tentativa(tentativa_id: int, body: TentativaUpdate, db: sqlite3.Connection = Depends(get_db)):
    """Corrige uma tentativa específica do histórico (nota, professor, período letivo ou situação)."""
    t = db.execute(
        "SELECT h.aluno, h.materia_id, h.status, a.curso FROM historico h "
        "LEFT JOIN alunos a ON a.nome = h.aluno WHERE h.id = ?", (tentativa_id,)
    ).fetchone()
    if not t:
        raise HTTPException(status_code=404, detail="Tentativa não encontrada.")

    periodo = normalizar_periodo(body.periodo_letivo) if body.periodo_letivo and body.periodo_letivo.strip() else None
    professor = (body.professor or "").strip() or None

    # Só valida quando a situação muda (assim dá para corrigir a nota de uma tentativa já duplicada)
    if body.status != t["status"] and body.status != "Reprovado":
        if db.execute(
            "SELECT 1 FROM historico WHERE aluno = ? AND materia_id = ? AND id != ? "
            "AND status IN ('Concluída', 'Inscrito')", (t["aluno"], t["materia_id"], tentativa_id)
        ).fetchone():
            raise HTTPException(status_code=400,
                                detail="Esta matéria já tem outra tentativa concluída/em curso. Edite ou exclua aquela primeiro.")
        optativa = db.execute("SELECT tipo FROM optativas WHERE id = ?", (t["materia_id"],)).fetchone()
        if optativa:
            bloco = _bloco(db, t["curso"], optativa["tipo"])
            if bloco and _horas_no_bloco(db, t["aluno"], optativa["tipo"], t["materia_id"]) >= bloco["horas"]:
                raise HTTPException(status_code=400,
                                    detail=f"O bloco de optativas {optativa['tipo']}s já está completo.")

    db.execute(
        "UPDATE historico SET status = ?, nota = ?, professor = ?, periodo_letivo = ? WHERE id = ?",
        (body.status, body.nota, professor, periodo, tentativa_id),
    )
    db.commit()
    return {"mensagem": "Tentativa atualizada!"}


@app.delete("/tentativas/{tentativa_id}")
def excluir_tentativa(tentativa_id: int, db: sqlite3.Connection = Depends(get_db)):
    """Apaga uma tentativa específica (inclusive reprovações, ao contrário de DELETE /historico)."""
    cur = db.execute("DELETE FROM historico WHERE id = ?", (tentativa_id,))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tentativa não encontrada.")
    return {"mensagem": "Tentativa excluída."}


@app.get("/alunos/{nome_aluno}/progresso")
def calcular_progresso(nome_aluno: str, db: sqlite3.Connection = Depends(get_db)):
    aluno = db.execute("SELECT curso FROM alunos WHERE nome = ?", (nome_aluno,)).fetchone()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    curso = aluno["curso"]

    materias = db.execute(
        "SELECT id, nome, periodo, horas FROM materias WHERE curso = ? ORDER BY periodo, nome",
        (curso,),
    ).fetchall()
    nomes = {m["id"]: m["nome"] for m in materias}

    optativas = {r["id"]: dict(r) for r in db.execute(
        "SELECT o.id, o.nome, o.horas, o.tipo FROM optativas o JOIN optativas_cursos oc ON oc.optativa_id = o.id "
        "WHERE oc.curso = ? ORDER BY o.nome", (curso,))}
    blocos = db.execute(
        "SELECT tipo, horas, periodo FROM optativas_blocos WHERE curso = ? ORDER BY rowid", (curso,)
    ).fetchall()

    todas = db.execute(
        "SELECT materia_id, status, nota, professor, periodo_letivo FROM historico WHERE aluno = ?",
        (nome_aluno,),
    ).fetchall()
    tent_opt = [t for t in todas if t["materia_id"] in optativas]
    tentativas = [t for t in todas if t["materia_id"] not in optativas]
    historico = _melhores_tentativas(tentativas)
    # Uma optativa só pode ser usada uma vez por aluno
    usadas = {t["materia_id"] for t in tent_opt if t["status"] in ("Concluída", "Inscrito")}

    reprovacoes = {}
    for t in tentativas:
        if t["status"] == "Reprovado":
            reprovacoes[t["materia_id"]] = reprovacoes.get(t["materia_id"], 0) + 1

    prereqs_map = {}
    for r in db.execute("SELECT pre, pos FROM dependencias"):
        prereqs_map.setdefault(r["pos"], []).append(r["pre"])

    grade = []
    horas_concluidas = 0
    horas_totais = 0

    for m in materias:
        horas_totais += m["horas"]
        hist = historico.get(m["id"])
        prereqs = prereqs_map.get(m["id"], [])

        if hist and hist["status"] == "Concluída":
            status = "concluida"
            horas_concluidas += m["horas"]
        elif hist and hist["status"] == "Inscrito":
            status = "inscrito"
        elif any(p not in historico or historico[p]["status"] != "Concluída" for p in prereqs):
            status = "bloqueada"
        else:
            status = "disponivel"

        # Reprovado fica salvo no histórico, mas na tela a matéria aparece como Disponível
        exibido = hist if hist and hist["status"] != "Reprovado" else None

        grade.append({
            "id": m["id"],
            "nome": m["nome"],
            "periodo": m["periodo"],
            "horas": m["horas"],
            "status": status,
            "status_real": exibido["status"] if exibido else "Disponível",
            "nota": exibido["nota"] if exibido else None,
            "professor": exibido["professor"] if exibido else None,
            "periodo_letivo": exibido["periodo_letivo"] if exibido else None,
            "reprovacoes": reprovacoes.get(m["id"], 0),
            "pre_requisitos": [
                {"id": p, "nome": nomes.get(p, p),
                 "situacao": ("concluida" if p in historico and historico[p]["status"] == "Concluída"
                              else "inscrito" if p in historico and historico[p]["status"] == "Inscrito"
                              else "pendente")}
                for p in prereqs
            ],
            "optativa": False,
        })

    # ---- Blocos de optativas (ex: Tecnológicas 240h, Humanísticas 120h) ----
    # As horas reais de cada optativa vão preenchendo o bloco em sequência (concluídas, depois em curso);
    # o bloco é fatiado em cards de 60h só para a visualização, e o que sobra fica como "disponível".
    for b in blocos:
        tipo, total = b["tipo"], b["horas"]
        horas_totais += total
        melhores = _melhores_tentativas([t for t in tent_opt if optativas[t["materia_id"]]["tipo"] == tipo])
        segmentos = [(o_id, t) for o_id, t in melhores.items() if t["status"] != "Reprovado"]
        segmentos.sort(key=lambda x: (PRIORIDADE[x[1]["status"]], optativas[x[0]]["nome"]))
        horas_concluidas += min(
            sum(optativas[o]["horas"] for o, t in segmentos if t["status"] == "Concluída"), total
        )

        pecas, consumido = [], 0  # (optativa_id | None, tentativa | None, horas da peça)
        itens = [(o, t, optativas[o]["horas"]) for o, t in segmentos] + [(None, None, total)]
        for o_id, t, horas in itens:
            restante_item = min(horas, total - consumido)
            while restante_item > 0:
                cabe = CARD_HORAS - (consumido % CARD_HORAS)
                pedaco = min(restante_item, cabe)
                pecas.append((o_id, t, pedaco))
                consumido += pedaco
                restante_item -= pedaco
        partes_por_opt = {}
        for o_id, _, _ in pecas:
            partes_por_opt[o_id] = partes_por_opt.get(o_id, 0) + 1

        opcoes = [{"id": o["id"], "nome": o["nome"], "horas": o["horas"]}
                  for o in optativas.values() if o["tipo"] == tipo and o["id"] not in usadas]
        vistas = {}
        for o_id, t, horas in pecas:
            if o_id is None:
                grade.append({
                    "id": f"OPT-{tipo}", "nome": f"Optativa {tipo}", "periodo": b["periodo"], "horas": horas,
                    "status": "disponivel", "status_real": "Disponível", "nota": None, "professor": None,
                    "periodo_letivo": None, "reprovacoes": 0, "pre_requisitos": [],
                    "optativa": True, "optativa_id": None, "tipo": tipo, "opcoes": opcoes,
                })
                continue
            vistas[o_id] = vistas.get(o_id, 0) + 1
            sufixo = f" ({vistas[o_id]}/{partes_por_opt[o_id]})" if partes_por_opt[o_id] > 1 else ""
            grade.append({
                "id": o_id, "nome": optativas[o_id]["nome"] + sufixo, "periodo": b["periodo"], "horas": horas,
                "horas_optativa": optativas[o_id]["horas"],
                "status": "concluida" if t["status"] == "Concluída" else "inscrito",
                "status_real": t["status"], "nota": t["nota"], "professor": t["professor"],
                "periodo_letivo": t["periodo_letivo"], "reprovacoes": 0, "pre_requisitos": [],
                "optativa": True, "optativa_id": o_id, "tipo": tipo, "opcoes": [],
            })

    porcentagem = round(horas_concluidas / horas_totais * 100, 1) if horas_totais else 0
    # Horas das matérias em curso (já limitadas ao tamanho do bloco no caso das optativas)
    horas_inscritas = sum(g["horas"] for g in grade if g["status"] == "inscrito")
    porcentagem_com_inscritas = (
        round((horas_concluidas + horas_inscritas) / horas_totais * 100, 1) if horas_totais else 0
    )

    return {
        "aluno": nome_aluno,
        "curso": curso,
        "horas_concluidas": horas_concluidas,
        "horas_inscritas": horas_inscritas,
        "horas_totais": horas_totais,
        "progresso_percentual": porcentagem,
        "progresso_com_inscritas_percentual": porcentagem_com_inscritas,
        "extensao": {k: v for k, v in _resumo_extensao(db, nome_aluno, curso).items() if k != "itens"},
        "complementares": {k: v for k, v in _resumo_complementares(db, nome_aluno, curso).items()
                           if k in ("necessarias", "concluidas", "faltam")},
        "grade": grade,
    }


# ---------- Matérias em curso: faltas e datas ----------
def limite_faltas(horas: int) -> int:
    """Faltas permitidas: 25% da carga horária (o aluno reprova ao ultrapassar este número)."""
    return horas // 4


@app.get("/alunos/{nome}/inscritas")
def materias_inscritas(nome: str, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (nome,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    catalogo = {r["id"]: (r["nome"], r["horas"]) for r in db.execute(
        "SELECT id, nome, horas FROM materias UNION ALL SELECT id, nome, horas FROM optativas")}

    materias = []
    for r in db.execute(
        "SELECT id, materia_id, professor, periodo_letivo, faltas FROM historico "
        "WHERE aluno = ? AND status = 'Inscrito' ORDER BY id", (nome,)
    ):
        if r["materia_id"] not in catalogo:
            continue
        nome_mat, horas = catalogo[r["materia_id"]]
        materias.append({
            "tentativa_id": r["id"], "materia_id": r["materia_id"], "nome": nome_mat, "horas": horas,
            "professor": r["professor"], "periodo_letivo": r["periodo_letivo"],
            "faltas": r["faltas"], "limite_faltas": limite_faltas(horas),
        })
    materias.sort(key=lambda m: m["nome"])

    linhas = db.execute(
        "SELECT id, materia_id, titulo, tipo, data, hora, obs, grupo FROM eventos WHERE aluno = ? "
        "ORDER BY data, COALESCE(hora, ''), id", (nome,)).fetchall()
    grupos = {r["grupo"] for r in linhas if r["grupo"]}
    com = {}
    if grupos:
        marcas = ",".join("?" * len(grupos))
        for r in db.execute(
            f"SELECT e.grupo, e.aluno, a.apelido FROM eventos e JOIN alunos a ON a.nome = e.aluno "
            f"WHERE e.grupo IN ({marcas}) AND e.aluno != ? ORDER BY e.aluno", (*grupos, nome)
        ):
            com.setdefault(r["grupo"], []).append(_apelido(r["aluno"], r["apelido"]))
    eventos = [
        {
            "id": r["id"], "materia_id": r["materia_id"],
            "materia_nome": catalogo[r["materia_id"]][0] if r["materia_id"] in catalogo else None,
            "titulo": r["titulo"], "tipo": r["tipo"], "data": r["data"], "hora": r["hora"], "obs": r["obs"],
            "com": com.get(r["grupo"], []),
        }
        for r in linhas
    ]
    return {"materias": materias, "eventos": eventos}


@app.put("/tentativas/{tentativa_id}/faltas")
def atualizar_faltas(tentativa_id: int, body: FaltasUpdate, db: sqlite3.Connection = Depends(get_db)):
    t = db.execute("SELECT materia_id, status FROM historico WHERE id = ?", (tentativa_id,)).fetchone()
    if not t:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    if t["status"] != "Inscrito":
        raise HTTPException(status_code=400, detail="Só é possível lançar faltas em matérias em curso.")
    db.execute("UPDATE historico SET faltas = ? WHERE id = ?", (body.faltas, tentativa_id))
    db.commit()
    return {"faltas": body.faltas}


@app.post("/alunos/{nome}/eventos")
def criar_evento(nome: str, ev: EventoCreate, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (nome,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    try:
        data = datetime.date.fromisoformat(ev.data)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida.")
    hora = (ev.hora or "").strip() or None
    if hora and not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", hora):
        raise HTTPException(status_code=400, detail="Horário inválido. Use o formato HH:MM.")
    materia_id = (ev.materia_id or "").strip() or None
    if materia_id and not db.execute(
        "SELECT 1 FROM materias WHERE id = ? UNION SELECT 1 FROM optativas WHERE id = ?", (materia_id, materia_id)
    ).fetchone():
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    titulo = (ev.titulo or "").strip() or ev.tipo
    obs = (ev.obs or "").strip() or None

    # Compartilhar: cada pessoa recebe a sua cópia, ligadas pelo mesmo "grupo"
    outros = []
    for outro in dict.fromkeys(ev.compartilhar_com):
        if outro == nome:
            continue
        if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (outro,)).fetchone():
            raise HTTPException(status_code=404, detail=f"Aluno não encontrado: {outro}")
        outros.append(outro)
    grupo = uuid.uuid4().hex if outros else None

    cur = None
    for pessoa in [nome, *outros]:
        c = db.execute(
            "INSERT INTO eventos (aluno, materia_id, titulo, tipo, data, hora, obs, grupo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (pessoa, materia_id, titulo, ev.tipo, data.isoformat(), hora, obs, grupo),
        )
        cur = cur or c
    db.commit()
    extra = f" (compartilhada com {len(outros)} pessoa(s))" if outros else ""
    return {"mensagem": f"Data adicionada!{extra}", "id": cur.lastrowid}


@app.delete("/eventos/{evento_id}")
def excluir_evento(evento_id: int, todos: bool = False, db: sqlite3.Connection = Depends(get_db)):
    """Remove a data. Com todos=true, remove também as cópias das outras pessoas do mesmo grupo."""
    ev = db.execute("SELECT grupo FROM eventos WHERE id = ?", (evento_id,)).fetchone()
    if not ev:
        raise HTTPException(status_code=404, detail="Data não encontrada.")
    if todos and ev["grupo"]:
        db.execute("DELETE FROM eventos WHERE grupo = ?", (ev["grupo"],))
    else:
        db.execute("DELETE FROM eventos WHERE id = ?", (evento_id,))
    db.commit()
    return {"mensagem": "Data removida para todos." if todos and ev["grupo"] else "Data removida."}


@app.get("/alunos/{nome}/colegas")
def colegas(nome: str, db: sqlite3.Connection = Depends(get_db)):
    """Outros alunos (para compartilhar datas) e quem está inscrito nas mesmas matérias."""
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (nome,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    alunos = [{"nome": r["nome"], "apelido": _apelido(r["nome"], r["apelido"]), "curso": r["curso"]}
              for r in db.execute("SELECT nome, apelido, curso FROM alunos WHERE nome != ? ORDER BY nome", (nome,))]
    minhas = {r["materia_id"] for r in db.execute(
        "SELECT materia_id FROM historico WHERE aluno = ? AND status = 'Inscrito'", (nome,))}
    por_materia = {}
    for r in db.execute("SELECT aluno, materia_id FROM historico WHERE status = 'Inscrito' AND aluno != ?", (nome,)):
        if r["materia_id"] in minhas:
            por_materia.setdefault(r["materia_id"], []).append(r["aluno"])
    return {"alunos": alunos, "por_materia": por_materia}


# ---------- Foto do aluno ----------
@app.put("/alunos/{nome}/foto")
def salvar_foto(nome: str, body: FotoUpload, db: sqlite3.Connection = Depends(get_db)):
    prefixo = "data:image/jpeg;base64,"
    if not body.imagem.startswith(prefixo):
        raise HTTPException(status_code=400, detail="Envie a imagem em JPEG.")
    try:
        dados = base64.b64decode(body.imagem[len(prefixo):], validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Imagem inválida.")
    if not dados.startswith(b"\xff\xd8"):
        raise HTTPException(status_code=400, detail="Imagem inválida.")
    cur = db.execute("UPDATE alunos SET foto = ? WHERE nome = ?", (dados, nome))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    return {"mensagem": "Foto atualizada!"}


@app.get("/alunos/{nome}/foto")
def obter_foto(nome: str, db: sqlite3.Connection = Depends(get_db)):
    row = db.execute("SELECT foto FROM alunos WHERE nome = ?", (nome,)).fetchone()
    if not row or not row["foto"]:
        raise HTTPException(status_code=404, detail="Sem foto")
    return Response(content=bytes(row["foto"]), media_type="image/jpeg", headers={"Cache-Control": "no-cache"})


# ---------- Perfil do aluno ----------
def entra_no_cr(t, especiais) -> bool:
    """Tentativa elegível ao CR: aprovações (inclusive em período especial) e reprovações fora de período especial."""
    if t["status"] not in ("Concluída", "Reprovado"):
        return False
    if t["status"] == "Reprovado" and t["periodo_letivo"] in especiais:
        return False
    return True


def conta_no_cr(t, especiais) -> bool:
    """Elegível E com nota (sem nota não dá para multiplicar pelas horas)."""
    return entra_no_cr(t, especiais) and t["nota"] is not None


def calcular_cr(itens):
    """CR = soma(nota x carga horária) / soma(carga horária), sobre todas as tentativas elegíveis.
    itens = [(nota, carga_horaria)]."""
    total_horas = sum(h for _, h in itens)
    if not total_horas:
        return None
    return round(sum(n * h for n, h in itens) / total_horas, 2)


def media_ponderada(par):
    """par = [soma(nota x horas), soma(horas)] -> média ponderada pela carga horária (ou None)."""
    return round(par[0] / par[1], 2) if par and par[1] else None


@app.get("/alunos/{nome}/perfil")
def perfil_aluno(nome: str, db: sqlite3.Connection = Depends(get_db)):
    aluno = db.execute("SELECT curso, (foto IS NOT NULL) AS tem_foto FROM alunos WHERE nome = ?", (nome,)).fetchone()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    materias = [dict(r, tipo=None) for r in db.execute(
        "SELECT id, nome, periodo, horas FROM materias WHERE curso = ? ORDER BY periodo, nome", (aluno["curso"],)
    )]
    blocos = [dict(r) for r in db.execute(
        "SELECT tipo, horas, periodo FROM optativas_blocos WHERE curso = ? ORDER BY rowid", (aluno["curso"],)
    )]
    periodo_bloco = {b["tipo"]: b["periodo"] for b in blocos}
    optativas = [dict(r, periodo=periodo_bloco[r["tipo"]]) for r in db.execute(
        "SELECT o.id, o.nome, o.horas, o.tipo FROM optativas o JOIN optativas_cursos oc ON oc.optativa_id = o.id "
        "WHERE oc.curso = ? ORDER BY o.nome", (aluno["curso"],)
    ) if r["tipo"] in periodo_bloco]
    unidades = materias + optativas
    por_id = {u["id"]: u for u in unidades}

    especiais = {r["periodo"] for r in db.execute("SELECT periodo FROM periodos_especiais")}
    tentativas = db.execute(
        "SELECT id, materia_id, status, nota, professor, periodo_letivo FROM historico WHERE aluno = ? ORDER BY id",
        (nome,)
    ).fetchall()

    tent_por_materia = {}
    por_letivo = {}  # período letivo -> contagem de tentativas por resultado
    itens_cr = []
    notas_letivo = {}  # período letivo -> [soma(nota x horas), soma(horas)] das tentativas que contam no CR
    notas_curso = {}  # período do curso -> idem, das matérias concluídas
    sem_nota = 0
    reprov_especiais = 0
    for t in tentativas:
        m = por_id.get(t["materia_id"])
        if not m:
            continue
        especial = t["periodo_letivo"] in especiais
        conta = conta_no_cr(t, especiais)
        if conta:
            itens_cr.append((t["nota"], m["horas"]))
            acc = notas_letivo.setdefault(t["periodo_letivo"], [0.0, 0])
            acc[0] += t["nota"] * m["horas"]
            acc[1] += m["horas"]
        elif entra_no_cr(t, especiais):
            sem_nota += 1
        if t["status"] == "Reprovado" and especial:
            reprov_especiais += 1
        grupo = por_letivo.setdefault(t["periodo_letivo"], {"aprovadas": 0, "reprovadas": 0, "inscritas": 0})
        grupo[{"Concluída": "aprovadas", "Reprovado": "reprovadas", "Inscrito": "inscritas"}[t["status"]]] += 1
        tent_por_materia.setdefault(m["id"], []).append({
            "id": t["id"], "status": t["status"], "nota": t["nota"], "professor": t["professor"],
            "periodo_letivo": t["periodo_letivo"], "especial": especial, "conta_cr": conta,
        })

    cursadas = []
    por_periodo = {}
    horas_concluidas = horas_totais = aprovadas = inscritas = reprovacoes = 0

    def periodo_info(periodo):
        return por_periodo.setdefault(periodo, {"periodo": periodo, "total": 0, "concluidas": 0, "inscritas": 0})

    for m in materias:
        horas_totais += m["horas"]
        periodo_info(m["periodo"])["total"] += 1
    for b in blocos:  # cada bloco de optativas vira vários cards de 60h no gráfico
        horas_totais += b["horas"]
        periodo_info(b["periodo"])["total"] += math.ceil(b["horas"] / CARD_HORAS)

    conc_tipo = {b["tipo"]: 0 for b in blocos}
    insc_tipo = {b["tipo"]: 0 for b in blocos}
    for m in unidades:
        tents = tent_por_materia.get(m["id"])
        if not tents:
            continue

        status_lista = [t["status"] for t in tents]
        n_reprov = status_lista.count("Reprovado")
        reprovacoes += n_reprov
        if "Concluída" in status_lista:
            situacao = "Concluída"
            aprovadas += 1
            if m["tipo"]:
                conc_tipo[m["tipo"]] += m["horas"]
            else:
                horas_concluidas += m["horas"]
                periodo_info(m["periodo"])["concluidas"] += 1
        elif "Inscrito" in status_lista:
            situacao = "Inscrito"
            inscritas += 1
            if m["tipo"]:
                insc_tipo[m["tipo"]] += m["horas"]
            else:
                periodo_info(m["periodo"])["inscritas"] += 1
        else:
            situacao = "Reprovado"

        nota_final = next((t["nota"] for t in reversed(tents) if t["status"] == "Concluída"), None)
        if situacao == "Concluída" and nota_final is not None:
            acc = notas_curso.setdefault(m["periodo"], [0.0, 0])
            acc[0] += nota_final * m["horas"]
            acc[1] += m["horas"]

        cursadas.append({
            "id": m["id"], "nome": m["nome"], "periodo": m["periodo"], "horas": m["horas"],
            "situacao": situacao, "reprovacoes": n_reprov,
            "nota_final": nota_final,
            "tentativas": tents,
        })

    for b in blocos:
        c = min(conc_tipo[b["tipo"]], b["horas"])
        horas_concluidas += c
        p = periodo_info(b["periodo"])
        cards_total = math.ceil(b["horas"] / CARD_HORAS)
        cards_conc = c // CARD_HORAS
        p["concluidas"] += cards_conc
        if insc_tipo[b["tipo"]]:
            ate = math.ceil(min(c + insc_tipo[b["tipo"]], b["horas"]) / CARD_HORAS)
            p["inscritas"] += max(0, min(cards_total - cards_conc, ate - cards_conc))

    for p in por_periodo.values():
        p["media"] = media_ponderada(notas_curso.get(p["periodo"]))

    # CR acumulado ao fim de cada período letivo (mesma conta do CR: Σ(nota × horas) ÷ Σ(horas))
    letivos = []
    acum = [0.0, 0]
    for k, v in sorted(por_letivo.items(), key=lambda kv: (kv[0] is None, kv[0] or "")):
        par = notas_letivo.get(k)
        if k is not None and par:
            acum[0] += par[0]
            acum[1] += par[1]
        encerrado = v["aprovadas"] + v["reprovadas"] > 0  # período só com matérias em curso não tem CR ainda
        letivos.append({
            "periodo_letivo": k, "especial": k in especiais, "media": media_ponderada(par),
            "cr_acumulado": round(acum[0] / acum[1], 2) if k is not None and encerrado and acum[1] else None,
            **v,
        })

    return {
        "aluno": nome,
        "curso": aluno["curso"],
        "tem_foto": bool(aluno["tem_foto"]),
        "cr": {
            "valor": calcular_cr(itens_cr),
            "disciplinas": len(itens_cr),
            "soma_horas": sum(h for _, h in itens_cr),
            "soma_nota_horas": round(sum(n * h for n, h in itens_cr), 2),
            "sem_nota": sem_nota,
            "descricao": "Σ(nota × horas) ÷ Σ(horas); reprovações em período especial ficam de fora",
        },
        "horas_concluidas": horas_concluidas,
        "horas_totais": horas_totais,
        "progresso_percentual": round(horas_concluidas / horas_totais * 100, 1) if horas_totais else 0,
        "aprovadas": aprovadas,
        "inscritas": inscritas,
        "reprovacoes": reprovacoes,
        "reprovacoes_especiais": reprov_especiais,
        "por_periodo": sorted(por_periodo.values(), key=lambda p: p["periodo"]),
        # Tentativas agrupadas por período letivo (ex: 2024.1); as sem período vão para o fim
        "por_periodo_letivo": letivos,
        "materias": cursadas,
    }


@app.get("/exportar/backup")
def exportar_backup(aluno: Optional[str] = None, foto: bool = False, db: sqlite3.Connection = Depends(get_db)):
    """Backup para levar a outro computador: matérias, optativas e o histórico de um aluno (ou de todos).
    O front salva este JSON num arquivo .txt; a importação está em POST /admin/importar."""
    rows = db.execute(
        "SELECT nome, curso, apelido, foto FROM alunos" + (" WHERE nome = ?" if aluno else "") + " ORDER BY nome",
        (aluno,) if aluno else (),
    ).fetchall()
    if aluno and not rows:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")

    alunos = []
    for r in rows:
        item = {
            "nome": r["nome"],
            "curso": r["curso"],
            "apelido": r["apelido"],
            "historico": [dict(h) for h in db.execute(
                "SELECT materia_id, status, nota, professor, periodo_letivo, faltas FROM historico "
                "WHERE aluno = ? ORDER BY id",
                (r["nome"],))],
            "eventos": [dict(e) for e in db.execute(
                "SELECT materia_id, titulo, tipo, data, hora, obs, grupo FROM eventos WHERE aluno = ? ORDER BY id",
                (r["nome"],))],
        }
        item["complementares"] = []
        for c in db.execute(
            "SELECT atividade, descricao, quantidade, data, comprovante_nome, comprovante "
            "FROM atividades_complementares WHERE aluno = ? ORDER BY id", (r["nome"],)
        ):
            ac = {k: c[k] for k in ("atividade", "descricao", "quantidade", "data", "comprovante_nome")}
            if foto and c["comprovante"]:  # "incluir fotos" também leva os comprovantes em PDF
                ac["comprovante"] = base64.b64encode(bytes(c["comprovante"])).decode()
            item["complementares"].append(ac)
        if foto and r["foto"]:
            item["foto"] = base64.b64encode(bytes(r["foto"])).decode()
        alunos.append(item)

    tabela = lambda sql: [dict(x) for x in db.execute(sql)]
    return {
        "formato": FORMATO_BACKUP,
        "versao": 1,
        "exportado_em": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "materias": tabela("SELECT id, nome, periodo, horas, curso, horas_extensao FROM materias"),
        "dependencias": tabela("SELECT pre, pos FROM dependencias"),
        "optativas": tabela("SELECT id, nome, horas, tipo, horas_extensao FROM optativas"),
        "requisitos_curso": tabela("SELECT curso, horas_complementares, horas_extensao FROM requisitos_curso"),
        "conquistas_config": tabela("SELECT id, nome, icone, categoria, descricao, metrica, parametro, metas, ativa, padrao, ordem FROM conquistas_config"),
        "optativas_cursos": tabela("SELECT optativa_id, curso FROM optativas_cursos"),
        "optativas_blocos": tabela("SELECT curso, tipo, horas, periodo FROM optativas_blocos"),
        "periodos_especiais": [x["periodo"] for x in db.execute("SELECT periodo FROM periodos_especiais")],
        "turmas": [] if aluno else [
            {**dict(t),
             "escolhas": [e["aluno"] for e in db.execute(
                 "SELECT aluno FROM turma_escolhas WHERE turma_id = ? ORDER BY aluno", (t["id"],))],
             "alunos_manual": [e["aluno"] for e in db.execute(
                 "SELECT aluno FROM turma_alunos WHERE turma_id = ? ORDER BY aluno", (t["id"],))]}
            for t in db.execute(
                "SELECT id, semestre, codigo, nome, dias, inicio, fim, professor, sala, ch, periodo, alunos_auto "
                "FROM turmas ORDER BY id")
        ],
        "alunos": alunos,
    }


@app.get("/alunos/{nome}/materias-exportacao")
def materias_para_exportar(nome: str, db: sqlite3.Connection = Depends(get_db)):
    """Uma linha por matéria/optativa do curso do aluno, com a situação dele (base do .txt de matérias)."""
    aluno = db.execute("SELECT curso FROM alunos WHERE nome = ?", (nome,)).fetchone()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    curso = aluno["curso"]

    materias = [dict(r, tipo="Obrigatória") for r in db.execute(
        "SELECT id, nome, periodo, horas FROM materias WHERE curso = ? ORDER BY periodo, nome", (curso,))]
    periodo_bloco = {r["tipo"]: r["periodo"] for r in db.execute(
        "SELECT tipo, periodo FROM optativas_blocos WHERE curso = ?", (curso,))}
    optativas = [dict(r, periodo=periodo_bloco[r["tipo"]], tipo=f"Optativa {r['tipo']}") for r in db.execute(
        "SELECT o.id, o.nome, o.horas, o.tipo FROM optativas o JOIN optativas_cursos oc ON oc.optativa_id = o.id "
        "WHERE oc.curso = ? ORDER BY o.nome", (curso,)) if r["tipo"] in periodo_bloco]

    nomes = {m["id"]: m["nome"] for m in materias}
    prereqs = {}
    for r in db.execute("SELECT pre, pos FROM dependencias"):
        prereqs.setdefault(r["pos"], []).append(nomes.get(r["pre"], r["pre"]))

    tentativas = db.execute(
        "SELECT materia_id, status, nota, professor, periodo_letivo FROM historico WHERE aluno = ? ORDER BY id", (nome,)
    ).fetchall()
    melhores = _melhores_tentativas(tentativas)
    reprov = {}
    for t in tentativas:
        if t["status"] == "Reprovado":
            reprov[t["materia_id"]] = reprov.get(t["materia_id"], 0) + 1

    saida = []
    for m in materias + optativas:
        t = melhores.get(m["id"])
        saida.append({
            "id": m["id"], "nome": m["nome"], "periodo": m["periodo"], "horas": m["horas"], "tipo": m["tipo"],
            "situacao": t["status"] if t else "Não cursada",
            "nota": t["nota"] if t else None,
            "professor": t["professor"] if t else None,
            "periodo_letivo": t["periodo_letivo"] if t else None,
            "reprovacoes": reprov.get(m["id"], 0),
            "pre_requisitos": prereqs.get(m["id"], []),
        })
    return saida


# ==========================================
# CONQUISTAS, SIMULADOR DE CR E PREVISÃO DE FORMATURA (perfil do aluno)
# ==========================================
NIVEIS_CONQUISTA = ("Bronze", "Prata", "Ouro", "Diamante")
PONTOS_NIVEL = (1, 2, 3, 5)

# Métricas que uma conquista pode usar (o valor é calculado sozinho a partir do histórico do aluno).
# "parametro" = campo extra que o Admin preenche (ex: a nota mínima ou o código da matéria).
METRICAS_CONQUISTA = {
    "progresso_pct": {"rotulo": "Porcentagem do curso concluída", "unidade": "%"},
    "horas_concluidas": {"rotulo": "Horas concluídas", "unidade": "h"},
    "aprovadas": {"rotulo": "Matérias aprovadas", "unidade": ""},
    "semestres": {"rotulo": "Semestres com aprovação", "unidade": ""},
    "sequencia_sem_reprovacao": {"rotulo": "Sequência de semestres sem reprovação", "unidade": ""},
    "max_aprovadas_semestre": {"rotulo": "Aprovações em um único semestre (recorde)", "unidade": ""},
    "aprovadas_apos_reprovacao": {"rotulo": "Matérias aprovadas depois de reprovar", "unidade": ""},
    "notas_minimas": {"rotulo": "Matérias com nota mínima", "unidade": "",
                      "parametro": {"rotulo": "Nota mínima", "tipo": "numero", "padrao": "9"}},
    "melhor_media_semestre": {"rotulo": "Melhor média de um semestre", "unidade": ""},
    "aproveitamento_pct": {"rotulo": "Aproveitamento (aprovações ÷ tentativas)", "unidade": "%"},
    "ritmo_horas": {"rotulo": "Ritmo (horas por semestre)", "unidade": "h"},
    "horas_extras": {"rotulo": "Horas de extensão + complementares", "unidade": "h"},
    "extensao_pct": {"rotulo": "Meta de extensão cumprida", "unidade": "%"},
    "complementares_pct": {"rotulo": "Meta de complementares cumprida", "unidade": "%"},
    "materia_concluida": {"rotulo": "Concluir uma matéria específica", "unidade": "",
                          "parametro": {"rotulo": "Código da matéria", "tipo": "texto", "padrao": ""}},
}


def _pct_meta(feito, meta):
    return min(100.0, feito / meta * 100) if meta else None


def _metas_lista(texto):
    return [float(x) for x in str(texto).split(",") if x.strip()]


def _contexto_conquistas(db, nome, perfil):
    """Valores de todas as métricas para um aluno (uma conta só, reaproveitada por todas as conquistas)."""
    curso = perfil["curso"]
    extensao = _resumo_extensao(db, nome, curso)
    complementares = _resumo_complementares(db, nome, curso)

    letivos = [x for x in perfil["por_periodo_letivo"] if x["periodo_letivo"] and x["aprovadas"] > 0]
    letivos.sort(key=lambda x: x["periodo_letivo"])
    sequencia = melhor_sequencia = 0
    for x in letivos:
        reprovou = x["reprovadas"] > 0 and not x["especial"]  # reprovação em período especial não quebra a sequência
        sequencia = 0 if reprovou else sequencia + 1
        melhor_sequencia = max(melhor_sequencia, sequencia)
    medias = [x["media"] for x in letivos if x["media"] is not None]

    concluidas = [m for m in perfil["materias"] if m["situacao"] == "Concluída"]
    reprov_validas = perfil["reprovacoes"] - perfil["reprovacoes_especiais"]
    tentativas = perfil["aprovadas"] + reprov_validas
    return {
        "concluidas": concluidas,
        "valores": {
            "progresso_pct": perfil["progresso_percentual"],
            "horas_concluidas": perfil["horas_concluidas"],
            "aprovadas": perfil["aprovadas"],
            "semestres": len(letivos),
            "sequencia_sem_reprovacao": melhor_sequencia,
            "max_aprovadas_semestre": max((x["aprovadas"] for x in letivos), default=0),
            "aprovadas_apos_reprovacao": sum(1 for m in concluidas if m["reprovacoes"] > 0),
            "melhor_media_semestre": max(medias, default=0),
            "aproveitamento_pct": round(perfil["aprovadas"] / tentativas * 100, 1) if tentativas else 0,
            "ritmo_horas": round(perfil["horas_concluidas"] / len(letivos), 1) if letivos else 0,
            "horas_extras": extensao["concluidas"] + complementares["concluidas"],
            "extensao_pct": _pct_meta(extensao["concluidas"], extensao["necessarias"]),
            "complementares_pct": _pct_meta(complementares["concluidas"], complementares["necessarias"]),
        },
    }


def _valor_metrica(ctx, metrica, parametro):
    if metrica == "notas_minimas":
        try:
            minima = float(str(parametro or "9").replace(",", "."))
        except ValueError:
            minima = 9.0
        return sum(1 for m in ctx["concluidas"] if m["nota_final"] is not None and m["nota_final"] >= minima)
    if metrica == "materia_concluida":
        codigo = (parametro or "").strip().upper()
        return 1 if codigo and any(m["id"].upper() == codigo for m in ctx["concluidas"]) else 0
    return ctx["valores"].get(metrica, 0)


def calcular_conquistas(db, nome, perfil=None):
    """Conquistas do aluno: as regras vêm do Admin (tabela conquistas_config) e são avaliadas na hora."""
    perfil = perfil or perfil_aluno(nome, db)
    ctx = _contexto_conquistas(db, nome, perfil)

    itens, pontos, desbloqueadas, maximo, niveis_totais = [], 0, 0, 0, 0
    for c in db.execute("SELECT * FROM conquistas_config WHERE ativa = 1 ORDER BY ordem, rowid"):
        if c["metrica"] not in METRICAS_CONQUISTA:
            continue
        metas = _metas_lista(c["metas"])
        if not metas:
            continue
        # Uma meta só = conquista "de uma vez" (sem Bronze/Prata/...); com 2 a 4 metas usa os níveis em ordem
        nomes_nivel = ("Conquistada",) if len(metas) == 1 else NIVEIS_CONQUISTA[:len(metas)]
        pontos_nivel = (2,) if len(metas) == 1 else PONTOS_NIVEL[:len(metas)]

        bruto = _valor_metrica(ctx, c["metrica"], c["parametro"])
        disponivel = bruto is not None  # extensão/AC sem meta definida no Admin ficam indisponíveis
        valor = round(bruto or 0, 2)
        nivel = sum(1 for meta in metas if disponivel and valor >= meta)
        proxima = metas[nivel] if nivel < len(metas) else None
        base = metas[nivel - 1] if nivel > 0 else 0

        pontos += sum(pontos_nivel[:nivel])
        desbloqueadas += nivel
        maximo += sum(pontos_nivel)
        niveis_totais += len(metas)
        itens.append({
            "id": c["id"], "nome": c["nome"], "icone": c["icone"], "categoria": c["categoria"],
            "descricao": c["descricao"], "unidade": METRICAS_CONQUISTA[c["metrica"]]["unidade"],
            "metas": metas, "niveis_nomes": list(nomes_nivel), "pontos_niveis": list(pontos_nivel),
            "valor": valor, "disponivel": disponivel, "nivel": nivel,
            "nivel_nome": nomes_nivel[nivel - 1] if nivel else None,
            "proxima_meta": proxima,
            "progresso": round(min(100, max(0, (valor - base) / (proxima - base) * 100)), 1) if proxima else 100,
        })
    return {
        "pontos": pontos, "pontos_maximos": maximo,
        "niveis_desbloqueados": desbloqueadas, "niveis_totais": niveis_totais,
        "conquistas": itens,
    }


@app.get("/alunos/{nome}/conquistas")
def obter_conquistas(nome: str, db: sqlite3.Connection = Depends(get_db)):
    return calcular_conquistas(db, nome)


@app.get("/alunos/{nome}/simulador")
def simulador_cr(nome: str, db: sqlite3.Connection = Depends(get_db)):
    """Dados para o simulador de CR: somas atuais do CR e as matérias em curso."""
    p = perfil_aluno(nome, db)
    return {
        "cr_atual": p["cr"]["valor"],
        "soma_horas": p["cr"]["soma_horas"],
        "soma_nota_horas": p["cr"]["soma_nota_horas"],
        "materias": [{"id": m["id"], "nome": m["nome"], "horas": m["horas"]}
                     for m in p["materias"] if m["situacao"] == "Inscrito"],
    }


SEMESTRE_VALIDO = re.compile(r"^\d{4}\.[12]$")


def _indice_semestre(semestre: str) -> int:
    ano, parte = semestre.split(".")
    return int(ano) * 2 + int(parte) - 1


def _nome_semestre(indice: int) -> str:
    return f"{indice // 2}.{indice % 2 + 1}"


def calcular_previsao(db, nome, perfil=None, progresso=None):
    """Estima o semestre de formatura pelo ritmo (média de horas concluídas por semestre nos últimos 4)."""
    perfil = perfil or perfil_aluno(nome, db)
    progresso = progresso or calcular_progresso(nome, db)

    horas_semestre, em_curso = {}, set()
    for m in perfil["materias"]:
        for t in m["tentativas"]:
            sem = t["periodo_letivo"]
            if not sem or not SEMESTRE_VALIDO.match(sem):
                continue
            if t["status"] == "Concluída":
                horas_semestre[sem] = horas_semestre.get(sem, 0) + m["horas"]
            elif t["status"] == "Inscrito":
                em_curso.add(sem)

    atual = max(em_curso, key=_indice_semestre) if em_curso else None
    encerrados = sorted((s for s in horas_semestre if s != atual), key=_indice_semestre)
    recentes = encerrados[-4:]
    ritmo = round(sum(horas_semestre[s] for s in recentes) / len(recentes)) if recentes else None

    restantes = max(0, progresso["horas_totais"] - progresso["horas_concluidas"])
    # Com semestre em andamento, as horas inscritas contam como feitas; a previsão parte dele
    base = atual or (encerrados[-1] if encerrados else None)
    a_cursar = max(0, restantes - progresso["horas_inscritas"]) if atual else restantes

    semestre_formatura = semestres_restantes = None
    if base and (ritmo or a_cursar == 0):
        semestres_restantes = -(-a_cursar // ritmo) if a_cursar else 0
        semestre_formatura = _nome_semestre(_indice_semestre(base) + semestres_restantes)

    historico = [{"semestre": s, "horas": horas_semestre[s], "em_curso": False}
                 for s in sorted(horas_semestre, key=_indice_semestre) if s != atual]
    if atual:
        historico.append({"semestre": atual, "horas": progresso["horas_inscritas"], "em_curso": True})
    return {
        "disponivel": base is not None, "ritmo": ritmo, "semestre_base": base,
        "horas_totais": progresso["horas_totais"], "horas_concluidas": progresso["horas_concluidas"],
        "horas_inscritas": progresso["horas_inscritas"], "horas_restantes": restantes, "a_cursar": a_cursar,
        "semestres_restantes": semestres_restantes, "semestre_formatura": semestre_formatura,
        "complementares_faltam": progresso["complementares"]["faltam"],
        "historico": historico,
    }


@app.get("/alunos/{nome}/previsao")
def obter_previsao(nome: str, db: sqlite3.Connection = Depends(get_db)):
    return calcular_previsao(db, nome)


@app.get("/alunos/{nome}/planejador")
def dados_planejador(nome: str, db: sqlite3.Connection = Depends(get_db)):
    """Matérias que ainda faltam (com pré-requisitos) para o aluno montar um plano de semestres.
    O plano em si não é salvo no banco: vive só na tela."""
    progresso = calcular_progresso(nome, db)
    previsao = calcular_previsao(db, nome, None, progresso)

    itens, vistos = [], {}
    for g in progresso["grade"]:
        if g["status"] not in ("disponivel", "bloqueada"):
            continue
        vistos[g["id"]] = vistos.get(g["id"], 0) + 1
        # As fatias livres de um bloco de optativas compartilham o mesmo código: numeramos para diferenciar
        chave = g["id"] if not g["optativa"] else f"{g['id']}#{vistos[g['id']]}"
        itens.append({
            "id": chave, "nome": g["nome"], "periodo": g["periodo"], "horas": g["horas"],
            "optativa": g["optativa"],
            # Só importa o que ainda não foi concluído; "inscrito" já termina antes dos semestres futuros
            "pre": [p["id"] for p in g["pre_requisitos"] if p["situacao"] == "pendente"],
            "pre_nomes": {p["id"]: p["nome"] for p in g["pre_requisitos"]},
        })
    return {
        "disponivel": previsao["semestre_base"] is not None,
        "semestre_base": previsao["semestre_base"], "ritmo": previsao["ritmo"],
        "semestre_formatura_estimado": previsao["semestre_formatura"],
        "horas_inscritas": progresso["horas_inscritas"],
        "itens": itens,
    }


@app.get("/ranking")
def obter_ranking(db: sqlite3.Connection = Depends(get_db)):
    """Números de cada aluno para os rankings (o front escolhe o critério: horas, progresso, aprovações,
    aproveitamento, ritmo ou horas extras). Nenhum deles usa o CR."""
    alunos = db.execute("SELECT nome, curso, (foto IS NOT NULL) AS tem_foto FROM alunos").fetchall()
    ranking = []
    for a in alunos:
        p = perfil_aluno(a["nome"], db)
        semestres = {x["periodo_letivo"] for x in p["por_periodo_letivo"] if x["periodo_letivo"] and x["aprovadas"] > 0}
        reprovacoes = p["reprovacoes"] - p["reprovacoes_especiais"]  # reprovação em período especial não pesa
        tentativas = p["aprovadas"] + reprovacoes
        extensao = _resumo_extensao(db, a["nome"], a["curso"])["concluidas"]
        complementares = _resumo_complementares(db, a["nome"], a["curso"])["concluidas"]
        conquistas = calcular_conquistas(db, a["nome"], p)
        ranking.append({
            "aluno": a["nome"], "curso": a["curso"], "tem_foto": a["tem_foto"],
            "horas_concluidas": p["horas_concluidas"], "horas_totais": p["horas_totais"],
            "progresso": p["progresso_percentual"],
            "aprovadas": p["aprovadas"], "reprovacoes": reprovacoes,
            "aproveitamento": round(p["aprovadas"] / tentativas * 100, 1) if tentativas else None,
            "semestres": len(semestres),
            "ritmo": round(p["horas_concluidas"] / len(semestres), 1) if semestres else None,
            "extensao": extensao, "complementares": complementares,
            "horas_extra": round(extensao + complementares, 1),
            "pontos_conquistas": conquistas["pontos"], "pontos_maximos": conquistas["pontos_maximos"],
            "conquistas_desbloqueadas": conquistas["niveis_desbloqueados"],
        })
    ranking.sort(key=lambda r: (-r["horas_concluidas"], r["aluno"]))
    return ranking


@app.get("/visao-geral")
def visao_geral(db: sqlite3.Connection = Depends(get_db)):
    """Resumo da turma para a tela inicial do dashboard: alunos, próximas datas e faltas em atenção."""
    alunos = db.execute("SELECT nome, curso, apelido, (foto IS NOT NULL) AS tem_foto FROM alunos ORDER BY nome").fetchall()
    nomes = {a["nome"]: _apelido(a["nome"], a["apelido"]) for a in alunos}
    catalogo = {r["id"]: (r["nome"], r["horas"]) for r in db.execute(
        "SELECT id, nome, horas FROM materias UNION ALL SELECT id, nome, horas FROM optativas")}

    cards = []
    for a in alunos:
        prog = calcular_progresso(a["nome"], db)
        perfil = perfil_aluno(a["nome"], db)
        cards.append({
            "nome": a["nome"], "apelido": nomes[a["nome"]], "curso": a["curso"], "tem_foto": a["tem_foto"],
            "horas_concluidas": prog["horas_concluidas"], "horas_inscritas": prog["horas_inscritas"],
            "horas_totais": prog["horas_totais"], "progresso": prog["progresso_percentual"],
            "progresso_com_inscritas": prog["progresso_com_inscritas_percentual"],
            "cr": perfil["cr"]["valor"], "inscritas": perfil["inscritas"],
            "formatura": calcular_previsao(db, a["nome"], perfil, prog)["semestre_formatura"],
        })

    faltas, semestres_atuais = [], []
    for r in db.execute("SELECT aluno, materia_id, faltas, periodo_letivo FROM historico WHERE status = 'Inscrito'"):
        if r["aluno"] not in nomes or r["materia_id"] not in catalogo:
            continue
        if r["periodo_letivo"]:
            semestres_atuais.append(r["periodo_letivo"])
        nome_mat, horas = catalogo[r["materia_id"]]
        limite = limite_faltas(horas)
        margem = limite - r["faltas"]
        if margem <= 2:
            faltas.append({
                "aluno": r["aluno"], "apelido": nomes[r["aluno"]], "materia": nome_mat,
                "faltas": r["faltas"], "limite": limite, "margem": margem,
            })
    faltas.sort(key=lambda f: (f["margem"], f["aluno"]))

    hoje = datetime.date.today().isoformat()
    datas = []
    por_grupo = {}
    for r in db.execute(
        "SELECT aluno, materia_id, titulo, tipo, data, hora, grupo FROM eventos WHERE data >= ? "
        "ORDER BY data, COALESCE(hora, ''), id", (hoje,)
    ):
        if r["aluno"] not in nomes:
            continue
        if r["grupo"] and r["grupo"] in por_grupo:  # mesma data compartilhada: um item só, com todos os nomes
            por_grupo[r["grupo"]]["pessoas"].append(nomes[r["aluno"]])
            continue
        item = {
            "aluno": r["aluno"], "pessoas": [nomes[r["aluno"]]], "titulo": r["titulo"], "tipo": r["tipo"],
            "data": r["data"], "hora": r["hora"],
            "materia": catalogo[r["materia_id"]][0] if r["materia_id"] in catalogo else None,
        }
        if r["grupo"]:
            por_grupo[r["grupo"]] = item
        datas.append(item)
    for item in datas:
        item["apelido"] = ", ".join(item.pop("pessoas"))

    return {
        "semestre": max(semestres_atuais) if semestres_atuais else None,
        "totais": {"alunos": len(cards), "em_curso": sum(c["inscritas"] for c in cards)},
        "alunos": cards,
        "faltas": faltas[:8],
        "datas": datas[:8],
    }


# ==========================================
# PLANEJAMENTO DE MATÉRIAS (turmas do semestre)
# ==========================================
def _info_codigo(db, codigo):
    """Dados cadastrados de um código (matéria obrigatória ou optativa), ou None se for desconhecido."""
    m = db.execute("SELECT nome, horas, periodo FROM materias WHERE id = ?", (codigo,)).fetchone()
    if m:
        return {"nome": m["nome"], "ch": m["horas"], "periodo": m["periodo"]}
    o = db.execute("SELECT nome, horas FROM optativas WHERE id = ?", (codigo,)).fetchone()
    if o:
        return {"nome": o["nome"], "ch": o["horas"], "periodo": 0}
    return None


def _hora_valida(valor):
    if valor is None or valor == "":
        return None
    m = re.fullmatch(r"(\d{1,2}):(\d{2})", valor.strip())
    if not m or int(m.group(1)) > 23 or int(m.group(2)) > 59:
        raise HTTPException(status_code=400, detail="Horário inválido. Use o formato HH:MM (ex: 07:00).")
    return f"{int(m.group(1)):02d}:{m.group(2)}"


def _validar_turma(t: TurmaIn, db):
    """Normaliza e valida uma turma; devolve os campos prontos para gravar."""
    codigo = t.codigo.strip().upper()
    info = _info_codigo(db, codigo)
    nome = (t.nome or "").strip() or (info["nome"] if info else "")
    if not nome:
        raise HTTPException(status_code=400, detail="Código desconhecido: informe também o nome da matéria.")
    dias = []
    for d in t.dias:
        achado = next((x for x in DIAS_SEMANA if _sem_acento(x) == _sem_acento(d)), None)
        if not achado:
            raise HTTPException(status_code=400, detail=f"Dia da semana inválido: {d}.")
        if achado not in dias:
            dias.append(achado)
    dias.sort(key=DIAS_SEMANA.index)
    inicio, fim = _hora_valida(t.inicio), _hora_valida(t.fim)
    if bool(inicio) != bool(fim):
        raise HTTPException(status_code=400, detail="Informe o horário de início e o de fim.")
    if inicio and fim <= inicio:
        raise HTTPException(status_code=400, detail="O horário de fim precisa ser depois do início.")
    return {
        "semestre": normalizar_periodo(t.semestre),
        "codigo": codigo,
        "nome": nome,
        "dias": ",".join(dias),
        "inicio": inicio,
        "fim": fim,
        "professor": (t.professor or "").strip() or None,
        "sala": (t.sala or "").strip() or None,
        "ch": t.ch if t.ch is not None else (info["ch"] if info else None),
        "periodo": t.periodo if t.periodo is not None else (info["periodo"] if info else 0),
    }


def _turma_existente(db, semestre, codigo, nome, dias, inicio, fim, professor, sala):
    r = db.execute(
        "SELECT id FROM turmas WHERE semestre = ? AND codigo = ? AND dias = ? AND inicio IS ? AND fim IS ? "
        "AND professor IS ? AND sala IS ?", (semestre, codigo, dias, inicio, fim, professor, sala)
    ).fetchone()
    return r["id"] if r else None


def _definir_escolhas(db, turma_id, alunos, tabela="turma_escolhas"):
    """Troca a lista de alunos ligada a uma turma (escolhas ou alunos aptos, conforme a tabela)."""
    if tabela not in ("turma_escolhas", "turma_alunos"):
        raise ValueError("tabela inválida")
    existentes = {r["nome"] for r in db.execute("SELECT nome FROM alunos")}
    for a in alunos:
        if a not in existentes:
            raise HTTPException(status_code=400, detail=f"Aluno não encontrado: {a}.")
    db.execute(f"DELETE FROM {tabela} WHERE turma_id = ?", (turma_id,))
    db.executemany(f"INSERT OR IGNORE INTO {tabela} (turma_id, aluno) VALUES (?, ?)",
                   [(turma_id, a) for a in alunos])


def _aplicar_alunos_aptos(db, turma_id, auto, alunos):
    """auto=True volta para o cálculo automático; auto=False grava a lista manual."""
    db.execute("UPDATE turmas SET alunos_auto = ? WHERE id = ?", (1 if auto else 0, turma_id))
    _definir_escolhas(db, turma_id, [] if auto else (alunos or []), "turma_alunos")


def _calcular_elegiveis(db, codigos):
    """Para cada código de matéria, quais alunos poderiam cursá-la: é do curso, ainda não fez/está fazendo
    e já cumpriu (ou está cursando) os pré-requisitos. Optativas: do curso e com espaço no bloco do tipo."""
    pre = {}
    for r in db.execute("SELECT pre, pos FROM dependencias"):
        pre.setdefault(r["pos"], []).append(r["pre"])
    curso_da_materia = {r["id"]: r["curso"] for r in db.execute("SELECT id, curso FROM materias")}
    optativas = {r["id"]: r for r in db.execute("SELECT id, horas, tipo FROM optativas")}
    opt_cursos = {(r["optativa_id"], r["curso"]) for r in db.execute("SELECT optativa_id, curso FROM optativas_cursos")}
    blocos = {(r["curso"], r["tipo"]): r["horas"] for r in db.execute("SELECT curso, tipo, horas FROM optativas_blocos")}

    feitas_por_aluno = {}
    for r in db.execute("SELECT aluno, materia_id FROM historico WHERE status IN ('Concluída', 'Inscrito')"):
        feitas_por_aluno.setdefault(r["aluno"], set()).add(r["materia_id"])

    resultado = {c: [] for c in codigos}
    for a in db.execute("SELECT nome, curso FROM alunos ORDER BY nome"):
        feitas = feitas_por_aluno.get(a["nome"], set())
        usado = {}  # horas já ocupadas em cada bloco de optativas
        for m in feitas:
            if m in optativas:
                usado[optativas[m]["tipo"]] = usado.get(optativas[m]["tipo"], 0) + optativas[m]["horas"]
        for c in codigos:
            if c in feitas:
                continue
            if c in curso_da_materia:
                if curso_da_materia[c] == a["curso"] and all(p in feitas for p in pre.get(c, [])):
                    resultado[c].append(a["nome"])
            elif c in optativas and (c, a["curso"]) in opt_cursos:
                limite = blocos.get((a["curso"], optativas[c]["tipo"]))
                if limite is not None and usado.get(optativas[c]["tipo"], 0) < limite:
                    resultado[c].append(a["nome"])
    return resultado


@app.get("/planejamento")
def obter_planejamento(semestre: Optional[str] = None, db: sqlite3.Connection = Depends(get_db)):
    semestres = [r["semestre"] for r in db.execute("SELECT DISTINCT semestre FROM turmas ORDER BY semestre DESC")]
    atual = normalizar_periodo(semestre) if semestre else (semestres[0] if semestres else None)

    rows = db.execute("SELECT * FROM turmas WHERE semestre = ?", (atual,)).fetchall() if atual else []
    escolhas = {}
    for r in db.execute("SELECT turma_id, aluno FROM turma_escolhas ORDER BY aluno"):
        escolhas.setdefault(r["turma_id"], []).append(r["aluno"])
    elegiveis = _calcular_elegiveis(db, {r["codigo"] for r in rows})
    manuais = {}
    for r in db.execute("SELECT turma_id, aluno FROM turma_alunos ORDER BY aluno"):
        manuais.setdefault(r["turma_id"], []).append(r["aluno"])

    turmas = []
    for r in rows:
        dias = [d for d in r["dias"].split(",") if d]
        turmas.append({
            "id": r["id"], "semestre": r["semestre"], "codigo": r["codigo"], "nome": r["nome"], "dias": dias,
            "inicio": r["inicio"], "fim": r["fim"], "professor": r["professor"], "sala": r["sala"],
            "ch": r["ch"], "periodo": r["periodo"],
            "alunos_auto": bool(r["alunos_auto"]),
            "alunos": elegiveis[r["codigo"]] if r["alunos_auto"] else manuais.get(r["id"], []),
            "escolhas": escolhas.get(r["id"], []),
        })
    # Ordem parecida com a do Notion: pelo primeiro dia, depois horário
    turmas.sort(key=lambda t: (DIAS_SEMANA.index(t["dias"][0]) if t["dias"] else 99, t["inicio"] or "99", t["codigo"]))

    alunos = [{"nome": r["nome"], "curso": r["curso"], "apelido": _apelido(r["nome"], r["apelido"])}
              for r in db.execute("SELECT nome, curso, apelido FROM alunos ORDER BY nome")]
    catalogo = [dict(r) for r in db.execute(
        "SELECT id AS codigo, nome, horas AS ch, periodo FROM materias UNION ALL "
        "SELECT id, nome, horas, 0 FROM optativas ORDER BY id")]
    return {"semestres": semestres, "semestre": atual, "alunos": alunos, "turmas": turmas, "catalogo": catalogo}


@app.post("/planejamento/turmas")
def criar_turma(turma: TurmaIn, db: sqlite3.Connection = Depends(get_db)):
    v = _validar_turma(turma, db)
    turma_id = db.execute(
        "INSERT INTO turmas (semestre, codigo, nome, dias, inicio, fim, professor, sala, ch, periodo) "
        "VALUES (:semestre, :codigo, :nome, :dias, :inicio, :fim, :professor, :sala, :ch, :periodo)", v
    ).lastrowid
    _definir_escolhas(db, turma_id, turma.escolhas or [])
    _aplicar_alunos_aptos(db, turma_id, turma.alunos_auto is not False, turma.alunos)
    db.commit()
    registrar_log(f"NOVA TURMA {v['semestre']}: {v['codigo']} - {v['nome']}.")
    return {"mensagem": "Turma adicionada ao planejamento!", "id": turma_id, "semestre": v["semestre"]}


@app.put("/planejamento/turmas/{turma_id}")
def editar_turma(turma_id: int, turma: TurmaIn, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM turmas WHERE id = ?", (turma_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Turma não encontrada.")
    v = _validar_turma(turma, db)
    db.execute(
        "UPDATE turmas SET semestre = :semestre, codigo = :codigo, nome = :nome, dias = :dias, inicio = :inicio, "
        "fim = :fim, professor = :professor, sala = :sala, ch = :ch, periodo = :periodo WHERE id = :id",
        {**v, "id": turma_id})
    if turma.escolhas is not None:
        _definir_escolhas(db, turma_id, turma.escolhas)
    if turma.alunos_auto is not None:
        _aplicar_alunos_aptos(db, turma_id, turma.alunos_auto, turma.alunos)
    db.commit()
    return {"mensagem": "Turma atualizada!", "semestre": v["semestre"]}


@app.delete("/planejamento/turmas/{turma_id}")
def excluir_turma(turma_id: int, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("DELETE FROM turmas WHERE id = ?", (turma_id,))
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Turma não encontrada.")
    db.execute("DELETE FROM turma_escolhas WHERE turma_id = ?", (turma_id,))
    db.execute("DELETE FROM turma_alunos WHERE turma_id = ?", (turma_id,))
    db.commit()
    return {"mensagem": "Turma removida do planejamento."}


@app.put("/planejamento/escolha")
def definir_escolha(body: EscolhaIn, db: sqlite3.Connection = Depends(get_db)):
    """Marca ou desmarca uma turma como escolha de um aluno."""
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (body.aluno,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")
    if not db.execute("SELECT 1 FROM turmas WHERE id = ?", (body.turma_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Turma não encontrada.")
    if body.escolhido:
        db.execute("INSERT OR IGNORE INTO turma_escolhas (turma_id, aluno) VALUES (?, ?)", (body.turma_id, body.aluno))
    else:
        db.execute("DELETE FROM turma_escolhas WHERE turma_id = ? AND aluno = ?", (body.turma_id, body.aluno))
    db.commit()
    return {"mensagem": "Escolha atualizada!"}


@app.put("/alunos/{nome}/apelido")
def definir_apelido(nome: str, body: ApelidoIn, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("UPDATE alunos SET apelido = ? WHERE nome = ?", ((body.apelido or "").strip() or None, nome))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Aluno não encontrado.")
    return {"mensagem": "Apelido atualizado!"}


@app.post("/planejamento/importar")
def importar_turmas(body: TurmasImport, db: sqlite3.Connection = Depends(get_db)):
    """Importa linhas de uma exportação CSV do Notion (colunas: Matéria, Horário, Dias da Semana, Professor,
    CH, Alunos, Período, Escolhas, Sala). Repetir a importação não duplica turmas."""
    semestre = normalizar_periodo(body.semestre)
    por_apelido = {}
    for a in db.execute("SELECT nome, apelido FROM alunos ORDER BY nome"):
        por_apelido.setdefault(_sem_acento(a["nome"].split()[0]), a["nome"])
    for a in db.execute("SELECT nome, apelido FROM alunos WHERE apelido IS NOT NULL AND apelido != ''"):
        por_apelido[_sem_acento(a["apelido"])] = a["nome"]

    novas = repetidas = 0
    ignoradas, desconhecidos = [], set()
    for i, l in enumerate(body.linhas, 1):
        bruto = re.sub(r"\s*\(https?://[^)]*\)\s*$", "", str(l.get("materia") or "")).strip()
        m = re.match(r"^([A-Za-z0-9]{3,12})\s*[-–—]\s*(.+)$", bruto)
        if not m:
            ignoradas.append(bruto or f"linha {i}")
            continue
        codigo, nome = m.group(1).upper(), m.group(2).strip()
        horas = re.findall(r"(\d{1,2}):(\d{2})", str(l.get("horario") or ""))
        inicio = fim = None
        if len(horas) >= 2:
            inicio, fim = (f"{int(h):02d}:{mi}" for h, mi in horas[:2])
            if fim <= inicio:
                inicio = fim = None
        pedacos = [x.strip() for x in re.split(r"[,;/]", str(l.get("dias") or "")) if x.strip()]
        dias = [d for d in DIAS_SEMANA if any(_sem_acento(p) == _sem_acento(d) for p in pedacos)]
        numero = lambda v: int(re.search(r"\d+", str(v)).group()) if re.search(r"\d+", str(v or "")) else None
        info = _info_codigo(db, codigo)
        valores = (semestre, codigo, info["nome"] if info else nome, ",".join(dias), inicio, fim,
                   (str(l.get("professor") or "").strip() or None), (str(l.get("sala") or "").strip() or None))
        turma_id = _turma_existente(db, *valores)
        if turma_id is None:
            ch = numero(l.get("ch"))
            periodo = numero(l.get("periodo"))
            turma_id = db.execute(
                "INSERT INTO turmas (semestre, codigo, nome, dias, inicio, fim, professor, sala, ch, periodo) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (*valores, ch if ch is not None else (info["ch"] if info else None),
                 periodo if periodo is not None else (info["periodo"] if info else 0))).lastrowid
            novas += 1
        else:
            repetidas += 1
        aptos = []
        for nome_aluno in [x.strip() for x in re.split(r"[,;]", str(l.get("alunos") or "")) if x.strip()]:
            alvo = por_apelido.get(_sem_acento(nome_aluno))
            if alvo:
                aptos.append(alvo)
            else:
                desconhecidos.add(nome_aluno)
        if aptos:  # a coluna "Alunos" do Notion vira a lista manual de alunos aptos
            _aplicar_alunos_aptos(db, turma_id, False, aptos)
        for nome_aluno in [x.strip() for x in re.split(r"[,;]", str(l.get("escolhas") or "")) if x.strip()]:
            alvo = por_apelido.get(_sem_acento(nome_aluno))
            if alvo:
                db.execute("INSERT OR IGNORE INTO turma_escolhas (turma_id, aluno) VALUES (?, ?)", (turma_id, alvo))
            else:
                desconhecidos.add(nome_aluno)
    db.commit()
    registrar_log(f"IMPORTAÇÃO DE TURMAS {semestre}: {novas} nova(s), {repetidas} já existia(m).")
    return {
        "mensagem": f"{novas} turma(s) importada(s)" + (f", {repetidas} já existia(m)" if repetidas else ""),
        "novas": novas, "repetidas": repetidas, "ignoradas": ignoradas, "desconhecidos": sorted(desconhecidos),
    }


# ==========================================
# HORAS DE EXTENSÃO E HORAS COMPLEMENTARES (AC)
# ==========================================
def _ac(id_, nome, unidade, fator, maximo, regra):
    return {"id": id_, "nome": nome, "unidade": unidade, "fator": fator, "maximo": maximo, "regra": regra}


# Tabela de pontuação das Atividades Complementares - Currículo novo (31.02.003), IC/UFF.
ATIVIDADES_AC = [
    _ac("eletiva_uff", "Disciplina Eletiva presencial ou a distância – UFF", "horas cursadas", 0.5, 30, "2 horas cursadas = 1 AC"),
    _ac("disciplina_isolada", "Disciplina Isolada (outra IES)", "horas cursadas", 0.5, 30, "2 horas cursadas = 1 AC"),
    _ac("iniciacao_docencia", "Iniciação à Docência", "meses", 5, 60, "1 mês = 5 AC"),
    _ac("material_didatico", "Desenvolvimento de material didático", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("pratica_laboratorio", "Prática de Laboratório de Computação ou áreas afins", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("ensino_monitoria", "Participação em Projeto de Ensino e monitoria", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("estagio", "Estágio", "meses", 5, 60, "1 mês = 5 AC"),
    _ac("lingua_estrangeira", "Curso de Língua Estrangeira", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("conselhos", "Participação em Conselhos, Colegiados e Comissões", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("iniciacao_cientifica", "Iniciação Científica e Tecnológica", "meses", 5, 60, "1 mês = 5 AC"),
    _ac("projeto_pesquisa", "Participação em Projeto de Pesquisa", "meses", 5, 60, "1 mês = 5 AC"),
    _ac("projeto_extensao", "Participação em Projeto de Extensão", "meses", 5, 60, "1 mês = 5 AC"),
    _ac("empresa_jr_diretor", "Participação na Empresa Jr (Diretor)", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("empresa_jr_membro", "Participação na Empresa Jr (Membro)", "meses", 1.3, 15, "1 mês = 1,3 AC"),
    _ac("minicurso_realizado", "Minicursos ou Tutoriais realizados durante evento científico ou tecnológico",
        "horas cursadas", 0.5, 12, "2 horas cursadas = 1 AC"),
    _ac("minicurso_ministrado", "Minicursos ou Tutoriais ministrados durante evento científico ou tecnológico",
        "horas ministradas", 4, 16, "1 hora ministrada = 4 AC"),
    _ac("palestra", "Proferir palestras na área de Computação", "apresentações", 2, 12, "1 apresentação = 2 AC"),
    _ac("apresentacao_cientifica", "Apresentação de Trabalhos em eventos científicos ou tecnológicos",
        "apresentações", 4, 30, "1 apresentação = 4 AC"),
    _ac("apresentacao_extensao", "Apresentação de Trabalhos em eventos de Extensão", "apresentações", 4, 30,
        "1 apresentação = 4 AC"),
    _ac("eventos_estudantis", "Participação em eventos estudantis, nacionais ou regionais, ligados à formação do aluno",
        "horas cursadas", 0.5, 12, "2 horas cursadas = 1 AC"),
    _ac("cursos_treinamentos", "Participação em cursos e treinamentos presenciais ou não, na área de Computação",
        "horas cursadas", 0.5, 30, "2 horas cursadas = 1 AC"),
    _ac("seminarios_congressos", "Participação em seminários, congressos e eventos", "horas cursadas", 0.5, 30,
        "2 horas cursadas = 1 AC"),
    _ac("competicao_maratona", "Participação em Competição de Base Tecnológica e Caráter Educacional / Maratona",
        "horas", 1, 60, "1 hora = 1 AC"),
    _ac("hackathon", "Hackathon", "horas cursadas", 0.5, 30, "2 horas cursadas = 1 AC"),
    _ac("organizacao_eventos", "Organização de eventos na área de Computação ou em áreas afins", "eventos organizados", 4, 12,
        "1 evento organizado = 4 AC"),
    _ac("semana_academica", "Semana Acadêmica de Computação", "horas", 0.5, 30, "4 horas = 2 AC"),
    _ac("atletica", "Atlética", "meses", 2.5, 30, "1 mês = 2,5 AC"),
    _ac("outra", "Outra (a critério da Comissão de AC)", "AC", 1, 60, "Valor definido pela Comissão de AC"),
]
ATIV_POR_ID = {a["id"]: a for a in ATIVIDADES_AC}
LIMITE_COMPROVANTE = 5 * 1024 * 1024  # 5 MB


def _requisitos(db, curso):
    r = db.execute("SELECT horas_complementares, horas_extensao FROM requisitos_curso WHERE curso = ?", (curso,)).fetchone()
    return (r["horas_complementares"], r["horas_extensao"]) if r else (0, 0)


def _resumo_extensao(db, nome, curso):
    """Horas de extensão do aluno: soma das horas de extensão das matérias (e optativas) concluídas."""
    _, necessarias = _requisitos(db, curso)
    itens = [dict(r, tipo="Obrigatória") for r in db.execute(
        "SELECT id, nome, horas_extensao FROM materias WHERE curso = ? AND horas_extensao > 0 ORDER BY periodo, nome", (curso,))]
    itens += [dict(r, tipo="Optativa") for r in db.execute(
        "SELECT o.id, o.nome, o.horas_extensao FROM optativas o JOIN optativas_cursos oc ON oc.optativa_id = o.id "
        "WHERE oc.curso = ? AND o.horas_extensao > 0 ORDER BY o.nome", (curso,))]
    status = {}
    for r in db.execute("SELECT materia_id, status FROM historico WHERE aluno = ?", (nome,)):
        status.setdefault(r["materia_id"], set()).add(r["status"])
    concluidas = em_curso = 0
    for it in itens:
        s = status.get(it["id"], set())
        it["situacao"] = "Concluída" if "Concluída" in s else "Inscrito" if "Inscrito" in s else "Não cursada"
        if it["situacao"] == "Concluída":
            concluidas += it["horas_extensao"]
        elif it["situacao"] == "Inscrito":
            em_curso += it["horas_extensao"]
    return {
        "necessarias": necessarias, "concluidas": concluidas, "em_curso": em_curso,
        "faltam": max(0, necessarias - concluidas), "no_curriculo": sum(i["horas_extensao"] for i in itens),
        "itens": itens,
    }


def _resumo_complementares(db, nome, curso):
    """AC do aluno: cada atividade converte a quantidade em AC e é limitada ao máximo da tabela (currículo .003)."""
    necessarias, _ = _requisitos(db, curso)
    registros, bruto = [], {}
    for r in db.execute(
        "SELECT id, atividade, descricao, quantidade, data, comprovante_nome, (comprovante IS NOT NULL) AS tem "
        "FROM atividades_complementares WHERE aluno = ? ORDER BY COALESCE(data, '') DESC, id DESC", (nome,)
    ):
        a = ATIV_POR_ID.get(r["atividade"])
        if not a:
            continue
        ac = round(r["quantidade"] * a["fator"], 2)
        bruto[a["id"]] = bruto.get(a["id"], 0) + ac
        registros.append({
            "id": r["id"], "atividade": a["id"], "atividade_nome": a["nome"], "unidade": a["unidade"],
            "descricao": r["descricao"], "quantidade": r["quantidade"], "data": r["data"], "ac": ac,
            "tem_comprovante": bool(r["tem"]), "comprovante_nome": r["comprovante_nome"],
        })
    por_atividade = [
        {"id": a["id"], "nome": a["nome"], "regra": a["regra"], "maximo": a["maximo"],
         "lancado": round(bruto[a["id"]], 2), "contado": round(min(bruto[a["id"]], a["maximo"]), 2)}
        for a in ATIVIDADES_AC if a["id"] in bruto
    ]
    total = round(sum(p["contado"] for p in por_atividade), 2)
    return {
        "necessarias": necessarias, "concluidas": total, "faltam": max(0, round(necessarias - total, 2)),
        "por_atividade": por_atividade, "registros": registros,
    }


def _ler_pdf(b64):
    try:
        dados = base64.b64decode(b64, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Arquivo do comprovante inválido.")
    if not dados.startswith(b"%PDF"):
        raise HTTPException(status_code=400, detail="O comprovante precisa ser um arquivo PDF.")
    if len(dados) > LIMITE_COMPROVANTE:
        raise HTTPException(status_code=400, detail="O comprovante passa de 5 MB. Comprima o PDF e tente de novo.")
    return dados


def _validar_atividade(body: AtividadeIn):
    if body.atividade not in ATIV_POR_ID:
        raise HTTPException(status_code=400, detail="Tipo de atividade desconhecido.")
    data = (body.data or "").strip() or None
    if data:
        try:
            datetime.date.fromisoformat(data)
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida. Use o formato AAAA-MM-DD.")
    return data, (body.descricao or "").strip() or None


@app.get("/alunos/{nome}/complementares")
def obter_complementares(nome: str, db: sqlite3.Connection = Depends(get_db)):
    aluno = db.execute("SELECT curso FROM alunos WHERE nome = ?", (nome,)).fetchone()
    if not aluno:
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    return {
        "curso": aluno["curso"],
        "atividades": ATIVIDADES_AC,
        "complementares": _resumo_complementares(db, nome, aluno["curso"]),
        "extensao": _resumo_extensao(db, nome, aluno["curso"]),
    }


@app.post("/alunos/{nome}/complementares")
def criar_complementar(nome: str, body: AtividadeIn, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (nome,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    data, descricao = _validar_atividade(body)
    pdf = _ler_pdf(body.comprovante_b64) if body.comprovante_b64 else None
    db.execute(
        "INSERT INTO atividades_complementares (aluno, atividade, descricao, quantidade, data, comprovante, comprovante_nome) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (nome, body.atividade, descricao, body.quantidade, data, pdf,
         (body.comprovante_nome or "comprovante.pdf") if pdf else None),
    )
    db.commit()
    return {"mensagem": "Atividade complementar adicionada!"}


@app.put("/complementares/{atividade_id}")
def editar_complementar(atividade_id: int, body: AtividadeIn, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM atividades_complementares WHERE id = ?", (atividade_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Atividade não encontrada.")
    data, descricao = _validar_atividade(body)
    db.execute(
        "UPDATE atividades_complementares SET atividade = ?, descricao = ?, quantidade = ?, data = ? WHERE id = ?",
        (body.atividade, descricao, body.quantidade, data, atividade_id),
    )
    if body.comprovante_b64:  # novo PDF substitui o anterior
        db.execute("UPDATE atividades_complementares SET comprovante = ?, comprovante_nome = ? WHERE id = ?",
                   (_ler_pdf(body.comprovante_b64), body.comprovante_nome or "comprovante.pdf", atividade_id))
    elif body.remover_comprovante:
        db.execute("UPDATE atividades_complementares SET comprovante = NULL, comprovante_nome = NULL WHERE id = ?",
                   (atividade_id,))
    db.commit()
    return {"mensagem": "Atividade atualizada!"}


@app.delete("/complementares/{atividade_id}")
def excluir_complementar(atividade_id: int, db: sqlite3.Connection = Depends(get_db)):
    cur = db.execute("DELETE FROM atividades_complementares WHERE id = ?", (atividade_id,))
    db.commit()
    if cur.rowcount == 0:
        raise HTTPException(status_code=404, detail="Atividade não encontrada.")
    return {"mensagem": "Atividade removida."}


@app.get("/complementares/{atividade_id}/comprovante")
def obter_comprovante(atividade_id: int, db: sqlite3.Connection = Depends(get_db)):
    r = db.execute("SELECT comprovante, comprovante_nome FROM atividades_complementares WHERE id = ?",
                   (atividade_id,)).fetchone()
    if not r or not r["comprovante"]:
        raise HTTPException(status_code=404, detail="Sem comprovante")
    nome_arquivo = re.sub(r'[^\w.\- ]', "_", r["comprovante_nome"] or "comprovante.pdf")
    return Response(content=bytes(r["comprovante"]), media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{nome_arquivo}"'})


# ==========================================
# ROTAS DE ADMINISTRAÇÃO (/admin)
# ==========================================
admin_router = APIRouter(prefix="/admin", tags=["Administração"])


@admin_router.get("/logs")
def ver_logs():
    return {"logs": list(logs_execucao)}


# ---------- Conquistas (configuradas no Admin) ----------
def _validar_conquista(c: ConquistaIn):
    if not c.nome.strip():
        raise HTTPException(status_code=400, detail="Informe o nome da conquista.")
    info = METRICAS_CONQUISTA.get(c.metrica)
    if not info:
        raise HTTPException(status_code=400, detail="Métrica inválida.")
    metas = [round(m, 2) for m in c.metas]
    if not 1 <= len(metas) <= 4:
        raise HTTPException(status_code=400, detail="Informe de 1 a 4 metas (uma por nível).")
    if any(m <= 0 for m in metas) or any(b <= a for a, b in zip(metas, metas[1:])):
        raise HTTPException(status_code=400, detail="As metas precisam ser positivas e crescentes (ex: 5, 10, 20).")
    parametro = (c.parametro or "").strip() or None
    if "parametro" in info:
        parametro = parametro or info["parametro"]["padrao"] or None
        if not parametro:
            raise HTTPException(status_code=400, detail=f"Preencha: {info['parametro']['rotulo']}.")
        if info["parametro"]["tipo"] == "numero":
            try:
                float(parametro.replace(",", "."))
            except ValueError:
                raise HTTPException(status_code=400, detail=f"{info['parametro']['rotulo']} precisa ser um número.")
            parametro = parametro.replace(",", ".")
    else:
        parametro = None
    return metas, parametro


def _conquista_para_json(r):
    return {**{k: r[k] for k in ("id", "nome", "icone", "categoria", "descricao", "metrica", "parametro")},
            "metas": _metas_lista(r["metas"]), "ativa": bool(r["ativa"]), "padrao": bool(r["padrao"])}


@admin_router.get("/conquistas")
def listar_conquistas_admin(db: sqlite3.Connection = Depends(get_db)):
    return {
        "conquistas": [_conquista_para_json(r) for r in db.execute("SELECT * FROM conquistas_config ORDER BY ordem, rowid")],
        "metricas": [{"id": k, **v} for k, v in METRICAS_CONQUISTA.items()],
    }


@admin_router.post("/conquistas")
def criar_conquista(c: ConquistaIn, db: sqlite3.Connection = Depends(get_db)):
    metas, parametro = _validar_conquista(c)
    novo_id = f"custom-{uuid.uuid4().hex[:8]}"
    ordem = db.execute("SELECT COALESCE(MAX(ordem), 0) + 1 FROM conquistas_config").fetchone()[0]
    db.execute(
        "INSERT INTO conquistas_config (id, nome, icone, categoria, descricao, metrica, parametro, metas, ativa, padrao, ordem) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)",
        (novo_id, c.nome.strip(), c.icone.strip() or "🏅", c.categoria.strip() or "Geral", c.descricao.strip(),
         c.metrica, parametro, ",".join(f"{m:g}" for m in metas), int(c.ativa), ordem))
    db.commit()
    registrar_log(f"Conquista criada: {c.nome.strip()}")
    return {"mensagem": f"Conquista '{c.nome.strip()}' criada!", "id": novo_id}


@admin_router.put("/conquistas/{conquista_id}")
def editar_conquista(conquista_id: str, c: ConquistaIn, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM conquistas_config WHERE id = ?", (conquista_id,)).fetchone():
        raise HTTPException(status_code=404, detail="Conquista não encontrada.")
    metas, parametro = _validar_conquista(c)
    db.execute(
        "UPDATE conquistas_config SET nome = ?, icone = ?, categoria = ?, descricao = ?, metrica = ?, parametro = ?, "
        "metas = ?, ativa = ? WHERE id = ?",
        (c.nome.strip(), c.icone.strip() or "🏅", c.categoria.strip() or "Geral", c.descricao.strip(),
         c.metrica, parametro, ",".join(f"{m:g}" for m in metas), int(c.ativa), conquista_id))
    db.commit()
    registrar_log(f"Conquista editada: {c.nome.strip()}")
    return {"mensagem": "Conquista atualizada!"}


@admin_router.delete("/conquistas/{conquista_id}")
def excluir_conquista(conquista_id: str, db: sqlite3.Connection = Depends(get_db)):
    r = db.execute("SELECT nome, padrao FROM conquistas_config WHERE id = ?", (conquista_id,)).fetchone()
    if not r:
        raise HTTPException(status_code=404, detail="Conquista não encontrada.")
    if r["padrao"]:
        raise HTTPException(status_code=400, detail="As conquistas que já vêm no sistema não podem ser excluídas: desative-a.")
    db.execute("DELETE FROM conquistas_config WHERE id = ?", (conquista_id,))
    db.commit()
    registrar_log(f"Conquista excluída: {r['nome']}")
    return {"mensagem": "Conquista excluída."}


@admin_router.post("/materias")
def cadastrar_materia(materia: MateriaCreate, db: sqlite3.Connection = Depends(get_db)):
    codigo = materia.id.strip().upper()
    nome = materia.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Informe o nome da disciplina.")
    if db.execute("SELECT 1 FROM materias WHERE id = ?", (codigo,)).fetchone() or \
            db.execute("SELECT 1 FROM optativas WHERE id = ?", (codigo,)).fetchone():
        raise HTTPException(status_code=400, detail="Já existe uma matéria com este código!")

    if materia.horas_extensao > materia.horas:
        raise HTTPException(status_code=400, detail="As horas de extensão não podem passar da carga horária da matéria.")

    if materia.optativa:
        cursos = sorted(set(materia.cursos))
        if not cursos:
            raise HTTPException(status_code=400, detail="Selecione ao menos um curso para a optativa.")
        for c in cursos:
            if not db.execute("SELECT 1 FROM materias WHERE curso = ? LIMIT 1", (c,)).fetchone():
                raise HTTPException(status_code=400, detail=f"Curso inexistente: {c}.")
        if materia.tipo not in TIPOS_OPTATIVA:
            raise HTTPException(status_code=400, detail="Escolha o tipo da optativa (Tecnológica ou Humanística).")
        db.execute(
            "INSERT INTO optativas (id, nome, horas, tipo, horas_extensao) VALUES (?, ?, ?, ?, ?)",
            (codigo, nome, materia.horas, materia.tipo, materia.horas_extensao)
        )
        db.executemany("INSERT INTO optativas_cursos (optativa_id, curso) VALUES (?, ?)", [(codigo, c) for c in cursos])
        db.commit()
        registrar_log(f"NOVA OPTATIVA {materia.tipo.upper()}: '{nome}' ({codigo}, {materia.horas}h) disponível para {', '.join(cursos)}.")
        return {"mensagem": f"Optativa '{nome}' adicionada com sucesso!"}

    if materia.periodo is None or not materia.curso:
        raise HTTPException(status_code=400, detail="Informe o período e o curso da matéria.")
    db.execute(
        "INSERT INTO materias (id, nome, periodo, horas, curso, horas_extensao) VALUES (?, ?, ?, ?, ?, ?)",
        (codigo, nome, materia.periodo, materia.horas, materia.curso, materia.horas_extensao),
    )
    db.commit()
    registrar_log(f"NOVA MATÉRIA: '{nome}' ({codigo}) adicionada a {materia.curso}.")
    return {"mensagem": f"Disciplina '{nome}' adicionada com sucesso!"}


@admin_router.get("/materias")
def listar_materias_admin(db: sqlite3.Connection = Depends(get_db)):
    """Todas as matérias (obrigatórias e optativas) para a tela de edição."""
    saida = [dict(r, optativa=False, tipo=None, cursos=[]) for r in db.execute(
        "SELECT id, nome, periodo, horas, horas_extensao, curso FROM materias ORDER BY curso, periodo, nome")]
    for o in db.execute("SELECT id, nome, horas, horas_extensao, tipo FROM optativas ORDER BY tipo, nome"):
        cursos = [c["curso"] for c in db.execute(
            "SELECT curso FROM optativas_cursos WHERE optativa_id = ? ORDER BY curso", (o["id"],))]
        saida.append(dict(o, optativa=True, periodo=None, curso=None, cursos=cursos))
    return saida


@admin_router.put("/materias/{codigo}")
def editar_materia(codigo: str, body: MateriaUpdate, db: sqlite3.Connection = Depends(get_db)):
    codigo = codigo.strip().upper()
    nome = body.nome.strip()
    if not nome:
        raise HTTPException(status_code=400, detail="Informe o nome da disciplina.")
    if body.horas_extensao > body.horas:
        raise HTTPException(status_code=400, detail="As horas de extensão não podem passar da carga horária da matéria.")

    mat = db.execute("SELECT periodo, curso FROM materias WHERE id = ?", (codigo,)).fetchone()
    if mat:
        curso = body.curso or mat["curso"]
        if not db.execute("SELECT 1 FROM materias WHERE curso = ? LIMIT 1", (curso,)).fetchone():
            raise HTTPException(status_code=400, detail=f"Curso inexistente: {curso}.")
        db.execute(
            "UPDATE materias SET nome = ?, periodo = ?, horas = ?, horas_extensao = ?, curso = ? WHERE id = ?",
            (nome, body.periodo or mat["periodo"], body.horas, body.horas_extensao, curso, codigo))
        db.commit()
        registrar_log(f"MATÉRIA EDITADA: {codigo} - {nome} ({body.horas}h, {body.horas_extensao}h de extensão).")
        return {"mensagem": f"Matéria '{nome}' atualizada!"}

    opt = db.execute("SELECT tipo FROM optativas WHERE id = ?", (codigo,)).fetchone()
    if not opt:
        raise HTTPException(status_code=404, detail="Matéria não encontrada.")
    tipo = body.tipo or opt["tipo"]
    if tipo not in TIPOS_OPTATIVA:
        raise HTTPException(status_code=400, detail="Tipo de optativa inválido.")
    db.execute("UPDATE optativas SET nome = ?, horas = ?, horas_extensao = ?, tipo = ? WHERE id = ?",
               (nome, body.horas, body.horas_extensao, tipo, codigo))
    if body.cursos:
        cursos = sorted(set(body.cursos))
        for c in cursos:
            if not db.execute("SELECT 1 FROM materias WHERE curso = ? LIMIT 1", (c,)).fetchone():
                raise HTTPException(status_code=400, detail=f"Curso inexistente: {c}.")
        db.execute("DELETE FROM optativas_cursos WHERE optativa_id = ?", (codigo,))
        db.executemany("INSERT INTO optativas_cursos (optativa_id, curso) VALUES (?, ?)", [(codigo, c) for c in cursos])
    db.commit()
    registrar_log(f"OPTATIVA EDITADA: {codigo} - {nome} ({body.horas}h, {body.horas_extensao}h de extensão).")
    return {"mensagem": f"Optativa '{nome}' atualizada!"}


@admin_router.get("/requisitos")
def listar_requisitos(db: sqlite3.Connection = Depends(get_db)):
    """Horas complementares e de extensão exigidas em cada curso."""
    cursos = [r["curso"] for r in db.execute(
        "SELECT curso FROM materias UNION SELECT curso FROM requisitos_curso ORDER BY curso")]
    saida = []
    for c in cursos:
        comp, ext = _requisitos(db, c)
        saida.append({"curso": c, "horas_complementares": comp, "horas_extensao": ext})
    return saida


@admin_router.put("/requisitos/{curso}")
def salvar_requisitos(curso: str, body: RequisitosIn, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM materias WHERE curso = ? LIMIT 1", (curso,)).fetchone():
        raise HTTPException(status_code=404, detail="Curso não encontrado.")
    db.execute(
        "INSERT INTO requisitos_curso (curso, horas_complementares, horas_extensao) VALUES (?, ?, ?) "
        "ON CONFLICT(curso) DO UPDATE SET horas_complementares = excluded.horas_complementares, "
        "horas_extensao = excluded.horas_extensao",
        (curso, body.horas_complementares, body.horas_extensao))
    db.commit()
    registrar_log(f"REQUISITOS DE {curso}: {body.horas_complementares}h complementares, {body.horas_extensao}h de extensão.")
    return {"mensagem": f"Requisitos de {curso} salvos!"}


@admin_router.post("/importar")
def importar_backup(body: BackupImport, db: sqlite3.Connection = Depends(get_db)):
    """Importa um backup gerado por /exportar/backup. Só acrescenta: nada existente é sobrescrito
    e importar o mesmo arquivo duas vezes não duplica lançamentos."""
    d = body.dados
    if d.get("formato") != FORMATO_BACKUP:
        raise HTTPException(status_code=400, detail="Este arquivo não é um backup do Gestão UFF.")

    novos = {"materias": 0, "optativas": 0, "alunos": 0, "lancamentos": 0, "eventos": 0, "turmas": 0, "complementares": 0}
    ja_existiam = ignorados = 0
    try:
        for m in d.get("materias", []):
            novos["materias"] += db.execute(
                "INSERT OR IGNORE INTO materias (id, nome, periodo, horas, curso, horas_extensao) VALUES (?, ?, ?, ?, ?, ?)",
                (m["id"], m["nome"], m["periodo"], m["horas"], m["curso"], m.get("horas_extensao", 0))).rowcount
        for x in d.get("dependencias", []):
            db.execute("INSERT OR IGNORE INTO dependencias (pre, pos) VALUES (?, ?)", (x["pre"], x["pos"]))
        for o in d.get("optativas", []):
            tipo = o.get("tipo", "Tecnológica")
            if tipo not in TIPOS_OPTATIVA:
                raise ValueError("tipo de optativa inválido")
            novos["optativas"] += db.execute(
                "INSERT OR IGNORE INTO optativas (id, nome, horas, tipo, horas_extensao) VALUES (?, ?, ?, ?, ?)",
                (o["id"], o["nome"], o["horas"], tipo, o.get("horas_extensao", 0))).rowcount
        for c in d.get("conquistas_config", []):  # só acrescenta; as que já existem (editadas no Admin) ficam como estão
            db.execute(
                "INSERT OR IGNORE INTO conquistas_config (id, nome, icone, categoria, descricao, metrica, parametro, metas, ativa, padrao, ordem) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (c["id"], c["nome"], c.get("icone", "🏅"), c.get("categoria", "Geral"), c.get("descricao", ""),
                 c["metrica"], c.get("parametro"), c["metas"], c.get("ativa", 1), c.get("padrao", 0), c.get("ordem", 0)))
        for x in d.get("optativas_cursos", []):
            db.execute("INSERT OR IGNORE INTO optativas_cursos (optativa_id, curso) VALUES (?, ?)",
                       (x["optativa_id"], x["curso"]))
        for b in d.get("optativas_blocos", []):
            db.execute("INSERT OR IGNORE INTO optativas_blocos (curso, tipo, horas, periodo) VALUES (?, ?, ?, ?)",
                       (b["curso"], b["tipo"], b["horas"], b["periodo"]))
        for rq in d.get("requisitos_curso", []):
            db.execute("INSERT OR IGNORE INTO requisitos_curso (curso) VALUES (?)", (rq["curso"],))
            # só preenche se o curso ainda não tinha meta definida neste banco
            db.execute("UPDATE requisitos_curso SET horas_complementares = ?, horas_extensao = ? "
                       "WHERE curso = ? AND horas_complementares = 0 AND horas_extensao = 0",
                       (rq["horas_complementares"], rq["horas_extensao"], rq["curso"]))
        for p in d.get("periodos_especiais", []):
            db.execute("INSERT OR IGNORE INTO periodos_especiais (periodo) VALUES (?)", (normalizar_periodo(p),))

        for a in d.get("alunos", []):
            foto = base64.b64decode(a["foto"], validate=True) if a.get("foto") else None
            if db.execute("SELECT 1 FROM alunos WHERE nome = ?", (a["nome"],)).fetchone():
                if foto:
                    db.execute("UPDATE alunos SET foto = ? WHERE nome = ? AND foto IS NULL", (foto, a["nome"]))
            else:
                db.execute("INSERT INTO alunos (nome, curso, apelido, foto) VALUES (?, ?, ?, ?)",
                           (a["nome"], a["curso"], a.get("apelido"), foto))
                novos["alunos"] += 1
            for h in a.get("historico", []):
                if h["status"] not in ("Concluída", "Inscrito", "Reprovado"):
                    raise ValueError("status inválido")
                if not db.execute("SELECT 1 FROM materias WHERE id = ? UNION SELECT 1 FROM optativas WHERE id = ?",
                                  (h["materia_id"], h["materia_id"])).fetchone():
                    ignorados += 1
                    continue
                chave = (a["nome"], h["materia_id"], h["status"], h.get("nota"), h.get("professor"), h.get("periodo_letivo"))
                if db.execute(
                    "SELECT 1 FROM historico WHERE aluno = ? AND materia_id = ? AND status = ? "
                    "AND nota IS ? AND professor IS ? AND periodo_letivo IS ?", chave
                ).fetchone():
                    ja_existiam += 1
                    continue
                db.execute(
                    "INSERT INTO historico (aluno, materia_id, status, nota, professor, periodo_letivo, faltas) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)", (*chave, int(h.get("faltas") or 0)))
                novos["lancamentos"] += 1
            for e in a.get("eventos", []):
                datetime.date.fromisoformat(e["data"])  # ValueError -> backup inválido
                ev_chave = (a["nome"], e.get("materia_id"), e["titulo"], e.get("tipo", "Outro"), e["data"], e.get("hora"))
                if db.execute(
                    "SELECT 1 FROM eventos WHERE aluno = ? AND materia_id IS ? AND titulo = ? AND tipo = ? "
                    "AND data = ? AND hora IS ?", ev_chave
                ).fetchone():
                    continue
                db.execute(
                    "INSERT INTO eventos (aluno, materia_id, titulo, tipo, data, hora, obs, grupo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (*ev_chave, e.get("obs"), e.get("grupo")))
                novos["eventos"] += 1

        # Atividades complementares (com comprovante, se o backup foi feito com ele)
        for a in d.get("alunos", []):
            for c in a.get("complementares", []):
                if c["atividade"] not in ATIV_POR_ID:
                    raise ValueError("atividade desconhecida")
                if db.execute(
                    "SELECT 1 FROM atividades_complementares WHERE aluno = ? AND atividade = ? AND descricao IS ? "
                    "AND quantidade = ? AND data IS ?",
                    (a["nome"], c["atividade"], c.get("descricao"), c["quantidade"], c.get("data"))
                ).fetchone():
                    continue
                pdf = _ler_pdf(c["comprovante"]) if c.get("comprovante") else None
                db.execute(
                    "INSERT INTO atividades_complementares (aluno, atividade, descricao, quantidade, data, comprovante, comprovante_nome) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (a["nome"], c["atividade"], c.get("descricao"), c["quantidade"], c.get("data"), pdf,
                     c.get("comprovante_nome") if pdf else None))
                novos["complementares"] += 1

        # Turmas do planejamento (só entram escolhas de alunos que existem neste banco)
        for t in d.get("turmas", []):
            valores = (t["semestre"], t["codigo"], t["nome"], t.get("dias") or "", t.get("inicio"), t.get("fim"),
                       t.get("professor"), t.get("sala"))
            existente = _turma_existente(db, *valores)
            turma_id = existente
            if turma_id is None:
                turma_id = db.execute(
                    "INSERT INTO turmas (semestre, codigo, nome, dias, inicio, fim, professor, sala, ch, periodo) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (*valores, t.get("ch"), t.get("periodo"))).lastrowid
                novos["turmas"] += 1
                db.execute("UPDATE turmas SET alunos_auto = ? WHERE id = ?", (0 if t.get("alunos_auto") == 0 else 1, turma_id))
                for aluno_apto in t.get("alunos_manual", []):
                    if db.execute("SELECT 1 FROM alunos WHERE nome = ?", (aluno_apto,)).fetchone():
                        db.execute("INSERT OR IGNORE INTO turma_alunos (turma_id, aluno) VALUES (?, ?)", (turma_id, aluno_apto))
            for aluno_escolha in t.get("escolhas", []):
                if db.execute("SELECT 1 FROM alunos WHERE nome = ?", (aluno_escolha,)).fetchone():
                    db.execute("INSERT OR IGNORE INTO turma_escolhas (turma_id, aluno) VALUES (?, ?)",
                               (turma_id, aluno_escolha))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except (KeyError, TypeError, ValueError, AttributeError, sqlite3.Error):
        db.rollback()
        raise HTTPException(status_code=400, detail="Backup inválido ou corrompido. Nada foi importado.")

    resumo = (f"{novos['alunos']} aluno(s) novo(s), {novos['lancamentos']} lançamento(s) adicionado(s), "
              f"{novos['materias']} matéria(s) e {novos['optativas']} optativa(s) novas")
    if novos["eventos"]:
        resumo += f"; {novos['eventos']} data(s) de calendário"
    if novos["turmas"]:
        resumo += f"; {novos['turmas']} turma(s) do planejamento"
    if novos["complementares"]:
        resumo += f"; {novos['complementares']} atividade(s) complementar(es)"
    if ja_existiam:
        resumo += f"; {ja_existiam} lançamento(s) já existiam"
    if ignorados:
        resumo += f"; {ignorados} ignorado(s) por matéria desconhecida"
    registrar_log(f"IMPORTAÇÃO: {resumo}.")
    return {"mensagem": f"Importação concluída: {resumo}."}


@admin_router.delete("/alunos/{nome}")
def excluir_aluno(nome: str, db: sqlite3.Connection = Depends(get_db)):
    if not db.execute("SELECT 1 FROM alunos WHERE nome = ?", (nome,)).fetchone():
        raise HTTPException(status_code=404, detail="Aluno não encontrado")
    db.execute("DELETE FROM historico WHERE aluno = ?", (nome,))
    db.execute("DELETE FROM eventos WHERE aluno = ?", (nome,))
    db.execute("DELETE FROM turma_escolhas WHERE aluno = ?", (nome,))
    db.execute("DELETE FROM turma_alunos WHERE aluno = ?", (nome,))
    db.execute("DELETE FROM atividades_complementares WHERE aluno = ?", (nome,))
    db.execute("DELETE FROM alunos WHERE nome = ?", (nome,))
    db.commit()
    registrar_log(f"ALERTA: aluno '{nome}' e todo o seu histórico foram apagados.")
    return {"mensagem": f"Aluno '{nome}' removido do sistema."}


@admin_router.get("/periodos-especiais")
def listar_periodos_especiais(db: sqlite3.Connection = Depends(get_db)):
    rows = db.execute("SELECT periodo FROM periodos_especiais ORDER BY periodo").fetchall()
    return {"periodos": [r["periodo"] for r in rows]}


@admin_router.post("/periodos-especiais")
def cadastrar_periodo_especial(body: PeriodoEspecialCreate, db: sqlite3.Connection = Depends(get_db)):
    periodo = normalizar_periodo(body.periodo)
    try:
        db.execute("INSERT INTO periodos_especiais (periodo) VALUES (?)", (periodo,))
        db.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Este período especial já está cadastrado!")
    registrar_log(f"PERÍODO ESPECIAL: {periodo} cadastrado (reprovações não contam no CR).")
    return {"mensagem": f"Período {periodo} cadastrado como especial."}


@admin_router.delete("/periodos-especiais/{periodo}")
def remover_periodo_especial(periodo: str, db: sqlite3.Connection = Depends(get_db)):
    db.execute("DELETE FROM periodos_especiais WHERE periodo = ?", (periodo,))
    db.commit()
    registrar_log(f"PERÍODO ESPECIAL: {periodo} removido.")
    return {"mensagem": f"Período {periodo} não é mais especial."}


app.include_router(admin_router)