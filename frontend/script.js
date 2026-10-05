const alunoSelect = document.getElementById('alunoSelect');
const resumoProgresso = document.getElementById('resumoProgresso');
const tituloTela = document.getElementById('tituloTela');
const gradeCurricular = document.getElementById('gradeCurricular');
const painelDetalhes = document.getElementById('painelDetalhes');
const visaoGeral = document.getElementById('visaoGeral');

let materiaSelecionada = null;

// === ALUNOS ===
async function carregarAlunos() {
    try {
        const alunos = await api('/alunos');
        alunoSelect.innerHTML = '<option value="">Selecione um aluno...</option>';
        alunos.forEach(a => alunoSelect.appendChild(new Option(a.nome, a.nome)));
    } catch (e) {
        alunoSelect.innerHTML = '<option value="">Erro ao conectar com a API</option>';
        mostrarToast(e.message, 'erro');
    }
}

// === PROGRESSO / GRADE ===
async function carregarProgresso() {
    const nome = alunoSelect.value;
    painelDetalhes.classList.remove('aberto');

    if (!nome) {
        tituloTela.innerText = "Visão Geral";
        gradeCurricular.innerHTML = '';
        gradeCurricular.classList.add('hidden');
        resumoProgresso.classList.add('hidden');
        document.getElementById('linkPerfil').classList.add('hidden');
        carregarVisaoGeral();
        return;
    }

    visaoGeral.classList.add('hidden');
    gradeCurricular.classList.remove('hidden');
    salvarUltimoAluno(nome);
    tituloTela.innerText = nome;
    const linkPerfil = document.getElementById('linkPerfil');
    linkPerfil.href = `aluno.html?nome=${encodeURIComponent(nome)}`;
    linkPerfil.classList.remove('hidden');
    try {
        const dados = await api(`/alunos/${encodeURIComponent(nome)}/progresso`);

        document.getElementById('infoCurso').innerText = dados.curso;
        document.getElementById('infoHoras').innerText = dados.horas_concluidas;
        document.getElementById('infoHorasInsc').innerText = dados.horas_inscritas;
        document.getElementById('infoPorcentagem').innerText = dados.progresso_percentual;
        document.getElementById('infoPorcentagemInsc').innerText = dados.progresso_com_inscritas_percentual;
        document.getElementById('barraProgresso').style.width = `${dados.progresso_percentual}%`;
        document.getElementById('barraInscritas').style.width = `${dados.progresso_com_inscritas_percentual}%`;
        renderizarRequisitos(dados);
        document.getElementById('linkComplementares').href = `aluno.html?nome=${encodeURIComponent(nome)}#complementares`;
        resumoProgresso.classList.remove('hidden');

        renderizarGrade(dados.grade);
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// Quanto o aluno já tem e quanto falta de horas de extensão e complementares
function renderizarRequisitos(dados) {
    const linha = (prefixo, r, emCurso) => {
        const meta = r.necessarias;
        const pct = meta ? Math.min(100, (r.concluidas / meta) * 100) : 0;
        const pctInsc = meta ? Math.min(100, ((r.concluidas + emCurso) / meta) * 100) : 0;
        document.getElementById(`${prefixo}Texto`).textContent = meta ? `${fmt(r.concluidas)} / ${fmt(meta)}h` : `${fmt(r.concluidas)}h`;
        document.getElementById(`${prefixo}Barra`).style.width = `${pct}%`;
        const barraInsc = document.getElementById(`${prefixo}BarraInsc`);
        if (barraInsc) barraInsc.style.width = `${pctInsc}%`;
        const detalhe = document.getElementById(`${prefixo}Detalhe`);
        detalhe.classList.toggle('ok', !!meta && r.faltam === 0);
        detalhe.textContent = !meta
            ? 'Meta do curso ainda não definida (Admin).'
            : r.faltam === 0 ? '✓ Meta cumprida'
            : `Faltam ${fmt(r.faltam)}h${emCurso ? ` · ${fmt(emCurso)}h em curso` : ''}`;
    };
    linha('ext', dados.extensao, dados.extensao.em_curso);
    linha('comp', dados.complementares, 0);
}

// === VISÃO GERAL (tela inicial, sem aluno selecionado) ===
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function diasAteData(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    const h = new Date();
    return Math.round((new Date(a, m - 1, d) - new Date(h.getFullYear(), h.getMonth(), h.getDate())) / 86400000);
}

function textoQuando(dias) {
    return dias === 0 ? 'hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`;
}

async function carregarVisaoGeral() {
    visaoGeral.classList.remove('hidden');
    try {
        visaoGeral.innerHTML = renderizarVisaoGeral(await api('/visao-geral'));
    } catch (e) {
        visaoGeral.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

function renderizarVisaoGeral(d) {
    if (d.alunos.length === 0) {
        return '<p class="msg-vazia">Nenhum aluno cadastrado ainda. Cadastre o primeiro em Admin → Alunos.</p>';
    }

    const cartoes = d.alunos.map(a => `
        <button class="aluno-card" data-nome="${escapeHtml(a.nome)}" title="Abrir a grade de ${escapeHtml(a.nome)}">
            <div class="aluno-card-topo">
                ${avatarHtml(a.nome, a.tem_foto)}
                <div><strong>${escapeHtml(a.nome)}</strong><span>${escapeHtml(a.curso)}</span></div>
            </div>
            <div class="barra-progresso-fundo">
                <div class="barra-progresso-inscritas" style="width:${a.progresso_com_inscritas}%"></div>
                <div class="barra-progresso-preenchimento" style="width:${a.progresso}%"></div>
            </div>
            <div class="aluno-card-numeros">
                <span class="pct-verde">${a.progresso}%</span>
                <span class="pct-azul">→ ${a.progresso_com_inscritas}% com inscritas</span>
            </div>
            <div class="aluno-card-rodape">
                <span>${a.horas_concluidas}h de ${a.horas_totais}h</span>
                <span>CR <b>${a.cr === null ? '—' : a.cr.toFixed(2)}</b></span>
                <span>${a.inscritas} em curso</span>
                <span title="Formatura prevista pelo ritmo atual">🎓 ${a.formatura ?? '—'}</span>
            </div>
        </button>`).join('');

    const datas = d.datas.length ? d.datas.map(e => {
        const [, m, dia] = e.data.split('-').map(Number);
        const dias = diasAteData(e.data);
        return `
            <div class="home-item">
                <div class="home-dia"><b>${dia}</b><span>${MESES_CURTOS[m - 1]}</span></div>
                <div class="home-item-corpo">
                    <div class="home-item-titulo"><span class="tag-tipo tipo-${escapeHtml(e.tipo)}">${escapeHtml(e.tipo)}</span>${escapeHtml(e.titulo)}</div>
                    <div class="home-item-sub">${escapeHtml(e.apelido)}${e.materia ? ` · ${escapeHtml(e.materia)}` : ''}${e.hora ? ` · ${escapeHtml(e.hora)}` : ''}</div>
                </div>
                <span class="home-quando ${dias <= 2 ? 'urgente' : ''}">${textoQuando(dias)}</span>
            </div>`;
    }).join('') : '<p class="msg-vazia">Nenhuma data cadastrada. Adicione provas e trabalhos na aba Inscritas.</p>';

    const faltas = d.faltas.length ? d.faltas.map(f => {
        const situacao = f.margem < 0 ? 'passou do limite' : f.margem === 0 ? 'no limite' : `pode faltar mais ${f.margem}`;
        return `
            <div class="home-item">
                <div class="home-item-corpo">
                    <div class="home-item-titulo">${escapeHtml(f.materia)}</div>
                    <div class="home-item-sub">${escapeHtml(f.apelido)} · ${f.faltas} de ${f.limite} faltas permitidas</div>
                </div>
                <span class="home-quando urgente">${situacao}</span>
            </div>`;
    }).join('') : '<p class="msg-vazia">Tudo certo: ninguém está perto do limite de faltas. 🎉</p>';

    return `
        <p class="home-sub">${d.semestre ? `Semestre ${escapeHtml(d.semestre)} · ` : ''}clique em um aluno para abrir a grade curricular</p>

        <div class="home-stats">
            <div class="home-stat"><span>Alunos</span><b>${d.totais.alunos}</b></div>
            <div class="home-stat"><span>Matérias em curso</span><b class="azul">${d.totais.em_curso}</b></div>
            <div class="home-stat"><span>Próximas datas</span><b>${d.datas.length}</b></div>
            <div class="home-stat"><span>Faltas em atenção</span><b class="${d.faltas.length ? 'alerta' : ''}">${d.faltas.length}</b></div>
        </div>

        <h2 class="home-titulo">Alunos</h2>
        <div class="home-alunos">${cartoes}</div>

        <div class="home-duas">
            <div>
                <h2 class="home-titulo">📅 Próximas datas</h2>
                <div class="home-lista">${datas}</div>
            </div>
            <div>
                <h2 class="home-titulo">⚠ Faltas em atenção</h2>
                <div class="home-lista">${faltas}</div>
            </div>
        </div>`;
}

visaoGeral.addEventListener('click', (e) => {
    const card = e.target.closest('.aluno-card');
    if (!card) return;
    alunoSelect.value = card.dataset.nome;
    carregarProgresso();
});

function renderizarGrade(materias) {
    gradeCurricular.innerHTML = '';

    const porPeriodo = {};
    materias.forEach(m => (porPeriodo[m.periodo] ??= []).push(m));

    Object.keys(porPeriodo).sort((a, b) => a - b).forEach(p => {
        const coluna = document.createElement('div');
        coluna.className = 'periodo-coluna';
        coluna.innerHTML = `<div class="periodo-titulo">${p}º Período</div>`;

        porPeriodo[p].forEach(m => {
            const card = document.createElement('div');
            card.className = `materia-card status-${m.status}`;
            card.innerHTML = `<strong>${escapeHtml(m.nome)}</strong><span>${m.horas}h</span>`;
            card.onclick = () => abrirPainel(m);
            coluna.appendChild(card);
        });

        gradeCurricular.appendChild(coluna);
    });
}

// === PAINEL LATERAL ===
function abrirPainel(materia) {
    materiaSelecionada = materia;
    document.getElementById('detalheNome').innerText = materia.nome;
    document.getElementById('detalheId').innerText = materia.id;
    document.getElementById('statusSelect').value = materia.status_real;
    document.getElementById('inputNota').value = materia.nota ?? '';
    document.getElementById('inputProfessor').value = materia.professor ?? '';
    document.getElementById('inputPeriodoLetivo').value = materia.periodo_letivo ?? '';
    document.getElementById('detalheReprovacoes').innerText = materia.reprovacoes
        ? `Reprovações anteriores: ${materia.reprovacoes} (salvas no histórico)`
        : '';

    // Card de optativa: escolhe qual optativa do catálogo foi cursada
    const grupoOptativa = document.getElementById('grupoOptativa');
    const optSelect = document.getElementById('optativaSelect');
    grupoOptativa.classList.toggle('hidden', !materia.optativa);
    if (materia.optativa) {
        optSelect.innerHTML = '';
        if (materia.status_real !== 'Disponível') {
            optSelect.appendChild(new Option(
                `${materia.nome.replace(/ [(][0-9]+[/][0-9]+[)]$/, '')} (${materia.horas_optativa ?? materia.horas}h)`, materia.optativa_id ?? ''
            ));
            optSelect.disabled = true;
        } else {
            optSelect.disabled = false;
            optSelect.appendChild(new Option(
                materia.opcoes.length ? 'Selecione a optativa...' : 'Nenhuma optativa disponível para este curso', ''
            ));
            materia.opcoes.forEach(o => optSelect.appendChild(new Option(`${o.nome} (${o.horas}h)`, o.id)));
            document.getElementById('detalheReprovacoes').innerText = `Bloco de optativas ${materia.tipo}s: este card ainda tem ${materia.horas}h livres`;
        }
    }

    // Pré-requisitos: verde = concluído, azul = cursando, vermelho = ainda não cursou
    const CLASSE_PRE = { concluida: 'pre-ok', inscrito: 'pre-insc', pendente: 'pre-pendente' };
    const ROTULO_PRE = { concluida: 'concluída', inscrito: 'cursando', pendente: 'falta cursar' };
    document.getElementById('listaPrereqs').innerHTML = materia.pre_requisitos.length
        ? materia.pre_requisitos.map(p =>
            `<li class="${CLASSE_PRE[p.situacao]}">${escapeHtml(p.nome)}</li>`).join('')
        : '<li>Nenhum pré-requisito</li>';
    document.getElementById('legendaPrereqs').innerHTML = materia.pre_requisitos.length
        ? '<span class="l-ok">● concluída</span> · <span class="l-insc">● cursando</span> · <span class="l-pend">● não cursou</span>'
        : '';

    painelDetalhes.classList.add('aberto');
}

document.getElementById('btnFecharPainel').onclick = () => painelDetalhes.classList.remove('aberto');

document.getElementById('btnSalvarDetalhes').onclick = async () => {
    if (!materiaSelecionada) return;

    const aluno = alunoSelect.value;
    const status = document.getElementById('statusSelect').value;
    const notaTexto = document.getElementById('inputNota').value;
    const optativa = materiaSelecionada.optativa;
    const preenchido = materiaSelecionada.status_real !== 'Disponível';
    // Optativas são lançadas pelo código da própria optativa escolhida
    const optativaId = optativa ? (materiaSelecionada.optativa_id ?? (document.getElementById('optativaSelect').value || null)) : null;
    const materiaId = optativa ? optativaId : materiaSelecionada.id;

    try {
        if (status === 'Disponível') {
            // Card de optativa ainda vazio: não há o que desfazer
            if (optativa && !preenchido) {
                mostrarToast('Escolha uma optativa e um estado para salvar.', 'erro');
                return;
            }
            // Desfaz inscrição/conclusão (reprovações continuam salvas)
            await api(`/historico/${encodeURIComponent(aluno)}/${encodeURIComponent(materiaId)}`, {
                method: 'DELETE'
            });
        } else {
            if (optativa && !optativaId) {
                mostrarToast('Selecione a optativa cursada.', 'erro');
                return;
            }
            await api('/historico', {
                method: 'POST',
                body: JSON.stringify({
                    aluno,
                    materia_id: materiaId,
                    status,
                    nota: notaTexto === '' ? null : parseFloat(notaTexto),
                    professor: document.getElementById('inputProfessor').value.trim() || null,
                    periodo_letivo: document.getElementById('inputPeriodoLetivo').value.trim() || null
                })
            });
        }
        mostrarToast('Informações salvas!');
        await carregarProgresso();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
};

alunoSelect.addEventListener('change', carregarProgresso);
document.addEventListener('DOMContentLoaded', () => { carregarAlunos(); carregarVisaoGeral(); });