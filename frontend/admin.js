const excluirSelect = document.getElementById('excluirAlunoSelect');

document.addEventListener('DOMContentLoaded', () => {
    abrirSecao(location.hash.slice(1));
    carregarLogs();
    carregarAlunosParaExclusao();
    carregarPeriodos();
    carregarMateriasEdicao();
    carregarRequisitos();
    carregarConquistasAdmin();
});

// === NAVEGAÇÃO: uma seção por vez (guarda a escolha no endereço, ex: admin.html#backup) ===
function abrirSecao(id) {
    if (!document.getElementById(`sec-${id}`)) id = 'alunos';
    document.querySelectorAll('.admin-secao').forEach(s => s.classList.toggle('hidden', s.id !== `sec-${id}`));
    document.querySelectorAll('.menu-item').forEach(b => b.classList.toggle('ativo', b.dataset.sec === id));
    location.hash = id;
    if (id === 'logs') carregarLogs();
}

document.querySelector('.admin-menu').addEventListener('click', (e) => {
    const botao = e.target.closest('.menu-item');
    if (botao) abrirSecao(botao.dataset.sec);
});

// Alternador Cadastrar | Editar (seção Matérias)
document.querySelector('.segmentado').addEventListener('click', (e) => {
    const botao = e.target.closest('.seg-botao');
    if (!botao) return;
    document.querySelectorAll('.seg-botao').forEach(b => b.classList.toggle('ativo', b === botao));
    document.getElementById('sub-cadastrar').classList.toggle('hidden', botao.dataset.sub !== 'cadastrar');
    document.getElementById('sub-editar').classList.toggle('hidden', botao.dataset.sub !== 'editar');
});

