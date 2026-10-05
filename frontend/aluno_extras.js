// Abas do perfil: Conquistas, Simulador de CR e Previsão de formatura
const exNome = new URLSearchParams(location.search).get('nome');

const exFmt = (n, casas = 1) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: casas });

// ---------- contas (funções puras) ----------
// Notas informadas -> CR projetado e média necessária para atingir um CR-alvo
function calcularSimulacao(sim, notas, alvo) {
    const preenchidas = sim.materias.filter(m => notas[m.id] !== null && notas[m.id] !== undefined);
    const vazias = sim.materias.filter(m => !preenchidas.includes(m));
    const horasPreenchidas = preenchidas.reduce((s, m) => s + m.horas, 0);
    const horasVazias = vazias.reduce((s, m) => s + m.horas, 0);

    const somaNH = sim.soma_nota_horas + preenchidas.reduce((s, m) => s + notas[m.id] * m.horas, 0);
    const somaH = sim.soma_horas + horasPreenchidas;
    const projetado = somaH ? somaNH / somaH : null;

    let meta = null;
    if (alvo !== null && alvo !== undefined) {
        if (vazias.length === 0) {
            meta = { tipo: 'completo', atinge: projetado !== null && projetado >= alvo - 1e-9 };
        } else {
            const total = somaH + horasVazias;
            const necessaria = (alvo * total - somaNH) / horasVazias;
            const maximo = (somaNH + 10 * horasVazias) / total;
            meta = {
                tipo: necessaria > 10 ? 'impossivel' : necessaria <= 6 ? 'facil' : 'normal',
                necessaria, maximo, materias: vazias.length, horas: horasVazias
            };
        }
    }
    return { projetado, meta };
}

function somarSemestres(base, n) {
    const [ano, parte] = base.split('.').map(Number);
    const i = ano * 2 + (parte - 1) + n;
    return `${Math.floor(i / 2)}.${(i % 2) + 1}`;
}

// Horas por semestre -> semestre de formatura
function calcularFormatura(prev, ritmo) {
    if (!prev.semestre_base) return null;
    if (prev.a_cursar === 0) return { semestres: 0, semestre: prev.semestre_base };
    if (!ritmo || ritmo <= 0) return null;
    const semestres = Math.ceil(prev.a_cursar / ritmo);
    return { semestres, semestre: somarSemestres(prev.semestre_base, semestres) };
}

// ---------- planejador de semestres (funções puras) ----------
// Problemas de um item dentro do plano: pré-requisito fora do plano ou no mesmo semestre / depois
function problemasDoItem(item, atrib, idsPool) {
    const i = atrib[item.id];
    if (i === undefined) return [];
    const problemas = [];
    item.pre.forEach(p => {
        if (!idsPool.has(p)) return; // já concluído ou em curso: não atrapalha
        const nomePre = (item.pre_nomes && item.pre_nomes[p]) || p;
        if (atrib[p] === undefined) problemas.push(`${nomePre} ainda não está no plano`);
        else if (atrib[p] >= i) problemas.push(`${nomePre} precisa ficar em um semestre anterior`);
    });
    return problemas;
}

// Distribui as matérias semestre a semestre respeitando pré-requisitos e o limite de horas
function distribuirAutomatico(itens, capacidade, maxSemestres = 16) {
    const idsPool = new Set(itens.map(i => i.id));
    const ordem = [...itens].sort((a, b) => a.periodo - b.periodo || a.nome.localeCompare(b.nome));
    const atrib = {};
    const feitos = new Set();
    let semestre = 0;
    while (ordem.some(i => atrib[i.id] === undefined) && semestre < maxSemestres) {
        let horas = 0;
        const deste = [];
        for (const it of ordem) {
            if (atrib[it.id] !== undefined) continue;
            if (!it.pre.every(p => !idsPool.has(p) || feitos.has(p))) continue;
            if (horas + it.horas > capacidade && deste.length > 0) continue;
            deste.push(it);
            horas += it.horas;
        }
        if (deste.length === 0) break;
        deste.forEach(it => { atrib[it.id] = semestre; });
        deste.forEach(it => feitos.add(it.id));
        semestre++;
    }
    return { atrib, semestres: semestre };
}

