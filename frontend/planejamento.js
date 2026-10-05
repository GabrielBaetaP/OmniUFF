const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Remoto'];
const DIA_CLASSE = { Segunda: 'seg', Terça: 'ter', Quarta: 'qua', Quinta: 'qui', Sexta: 'sex', Sábado: 'sab', Remoto: 'rem' };

const abasEl = document.getElementById('abas');
const conteudo = document.getElementById('conteudo');
const semestreSelect = document.getElementById('semestreSelect');

let dados = null;      // resposta de GET /planejamento
let aba = 'todas';     // 'todas' ou o nome (completo) de um aluno
let busca = '';

// ---------- utilidades de exibição ----------
const hash = (texto) => [...texto].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0);
const apelidoDe = (nome) => dados.alunos.find(a => a.nome === nome)?.apelido ?? nome;
const tagAluno = (nome) => `<span class="tag c${hash(nome) % 8}">${escapeHtml(apelidoDe(nome))}</span>`;
const tagDia = (dia) => `<span class="tag dia-${DIA_CLASSE[dia]}">${dia}</span>`;
const rotuloTurma = (t) => `${t.codigo} - ${t.nome}`;

function classeHora(inicio) {
    const h = parseInt(inicio, 10);
    if (h < 9) return 'h-azul';
    if (h < 11) return 'h-amarelo';
    if (h < 13) return 'h-neutro';
    if (h < 16) return 'h-verde';
    if (h < 18) return 'h-vermelho';
    return 'h-roxo';
}
const horarioHtml = (t) => t.inicio
    ? `<span class="hora ${classeHora(t.inicio)}">${t.inicio} - ${t.fim}</span>`
    : '<span class="vazio">—</span>';

// ---------- carregamento ----------
async function carregar(semestre) {
    try {
        const q = semestre ? `?semestre=${encodeURIComponent(semestre)}` : '';
        dados = await api(`/planejamento${q}`);
    } catch (e) {
        conteudo.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
        return;
    }
    if (aba !== 'todas' && !dados.alunos.some(a => a.nome === aba)) aba = 'todas';
    renderTudo();
}

function renderTudo() {
    renderSemestres();
    renderAbas();
    renderConteudo();
}

function renderSemestres() {
    document.getElementById('tituloSemestre').textContent = dados.semestre ?? '';
    semestreSelect.innerHTML = dados.semestres.length
        ? dados.semestres.map(s => `<option value="${s}" ${s === dados.semestre ? 'selected' : ''}>${s}</option>`).join('')
        : '<option value="">Sem semestre</option>';
}

function renderAbas() {
    const itens = [{ id: 'todas', rotulo: 'Todas as Matérias' }, ...dados.alunos.map(a => ({ id: a.nome, rotulo: a.apelido }))];
    abasEl.innerHTML = itens
        .map(i => `<button class="tab ${i.id === aba ? 'ativa' : ''}" data-aba="${escapeHtml(i.id)}">${escapeHtml(i.rotulo)}</button>`)
        .join('');
}

function renderConteudo() {
    if (!dados.semestre) {
        conteudo.innerHTML = `<div class="admin-card"><p class="msg-vazia">Nenhum semestre cadastrado ainda. Clique em "+ Nova turma" (ou "+ Semestre" / "Importar CSV") para começar.</p></div>`;
        return;
    }
    if (aba === 'todas') renderTabela(); else renderAluno(aba);
}

abasEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (!b) return;
    aba = b.dataset.aba;
    busca = '';
    renderAbas();
    renderConteudo();
});

semestreSelect.addEventListener('change', () => carregar(semestreSelect.value));

