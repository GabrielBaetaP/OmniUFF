const MEDALHAS = ['👑 1º', '🥈 2º', '🥉 3º'];

const nd = '—';
const num = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Cada critério diz como ordenar (chave: maior vence), o que mostrar e o que explicar.
// Nenhum usa o CR.
const CRITERIOS = [
    {
        id: 'horas', rotulo: 'Horas concluídas', coluna: 'Horas concluídas',
        desc: 'Soma das horas das matérias concluídas (optativas contam até o limite do bloco).',
        chave: r => r.horas_concluidas,
        valor: r => `${num(r.horas_concluidas)}h`,
        detalhe: r => `${num(r.progresso)}% do curso`
    },
    {
        id: 'progresso', rotulo: 'Progresso do curso', coluna: 'Progresso',
        desc: 'Horas concluídas ÷ horas totais do curso. É o mais justo entre cursos de tamanhos diferentes.',
        chave: r => r.progresso,
        valor: r => `${num(r.progresso)}%`,
        detalhe: r => `${num(r.horas_concluidas)}h de ${num(r.horas_totais)}h`
    },
    {
        id: 'aprovadas', rotulo: 'Matérias aprovadas', coluna: 'Aprovadas',
        desc: 'Quantidade de matérias diferentes em que o aluno foi aprovado.',
        chave: r => r.aprovadas,
        valor: r => `${r.aprovadas}`,
        detalhe: r => r.reprovacoes ? `${r.reprovacoes} reprovação(ões)` : 'sem reprovações'
    },
    {
        id: 'aproveitamento', rotulo: 'Aproveitamento', coluna: 'Aproveitamento',
        desc: 'Aprovações ÷ (aprovações + reprovações). Reprovação em período especial não conta. Empates dividem a posição.',
        chave: r => r.aproveitamento,
        valor: r => r.aproveitamento === null ? nd : `${num(r.aproveitamento)}%`,
        detalhe: r => `${r.aprovadas} aprovada(s) · ${r.reprovacoes} reprovação(ões)`
    },
    {
        id: 'ritmo', rotulo: 'Ritmo', coluna: 'Horas por semestre',
        desc: 'Horas concluídas ÷ número de semestres em que o aluno teve aprovação. Mostra quem avança mais rápido.',
        chave: r => r.ritmo,
        valor: r => r.ritmo === null ? nd : `${num(r.ritmo)}h`,
        detalhe: r => `${r.semestres} semestre(s)`
    },
    {
        id: 'conquistas', rotulo: 'Conquistas', coluna: 'Pontos de conquistas',
        desc: 'Pontos das conquistas do perfil do aluno (Bronze 1, Prata 2, Ouro 3, Diamante 5).',
        chave: r => r.pontos_conquistas,
        valor: r => `${r.pontos_conquistas} pts`,
        detalhe: r => `${r.conquistas_desbloqueadas} níveis · máx. ${r.pontos_maximos}`
    },
    {
        id: 'extra', rotulo: 'Extensão + complementares', coluna: 'Horas extras',
        desc: 'Horas de extensão concluídas somadas às atividades complementares (AC) lançadas.',
        chave: r => r.horas_extra,
        valor: r => `${num(r.horas_extra)}h`,
        detalhe: r => `${num(r.extensao)}h extensão · ${num(r.complementares)}h AC`
    }
];

const abasCriterio = document.getElementById('abasCriterio');
const descCriterio = document.getElementById('descCriterio');
const abas = document.getElementById('abasCurso');
const container = document.getElementById('tabelaRanking');

let ranking = [];
let cursoAtivo = 'Todos';
let criterioAtivo = 'horas';

