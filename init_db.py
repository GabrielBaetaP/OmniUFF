import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent / "faculdade.db"

CC = "Ciência da Computação"
SI = "Sistemas de Informação"

# Optativas formam blocos por tipo: (curso, tipo, horas do bloco, período em que aparecem na grade)
BLOCOS_OPTATIVAS = [
    (CC, "Tecnológica", 240, 8),
    (CC, "Humanística", 120, 8),
]

# (código, nome, período, horas)
MATERIAS_CC = [
    ('GAN00167', 'Matemática Discreta', 1, 60),
    ('GGM00137', 'Fundamentos de Cálculo e Geometria', 1, 60),
    ('TCC00296', 'Fund. de Arquiteturas de Computadores', 1, 64),
    ('TCC00308', 'Programação de Computadores I', 1, 64),
    ('TCC00346', 'Lab. de Resolução de Problemas', 1, 32),
    ('GAN00140', 'Álgebra Linear', 2, 60),
    ('GMA00154', 'Cálculo 1', 2, 60),
    ('TCC00301', 'Lab. de Programação de Jogos', 2, 32),
    ('TCC00347', 'Programação Estruturada', 2, 64),
    ('TET00347', 'Circuitos Digitais para C.C.', 2, 68),
    ('GAN00166', 'Lógica para a Ciência da Computação', 3, 60),
    ('GFI00158', 'Física I', 3, 68),
    ('GMA00155', 'Cálculo 2', 3, 60),
    ('TCC00286', 'Arquiteturas de Computadores', 3, 64),
    ('TCC00328', 'Programação Orientada a Objetos', 3, 68),
    ('TCC00348', 'Estruturas de Dados e Seus Algoritmos', 3, 64),
    ('GET00177', 'Estatística Básica', 4, 60),
    ('TCC00287', 'Banco de Dados I', 4, 64),
    ('TCC00292', 'Engenharia de Software I', 4, 64),
    ('TCC00304', 'Linguagens de Programação', 4, 64),
    ('TCC00306', 'Métodos Numéricos', 4, 64),
    ('TCC00316', 'Sistemas Operacionais', 4, 64),
    ('TCC00226', 'Desenvolvimento Web', 5, 68),
    ('TCC00285', 'Análise e Projeto de Algoritmos', 5, 64),
    ('TCC00288', 'Banco de Dados II', 5, 64),
    ('TCC00312', 'Projeto de Software', 5, 64),
    ('TCC00313', 'Redes de Computadores I', 5, 64),
    ('TCC00349', 'Avaliação de Desempenho', 5, 64),
    ('TCC00284', 'Algoritmos em Grafos', 6, 64),
    ('TCC00291', 'Computação Gráfica', 6, 64),
    ('TCC00293', 'Engenharia de Software II', 6, 64),
    ('TCC00305', 'Ling. Formais e Teoria da Computação', 6, 64),
    ('TCC00307', 'Programação Científica', 6, 64),
    ('TCC00314', 'Redes de Computadores II', 6, 64),
    ('TCC00289', 'Compiladores', 7, 64),
    ('TCC00297', 'Inteligência Artificial', 7, 64),
    ('TCC00298', 'Interface Homem-Máquina', 7, 64),
    ('TCC00315', 'Sistemas Distribuídos', 7, 64),
    ('TCC00318', 'Pesquisa Operacional', 7, 64),
    ('TCC00344', 'Lab. de Programação Paralela I', 7, 60),
    ('TCC00351', 'Projeto Final I-A', 7, 90),
    ('TCC00290', 'Computação e Sociedade', 8, 32),
    ('TCC00352', 'Projeto Final II-A', 8, 90),
]