(() => {
    const abas = document.getElementById('abasPerfil');
    const painelConq = document.getElementById('painel-conquistas');
    const painelSim = document.getElementById('painel-simulador');
    const painelForm = document.getElementById('painel-formatura');
    if (!exNome || !abas || !painelConq) return;

    const carregado = {};
    document.addEventListener('aba-perfil', (e) => {
        const aba = e.detail;
        if (carregado[aba]) return;
        if (aba === 'conquistas') { carregado[aba] = true; carregarConquistas(); }
        if (aba === 'simulador') { carregado[aba] = true; carregarSimulador(); }
        if (aba === 'formatura') { carregado[aba] = true; carregarFormatura(); }
    });

    const aoErro = (painel, e) => { painel.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`; };
    const base = `/alunos/${encodeURIComponent(exNome)}`;

    // =========================================================
    // CONQUISTAS
    // =========================================================
    async function carregarConquistas() {
        painelConq.innerHTML = '<p class="msg-vazia">Carregando conquistas...</p>';
        try { painelConq.innerHTML = htmlConquistas(await api(`${base}/conquistas`)); } catch (e) { aoErro(painelConq, e); }
    }

    function cartaoConquista(c) {
        const un = c.unidade;
        const fim = c.proxima_meta === null;
        const tom = (i) => c.metas.length === 1 ? 3 : i + 1; // conquista de nível único usa a cor de ouro
        const pips = c.metas.map((meta, i) =>
            `<span class="pip ${i < c.nivel ? `ligado n${tom(i)}` : ''}" title="${c.niveis_nomes[i]}: ${exFmt(meta)}${un}"></span>`).join('');
        const rodape = !c.disponivel
            ? '<p class="conq-nota">Meta ainda não definida: configure em Admin → Formação.</p>'
            : fim
                ? '<p class="conq-nota ok">Nível máximo alcançado! 🎉</p>'
                : `<div class="barra-mini"><div class="mini-ok" style="width:${c.progresso}%"></div></div>
                   <p class="conq-nota">${c.metas.length === 1 ? 'Meta' : `Próximo nível (${c.niveis_nomes[c.nivel]})`}: ${exFmt(c.valor, 2)}${un} / ${exFmt(c.proxima_meta)}${un}</p>`;
        return `
            <div class="conq-card ${c.nivel ? `tem n${tom(c.nivel - 1)}` : 'bloqueada'} ${c.disponivel ? '' : 'indisponivel'}">
                <div class="conq-topo">
                    <span class="conq-icone">${c.icone}</span>
                    <div class="conq-titulo"><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.descricao)}</small></div>
                    ${c.nivel_nome ? `<span class="conq-selo n${tom(c.nivel - 1)}">${escapeHtml(c.nivel_nome)}</span>` : '<span class="conq-selo vazio">Bloqueada</span>'}
                </div>
                <div class="conq-valor">${exFmt(c.valor, 2)}<small>${un}</small></div>
                <div class="pips">${pips}</div>
                ${rodape}
            </div>`;
    }

    function htmlConquistas(d) {
        const categorias = [...new Set(d.conquistas.map(c => c.categoria))];
        const pct = d.pontos_maximos ? (d.pontos / d.pontos_maximos) * 100 : 0;
        return `
            <div class="admin-card conq-resumo">
                <div class="conq-resumo-topo">
                    <div><div class="rotulo-campo">Pontos de conquista</div>
                        <div class="conq-pontos">${d.pontos}<small> / ${d.pontos_maximos}</small></div></div>
                    <p class="dica" style="margin:0">${d.niveis_desbloqueados} de ${d.niveis_totais} níveis desbloqueados.<br>
                        Bronze 1 pt · Prata 2 · Ouro 3 · Diamante 5 (conquista de nível único: 2 pts)</p>
                </div>
                <div class="barra-mini" style="height:10px"><div class="mini-ok" style="width:${pct}%"></div></div>
            </div>
            ${categorias.map(cat => `
                <h3 class="conq-cat">${escapeHtml(cat)}</h3>
                <div class="conq-grid">${d.conquistas.filter(c => c.categoria === cat).map(cartaoConquista).join('')}</div>`).join('')}
        `;
    }

    // =========================================================
    // SIMULADOR DE CR
    // =========================================================
    let sim = null;
    let notas = {};
    let alvoDigitado = '';
    let contadorHipotetica = 0;

    async function carregarSimulador() {
        painelSim.innerHTML = '<p class="msg-vazia">Carregando simulador...</p>';
        try {
            sim = await api(`${base}/simulador`);
            notas = Object.fromEntries(sim.materias.map(m => [m.id, null]));
            desenharSimulador();
        } catch (e) { aoErro(painelSim, e); }
    }

    function desenharSimulador() {
        if (sim.materias.length === 0) {
            painelSim.innerHTML = `<div class="admin-card"><h2>Simulador de CR</h2>
                <p class="msg-vazia">Nenhuma matéria em curso. Marque matérias como "Inscrito" no Dashboard para simular o CR.</p></div>`;
            return;
        }
        const linhas = sim.materias.map(m => `
            <tr><td>${escapeHtml(m.nome)}<div class="cod">${m.hipotetica ? 'hipotética (só para teste)' : escapeHtml(m.id)}</div></td>
                <td class="num">${m.horas}h</td>
                <td class="num"><input type="number" class="sim-nota" data-id="${escapeHtml(m.id)}" min="0" max="10" step="0.1" placeholder="—" value="${notas[m.id] ?? ''}">
                    ${m.hipotetica ? `<button class="mini perigo sim-remover" data-remover="${escapeHtml(m.id)}" title="Remover">×</button>` : ''}</td></tr>`).join('');
        painelSim.innerHTML = `
            <div class="admin-card">
                <h2>Simulador de CR</h2>
                <p class="dica">Informe a nota que você espera em cada matéria em curso. A conta é a mesma do CR do perfil: Σ(nota × horas) ÷ Σ(horas).</p>
                <div class="stats-grid sim-stats">
                    <div class="stat-card"><div class="rotulo">CR atual</div><div class="valor">${sim.cr_atual === null ? '—' : sim.cr_atual.toFixed(2)}</div></div>
                    <div class="stat-card destaque"><div class="rotulo">CR projetado</div><div class="valor" id="simProjetado">—</div>
                        <div class="detalhe" id="simDiferenca">Preencha ao menos uma nota</div></div>
                </div>
                <table class="tabela-simples">
                    <thead><tr><th>Matéria em curso</th><th class="num">Carga</th><th class="num">Nota esperada</th></tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
                <div class="sim-acoes">
                    <input type="number" id="simTodas" min="0" max="10" step="0.1" placeholder="Nota">
                    <button class="btn-neutro" id="simAplicar">Aplicar a todas</button>
                    <button class="btn-neutro" id="simLimpar">Limpar</button>
                </div>
                <div class="sim-hipotetica">
                    <p class="rotulo-campo">Testar uma matéria que você ainda não cursa (não salva nada)</p>
                    <div class="sim-acoes" style="margin-top:6px">
                        <input type="text" id="hipNome" placeholder="Nome (opcional)">
                        <input type="number" id="hipHoras" min="1" step="1" placeholder="Carga (h)" style="width:110px">
                        <input type="number" id="hipNota" min="0" max="10" step="0.1" placeholder="Nota" style="width:90px">
                        <button class="btn-neutro" id="hipAdicionar">Adicionar à simulação</button>
                    </div>
                </div>
            </div>
            <div class="admin-card">
                <h2>Meta de CR</h2>
                <p class="dica">Descubra a média que você precisa tirar nas matérias que ainda estão sem nota para chegar ao CR desejado.</p>
                <div class="sim-acoes">
                    <input type="number" id="simAlvo" min="0" max="10" step="0.01" placeholder="CR desejado (ex: 8,00)" value="${alvoDigitado}">
                </div>
                <div id="simMeta" class="sim-meta"><p class="msg-vazia">Digite o CR que você quer alcançar.</p></div>
            </div>`;
        atualizarSimulacao();
    }

    const lerNumero = (el) => (el.value === '' || Number.isNaN(parseFloat(el.value))) ? null : Math.min(10, Math.max(0, parseFloat(el.value)));

    function atualizarSimulacao() {
        const alvo = lerNumero(document.getElementById('simAlvo'));
        const r = calcularSimulacao(sim, notas, alvo);
        document.getElementById('simProjetado').textContent = r.projetado === null ? '—' : r.projetado.toFixed(2);
        const dif = document.getElementById('simDiferenca');
        if (r.projetado === null) {
            dif.textContent = 'Preencha ao menos uma nota';
            dif.className = 'detalhe';
        } else if (sim.cr_atual === null) {
            dif.textContent = '';
        } else {
            const d = r.projetado - sim.cr_atual;
            dif.textContent = `${d >= 0 ? '+' : ''}${d.toFixed(2)} em relação ao CR atual`;
            dif.className = `detalhe ${d >= 0 ? 'n-verde' : 'n-vermelho'}`;
        }

        const box = document.getElementById('simMeta');
        const m = r.meta;
        if (!m) { box.innerHTML = '<p class="msg-vazia">Digite o CR que você quer alcançar.</p>'; return; }
        if (m.tipo === 'completo') {
            box.innerHTML = m.atinge
                ? `<p class="sim-ok">✓ Com as notas informadas o CR fica em <b>${r.projetado.toFixed(2)}</b>: meta atingida.</p>`
                : `<p class="sim-ruim">Com as notas informadas o CR fica em <b>${r.projetado === null ? '—' : r.projetado.toFixed(2)}</b>, abaixo da meta. Apague alguma nota para ver quanto falta tirar.</p>`;
        } else if (m.tipo === 'impossivel') {
            box.innerHTML = `<p class="sim-ruim">Não dá para chegar lá só com estas matérias: mesmo com 10 em todas as ${m.materias} sem nota, o CR chega a no máximo <b>${m.maximo.toFixed(2)}</b>.</p>`;
        } else if (m.tipo === 'facil') {
            box.innerHTML = `<p class="sim-ok">✓ Meta praticamente garantida: bastaria ser aprovado (nota 6,0 ou mais) nas ${m.materias} matéria(s) sem nota.</p>`;
        } else {
            box.innerHTML = `<p class="sim-meta-destaque">Você precisa de média <b>${exFmt(Math.ceil(m.necessaria * 100) / 100, 2)}</b> nas ${m.materias} matéria(s) sem nota (${m.horas}h).</p>
                <p class="dica">O máximo possível com estas matérias é CR ${m.maximo.toFixed(2)}.</p>`;
        }
    }

    painelSim.addEventListener('input', (e) => {
        const campo = e.target.closest('.sim-nota');
        if (campo) notas[campo.dataset.id] = lerNumero(campo);
        if (e.target.id === 'simAlvo') alvoDigitado = e.target.value;
        if (campo || e.target.id === 'simAlvo') atualizarSimulacao();
    });
    painelSim.addEventListener('click', (e) => {
        if (e.target.id === 'simAplicar') {
            const v = lerNumero(document.getElementById('simTodas'));
            if (v === null) { mostrarToast('Digite uma nota para aplicar a todas.', 'erro'); return; }
            painelSim.querySelectorAll('.sim-nota').forEach(c => { c.value = v; notas[c.dataset.id] = v; });
            atualizarSimulacao();
        } else if (e.target.id === 'hipAdicionar') {
            const horas = parseInt(document.getElementById('hipHoras').value);
            if (!horas || horas <= 0) { mostrarToast('Informe a carga horária da matéria de teste.', 'erro'); return; }
            const id = `hip-${++contadorHipotetica}`;
            const nomeHip = document.getElementById('hipNome').value.trim() || `Matéria de teste ${contadorHipotetica}`;
            sim.materias.push({ id, nome: nomeHip, horas, hipotetica: true });
            notas[id] = lerNumero(document.getElementById('hipNota'));
            desenharSimulador();
        } else if (e.target.closest('[data-remover]')) {
            const id = e.target.closest('[data-remover]').dataset.remover;
            sim.materias = sim.materias.filter(m => m.id !== id);
            delete notas[id];
            desenharSimulador();
        } else if (e.target.id === 'simLimpar') {
            painelSim.querySelectorAll('.sim-nota').forEach(c => { c.value = ''; notas[c.dataset.id] = null; });
            document.getElementById('simTodas').value = '';
            atualizarSimulacao();
        }
    });

    // =========================================================
    // PREVISÃO DE FORMATURA
    // =========================================================
    let prev = null;
    const MATERIA_MEDIA = 64; // carga típica de uma matéria, para os botões "mais leve / mais pesado"

    async function carregarFormatura() {
        painelForm.innerHTML = '<p class="msg-vazia">Calculando previsão...</p>';
        try {
            prev = await api(`${base}/previsao`);
            desenharFormatura();
        } catch (e) { aoErro(painelForm, e); }
    }

    function desenharFormatura() {
        if (!prev.disponivel) {
            painelForm.innerHTML = `<div class="admin-card"><h2>Previsão de formatura</h2>
                <p class="msg-vazia">Ainda não há semestres com período letivo informado. Preencha o "Período letivo" (ex: 2024.1) ao salvar as matérias no Dashboard.</p></div>`;
            return;
        }
        const maxHoras = Math.max(...prev.historico.map(h => h.horas), prev.ritmo || 0, 1);
        const colunas = prev.historico.map(h => `
            <div class="coluna-grafico" title="${escapeHtml(h.semestre)}: ${h.horas}h${h.em_curso ? ' (em curso)' : ''}">
                <div class="valor-grafico">${h.horas}h</div>
                <div class="area-barra"><div class="trilho" style="height:${(h.horas / maxHoras) * 100}%">
                    <div class="${h.em_curso ? 'insc' : 'concl'}" style="height:100%"></div></div></div>
                <div class="rotulo-grafico">${escapeHtml(h.semestre)}</div>
            </div>`).join('');

        painelForm.innerHTML = `
            <div class="segmentado fm-seg">
                <button class="seg-botao ativo" data-fm="auto">Estimativa automática</button>
                <button class="seg-botao" data-fm="plano">Montar meu plano</button>
            </div>
            <div id="fmAuto" class="fm-painel">
            <div class="admin-card formatura-topo">
                <div>
                    <div class="rotulo-campo">Previsão de formatura</div>
                    <div class="formatura-semestre" id="fmSemestre">—</div>
                    <p class="dica" id="fmDetalhe" style="margin:6px 0 0"></p>
                </div>
            </div>
            <div class="stats-grid">
                <div class="stat-card"><div class="rotulo">Horas que faltam</div><div class="valor">${exFmt(prev.horas_restantes, 0)}h</div>
                    <div class="detalhe">de ${exFmt(prev.horas_totais, 0)}h do curso</div></div>
                <div class="stat-card"><div class="rotulo">Em curso agora</div><div class="valor azul">${exFmt(prev.horas_inscritas, 0)}h</div>
                    <div class="detalhe">${prev.semestre_base ? `semestre ${escapeHtml(prev.semestre_base)}` : ''}</div></div>
                <div class="stat-card"><div class="rotulo">A cursar depois</div><div class="valor">${exFmt(prev.a_cursar, 0)}h</div></div>
                <div class="stat-card"><div class="rotulo">Seu ritmo</div><div class="valor verde">${prev.ritmo ? `${exFmt(prev.ritmo, 0)}h` : '—'}</div>
                    <div class="detalhe">média dos últimos semestres concluídos</div></div>
            </div>
            <div class="admin-card">
                <h2>E se eu mudar o ritmo?</h2>
                <p class="dica">Ajuste quantas horas por semestre você pretende cursar daqui para frente (uma matéria costuma ter ~${MATERIA_MEDIA}h).</p>
                <div class="sim-acoes">
                    <input type="number" id="fmRitmo" min="16" step="4" value="${prev.ritmo ?? ''}" placeholder="Horas/semestre">
                    <button class="btn-neutro" data-ritmo="-${MATERIA_MEDIA}">− 1 matéria</button>
                    <button class="btn-neutro" data-ritmo="0">Meu ritmo</button>
                    <button class="btn-neutro" data-ritmo="${MATERIA_MEDIA}">+ 1 matéria</button>
                </div>
            </div>
            <div class="admin-card">
                <h2>Horas concluídas por semestre</h2>
                <div class="grafico">${colunas}</div>
                <div class="legenda">
                    <span><i style="background:#22c55e"></i>Concluídas</span>
                    <span><i style="background:var(--accent-color)"></i>Em curso (inscritas)</span>
                </div>
            </div>
            <p class="dica">Estimativa simples: divide as horas que faltam pelo ritmo. Não considera pré-requisitos, oferta de turmas nem o projeto final.${prev.complementares_faltam ? ` Faltam ainda ${exFmt(prev.complementares_faltam, 1)}h de atividades complementares, que não dependem do semestre.` : ''}</p>
            </div>
            <div id="fmPlano" class="fm-painel hidden"></div>`;
        atualizarFormatura();
    }

    function atualizarFormatura() {
        const campo = document.getElementById('fmRitmo');
        const ritmo = parseFloat(campo.value);
        const r = calcularFormatura(prev, ritmo);
        const sem = document.getElementById('fmSemestre');
        const det = document.getElementById('fmDetalhe');
        if (!r) {
            sem.textContent = '—';
            det.textContent = 'Informe um ritmo (horas por semestre) para calcular.';
            return;
        }
        sem.textContent = r.semestre;
        det.textContent = r.semestres === 0
            ? `As horas que faltam já estão no semestre em curso (${prev.semestre_base}).`
            : `≈ ${r.semestres} semestre(s) depois de ${prev.semestre_base}, a ${exFmt(ritmo, 0)}h por semestre (${exFmt(r.semestres / 2, 1)} ano(s)).`;
    }

    painelForm.addEventListener('input', (e) => { if (e.target.id === 'fmRitmo') atualizarFormatura(); });
    painelForm.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ritmo]');
        if (!b) return;
        const campo = document.getElementById('fmRitmo');
        const delta = Number(b.dataset.ritmo);
        campo.value = delta === 0 ? (prev.ritmo ?? '') : Math.max(16, (parseFloat(campo.value) || prev.ritmo || 0) + delta);
        atualizarFormatura();
    });

    // =========================================================
    // PLANEJADOR: montar as matérias por semestre (fica só na tela / neste navegador, não vai ao banco)
    // =========================================================
    let planej = null;       // dados do servidor
    let plano = { atrib: {}, semestres: 4, capacidade: 380 };
    let idsPool = new Set();
    const chavePlano = `uff_plano_${exNome}`;

    const salvarPlano = () => { try { localStorage.setItem(chavePlano, JSON.stringify(plano)); } catch { /* sem storage */ } };
    function lerPlanoSalvo() {
        try {
            const salvo = JSON.parse(localStorage.getItem(chavePlano) || 'null');
            if (!salvo) return;
            plano.semestres = Math.max(1, Math.min(16, salvo.semestres || 4));
            plano.capacidade = salvo.capacidade || plano.capacidade;
            // Só reaproveita matérias que ainda estão pendentes
            Object.entries(salvo.atrib || {}).forEach(([id, i]) => { if (idsPool.has(id) && i < plano.semestres) plano.atrib[id] = i; });
        } catch { /* plano antigo ilegível: ignora */ }
    }

    async function abrirPlanejador() {
        const caixa = document.getElementById('fmPlano');
        if (planej) { desenharPlano(); return; }
        caixa.innerHTML = '<p class="msg-vazia">Carregando matérias que faltam...</p>';
        try {
            planej = await api(`${base}/planejador`);
            idsPool = new Set(planej.itens.map(i => i.id));
            plano.capacidade = planej.ritmo || 380;
            lerPlanoSalvo();
            desenharPlano();
        } catch (e) { aoErro(caixa, e); }
    }

    const nomeSemestre = (i) => somarSemestres(planej.semestre_base, i + 1);

    function resultadoPlano() {
        const naoAlocadas = planej.itens.filter(i => plano.atrib[i.id] === undefined);
        const alocados = Object.values(plano.atrib);
        const comProblema = planej.itens.filter(i => problemasDoItem(i, plano.atrib, idsPool).length > 0);
        const ultimo = alocados.length ? Math.max(...alocados) : null;
        return { naoAlocadas, comProblema, formatura: naoAlocadas.length === 0 && ultimo !== null ? nomeSemestre(ultimo) : null, ultimo };
    }

    function cartaoPlano(it) {
        const probs = problemasDoItem(it, plano.atrib, idsPool);
        const atual = plano.atrib[it.id];
        const opcoes = ['<option value="">A cursar (sem semestre)</option>']
            .concat(Array.from({ length: plano.semestres }, (_, i) =>
                `<option value="${i}" ${atual === i ? 'selected' : ''}>${nomeSemestre(i)}</option>`)).join('');
        return `
            <div class="plano-card ${probs.length ? 'problema' : ''}" draggable="true" data-id="${escapeHtml(it.id)}">
                <div class="plano-card-nome">${escapeHtml(it.nome)}</div>
                <div class="plano-card-meta">${it.horas}h · ${it.optativa ? 'optativa' : `${it.periodo}º período`}</div>
                ${probs.length ? `<div class="plano-card-aviso" title="${escapeHtml(probs.join('; '))}">⚠ ${escapeHtml(probs[0])}</div>` : ''}
                <select class="plano-select" data-id="${escapeHtml(it.id)}">${opcoes}</select>
            </div>`;
    }

    function desenharPlano() {
        const caixa = document.getElementById('fmPlano');
        if (planej.itens.length === 0) {
            caixa.innerHTML = '<div class="admin-card"><p class="msg-vazia">Não há mais matérias a planejar: tudo já está concluído ou em curso. 🎉</p></div>';
            return;
        }
        if (!planej.disponivel) {
            caixa.innerHTML = '<div class="admin-card"><p class="msg-vazia">Informe o período letivo das matérias que você já cursou para o plano saber em qual semestre começar.</p></div>';
            return;
        }
        const r = resultadoPlano();
        const horasDe = (i) => planej.itens.filter(it => plano.atrib[it.id] === i).reduce((s, it) => s + it.horas, 0);

        const colunas = [`
            <div class="plano-col" data-col="pool">
                <div class="plano-col-cab"><b>A cursar</b><span>${r.naoAlocadas.length} matéria(s)</span></div>
                <div class="plano-col-corpo">${r.naoAlocadas.length
                    ? [...r.naoAlocadas].sort((a, b) => a.periodo - b.periodo || a.nome.localeCompare(b.nome)).map(cartaoPlano).join('')
                    : '<p class="msg-vazia">Tudo distribuído ✓</p>'}</div>
            </div>`];
        for (let i = 0; i < plano.semestres; i++) {
            const lista = planej.itens.filter(it => plano.atrib[it.id] === i);
            const horas = horasDe(i);
            colunas.push(`
                <div class="plano-col" data-col="${i}">
                    <div class="plano-col-cab"><b>${nomeSemestre(i)}</b>
                        <span class="${horas > plano.capacidade * 1.15 ? 'pesado' : ''}">${horas}h${horas > plano.capacidade * 1.15 ? ' · pesado' : ''}</span></div>
                    <div class="plano-col-corpo">${lista.length ? lista.map(cartaoPlano).join('') : '<p class="plano-vazio">Arraste matérias para cá</p>'}</div>
                </div>`);
        }
        const rolagem = document.querySelector('.plano-quadro');
        const antes = rolagem ? rolagem.scrollLeft : 0;

        caixa.innerHTML = `
            <div class="admin-card formatura-topo">
                <div class="rotulo-campo">Formatura neste plano</div>
                <div class="formatura-semestre">${r.formatura ?? '—'}</div>
                <p class="dica" style="margin:6px 0 0">${
                    r.formatura
                        ? `${planej.itens.length} matéria(s) distribuídas${r.comProblema.length ? `, mas ${r.comProblema.length} com pré-requisito fora de ordem` : ' sem conflitos de pré-requisito'}.${planej.semestre_formatura_estimado ? ` Estimativa automática: ${planej.semestre_formatura_estimado}.` : ''}`
                        : `Faltam ${r.naoAlocadas.length} matéria(s) sem semestre. Arraste para um semestre, escolha no menu do cartão ou use "Distribuir automaticamente".`}</p>
            </div>
            <div class="sim-acoes plano-barra">
                <label class="plano-rotulo">Horas por semestre (para a distribuição automática)</label>
                <input type="number" id="planoCapacidade" min="60" step="4" value="${plano.capacidade}" style="width:110px">
                <button class="btn-neutro" id="planoAuto">Distribuir automaticamente</button>
                <button class="btn-neutro" id="planoMais">+ semestre</button>
                <button class="btn-neutro" id="planoMenos">− semestre</button>
                <button class="btn-neutro" id="planoLimpar">Limpar plano</button>
            </div>
            <div class="plano-quadro">${colunas.join('')}</div>
            <p class="dica">Este plano é só uma simulação: não é salvo no banco (fica guardado apenas neste navegador). Pré-requisitos precisam estar em um semestre anterior; matérias que você já está cursando contam como concluídas para os semestres futuros.</p>`;
        document.querySelector('.plano-quadro').scrollLeft = antes;
    }

    const fmPlano = () => document.getElementById('fmPlano');

    painelForm.addEventListener('click', (e) => {
        const seg = e.target.closest('[data-fm]');
        if (seg) {
            painelForm.querySelectorAll('.fm-seg .seg-botao').forEach(b => b.classList.toggle('ativo', b === seg));
            document.getElementById('fmAuto').classList.toggle('hidden', seg.dataset.fm !== 'auto');
            fmPlano().classList.toggle('hidden', seg.dataset.fm !== 'plano');
            if (seg.dataset.fm === 'plano') abrirPlanejador();
            return;
        }
        if (!planej) return;
        if (e.target.id === 'planoAuto') {
            const cap = parseFloat(document.getElementById('planoCapacidade').value) || plano.capacidade;
            plano.capacidade = cap;
            const r = distribuirAutomatico(planej.itens, cap);
            plano.atrib = r.atrib;
            plano.semestres = Math.max(r.semestres, 1);
            salvarPlano(); desenharPlano();
        } else if (e.target.id === 'planoMais') {
            plano.semestres = Math.min(16, plano.semestres + 1); salvarPlano(); desenharPlano();
        } else if (e.target.id === 'planoMenos') {
            const usado = Object.values(plano.atrib);
            const minimo = usado.length ? Math.max(...usado) + 1 : 1;
            if (plano.semestres <= minimo) { mostrarToast('Esse semestre ainda tem matérias: mova-as antes de removê-lo.', 'erro'); return; }
            plano.semestres--; salvarPlano(); desenharPlano();
        } else if (e.target.id === 'planoLimpar') {
            plano.atrib = {}; salvarPlano(); desenharPlano();
        }
    });

    painelForm.addEventListener('change', (e) => {
        if (e.target.id === 'planoCapacidade') { plano.capacidade = parseFloat(e.target.value) || plano.capacidade; salvarPlano(); return; }
        const sel = e.target.closest('.plano-select');
        if (!sel) return;
        if (sel.value === '') delete plano.atrib[sel.dataset.id]; else plano.atrib[sel.dataset.id] = Number(sel.value);
        salvarPlano(); desenharPlano();
    });

    // Arrastar e soltar entre as colunas
    painelForm.addEventListener('dragstart', (e) => {
        const card = e.target.closest && e.target.closest('.plano-card');
        if (!card) return;
        e.dataTransfer.setData('text/plain', card.dataset.id);
        e.dataTransfer.effectAllowed = 'move';
        card.classList.add('arrastando');
    });
    painelForm.addEventListener('dragend', () => painelForm.querySelectorAll('.arrastando, .alvo').forEach(x => x.classList.remove('arrastando', 'alvo')));
    painelForm.addEventListener('dragover', (e) => {
        const col = e.target.closest && e.target.closest('.plano-col');
        if (!col) return;
        e.preventDefault();
        painelForm.querySelectorAll('.plano-col.alvo').forEach(x => x !== col && x.classList.remove('alvo'));
        col.classList.add('alvo');
    });
    painelForm.addEventListener('drop', (e) => {
        const col = e.target.closest && e.target.closest('.plano-col');
        if (!col || !planej) return;
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!idsPool.has(id)) return;
        if (col.dataset.col === 'pool') delete plano.atrib[id]; else plano.atrib[id] = Number(col.dataset.col);
        salvarPlano(); desenharPlano();
    });
})();