// ---------- visão "Todas as Matérias" ----------
function renderTabela() {
    const termo = busca.trim().toLowerCase();
    const filtradas = dados.turmas.filter(t => !termo || [
        t.codigo, t.nome, t.professor, t.sala, ...t.dias, ...t.escolhas.map(apelidoDe)
    ].join(' ').toLowerCase().includes(termo));

    const linhas = filtradas.map(t => `
        <tr class="linha-turma" data-id="${t.id}">
            <td class="materia"><small>${escapeHtml(t.codigo)}</small>${escapeHtml(t.nome)}</td>
            <td>${horarioHtml(t)}</td>
            <td>${t.dias.length ? t.dias.map(tagDia).join('') : '<span class="vazio">—</span>'}</td>
            <td>${escapeHtml(t.professor ?? '')}</td>
            <td class="num">${t.ch ?? ''}</td>
            <td>${t.alunos.map(tagAluno).join('') || '<span class="vazio">—</span>'}</td>
            <td class="num">${t.periodo ?? ''}</td>
            <td>${t.escolhas.map(tagAluno).join('')}</td>
            <td>${escapeHtml(t.sala ?? '')}</td>
        </tr>`).join('');

    conteudo.innerHTML = `
        <div class="busca-linha">
            <input type="text" id="campoBusca" placeholder="Buscar matéria, professor, sala, aluno..." value="${escapeHtml(busca)}">
            <span class="contagem">${filtradas.length} de ${dados.turmas.length} turma(s) · clique numa linha para editar</span>
        </div>
        <div class="tabela-wrap">
            <table class="tabela-plan">
                <thead><tr>
                    <th>Matéria</th><th>Horário</th><th>Dias da Semana</th><th>Professor</th><th>CH</th>
                    <th title="Alunos que podem cursar: calculado pelos pré-requisitos ou definido à mão na turma">Alunos</th><th>Período</th><th>Escolhas</th><th>Sala</th>
                </tr></thead>
                <tbody>${linhas || '<tr><td colspan="9"><p class="msg-vazia" style="padding:14px">Nenhuma turma encontrada.</p></td></tr>'}</tbody>
            </table>
        </div>`;

    const campo = document.getElementById('campoBusca');
    campo.addEventListener('input', () => {
        busca = campo.value;
        const pos = campo.selectionStart;
        renderTabela();
        const novo = document.getElementById('campoBusca');
        novo.focus();
        novo.setSelectionRange(pos, pos);
    });
}

conteudo.addEventListener('click', (e) => {
    const linha = e.target.closest('.linha-turma');
    if (linha) {
        abrirFormTurma(dados.turmas.find(t => t.id === Number(linha.dataset.id)));
        return;
    }
    const titulo = e.target.closest('[data-editar]');
    if (titulo) {
        abrirFormTurma(dados.turmas.find(t => t.id === Number(titulo.dataset.editar)));
        return;
    }
    const remover = e.target.closest('[data-remover]');
    if (remover) {
        definirEscolha(aba, Number(remover.dataset.remover), false);
        return;
    }
    if (e.target.closest('#btnAdicionarTurma')) abrirPicker(aba);
    if (e.target.closest('#btnSalvarApelido')) salvarApelido();
});

// ---------- visão de um aluno ----------
function sobrepoe(a, b) {
    return a.inicio && b.inicio && a.inicio < b.fim && b.inicio < a.fim;
}

// Avisos de conflito de horário (mesmo dia) ou matéria repetida, por turma
function detectarConflitos(turmas) {
    const avisos = new Map(turmas.map(t => [t.id, []]));
    for (let i = 0; i < turmas.length; i++) {
        for (let j = i + 1; j < turmas.length; j++) {
            const a = turmas[i], b = turmas[j];
            const comum = a.dias.filter(d => d !== 'Remoto' && b.dias.includes(d));
            if (comum.length && sobrepoe(a, b)) {
                avisos.get(a.id).push(`Choca com ${b.codigo} (${comum.join(', ')})`);
                avisos.get(b.id).push(`Choca com ${a.codigo} (${comum.join(', ')})`);
            } else if (a.codigo === b.codigo) {
                avisos.get(a.id).push('Mesma matéria escolhida duas vezes');
                avisos.get(b.id).push('Mesma matéria escolhida duas vezes');
            }
        }
    }
    return avisos;
}