# (pré-requisito, matéria que depende dele)
DEPS_CC = [
    ('GGM00137', 'GAN00140'), ('TCC00308', 'TCC00301'), ('TCC00308', 'TCC00347'),
    ('TCC00296', 'TET00347'), ('GAN00167', 'GAN00166'), ('GMA00154', 'GFI00158'),
    ('GAN00140', 'GMA00155'), ('GMA00154', 'GMA00155'), ('TET00347', 'TCC00286'),
    ('TCC00347', 'TCC00328'), ('TCC00347', 'TCC00348'), ('GMA00155', 'GET00177'),
    ('TCC00348', 'TCC00287'), ('TCC00328', 'TCC00292'), ('TCC00347', 'TCC00304'),
    ('GAN00166', 'TCC00304'), ('TCC00308', 'TCC00306'), ('GAN00140', 'TCC00306'),
    ('GMA00154', 'TCC00306'), ('TCC00286', 'TCC00316'), ('TCC00328', 'TCC00226'),
    ('TCC00287', 'TCC00226'), ('GAN00167', 'TCC00226'), ('TCC00348', 'TCC00285'),
    ('TCC00287', 'TCC00288'), ('TCC00292', 'TCC00312'), ('TCC00316', 'TCC00313'),
    ('GET00177', 'TCC00349'), ('TCC00285', 'TCC00284'), ('GAN00140', 'TCC00284'),
    ('TCC00348', 'TCC00291'), ('TCC00292', 'TCC00293'), ('GAN00166', 'TCC00305'),
    ('TCC00306', 'TCC00307'), ('TCC00313', 'TCC00314'), ('TCC00348', 'TCC00289'),
    ('TCC00304', 'TCC00289'), ('TCC00305', 'TCC00289'), ('GAN00166', 'TCC00289'),
    ('TCC00348', 'TCC00297'), ('TCC00292', 'TCC00298'), ('TCC00316', 'TCC00315'),
    ('GAN00140', 'TCC00318'), ('TCC00347', 'TCC00318'), ('TCC00348', 'TCC00344'),
    ('TCC00316', 'TCC00344'), ('GET00177', 'TCC00351'), ('TCC00287', 'TCC00351'),
    ('TCC00292', 'TCC00351'), ('TCC00304', 'TCC00351'), ('TCC00316', 'TCC00351'),
    ('TCC00351', 'TCC00352'),
]

MATERIAS_SI = [
    ('CG100004', 'Seminários em Sistemas de Informação', 1, 20),
    ('TCC00332', 'Fundamentos de Sistemas de Informação', 1, 68),
    ('TCC00354', 'Fundamentos Matemáticos para Computação', 1, 68),
    ('TCC00355', 'Lab. de Resolução de Problemas', 1, 68),
    ('TCC00366', 'Programação de Computadores I', 1, 64),
    ('GAN00144', 'Complementos de Matemática Aplicada', 2, 60),
    ('GS100433', 'Comportamento Organizacional', 2, 68),
    ('STA00267', 'Modelos de Gestão Contemporânea', 2, 68),
    ('TCC00356', 'Programação de Computadores II', 2, 68),
    ('GET00116', 'Fundamentos de Estatística Aplicada', 3, 60),
    ('SDV00143', 'Propriedade Intelectual', 3, 68),
    ('TCC00331', 'Estruturas de Dados para Sist. Info.', 3, 68),
    ('TCC00358', 'Sistemas Computacionais', 3, 68),
    ('GC100116', 'Ética e Informação', 4, 60),
    ('STA00168', 'Desenvolvimento de Pessoas', 4, 60),
    ('TCC00334', 'Princípios de Banco de Dados', 4, 68),
    ('TCC00357', 'Programação Orientada a Objetos I', 4, 68),
    ('TCC00359', 'Redes de Computadores', 4, 68),
    ('GC100126', 'Representação da Informação', 5, 60),
    ('TCC00225', 'Engenharia de Software', 5, 68),
    ('TCC00335', 'Projeto de Banco de Dados para SI', 5, 68),
    ('TCC00337', 'Introdução a Interação Humano-Computador', 5, 68),
    ('TCC00362', 'Sistemas Distribuídos para SI', 5, 68),
    ('TCC00336', 'Bancos de Dados Não Convencionais', 6, 68),
    ('TCC00338', 'Projeto de Software (SI)', 6, 68),
    ('TCC00360', 'Visualização de Dados', 6, 68),
    ('TCC00361', 'Introdução ao Desenvolvimento Web', 6, 68),
    ('CG100002', 'Projeto de Aplicação I', 7, 180),
    ('TCC00330', 'Modelagem de Processos de Negócios', 7, 68),
    ('TCC00341', 'Segurança da Informação', 7, 68),
    ('TCC00363', 'Gerência de Projeto e Manutenção de Software', 7, 68),
    ('TCC00364', 'Desenvolvimento Web Avançado', 7, 68),
    ('CG100003', 'Projeto de Aplicação II', 8, 180),
    ('STA00191', 'Inteligência de Negócios', 8, 60),
    ('TCC00222', 'Computação e Sociedade para SI', 8, 68),
    ('TCC00324', 'Governança em Tecnologia da Informação', 8, 68),
    ('TCC00365', 'Qualidade e Teste de Software', 8, 68),
]

