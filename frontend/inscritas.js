const alunoSelect = document.getElementById('alunoSelect');
const conteudo = document.getElementById('conteudo');

let nome = '';
let dados = { materias: [], eventos: [] };
let colegas = { alunos: [], por_materia: {} };
let marcados = new Set(); // colegas marcados para compartilhar a nova data

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// === ALUNOS ===
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const alunos = await api('/alunos');
        alunoSelect.innerHTML = '<option value="">Selecione um aluno...</option>';
        alunos.forEach(a => alunoSelect.appendChild(new Option(a.nome, a.nome)));

        const pedido = new URLSearchParams(location.search).get('nome') || lerUltimoAluno();
        if (pedido && alunos.some(a => a.nome === pedido)) {
            alunoSelect.value = pedido;
            carregar();
        } else {
            conteudo.innerHTML = '<p class="msg-vazia">Escolha um aluno para ver as matérias em curso.</p>';
        }
    } catch (e) {
        alunoSelect.innerHTML = '<option value="">Erro ao conectar com a API</option>';
        mostrarToast(e.message, 'erro');
    }
});

alunoSelect.addEventListener('change', carregar);

async function carregar() {
    nome = alunoSelect.value;
    if (!nome) {
        conteudo.innerHTML = '<p class="msg-vazia">Escolha um aluno para ver as matérias em curso.</p>';
        return;
    }
    salvarUltimoAluno(nome);
    try {
        dados = await api(`/alunos/${encodeURIComponent(nome)}/inscritas`);
        colegas = await api(`/alunos/${encodeURIComponent(nome)}/colegas`);
        marcados = new Set();
        montarPagina();
    } catch (e) {
        conteudo.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

function montarPagina() {
    const opcoes = dados.materias
        .map(m => `<option value="${escapeHtml(m.materia_id)}">${escapeHtml(m.nome)}</option>`).join('');

    conteudo.innerHTML = `
        <div>
            <div id="resumoFaltas" class="dica"></div>
            <div id="areaCards"></div>
        </div>

        <div class="admin-card">
            <h2>📅 Datas importantes</h2>
            <p class="dica">Provas, trabalhos e entregas. Cada data tem um botão para abrir direto no Google Agenda.</p>
            <div class="form-datas">
                <div class="form-group"><label for="evMateria">Matéria</label>
                    <select id="evMateria"><option value="">Geral (sem matéria)</option>${opcoes}</select></div>
                <div class="form-group"><label for="evTipo">Tipo</label>
                    <select id="evTipo">
                        <option>Prova</option><option>Trabalho</option><option>Entrega</option><option>Outro</option>
                    </select></div>
                <div class="form-group"><label for="evTitulo">Título (opcional)</label>
                    <input type="text" id="evTitulo" placeholder="Ex: P1, Trabalho final"></div>
                <div class="form-group"><label for="evData">Data</label>
                    <input type="date" id="evData"></div>
                <div class="form-group"><label for="evHora">Horário (opcional)</label>
                    <input type="time" id="evHora"></div>
            </div>
            <div class="form-datas linha-form">
                <div class="form-group" style="grid-column: span 2"><label for="evObs">Observação (opcional)</label>
                    <input type="text" id="evObs" placeholder="Sala, conteúdo, peso na nota..."></div>
                <button id="btnAddEvento" class="btn-primary">Adicionar data</button>
            </div>

            <div class="compartilhar">
                <p class="rotulo-campo">Compartilhar esta data com (opcional)</p>
                <div id="evCompartilhar" class="compartilhar-lista"></div>
            </div>

            <div id="listaEventos" class="lista-eventos"></div>

            <div class="export-agenda">
                <button id="btnIcs" class="btn-primary">⬇ Baixar todas as próximas datas (.ics)</button>
                <p class="dica" style="margin:0;flex:1;min-width:240px">Para levar tudo de uma vez: no Google Agenda, vá em Configurações → Importar e exportar → Importar e escolha o arquivo .ics.</p>
            </div>
        </div>
    `;

    renderizarCards();
    renderizarEventos();
    renderizarColegas();
    document.getElementById('evMateria').addEventListener('change', () => {
        // Sugere quem está inscrito na mesma matéria (dá para desmarcar)
        const mesma = colegas.por_materia[document.getElementById('evMateria').value] || [];
        marcados = new Set(mesma);
        renderizarColegas();
    });
    document.getElementById('evCompartilhar').addEventListener('change', (e) => {
        const c = e.target.closest('input[type="checkbox"]');
        if (c) (c.checked ? marcados.add(c.value) : marcados.delete(c.value));
        renderizarColegas();
    });
    document.getElementById('btnAddEvento').addEventListener('click', adicionarEvento);
    document.getElementById('btnIcs').addEventListener('click', baixarIcs);
}

// === COMPARTILHAR DATAS ===
function renderizarColegas() {
    const caixa = document.getElementById('evCompartilhar');
    if (!caixa) return;
    if (colegas.alunos.length === 0) {
        caixa.innerHTML = '<p class="msg-vazia">Cadastre mais alunos no Admin para compartilhar datas.</p>';
        return;
    }
    const materia = document.getElementById('evMateria').value;
    const mesma = colegas.por_materia[materia] || [];
    caixa.innerHTML = colegas.alunos.map(a => `
        <label class="chip-check ${marcados.has(a.nome) ? 'marcado' : ''}">
            <input type="checkbox" value="${escapeHtml(a.nome)}" ${marcados.has(a.nome) ? 'checked' : ''}>
            ${escapeHtml(a.apelido)}${mesma.includes(a.nome) ? ' <small>· faz esta matéria</small>' : ''}
        </label>`).join('');
}

// === FALTAS ===
function estadoFaltas(faltas, limite) {
    if (faltas > limite) {
        return { classe: 'reprovado', selo: 'Reprovado por falta', pct: 100 };
    }
    const uso = limite ? faltas / limite : 1;
    const pct = Math.min(uso * 100, 100);
    if (faltas === limite) return { classe: 'perigo', selo: 'No limite', pct };
    if (uso >= 0.75) return { classe: 'perigo', selo: 'Cuidado', pct };
    if (uso >= 0.5) return { classe: 'atencao', selo: 'Atenção', pct };
    return { classe: 'ok', selo: 'Tranquilo', pct };
}

function cardMateria(m) {
    const est = estadoFaltas(m.faltas, m.limite_faltas);
    const restante = m.limite_faltas - m.faltas;
    const info = restante < 0
        ? `Passou do limite em <strong>${-restante}</strong> falta(s). Reprovação por falta.`
        : restante === 0
            ? `Você está <strong>no limite</strong>: a próxima falta reprova.`
            : `Pode faltar mais <strong>${restante}</strong>. Faltam <strong>${restante + 1}</strong> para reprovar por falta.`;
    const meta = [`${escapeHtml(m.materia_id)} · ${m.horas}h`, m.professor ? escapeHtml(m.professor) : null,
        m.periodo_letivo ? escapeHtml(m.periodo_letivo) : null].filter(Boolean).join(' · ');

    return `
        <div class="admin-card card-inscrita ${est.classe}" data-tentativa="${m.tentativa_id}">
            <div class="insc-cab">
                <div><h3>${escapeHtml(m.nome)}</h3><div class="meta">${meta}</div></div>
                <span class="selo ${est.classe}">${est.selo}</span>
            </div>
            <div class="faltas-linha">
                <span class="faltas-num">${m.faltas}</span>
                <span class="faltas-de">/ ${m.limite_faltas} faltas permitidas (25% de ${m.horas}h)</span>
            </div>
            <div class="barra-faltas"><div style="width:${est.pct}%"></div></div>
            <div class="faltas-info">${info}</div>
            <div class="faltas-acoes">
                <button data-delta="-1" ${m.faltas === 0 ? 'disabled' : ''} title="Tirar 1 falta">−1</button>
                <button data-delta="1" title="Adicionar 1 falta">+1</button>
                <button data-delta="2" title="Aula dupla: adicionar 2 faltas">+2</button>
                <input type="number" min="0" max="999" value="${m.faltas}" data-campo-faltas aria-label="Total de faltas">
            </div>
        </div>`;
}

function renderizarCards() {
    const area = document.getElementById('areaCards');
    const resumo = document.getElementById('resumoFaltas');
    if (dados.materias.length === 0) {
        resumo.textContent = '';
        area.innerHTML = '<div class="admin-card"><p class="msg-vazia">Nenhuma matéria com status "Inscrito". Marque matérias como Inscrito no Dashboard para controlar as faltas aqui.</p></div>';
        return;
    }
    const emRisco = dados.materias.filter(m => m.limite_faltas - m.faltas <= 2).length;
    resumo.innerHTML = `${dados.materias.length} matéria(s) em curso${emRisco ? ` · <span class="tag-especial">⚠ ${emRisco} perto do limite de faltas</span>` : ''}`;
    area.innerHTML = `<div class="insc-grid">${dados.materias.map(cardMateria).join('')}</div>`;
}

async function salvarFaltas(tentativaId, valor) {
    const m = dados.materias.find(x => x.tentativa_id === tentativaId);
    if (!m) return;
    valor = Math.max(0, Math.min(999, Math.round(Number(valor))));
    if (Number.isNaN(valor)) { renderizarCards(); return; }
    try {
        const res = await api(`/tentativas/${tentativaId}/faltas`, { method: 'PUT', body: JSON.stringify({ faltas: valor }) });
        m.faltas = res.faltas;
        renderizarCards();
        if (m.faltas > m.limite_faltas) mostrarToast(`${m.nome}: passou do limite de faltas!`, 'erro');
    } catch (e) {
        mostrarToast(e.message, 'erro');
        renderizarCards();
    }
}

conteudo.addEventListener('click', (e) => {
    const botao = e.target.closest('button[data-delta]');
    if (!botao) return;
    const card = botao.closest('[data-tentativa]');
    const id = Number(card.dataset.tentativa);
    const m = dados.materias.find(x => x.tentativa_id === id);
    if (m) salvarFaltas(id, m.faltas + Number(botao.dataset.delta));
});

conteudo.addEventListener('change', (e) => {
    const campo = e.target.closest('[data-campo-faltas]');
    if (!campo) return;
    salvarFaltas(Number(campo.closest('[data-tentativa]').dataset.tentativa), campo.value);
});

// === DATAS ===
function partesData(iso) {
    const [a, m, d] = iso.split('-').map(Number);
    return { a, m, d };
}

function hojeZerado() {
    const h = new Date();
    return new Date(h.getFullYear(), h.getMonth(), h.getDate());
}

function diasAte(iso) {
    const { a, m, d } = partesData(iso);
    return Math.round((new Date(a, m - 1, d) - hojeZerado()) / 86400000);
}

function textoQuando(dias) {
    if (dias === 0) return 'hoje';
    if (dias === 1) return 'amanhã';
    if (dias === -1) return 'ontem';
    return dias > 0 ? `em ${dias} dias` : `há ${-dias} dias`;
}

function tituloAgenda(e) {
    const prefixo = e.tipo !== 'Outro' && !e.titulo.toLowerCase().includes(e.tipo.toLowerCase()) ? `${e.tipo}: ` : '';
    return `${prefixo}${e.titulo}${e.materia_nome ? ` — ${e.materia_nome}` : ''}`;
}

const pad = n => String(n).padStart(2, '0');
const fmtData = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
const fmtDataHora = d => `${fmtData(d)}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

// Intervalo do evento: dia inteiro (sem horário) ou 1h (2h para prova)
function intervalo(e) {
    const { a, m, d } = partesData(e.data);
    if (!e.hora) return { diaInteiro: true, ini: new Date(a, m - 1, d), fim: new Date(a, m - 1, d + 1) };
    const [hh, mm] = e.hora.split(':').map(Number);
    const ini = new Date(a, m - 1, d, hh, mm);
    return { diaInteiro: false, ini, fim: new Date(ini.getTime() + (e.tipo === 'Prova' ? 120 : 60) * 60000) };
}

function detalhesAgenda(e) {
    return [e.obs, `Adicionado pelo Gestão UFF (${nome})`].filter(Boolean).join('\n');
}

function linkGoogleAgenda(e) {
    const { diaInteiro, ini, fim } = intervalo(e);
    const datas = diaInteiro ? `${fmtData(ini)}/${fmtData(fim)}` : `${fmtDataHora(ini)}/${fmtDataHora(fim)}`;
    const params = new URLSearchParams({ action: 'TEMPLATE', text: tituloAgenda(e), dates: datas, details: detalhesAgenda(e) });
    return `https://calendar.google.com/calendar/render?${params}`;
}

function renderizarEventos() {
    const lista = document.getElementById('listaEventos');
    if (dados.eventos.length === 0) {
        lista.innerHTML = '<p class="msg-vazia">Nenhuma data cadastrada ainda.</p>';
        return;
    }
    // Próximas primeiro (mais perto no topo); as que já passaram vão para o fim
    const futuras = dados.eventos.filter(e => diasAte(e.data) >= 0);
    const passadas = dados.eventos.filter(e => diasAte(e.data) < 0).reverse();

    lista.innerHTML = [...futuras, ...passadas].map(e => {
        const dias = diasAte(e.data);
        const { a, m, d } = partesData(e.data);
        const semana = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const sub = [e.materia_nome ? escapeHtml(e.materia_nome) : 'Geral', e.hora ? `às ${escapeHtml(e.hora)}` : null,
            e.obs ? escapeHtml(e.obs) : null,
            e.com && e.com.length ? `<span class="com">👥 com ${escapeHtml(e.com.join(', '))}</span>` : null].filter(Boolean).join(' · ');
        return `
            <div class="evento ${dias < 0 ? 'passado' : ''}">
                <div class="dia"><b>${d}</b><span>${MESES[m - 1]}</span></div>
                <div class="corpo">
                    <div class="titulo"><span class="tipo-tag ${escapeHtml(e.tipo)}">${escapeHtml(e.tipo)}</span>${escapeHtml(e.titulo)}</div>
                    <div class="sub">${escapeHtml(semana)} · ${sub}</div>
                </div>
                <div class="quando ${dias === 0 ? 'hoje' : ''}">${textoQuando(dias)}</div>
                <div class="evento-acoes">
                    <a href="${escapeHtml(linkGoogleAgenda(e))}" target="_blank" rel="noopener" title="Abrir no Google Agenda">📅 Google Agenda</a>
                    <button data-excluir-evento="${e.id}" title="Excluir esta data">🗑</button>
                </div>
            </div>`;
    }).join('');
}

async function adicionarEvento() {
    const data = document.getElementById('evData').value;
    if (!data) {
        mostrarToast('Escolha a data.', 'erro');
        return;
    }
    try {
        const res = await api(`/alunos/${encodeURIComponent(nome)}/eventos`, {
            method: 'POST',
            body: JSON.stringify({
                materia_id: document.getElementById('evMateria').value || null,
                tipo: document.getElementById('evTipo').value,
                titulo: document.getElementById('evTitulo').value.trim() || null,
                data,
                hora: document.getElementById('evHora').value || null,
                obs: document.getElementById('evObs').value.trim() || null,
                compartilhar_com: [...marcados]
            })
        });
        ['evTitulo', 'evData', 'evHora', 'evObs'].forEach(id => document.getElementById(id).value = '');
        marcados = new Set();
        renderizarColegas();
        dados = await api(`/alunos/${encodeURIComponent(nome)}/inscritas`);
        renderizarEventos();
        mostrarToast(res.mensagem);
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

conteudo.addEventListener('click', async (e) => {
    const botao = e.target.closest('[data-excluir-evento]');
    if (!botao) return;
    const id = Number(botao.dataset.excluirEvento);
    const ev = dados.eventos.find(x => x.id === id);
    if (!ev) return;
    const compartilhada = ev.com && ev.com.length > 0;
    const { ok, marcado } = await abrirConfirmacao({
        titulo: 'Excluir esta data?',
        mensagem: `"${tituloAgenda(ev)}" (${ev.data.split('-').reverse().join('/')}) será removida da lista. No Google Agenda, o evento só some se você apagá-lo lá também.`,
        confirmarTexto: 'Excluir',
        perigo: true,
        opcao: compartilhada ? `Excluir também para ${ev.com.join(', ')}` : null
    });
    if (!ok) return;
    try {
        const todos = compartilhada && marcado;
        await api(`/eventos/${id}${todos ? '?todos=true' : ''}`, { method: 'DELETE' });
        // Recarrega: se as outras pessoas continuam com a data, ela deixa de aparecer como compartilhada
        dados = await api(`/alunos/${encodeURIComponent(nome)}/inscritas`);
        renderizarEventos();
        mostrarToast(todos ? 'Data removida para todos.' : 'Data removida.');
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
});

// === EXPORTAÇÃO .ics (importável no Google Agenda, Outlook, Apple Calendar) ===
const icsTexto = t => String(t ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

function dobrarLinha(linha) {
    const partes = [];
    while (linha.length > 70) {
        partes.push(linha.slice(0, 70));
        linha = ' ' + linha.slice(70);
    }
    partes.push(linha);
    return partes;
}

function baixarIcs() {
    const futuras = dados.eventos.filter(e => diasAte(e.data) >= 0);
    if (futuras.length === 0) {
        mostrarToast('Não há datas futuras para exportar.', 'erro');
        return;
    }
    const agora = new Date();
    const carimbo = `${agora.getUTCFullYear()}${pad(agora.getUTCMonth() + 1)}${pad(agora.getUTCDate())}T${pad(agora.getUTCHours())}${pad(agora.getUTCMinutes())}${pad(agora.getUTCSeconds())}Z`;
    const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Gestao UFF//PT-BR', 'CALSCALE:GREGORIAN',
        `X-WR-CALNAME:${icsTexto('Gestão UFF - ' + nome)}`];

    futuras.forEach(e => {
        const { diaInteiro, ini, fim } = intervalo(e);
        linhas.push('BEGIN:VEVENT', `UID:evento-${e.id}-${slug(nome)}@gestao-uff`, `DTSTAMP:${carimbo}`);
        if (diaInteiro) {
            linhas.push(`DTSTART;VALUE=DATE:${fmtData(ini)}`, `DTEND;VALUE=DATE:${fmtData(fim)}`);
        } else {
            linhas.push(`DTSTART:${fmtDataHora(ini)}`, `DTEND:${fmtDataHora(fim)}`);
        }
        linhas.push(`SUMMARY:${icsTexto(tituloAgenda(e))}`, `DESCRIPTION:${icsTexto(detalhesAgenda(e))}`,
            // Lembrete 1 dia antes
            'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsTexto(tituloAgenda(e))}`, 'TRIGGER:-P1D', 'END:VALARM',
            'END:VEVENT');
    });
    linhas.push('END:VCALENDAR');

    const corpo = linhas.flatMap(dobrarLinha).join('\r\n') + '\r\n';
    baixarTxt(`agenda_${slug(nome)}_${dataHoje()}.ics`, corpo);
    mostrarToast(`${futuras.length} data(s) exportada(s)!`);
}