function renderAluno(nome) {
    const aluno = dados.alunos.find(a => a.nome === nome);
    const escolhidas = dados.turmas.filter(t => t.escolhas.includes(nome));
    const avisos = detectarConflitos(escolhidas);
    const nConflitos = [...avisos.values()].filter(v => v.length).length;
    const ch = escolhidas.reduce((s, t) => s + (t.ch ?? 0), 0);

    const dias = DIAS.slice(0, 5).concat(DIAS.slice(5).filter(d => escolhidas.some(t => t.dias.includes(d))));
    const semDia = escolhidas.filter(t => t.dias.length === 0);
    const colunas = dias.map(d => ({ dia: d, turmas: escolhidas.filter(t => t.dias.includes(d)) }));

    const card = (t) => {
        const av = avisos.get(t.id) ?? [];
        return `
        <div class="card-turma ${av.length ? 'conflito' : ''}">
            <button class="remover" data-remover="${t.id}" title="Tirar das minhas escolhas">&times;</button>
            <div class="titulo" data-editar="${t.id}" title="Editar turma">${escapeHtml(rotuloTurma(t))}</div>
            <div>${t.dias.map(tagDia).join('')}</div>
            <div>${horarioHtml(t)}${t.sala ? ` <span class="meta">· sala ${escapeHtml(t.sala)}</span>` : ''}</div>
            <div class="meta">${escapeHtml(t.professor ?? '')}${t.ch ? ` · ${t.ch}h` : ''}</div>
            <div>${t.alunos.map(tagAluno).join('')}</div>
            ${av.map(x => `<div class="aviso">⚠ ${escapeHtml(x)}</div>`).join('')}
        </div>`;
    };
    const coluna = (titulo, lista, tag) => `
        <div class="col-dia">
            <div class="col-dia-titulo">${tag} <span>${lista.length}</span></div>
            ${lista.map(card).join('') || '<div class="col-vazia">Nada neste dia.</div>'}
        </div>`;

    conteudo.innerHTML = `
        <div class="aluno-topo">
            <h2>${escapeHtml(aluno.nome)}</h2>
            <div class="resumo-chips">
                <span class="chip-info">${escolhidas.length} matéria(s)</span>
                <span class="chip-info">${ch}h de carga horária</span>
                <span class="chip-info ${nConflitos ? 'alerta' : ''}">${nConflitos ? `⚠ ${nConflitos} com conflito` : 'Sem conflitos'}</span>
            </div>
            <div class="apelido-edit">
                Apelido nas etiquetas:
                <input type="text" id="campoApelido" maxlength="30" value="${escapeHtml(aluno.apelido)}">
                <button id="btnSalvarApelido" class="btn-neutro">Salvar</button>
            </div>
        </div>
        <div class="quadro">
            ${colunas.map(c => coluna(c.dia, c.turmas, tagDia(c.dia))).join('')}
            ${semDia.length ? coluna('Sem dia', semDia, '<span class="tag c6">Sem dia</span>') : ''}
            <div class="col-dia" style="background:none;border:none;padding:0;flex-basis:220px">
                <button id="btnAdicionarTurma" class="btn-add-turma">+ Adicionar turma</button>
            </div>
        </div>`;
}