DEPS_SI = [
    ('TCC00366', 'TCC00356'), ('GAN00144', 'GET00116'), ('TCC00356', 'TCC00331'),
    ('TCC00356', 'TCC00358'), ('TCC00356', 'GC100116'), ('TCC00366', 'STA00168'),
    ('TCC00356', 'TCC00334'), ('TCC00331', 'TCC00357'), ('TCC00358', 'TCC00359'),
    ('TCC00356', 'GC100126'), ('TCC00357', 'TCC00225'), ('TCC00331', 'TCC00335'),
    ('TCC00334', 'TCC00335'), ('TCC00359', 'TCC00362'), ('TCC00334', 'TCC00336'),
    ('TCC00225', 'TCC00338'), ('TCC00334', 'TCC00360'), ('TCC00334', 'TCC00361'),
    ('TCC00357', 'TCC00361'), ('TCC00359', 'TCC00341'), ('TCC00225', 'TCC00363'),
    ('TCC00361', 'TCC00364'), ('CG100002', 'CG100003'), ('TCC00331', 'STA00191'),
    ('TCC00357', 'TCC00222'), ('TCC00225', 'TCC00324'), ('TCC00225', 'TCC00365'),
]


# Conquistas que já vêm prontas: (id, nome, ícone, categoria, descrição, métrica, parâmetro, metas por nível).
# Ficam no banco (tabela conquistas_config): o Admin pode editar, desativar ou criar novas.
CONQUISTAS_PADRAO = [
    ("caminhada", "Caminhada", "🧭", "Progresso", "Porcentagem do curso concluída", "progresso_pct", None, "25,50,75,100"),
    ("aprovacoes", "Matérias aprovadas", "✅", "Progresso", "Matérias diferentes concluídas", "aprovadas", None, "10,20,30,40"),
    ("veterano", "Veterano", "🎓", "Constância", "Semestres com pelo menos uma aprovação", "semestres", None, "2,4,6,8"),
    ("sem_tropecos", "Sem tropeços", "🔥", "Constância", "Maior sequência de semestres sem reprovação",
     "sequencia_sem_reprovacao", None, "2,4,6,8"),
    ("semestre_pesado", "Semestre pesado", "🏋️", "Dedicação", "Maior número de aprovações em um único semestre",
     "max_aprovadas_semestre", None, "4,5,6,7"),
    ("volta_por_cima", "Volta por cima", "💪", "Dedicação", "Matérias aprovadas depois de uma reprovação",
     "aprovadas_apos_reprovacao", None, "1,2,3,5"),
    ("destaque", "Destaque", "⭐", "Desempenho", "Matérias concluídas com nota 9 ou mais", "notas_minimas", "9", "1,5,10,15"),
    ("semestre_ouro", "Semestre de ouro", "🏆", "Desempenho", "Melhor média de um semestre",
     "melhor_media_semestre", None, "7.5,8.5,9,9.5"),
    ("extensionista", "Extensionista", "🤝", "Formação", "Meta de horas de extensão", "extensao_pct", None, "25,50,75,100"),
    ("colecionador_ac", "Colecionador de AC", "📎", "Formação", "Meta de atividades complementares",
     "complementares_pct", None, "25,50,75,100"),
]


def _adicionar_coluna(cursor, tabela, coluna, definicao):
    """Migração para bancos antigos: só adiciona a coluna se ela não existir."""
    colunas = [row[1] for row in cursor.execute(f"PRAGMA table_info({tabela})")]
    if coluna not in colunas:
        cursor.execute(f"ALTER TABLE {tabela} ADD COLUMN {coluna} {definicao}")