// === CADASTRO DE ALUNO ===
document.getElementById('btnCadastrarAluno').addEventListener('click', async () => {
    const campoNome = document.getElementById('novoAlunoNome');
    const nome = campoNome.value.trim();
    const curso = document.getElementById('novoAlunoCurso').value;

    if (!nome) {
        mostrarToast('Por favor, digite o nome do aluno.', 'erro');
        return;
    }

    try {
        const res = await api('/alunos', {
            method: 'POST',
            body: JSON.stringify({ nome, curso })
        });
        mostrarToast(res.mensagem);
        campoNome.value = '';
        carregarLogs();
        carregarAlunosParaExclusao();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

// === CADASTRO DE MATÉRIA ===
const matOptativa = document.getElementById('matOptativa');

// Optativa não tem período fixo nem um único curso: troca os campos
matOptativa.addEventListener('change', () => {
    const opt = matOptativa.checked;
    document.getElementById('campoPeriodo').classList.toggle('hidden', opt);
    document.getElementById('campoCurso').classList.toggle('hidden', opt);
    document.getElementById('matCursosOptativa').classList.toggle('hidden', !opt);
});

document.getElementById('btnCadastrarMateria').addEventListener('click', async () => {
    const optativa = matOptativa.checked;
    const payload = {
        id: document.getElementById('matId').value.trim(),
        nome: document.getElementById('matNome').value.trim(),
        horas: parseInt(document.getElementById('matHoras').value),
        horas_extensao: parseInt(document.getElementById('matExtensao').value) || 0,
        optativa
    };

    if (optativa) {
        payload.tipo = document.getElementById('matTipo').value;
        payload.cursos = [...document.querySelectorAll('input[name="cursoOptativa"]:checked')].map(c => c.value);
        if (!payload.id || !payload.nome || isNaN(payload.horas)) {
            mostrarToast('Preencha código, nome e carga horária da optativa.', 'erro');
            return;
        }
        if (payload.cursos.length === 0) {
            mostrarToast('Selecione ao menos um curso para a optativa.', 'erro');
            return;
        }
    } else {
        payload.periodo = parseInt(document.getElementById('matPeriodo').value);
        payload.curso = document.getElementById('matCurso').value;
        if (!payload.id || !payload.nome || isNaN(payload.periodo) || isNaN(payload.horas)) {
            mostrarToast('Preencha todos os campos da matéria.', 'erro');
            return;
        }
    }

    try {
        const res = await api('/admin/materias', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        mostrarToast(res.mensagem);
        ['matId', 'matNome', 'matPeriodo', 'matHoras', 'matExtensao'].forEach(id => document.getElementById(id).value = '');
        carregarLogs();
        carregarMateriasEdicao();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

// === EDIÇÃO DE MATÉRIA EXISTENTE ===
const editSelect = document.getElementById('editMateriaSelect');
const editForm = document.getElementById('editMateriaForm');
let materiasAdmin = [];

async function carregarMateriasEdicao() {
    try {
        materiasAdmin = await api('/admin/materias');
    } catch (e) {
        editSelect.innerHTML = '<option value="">Erro ao conectar com a API</option>';
        return;
    }
    const atual = editSelect.value;
    editSelect.innerHTML = '<option value="">Selecione uma matéria...</option>';
    const grupos = {};
    materiasAdmin.forEach(m => {
        const rotulo = m.optativa ? `Optativas ${m.tipo}s` : m.curso;
        (grupos[rotulo] ??= []).push(m);
    });
    Object.entries(grupos).forEach(([rotulo, lista]) => {
        const g = document.createElement('optgroup');
        g.label = rotulo;
        lista.forEach(m => g.appendChild(new Option(`${m.id} - ${m.nome}${m.horas_extensao ? ` (ext. ${m.horas_extensao}h)` : ''}`, m.id)));
        editSelect.appendChild(g);
    });
    editSelect.value = atual;
    if (!editSelect.value) editForm.classList.add('hidden');
}

editSelect.addEventListener('change', () => {
    const m = materiasAdmin.find(x => x.id === editSelect.value);
    editForm.classList.toggle('hidden', !m);
    if (!m) return;
    document.getElementById('editNome').value = m.nome;
    document.getElementById('editHoras').value = m.horas;
    document.getElementById('editExtensao').value = m.horas_extensao;
    document.getElementById('editCamposNormal').classList.toggle('hidden', m.optativa);
    document.getElementById('editCamposOptativa').classList.toggle('hidden', !m.optativa);
    if (m.optativa) {
        document.getElementById('editTipo').value = m.tipo;
        document.querySelectorAll('input[name="editCursoOptativa"]').forEach(c => { c.checked = m.cursos.includes(c.value); });
    } else {
        document.getElementById('editPeriodo').value = m.periodo;
        document.getElementById('editCurso').value = m.curso;
    }
});

document.getElementById('btnSalvarEdicaoMateria').addEventListener('click', async () => {
    const m = materiasAdmin.find(x => x.id === editSelect.value);
    if (!m) return;
    const payload = {
        nome: document.getElementById('editNome').value.trim(),
        horas: parseInt(document.getElementById('editHoras').value),
        horas_extensao: parseInt(document.getElementById('editExtensao').value) || 0
    };
    if (!payload.nome || isNaN(payload.horas)) {
        mostrarToast('Preencha o nome e a carga horária.', 'erro');
        return;
    }
    if (m.optativa) {
        payload.tipo = document.getElementById('editTipo').value;
        payload.cursos = [...document.querySelectorAll('input[name="editCursoOptativa"]:checked')].map(c => c.value);
        if (payload.cursos.length === 0) {
            mostrarToast('Selecione ao menos um curso para a optativa.', 'erro');
            return;
        }
    } else {
        payload.periodo = parseInt(document.getElementById('editPeriodo').value);
        payload.curso = document.getElementById('editCurso').value;
        if (isNaN(payload.periodo)) {
            mostrarToast('Informe o período.', 'erro');
            return;
        }
    }
    try {
        const res = await api(`/admin/materias/${encodeURIComponent(m.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
        mostrarToast(res.mensagem);
        await carregarMateriasEdicao();
        editSelect.dispatchEvent(new Event('change'));
        carregarLogs();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

// === REQUISITOS DE FORMAÇÃO (por curso) ===
const listaRequisitos = document.getElementById('listaRequisitos');

async function carregarRequisitos() {
    try {
        const reqs = await api('/admin/requisitos');
        listaRequisitos.innerHTML = reqs.map(r => `
            <div class="req-curso" data-curso="${escapeHtml(r.curso)}">
                <h3>${escapeHtml(r.curso)}</h3>
                <div class="linha-2">
                    <div><label class="rotulo-campo">Horas complementares (AC)</label>
                        <input type="number" min="0" data-campo="horas_complementares" value="${r.horas_complementares}"></div>
                    <div><label class="rotulo-campo">Horas de extensão</label>
                        <input type="number" min="0" data-campo="horas_extensao" value="${r.horas_extensao}"></div>
                </div>
                <button class="btn-primary" data-salvar-req="${escapeHtml(r.curso)}">Salvar ${escapeHtml(r.curso)}</button>
            </div>`).join('');
    } catch (e) {
        listaRequisitos.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

listaRequisitos.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-salvar-req]');
    if (!botao) return;
    const bloco = botao.closest('.req-curso');
    const valor = (campo) => parseInt(bloco.querySelector(`[data-campo="${campo}"]`).value) || 0;
    try {
        const res = await api(`/admin/requisitos/${encodeURIComponent(botao.dataset.salvarReq)}`, {
            method: 'PUT',
            body: JSON.stringify({ horas_complementares: valor('horas_complementares'), horas_extensao: valor('horas_extensao') })
        });
        mostrarToast(res.mensagem);
        carregarLogs();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
});

// === EXCLUSÃO DE ALUNO ===
async function carregarAlunosParaExclusao() {
    try {
        const alunos = await api('/alunos');
        excluirSelect.innerHTML = '<option value="">Selecione um aluno...</option>';
        alunos.forEach(a => excluirSelect.appendChild(new Option(a.nome, a.nome)));
    } catch (e) {
        excluirSelect.innerHTML = '<option value="">Erro ao conectar com a API</option>';
    }
}

document.getElementById('btnExcluirAluno').addEventListener('click', async () => {
    const nome = excluirSelect.value;
    if (!nome) {
        mostrarToast('Selecione um aluno para excluir.', 'erro');
        return;
    }
    const ok = await confirmar({
        titulo: 'Excluir aluno?',
        mensagem: `"${nome}" e todo o histórico (matérias, faltas e datas) serão apagados. Esta ação não pode ser desfeita.`,
        confirmarTexto: 'Excluir aluno',
        perigo: true
    });
    if (!ok) return;

    try {
        const res = await api(`/admin/alunos/${encodeURIComponent(nome)}`, { method: 'DELETE' });
        mostrarToast(res.mensagem);
        carregarLogs();
        carregarAlunosParaExclusao();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

// === LOGS ===
async function carregarLogs() {
    const container = document.getElementById('logsContainer');
    try {
        const { logs } = await api('/admin/logs');
        container.innerHTML = logs.length
            ? logs.slice().reverse()
                .map(l => `<div class="log-item">[${escapeHtml(l.tempo)}] ${escapeHtml(l.acao)}</div>`)
                .join('')
            : '<p class="msg-vazia">Sem logs registrados ainda.</p>';
    } catch (e) {
        container.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

// === BACKUP / IMPORTAÇÃO ===
document.getElementById('btnBackupTodos').addEventListener('click', async () => {
    try {
        const fotos = document.getElementById('backupFotos').checked;
        const dados = await api(`/exportar/backup?foto=${fotos}`);
        baixarTxt(`backup_gestao_uff_${dataHoje()}.txt`, JSON.stringify(dados, null, 2));
        mostrarToast(`Backup baixado (${dados.alunos.length} aluno(s)).`);
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

document.getElementById('btnImportar').addEventListener('click', async () => {
    const campo = document.getElementById('arquivoBackup');
    const arquivo = campo.files[0];
    if (!arquivo) {
        mostrarToast('Escolha o arquivo de backup.', 'erro');
        return;
    }
    let dados;
    try {
        dados = JSON.parse(await arquivo.text());
    } catch {
        mostrarToast('Arquivo inválido: não parece um backup do Gestão UFF.', 'erro');
        return;
    }
    try {
        const res = await api('/admin/importar', { method: 'POST', body: JSON.stringify({ dados }) });
        mostrarToast(res.mensagem);
        campo.value = '';
        carregarLogs();
        carregarAlunosParaExclusao();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

// === PERÍODOS ESPECIAIS ===
const listaPeriodos = document.getElementById('listaPeriodos');

async function carregarPeriodos() {
    try {
        const { periodos } = await api('/admin/periodos-especiais');
        listaPeriodos.innerHTML = periodos.length
            ? periodos.map(p => `<span class="chip">${escapeHtml(p)}<button data-periodo="${escapeHtml(p)}" title="Remover">&times;</button></span>`).join('')
            : '<p class="msg-vazia">Nenhum período especial cadastrado.</p>';
    } catch (e) {
        listaPeriodos.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

document.getElementById('btnCadastrarPeriodo').addEventListener('click', async () => {
    const campo = document.getElementById('novoPeriodoEspecial');
    if (!campo.value.trim()) {
        mostrarToast('Informe o período (ex: 2023.2).', 'erro');
        return;
    }
    try {
        const res = await api('/admin/periodos-especiais', {
            method: 'POST',
            body: JSON.stringify({ periodo: campo.value })
        });
        mostrarToast(res.mensagem);
        campo.value = '';
        carregarPeriodos();
        carregarLogs();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

listaPeriodos.addEventListener('click', async (e) => {
    const botao = e.target.closest('button[data-periodo]');
    if (!botao) return;
    try {
        const res = await api(`/admin/periodos-especiais/${encodeURIComponent(botao.dataset.periodo)}`, { method: 'DELETE' });
        mostrarToast(res.mensagem);
        carregarPeriodos();
        carregarLogs();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
});

// === CONQUISTAS ===
const listaConquistas = document.getElementById('listaConquistas');
const conqMetrica = document.getElementById('conqMetrica');
let conquistasAdmin = { conquistas: [], metricas: [] };
let conquistaEditando = null; // id em edição (null = criando uma nova)

const metricaPorId = (id) => conquistasAdmin.metricas.find(m => m.id === id);

async function carregarConquistasAdmin() {
    try {
        conquistasAdmin = await api('/admin/conquistas');
    } catch (e) {
        listaConquistas.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
        return;
    }
    conqMetrica.innerHTML = conquistasAdmin.metricas.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.rotulo)}${m.unidade ? ` (${escapeHtml(m.unidade)})` : ''}</option>`).join('');
    document.getElementById('conqCategorias').innerHTML = [...new Set(conquistasAdmin.conquistas.map(c => c.categoria))]
        .map(c => `<option value="${escapeHtml(c)}">`).join('');
    ajustarCampoParametro();
    desenharConquistas();
}

function desenharConquistas() {
    if (conquistasAdmin.conquistas.length === 0) {
        listaConquistas.innerHTML = '<p class="msg-vazia">Nenhuma conquista cadastrada.</p>';
        return;
    }
    listaConquistas.innerHTML = conquistasAdmin.conquistas.map(c => {
        const m = metricaPorId(c.metrica);
        const unidade = m ? m.unidade : '';
        const regra = `${m ? m.rotulo : c.metrica}${c.parametro ? ` · ${c.parametro}` : ''}`;
        return `
            <div class="conq-linha ${c.ativa ? '' : 'inativa'}" data-id="${escapeHtml(c.id)}">
                <span class="conq-linha-icone">${escapeHtml(c.icone)}</span>
                <div class="conq-linha-corpo">
                    <div class="conq-linha-nome">${escapeHtml(c.nome)}
                        <span class="conq-etiqueta">${escapeHtml(c.categoria)}</span>
                        ${c.padrao ? '<span class="conq-etiqueta padrao">padrão</span>' : '<span class="conq-etiqueta custom">sua</span>'}</div>
                    <div class="conq-linha-sub">${escapeHtml(regra)}</div>
                    <div class="conq-linha-sub">Metas: ${c.metas.map(x => `${x}${unidade}`).join(' → ')}</div>
                </div>
                <label class="chave" title="Ativar ou desativar"><input type="checkbox" data-ativa ${c.ativa ? 'checked' : ''}><span></span></label>
                <button class="mini" data-editar>Editar</button>
                ${c.padrao ? '' : '<button class="mini perigo" data-excluir>Excluir</button>'}
            </div>`;
    }).join('');
}

function ajustarCampoParametro(valor = null) {
    const m = metricaPorId(conqMetrica.value);
    const campo = document.getElementById('campoConqParametro');
    campo.classList.toggle('hidden', !(m && m.parametro));
    if (m && m.parametro) {
        document.getElementById('rotuloConqParametro').textContent = m.parametro.rotulo;
        const input = document.getElementById('conqParametro');
        input.placeholder = m.parametro.tipo === 'numero' ? 'Ex: 9' : 'Ex: TCC00289';
        input.value = valor ?? m.parametro.padrao ?? '';
    }
}
conqMetrica.addEventListener('change', () => ajustarCampoParametro());

function limparFormConquista() {
    conquistaEditando = null;
    ['conqNome', 'conqDescricao', 'conqCategoria', 'conqMeta1', 'conqMeta2', 'conqMeta3', 'conqMeta4'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('conqIcone').value = '🏅';
    document.getElementById('conqAtiva').checked = true;
    document.getElementById('conqFormTitulo').textContent = 'Nova conquista';
    document.getElementById('btnSalvarConquista').textContent = 'Criar conquista';
    document.getElementById('btnCancelarConquista').classList.add('hidden');
    ajustarCampoParametro();
}

function payloadConquista(c = null) {
    if (c) return { nome: c.nome, icone: c.icone, categoria: c.categoria, descricao: c.descricao, metrica: c.metrica, parametro: c.parametro, metas: c.metas, ativa: c.ativa };
    const metas = [1, 2, 3, 4].map(i => document.getElementById(`conqMeta${i}`).value.replace(',', '.'))
        .filter(v => v !== '').map(Number);
    const m = metricaPorId(conqMetrica.value);
    return {
        nome: document.getElementById('conqNome').value.trim(),
        icone: document.getElementById('conqIcone').value.trim() || '🏅',
        categoria: document.getElementById('conqCategoria').value.trim() || 'Geral',
        descricao: document.getElementById('conqDescricao').value.trim(),
        metrica: conqMetrica.value,
        parametro: m && m.parametro ? document.getElementById('conqParametro').value.trim() : null,
        metas,
        ativa: document.getElementById('conqAtiva').checked
    };
}

document.getElementById('btnSalvarConquista').addEventListener('click', async () => {
    const payload = payloadConquista();
    if (!payload.nome) { mostrarToast('Dê um nome para a conquista.', 'erro'); return; }
    if (payload.metas.length === 0 || payload.metas.some(Number.isNaN)) { mostrarToast('Preencha ao menos a meta 1.', 'erro'); return; }
    try {
        const res = conquistaEditando
            ? await api(`/admin/conquistas/${encodeURIComponent(conquistaEditando)}`, { method: 'PUT', body: JSON.stringify(payload) })
            : await api('/admin/conquistas', { method: 'POST', body: JSON.stringify(payload) });
        mostrarToast(res.mensagem);
        limparFormConquista();
        await carregarConquistasAdmin();
        carregarLogs();
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
});

document.getElementById('btnCancelarConquista').addEventListener('click', limparFormConquista);

listaConquistas.addEventListener('click', async (e) => {
    const linha = e.target.closest('.conq-linha');
    if (!linha) return;
    const c = conquistasAdmin.conquistas.find(x => x.id === linha.dataset.id);
    if (!c) return;

    if (e.target.closest('[data-editar]')) {
        conquistaEditando = c.id;
        document.getElementById('conqNome').value = c.nome;
        document.getElementById('conqIcone').value = c.icone;
        document.getElementById('conqCategoria').value = c.categoria;
        document.getElementById('conqDescricao').value = c.descricao;
        conqMetrica.value = c.metrica;
        ajustarCampoParametro(c.parametro);
        [1, 2, 3, 4].forEach(i => document.getElementById(`conqMeta${i}`).value = c.metas[i - 1] ?? '');
        document.getElementById('conqAtiva').checked = c.ativa;
        document.getElementById('conqFormTitulo').textContent = `Editando: ${c.nome}`;
        document.getElementById('btnSalvarConquista').textContent = 'Salvar alterações';
        document.getElementById('btnCancelarConquista').classList.remove('hidden');
        document.getElementById('conqNome').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (e.target.closest('[data-excluir]')) {
        const ok = await confirmar({
            titulo: 'Excluir conquista?',
            mensagem: `"${c.nome}" deixa de existir para todos os alunos.`,
            confirmarTexto: 'Excluir', perigo: true
        });
        if (!ok) return;
        try {
            mostrarToast((await api(`/admin/conquistas/${encodeURIComponent(c.id)}`, { method: 'DELETE' })).mensagem);
            await carregarConquistasAdmin();
            carregarLogs();
        } catch (err) {
            mostrarToast(err.message, 'erro');
        }
    }
});

// Liga/desliga uma conquista direto na lista
listaConquistas.addEventListener('change', async (e) => {
    const chave = e.target.closest('[data-ativa]');
    if (!chave) return;
    const c = conquistasAdmin.conquistas.find(x => x.id === chave.closest('.conq-linha').dataset.id);
    if (!c) return;
    try {
        await api(`/admin/conquistas/${encodeURIComponent(c.id)}`, {
            method: 'PUT', body: JSON.stringify({ ...payloadConquista(c), ativa: chave.checked })
        });
        c.ativa = chave.checked;
        desenharConquistas();
    } catch (err) {
        chave.checked = !chave.checked;
        mostrarToast(err.message, 'erro');
    }
});