async function salvarApelido() {
    const apelido = document.getElementById('campoApelido').value.trim();
    try {
        await api(`/alunos/${encodeURIComponent(aba)}/apelido`, { method: 'PUT', body: JSON.stringify({ apelido }) });
        mostrarToast('Apelido atualizado!');
        await carregar(dados.semestre);
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

async function definirEscolha(aluno, turmaId, escolhido) {
    try {
        await api('/planejamento/escolha', { method: 'PUT', body: JSON.stringify({ aluno, turma_id: turmaId, escolhido }) });
        await carregar(dados.semestre);
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

// ---------- janela: escolher turmas para um aluno ----------
function abrirPicker(nome) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
        <div class="modal largo">
            <h3>Adicionar turma para ${escapeHtml(apelidoDe(nome))}</h3>
            <p class="sub">Por padrão aparecem só as turmas que o aluno pode cursar (pré-requisitos cumpridos).</p>
            <div class="picker-topo">
                <input type="text" id="pkBusca" placeholder="Buscar...">
                <label class="check-linha"><input type="checkbox" id="pkTodas"> Mostrar todas</label>
            </div>
            <div class="lista-picker" id="pkLista"></div>
            <div class="modal-acoes"><button class="btn-neutro" id="pkFechar">Fechar</button></div>
        </div>`;
    document.body.appendChild(fundo);

    const fechar = () => { document.removeEventListener('keydown', teclar, true); fundo.remove(); };
    const teclar = (ev) => { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', teclar, true);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    fundo.querySelector('#pkFechar').addEventListener('click', fechar);

    const lista = fundo.querySelector('#pkLista');
    const desenhar = () => {
        const termo = fundo.querySelector('#pkBusca').value.trim().toLowerCase();
        const todas = fundo.querySelector('#pkTodas').checked;
        const atuais = dados.turmas.filter(t => t.escolhas.includes(nome));
        const candidatas = dados.turmas.filter(t =>
            !t.escolhas.includes(nome) && (todas || t.alunos.includes(nome)) &&
            (!termo || [t.codigo, t.nome, t.professor, t.sala, ...t.dias].join(' ').toLowerCase().includes(termo)));

        lista.innerHTML = candidatas.map(t => {
            const av = [...detectarConflitos([...atuais, t]).get(t.id) ?? []];
            return `
            <div class="item-picker">
                <div class="corpo">
                    <div class="titulo">${escapeHtml(rotuloTurma(t))}</div>
                    <div class="meta">${t.dias.map(tagDia).join('')} ${horarioHtml(t)} · ${escapeHtml(t.professor ?? 'sem professor')}${t.sala ? ` · sala ${escapeHtml(t.sala)}` : ''}</div>
                    ${av.map(x => `<div class="aviso">⚠ ${escapeHtml(x)}</div>`).join('')}
                </div>
                <button class="btn-primary" data-add="${t.id}">Adicionar</button>
            </div>`;
        }).join('') || '<p class="msg-vazia">Nenhuma turma disponível com esse filtro.</p>';
    };
    desenhar();
    fundo.querySelector('#pkBusca').addEventListener('input', desenhar);
    fundo.querySelector('#pkTodas').addEventListener('change', desenhar);
    lista.addEventListener('click', async (ev) => {
        const b = ev.target.closest('[data-add]');
        if (!b) return;
        await definirEscolha(nome, Number(b.dataset.add), true);
        desenhar();   // continua aberta para adicionar várias
    });
}

// ---------- janela: criar / editar turma ----------
function abrirFormTurma(turma = null) {
    const edicao = !!turma;
    const t = turma ?? { semestre: dados.semestre ?? '', codigo: '', nome: '', dias: [], inicio: '', fim: '', professor: '', sala: '', ch: '', periodo: '', escolhas: [], alunos: [], alunos_auto: true };

    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
        <div class="modal largo">
            <h3>${edicao ? 'Editar turma' : 'Nova turma'}</h3>
            <p class="sub">${edicao ? 'Ajuste os dados ou mude quem escolheu esta turma.' : 'Digite o código da matéria (ex: TCC00288) para preencher o resto automaticamente.'}</p>
            <div class="modal-form">
                <div class="form-group"><label for="ftSemestre">Semestre</label><input type="text" id="ftSemestre" placeholder="2026.2"></div>
                <div class="form-group"><label for="ftCodigo">Código</label><input type="text" id="ftCodigo" list="listaCodigos" autocomplete="off"></div>
                <div class="form-group cheio"><label for="ftNome">Nome da matéria</label><input type="text" id="ftNome"></div>
                <div class="form-group cheio"><label>Dias da semana</label>
                    <div class="chips-check">${DIAS.map(d => `<label><input type="checkbox" name="ftDia" value="${d}"> ${d}</label>`).join('')}</div></div>
                <div class="form-group"><label for="ftInicio">Início</label><input type="time" id="ftInicio"></div>
                <div class="form-group"><label for="ftFim">Fim</label><input type="time" id="ftFim"></div>
                <div class="form-group"><label for="ftProf">Professor</label><input type="text" id="ftProf"></div>
                <div class="form-group"><label for="ftSala">Sala</label><input type="text" id="ftSala"></div>
                <div class="form-group"><label for="ftCh">Carga horária (CH)</label><input type="number" id="ftCh" min="0" max="999"></div>
                <div class="form-group"><label for="ftPeriodo">Período</label><input type="number" id="ftPeriodo" min="0" max="12"></div>
                <div class="form-group cheio"><label>Alunos (quem pode puxar esta matéria)</label>
                    <label class="check-linha"><input type="checkbox" id="ftAuto"> Calcular automaticamente pelos pré-requisitos</label>
                    <div class="chips-check" id="ftAptos">${dados.alunos.map(a => `<label><input type="checkbox" name="ftApto" value="${escapeHtml(a.nome)}"> ${escapeHtml(a.apelido)}</label>`).join('')}</div>
                    <p class="dica" id="ftAptosDica" style="margin:8px 0 0"></p></div>
                <div class="form-group cheio"><label>Escolhas (quem vai cursar)</label>
                    <div class="chips-check">${dados.alunos.map(a => `<label><input type="checkbox" name="ftEscolha" value="${escapeHtml(a.nome)}"> ${escapeHtml(a.apelido)}</label>`).join('')}</div></div>
                <div class="acoes-form">
                    <button class="btn-primary" id="ftSalvar">Salvar</button>
                    <button class="btn-neutro" id="ftCancelar">Cancelar</button>
                </div>
                ${edicao ? '<div class="acoes-form"><button class="btn-danger" id="ftExcluir">Excluir esta turma</button></div>' : ''}
            </div>
            <datalist id="listaCodigos">${dados.catalogo.map(c => `<option value="${escapeHtml(c.codigo)}">${escapeHtml(c.nome)}</option>`).join('')}</datalist>
        </div>`;
    document.body.appendChild(fundo);
    const $ = (sel) => fundo.querySelector(sel);

    // Valores via propriedades (nada de montar HTML com texto do banco)
    $('#ftSemestre').value = t.semestre;
    $('#ftCodigo').value = t.codigo;
    $('#ftNome').value = t.nome;
    $('#ftInicio').value = t.inicio ?? '';
    $('#ftFim').value = t.fim ?? '';
    $('#ftProf').value = t.professor ?? '';
    $('#ftSala').value = t.sala ?? '';
    $('#ftCh').value = t.ch ?? '';
    $('#ftPeriodo').value = t.periodo ?? '';
    fundo.querySelectorAll('[name="ftDia"]').forEach(c => { c.checked = t.dias.includes(c.value); });
    fundo.querySelectorAll('[name="ftEscolha"]').forEach(c => { c.checked = t.escolhas.includes(c.value); });
    fundo.querySelectorAll('[name="ftApto"]').forEach(c => { c.checked = t.alunos.includes(c.value); });
    $('#ftAuto').checked = t.alunos_auto !== false;

    // Modo automático: a lista é só exibida (recalculada ao salvar); desmarcando, vira uma lista manual
    const atualizarAptos = () => {
        const auto = $('#ftAuto').checked;
        $('#ftAptos').classList.toggle('desativado', auto);
        $('#ftAptosDica').textContent = auto
            ? (edicao ? 'Automático: alunos do curso que ainda não cursaram a matéria e já cumpriram os pré-requisitos.'
                      : 'Automático: será calculado ao salvar, pelos pré-requisitos de cada aluno.')
            : 'Manual: só os alunos marcados aparecem como aptos a puxar esta matéria.';
    };
    $('#ftAuto').addEventListener('change', atualizarAptos);
    atualizarAptos();

    // Ao digitar um código conhecido, preenche nome / CH / período (sem sobrescrever o que já foi editado)
    $('#ftCodigo').addEventListener('input', () => {
        const c = dados.catalogo.find(x => x.codigo === $('#ftCodigo').value.trim().toUpperCase());
        if (!c) return;
        if (!$('#ftNome').value.trim()) $('#ftNome').value = c.nome;
        if ($('#ftCh').value === '') $('#ftCh').value = c.ch;
        if ($('#ftPeriodo').value === '') $('#ftPeriodo').value = c.periodo;
    });

    const fechar = () => { document.removeEventListener('keydown', teclar, true); fundo.remove(); };
    const teclar = (ev) => { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', teclar, true);
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    $('#ftCancelar').addEventListener('click', fechar);

    const numero = (sel) => $(sel).value === '' ? null : parseInt($(sel).value, 10);
    $('#ftSalvar').addEventListener('click', async () => {
        const corpo = {
            semestre: $('#ftSemestre').value.trim(),
            codigo: $('#ftCodigo').value.trim(),
            nome: $('#ftNome').value.trim() || null,
            dias: [...fundo.querySelectorAll('[name="ftDia"]:checked')].map(c => c.value),
            inicio: $('#ftInicio').value || null,
            fim: $('#ftFim').value || null,
            professor: $('#ftProf').value.trim() || null,
            sala: $('#ftSala').value.trim() || null,
            ch: numero('#ftCh'),
            periodo: numero('#ftPeriodo'),
            escolhas: [...fundo.querySelectorAll('[name="ftEscolha"]:checked')].map(c => c.value),
            alunos_auto: $('#ftAuto').checked,
            alunos: [...fundo.querySelectorAll('[name="ftApto"]:checked')].map(c => c.value)
        };
        if (!corpo.semestre || !corpo.codigo) {
            mostrarToast('Informe o semestre e o código da matéria.', 'erro');
            return;
        }
        try {
            const res = await api(edicao ? `/planejamento/turmas/${turma.id}` : '/planejamento/turmas', {
                method: edicao ? 'PUT' : 'POST',
                body: JSON.stringify(corpo)
            });
            fechar();
            mostrarToast(res.mensagem);
            await carregar(res.semestre);
        } catch (e) {
            mostrarToast(e.message, 'erro');
        }
    });

    if (edicao) {
        $('#ftExcluir').addEventListener('click', async () => {
            const ok = await confirmar({
                titulo: 'Excluir esta turma?',
                mensagem: `"${rotuloTurma(turma)}" sai do planejamento e das escolhas de todos os alunos.`,
                confirmarTexto: 'Excluir turma',
                cancelarTexto: 'Manter',
                perigo: true
            });
            if (!ok) return;
            try {
                const res = await api(`/planejamento/turmas/${turma.id}`, { method: 'DELETE' });
                fechar();
                mostrarToast(res.mensagem);
                await carregar(dados.semestre);
            } catch (e) {
                mostrarToast(e.message, 'erro');
            }
        });
    }
    $(edicao ? '#ftProf' : '#ftCodigo').focus();
}

document.getElementById('btnNovaTurma').addEventListener('click', () => abrirFormTurma());

// ---------- novo semestre ----------
function normalizarSemestre(texto) {
    const m = texto.trim().match(/^(\d{2}|\d{4})\.(\d)$/);
    return m ? `${m[1].length === 2 ? '20' + m[1] : m[1]}.${m[2]}` : null;
}

function perguntarSemestre() {
    return new Promise(resolve => {
        const fundo = document.createElement('div');
        fundo.className = 'modal-fundo topo';
        fundo.innerHTML = `
            <div class="modal confirm">
                <h3>Novo semestre</h3>
                <p class="confirm-msg">Use o formato 2026.2 (ou 26.2).</p>
                <div class="form-group" style="margin-top:14px"><input type="text" id="nsTexto" placeholder="2026.2"></div>
                <div class="modal-acoes">
                    <button class="btn-neutro" id="nsCancelar">Cancelar</button>
                    <button class="btn-primary" id="nsOk">Criar</button>
                </div>
            </div>`;
        document.body.appendChild(fundo);
        const campo = fundo.querySelector('#nsTexto');
        const fechar = (v) => { fundo.remove(); resolve(v); };
        const tentar = () => {
            const v = normalizarSemestre(campo.value);
            if (!v) { mostrarToast('Semestre inválido. Use o formato 2026.2.', 'erro'); return; }
            fechar(v);
        };
        fundo.querySelector('#nsOk').addEventListener('click', tentar);
        fundo.querySelector('#nsCancelar').addEventListener('click', () => fechar(null));
        fundo.addEventListener('click', (e) => { if (e.target === fundo) fechar(null); });
        campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') tentar(); if (e.key === 'Escape') fechar(null); });
        campo.focus();
    });
}

document.getElementById('btnNovoSemestre').addEventListener('click', async () => {
    const semestre = await perguntarSemestre();
    if (!semestre) return;
    // O semestre só passa a existir no banco quando a primeira turma é salva
    if (!dados.semestres.includes(semestre)) dados.semestres.unshift(semestre);
    dados.semestre = semestre;
    dados.turmas = [];
    renderTudo();
    mostrarToast(`Semestre ${semestre} criado. Adicione as turmas.`);
});

// ---------- importar CSV exportado do Notion ----------
function lerCsv(texto) {
    texto = texto.replace(/^\uFEFF/, '');
    const primeira = texto.split(/\r?\n/, 1)[0];
    const sep = (primeira.match(/;/g) ?? []).length > (primeira.match(/,/g) ?? []).length ? ';' : ',';
    const linhas = [];
    let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
        const c = texto[i];
        if (aspas) {
            if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
            else if (c === '"') aspas = false;
            else campo += c;
        } else if (c === '"') aspas = true;
        else if (c === sep) { linha.push(campo); campo = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && texto[i + 1] === '\n') i++;
            linha.push(campo); campo = '';
            if (linha.some(x => x !== '')) linhas.push(linha);
            linha = [];
        } else campo += c;
    }
    linha.push(campo);
    if (linha.some(x => x !== '')) linhas.push(linha);
    return linhas;
}

const semAcento = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const CAMPOS_CSV = {
    'materia': 'materia', 'horario': 'horario', 'dias da semana': 'dias', 'dias': 'dias', 'professor': 'professor',
    'ch': 'ch', 'alunos': 'alunos', 'periodo': 'periodo', 'escolhas': 'escolhas', 'sala': 'sala'
};

document.getElementById('btnImportarCsv').addEventListener('click', () => document.getElementById('arquivoCsv').click());

document.getElementById('arquivoCsv').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    e.target.value = '';
    if (!arquivo) return;

    const tabela = lerCsv(await arquivo.text());
    const cabecalho = (tabela[0] ?? []).map(h => CAMPOS_CSV[semAcento(h)] ?? null);
    if (!cabecalho.includes('materia')) {
        mostrarToast('Não achei a coluna "Matéria" no CSV. Exporte a tabela do Notion como CSV.', 'erro');
        return;
    }
    const linhas = tabela.slice(1).map(cols => Object.fromEntries(
        cabecalho.map((chave, i) => [chave, cols[i] ?? '']).filter(([chave]) => chave)
    ));

    const semestre = dados.semestre ?? await perguntarSemestre();
    if (!semestre) return;
    const ok = await confirmar({
        titulo: 'Importar turmas?',
        mensagem: `${linhas.length} linha(s) do arquivo "${arquivo.name}" serão adicionadas ao semestre ${semestre}. Turmas que já existem não são duplicadas.`,
        confirmarTexto: 'Importar',
        cancelarTexto: 'Cancelar'
    });
    if (!ok) return;

    try {
        const res = await api('/planejamento/importar', { method: 'POST', body: JSON.stringify({ semestre, linhas }) });
        mostrarToast(res.mensagem);
        await carregar(semestre);
        const avisos = [];
        if (res.ignoradas.length) avisos.push(`Linhas ignoradas (sem "CÓDIGO - Nome"): ${res.ignoradas.join('; ')}.`);
        if (res.desconhecidos.length) avisos.push(`Nomes em "Escolhas" que não batem com nenhum aluno (ajuste o apelido na aba do aluno): ${res.desconhecidos.join(', ')}.`);
        if (avisos.length) {
            await confirmar({ titulo: 'Importação concluída, com avisos', mensagem: avisos.join(' '), confirmarTexto: 'Entendi', cancelarTexto: 'Fechar' });
        }
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
});

document.addEventListener('DOMContentLoaded', () => carregar());