def _migrar_cards_optativa(cursor):
    """Os antigos cards fixos OPT01..OPT06 deixam de existir: as optativas agora são blocos de horas.
    Lançamentos feitos neles passam a apontar para a própria optativa do catálogo."""
    cursor.execute(
        "UPDATE historico SET materia_id = optativa_id, optativa_id = NULL "
        "WHERE optativa_id IS NOT NULL AND materia_id GLOB 'OPT0[0-9]'"
    )
    # Lançamentos antigos sem optativa escolhida viram uma optativa genérica de 60h
    for (slot,) in cursor.execute("SELECT DISTINCT materia_id FROM historico WHERE materia_id GLOB 'OPT0[0-9]'").fetchall():
        row = cursor.execute("SELECT nome FROM materias WHERE id = ?", (slot,)).fetchone()
        novo = f"{slot}-ANTIGA"
        cursor.execute(
            "INSERT OR IGNORE INTO optativas (id, nome, horas, tipo) VALUES (?, ?, 60, 'Tecnológica')",
            (novo, f"{row[0] if row else slot} (lançamento antigo)"),
        )
        cursor.execute("INSERT OR IGNORE INTO optativas_cursos (optativa_id, curso) VALUES (?, ?)", (novo, CC))
        cursor.execute("UPDATE historico SET materia_id = ? WHERE materia_id = ?", (novo, slot))
    cursor.execute("DELETE FROM materias WHERE id GLOB 'OPT0[0-9]'")


def _popular_curso(cursor, curso, materias, dependencias):
    """Insere a matriz do curso apenas se ele ainda não tiver matérias."""
    cursor.execute("SELECT COUNT(*) FROM materias WHERE curso = ?", (curso,))
    if cursor.fetchone()[0] > 0:
        return
    cursor.executemany(
        "INSERT OR IGNORE INTO materias (id, nome, periodo, horas, curso) VALUES (?, ?, ?, ?, ?)",
        [(i, n, p, h, curso) for i, n, p, h in materias],
    )
    cursor.executemany("INSERT OR IGNORE INTO dependencias (pre, pos) VALUES (?, ?)", dependencias)