document.addEventListener('DOMContentLoaded', async () => {
    renderizarCriterios();
    try {
        ranking = await api('/ranking');
        renderizarAbas();
        renderizarTabela();
    } catch (e) {
        container.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
});

function renderizarCriterios() {
    abasCriterio.innerHTML = CRITERIOS
        .map(c => `<button class="tab ${c.id === criterioAtivo ? 'ativa' : ''}" data-criterio="${c.id}">${escapeHtml(c.rotulo)}</button>`)
        .join('');
    descCriterio.textContent = CRITERIOS.find(c => c.id === criterioAtivo).desc;
}

function renderizarAbas() {
    const cursos = ['Todos', ...new Set(ranking.map(r => r.curso))];
    abas.innerHTML = cursos
        .map(c => `<button class="tab ${c === cursoAtivo ? 'ativa' : ''}" data-curso="${escapeHtml(c)}">${escapeHtml(c)}</button>`)
        .join('');
}

function renderizarTabela() {
    renderizarLideres();
    const criterio = CRITERIOS.find(c => c.id === criterioAtivo);
    const lista = (cursoAtivo === 'Todos' ? ranking : ranking.filter(r => r.curso === cursoAtivo))
        .slice()
        // Quem não tem o dado (null) vai para o fim; desempate por horas e depois por nome
        .sort((a, b) => (criterio.chave(b) ?? -Infinity) - (criterio.chave(a) ?? -Infinity)
            || b.horas_concluidas - a.horas_concluidas
            || a.aluno.localeCompare(b.aluno));

    if (lista.length === 0) {
        container.innerHTML = '<p class="msg-vazia">Nenhum aluno registrado neste curso.</p>';
        return;
    }

    // Empate no critério = mesma posição (ex.: dois alunos com 100% de aproveitamento)
    let posicao = 0;
    const linhas = lista.map((r, i) => {
        if (i === 0 || criterio.chave(r) !== criterio.chave(lista[i - 1])) posicao = i + 1;
        const semDado = criterio.chave(r) === null || criterio.chave(r) === undefined;
        return `
        <tr class="linha-aluno" data-nome="${escapeHtml(r.aluno)}">
            <td class="pos">${semDado ? nd : (MEDALHAS[posicao - 1] ?? `${posicao}º`)}</td>
            <td><div class="aluno-cel">${avatarHtml(r.aluno, r.tem_foto)}<span>${escapeHtml(r.aluno)}</span></div></td>
            <td class="curso">${escapeHtml(r.curso)}</td>
            <td class="horas">${criterio.valor(r)}<div class="sub-valor">${escapeHtml(criterio.detalhe(r))}</div></td>
        </tr>`;
    }).join('');

    container.innerHTML = `
        <table class="ranking-table">
            <thead>
                <tr><th>Posição</th><th>Aluno</th><th>Curso</th><th>${escapeHtml(criterio.coluna)}</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
        </table>
    `;
}

// Quem lidera cada categoria (mostra, de uma vez, que cada critério premia algo diferente)
function renderizarLideres() {
    const alvo = document.getElementById('lideres');
    const lista = cursoAtivo === 'Todos' ? ranking : ranking.filter(r => r.curso === cursoAtivo);
    if (lista.length === 0) { alvo.innerHTML = ''; return; }
    alvo.innerHTML = CRITERIOS.map(c => {
        const validos = lista.filter(r => c.chave(r) !== null && c.chave(r) !== undefined);
        if (validos.length === 0) return '';
        const melhor = Math.max(...validos.map(c.chave));
        const lideres = validos.filter(r => c.chave(r) === melhor);
        return `
            <div class="lider-card">
                <div class="lider-rotulo">${escapeHtml(c.rotulo)}</div>
                <div class="lider-nomes">${lideres.map(r => escapeHtml(r.aluno.split(' ')[0])).join(' · ')}</div>
                <div class="lider-valor">${c.valor(lideres[0])}${lideres.length > 1 ? ' (empate)' : ''}</div>
            </div>`;
    }).join('');
}

abasCriterio.addEventListener('click', (e) => {
    const botao = e.target.closest('.tab');
    if (!botao) return;
    criterioAtivo = botao.dataset.criterio;
    renderizarCriterios();
    renderizarTabela();
});

abas.addEventListener('click', (e) => {
    const botao = e.target.closest('.tab');
    if (!botao) return;
    cursoAtivo = botao.dataset.curso;
    renderizarAbas();
    renderizarTabela();
});

// Clicar em um aluno abre a página dele
container.addEventListener('click', (e) => {
    const linha = e.target.closest('.linha-aluno');
    if (linha) location.href = `aluno.html?nome=${encodeURIComponent(linha.dataset.nome)}`;
});