def inicializar_banco():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS materias (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        periodo INTEGER NOT NULL,
        horas INTEGER NOT NULL,
        curso TEXT DEFAULT 'Ciência da Computação'
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS dependencias (
        pre TEXT,
        pos TEXT,
        PRIMARY KEY (pre, pos),
        FOREIGN KEY (pre) REFERENCES materias (id),
        FOREIGN KEY (pos) REFERENCES materias (id)
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS alunos (
        nome TEXT PRIMARY KEY,
        curso TEXT DEFAULT 'Ciência da Computação',
        foto BLOB
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS historico (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aluno TEXT,
        materia_id TEXT,
        status TEXT NOT NULL,
        nota REAL,
        professor TEXT,
        periodo_letivo TEXT,
        FOREIGN KEY (materia_id) REFERENCES materias (id)
    )''')

    # Períodos letivos especiais (ex: 2023.2): reprovações neles não contam no CR
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS periodos_especiais (
        periodo TEXT PRIMARY KEY
    )''')

    # Catálogo de optativas (podem valer para mais de um curso)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS optativas (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        horas INTEGER NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'Tecnológica'
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS optativas_blocos (
        curso TEXT,
        tipo TEXT,
        horas INTEGER NOT NULL,
        periodo INTEGER NOT NULL,
        PRIMARY KEY (curso, tipo)
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS optativas_cursos (
        optativa_id TEXT,
        curso TEXT,
        PRIMARY KEY (optativa_id, curso),
        FOREIGN KEY (optativa_id) REFERENCES optativas (id)
    )''')

    # Datas importantes (provas, trabalhos...) das matérias em curso
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aluno TEXT NOT NULL,
        materia_id TEXT,
        titulo TEXT NOT NULL,
        tipo TEXT NOT NULL DEFAULT 'Outro',
        data TEXT NOT NULL,
        hora TEXT,
        obs TEXT
    )''')

    # Planejamento: turmas oferecidas no semestre e quem escolheu cada uma
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS turmas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        semestre TEXT NOT NULL,
        codigo TEXT NOT NULL,
        nome TEXT NOT NULL,
        dias TEXT NOT NULL DEFAULT '',
        inicio TEXT,
        fim TEXT,
        professor TEXT,
        sala TEXT,
        ch INTEGER,
        periodo INTEGER
    )''')

    cursor.execute('''
    CREATE TABLE IF NOT EXISTS turma_escolhas (
        turma_id INTEGER NOT NULL,
        aluno TEXT NOT NULL,
        PRIMARY KEY (turma_id, aluno)
    )''')

    # Lista manual de "alunos que podem cursar" (usada quando a turma não está em modo automático)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS turma_alunos (
        turma_id INTEGER NOT NULL,
        aluno TEXT NOT NULL,
        PRIMARY KEY (turma_id, aluno)
    )''')

    # Horas exigidas para formar, por curso (0 = ainda não definido no Admin)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS requisitos_curso (
        curso TEXT PRIMARY KEY,
        horas_complementares INTEGER NOT NULL DEFAULT 0,
        horas_extensao INTEGER NOT NULL DEFAULT 0
    )''')

    # Atividades complementares (AC) do aluno, com o comprovante em PDF
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS atividades_complementares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        aluno TEXT NOT NULL,
        atividade TEXT NOT NULL,
        descricao TEXT,
        quantidade REAL NOT NULL,
        data TEXT,
        comprovante BLOB,
        comprovante_nome TEXT
    )''')

    # Conquistas configuráveis pelo Admin (calculadas automaticamente a partir do histórico do aluno)
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS conquistas_config (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        icone TEXT NOT NULL DEFAULT '🏅',
        categoria TEXT NOT NULL DEFAULT 'Geral',
        descricao TEXT NOT NULL DEFAULT '',
        metrica TEXT NOT NULL,
        parametro TEXT,
        metas TEXT NOT NULL,
        ativa INTEGER NOT NULL DEFAULT 1,
        padrao INTEGER NOT NULL DEFAULT 0,
        ordem INTEGER NOT NULL DEFAULT 0
    )''')

    # Migração de bancos antigos
    _adicionar_coluna(cursor, "eventos", "grupo", "TEXT")  # datas compartilhadas entre alunos
    _adicionar_coluna(cursor, "materias", "horas_extensao", "INTEGER NOT NULL DEFAULT 0")
    _adicionar_coluna(cursor, "optativas", "horas_extensao", "INTEGER NOT NULL DEFAULT 0")
    _adicionar_coluna(cursor, "turmas", "alunos_auto", "INTEGER NOT NULL DEFAULT 1")
    _adicionar_coluna(cursor, "alunos", "apelido", "TEXT")
    _adicionar_coluna(cursor, "historico", "faltas", "INTEGER NOT NULL DEFAULT 0")
    _adicionar_coluna(cursor, "historico", "optativa_id", "TEXT")
    _adicionar_coluna(cursor, "optativas", "tipo", "TEXT NOT NULL DEFAULT 'Tecnológica'")
    _adicionar_coluna(cursor, "historico", "nota", "REAL")
    _adicionar_coluna(cursor, "historico", "professor", "TEXT")
    _adicionar_coluna(cursor, "historico", "periodo_letivo", "TEXT")
    _adicionar_coluna(cursor, "alunos", "foto", "BLOB")
    _adicionar_coluna(cursor, "alunos", "curso", "TEXT DEFAULT 'Ciência da Computação'")
    _adicionar_coluna(cursor, "materias", "curso", "TEXT DEFAULT 'Ciência da Computação'")

    # Garante que todo aluno com histórico exista na tabela alunos
    cursor.execute(
        "INSERT OR IGNORE INTO alunos (nome, curso) "
        "SELECT DISTINCT aluno, 'Ciência da Computação' FROM historico WHERE aluno IS NOT NULL"
    )

    _migrar_cards_optativa(cursor)

    cursor.executemany(
        "INSERT OR IGNORE INTO optativas_blocos (curso, tipo, horas, periodo) VALUES (?, ?, ?, ?)", BLOCOS_OPTATIVAS
    )

    cursor.executemany("INSERT OR IGNORE INTO requisitos_curso (curso) VALUES (?)", [(CC,), (SI,)])

    cursor.executemany(
        "INSERT OR IGNORE INTO conquistas_config (id, nome, icone, categoria, descricao, metrica, parametro, metas, padrao, ordem) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
        [(*c, i) for i, c in enumerate(CONQUISTAS_PADRAO)],
    )

    _popular_curso(cursor, CC, MATERIAS_CC, DEPS_CC)
    _popular_curso(cursor, SI, MATERIAS_SI, DEPS_SI)

    conn.commit()
    conn.close()
    print("Banco de dados 'faculdade.db' inicializado e validado com sucesso!")


if __name__ == '__main__':
    inicializar_banco()