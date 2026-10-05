const nome = new URLSearchParams(location.search).get('nome');
const raiz = document.getElementById('perfil');

document.addEventListener('DOMContentLoaded', carregarPerfil);

async function carregarPerfil() {
    if (!nome) {
        raiz.innerHTML = '<p class="msg-erro">Nenhum aluno informado. Volte ao <a href="ranking.html">ranking</a>.</p>';
        return;
    }
    try {
        const dados = await api(`/alunos/${encodeURIComponent(nome)}/perfil`);
        document.title = `${dados.aluno} - Gestão UFF`;
        renderizar(dados);
    } catch (e) {
        raiz.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
    }
}

function renderizar(d) {
    const cr = d.cr.valor === null ? '—' : d.cr.valor.toFixed(2);

    raiz.innerHTML = `
        <div class="admin-card perfil-topo">
            <label class="avatar-upload" title="Trocar foto">
                ${avatarHtml(d.aluno, d.tem_foto, true)}
                <span class="trocar-foto">📷 Trocar foto</span>
                <input type="file" id="inputFoto" accept="image/*">
            </label>
            <div>
                <h1>${escapeHtml(d.aluno)}</h1>
                <p class="curso">${escapeHtml(d.curso)}</p>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card destaque">
                <div class="rotulo">CR</div>
                <div class="valor">${cr}</div>
                <div class="detalhe">${escapeHtml(d.cr.descricao)} · ${d.cr.disciplinas} tentativa(s) no cálculo</div>
                ${d.cr.sem_nota ? `<div class="detalhe tag-especial">⚠ ${d.cr.sem_nota} tentativa(s) sem nota ficaram de fora</div>` : ''}
            </div>
            <div class="stat-card">
                <div class="rotulo">Horas concluídas</div>
                <div class="valor verde">${d.horas_concluidas}h</div>
                <div class="detalhe">de ${d.horas_totais}h (${d.progresso_percentual}%)</div>
            </div>
            <div class="stat-card">
                <div class="rotulo">Aprovações</div>
                <div class="valor verde">${d.aprovadas}</div>
            </div>
            <div class="stat-card">
                <div class="rotulo">Reprovações</div>
                <div class="valor vermelho">${d.reprovacoes}</div>
                <div class="detalhe">${d.reprovacoes_especiais ? `${d.reprovacoes_especiais} em período especial (não contam no CR)` : 'Todas contam no CR'}</div>
            </div>
            <div class="stat-card">
                <div class="rotulo">Cursando agora</div>
                <div class="valor azul">${d.inscritas}</div>
            </div>
        </div>

        <div class="admin-card">
            <h2>Matérias por período do curso</h2>
            ${renderizarGrafico(d.por_periodo)}
        </div>

        <div class="admin-card">
            <h2>Matérias feitas por período letivo</h2>
            ${renderizarGraficoLetivo(d.por_periodo_letivo)}
        </div>

        <div class="admin-card">
            <h2>Evolução do CR</h2>
            ${renderizarGraficoCR(d.por_periodo_letivo)}
        </div>

        <div class="admin-card">
            <h2>Matérias cursadas</h2>
            ${renderizarMaterias(d.materias)}
        </div>

        <div class="admin-card">
            <h2>Exportar (.txt)</h2>
            <p class="dica"><strong>Backup</strong>: guarda o histórico deste aluno, as matérias e as optativas. Para levar a outro computador, use "Importar backup" na página Admin de lá.</p>
            <label class="check-linha"><input type="checkbox" id="expFoto"> Incluir a foto no backup</label>
            <div class="export-acoes"><button id="btnBackup" class="btn-primary">Baixar backup do aluno</button></div>

            <div class="export-sep"></div>

            <p class="dica"><strong>Lista de matérias</strong>: escolha o que entra no arquivo.</p>
            <div class="export-campos">
                ${CAMPOS_EXPORT.map(c => `<label class="check-linha"><input type="checkbox" name="campoExp" value="${c.id}" ${c.padrao ? 'checked' : ''}> ${c.rotulo}</label>`).join('')}
            </div>
            <p class="dica">Incluir matérias com situação:</p>
            <div class="export-campos">
                ${SITUACOES_EXPORT.map(s => `<label class="check-linha"><input type="checkbox" name="situacaoExp" value="${s.id}" ${s.padrao ? 'checked' : ''}> ${s.id}</label>`).join('')}
            </div>
            <div class="export-acoes"><button id="btnExportMaterias" class="btn-primary">Baixar lista de matérias</button></div>
        </div>
    `;

    document.getElementById('inputFoto').addEventListener('change', enviarFoto);
    document.getElementById('btnBackup').addEventListener('click', baixarBackup);
    document.getElementById('btnExportMaterias').addEventListener('click', baixarListaMaterias);
}

// === EXPORTAÇÃO ===
const CAMPOS_EXPORT = [
    { id: 'id', rotulo: 'Código', padrao: true, valor: m => m.id },
    { id: 'nome', rotulo: 'Nome', padrao: true, valor: m => m.nome },
    { id: 'periodo', rotulo: 'Período do curso', padrao: false, valor: m => `${m.periodo}º` },
    { id: 'horas', rotulo: 'Carga horária', padrao: true, valor: m => `${m.horas}h` },
    { id: 'tipo', rotulo: 'Tipo (obrigatória/optativa)', padrao: false, valor: m => m.tipo },
    { id: 'situacao', rotulo: 'Situação', padrao: true, valor: m => m.situacao },
    { id: 'nota', rotulo: 'Nota', padrao: true, valor: m => m.nota !== null ? m.nota.toFixed(1) : '' },
    { id: 'professor', rotulo: 'Professor', padrao: false, valor: m => m.professor ?? '' },
    { id: 'periodo_letivo', rotulo: 'Período letivo', padrao: false, valor: m => m.periodo_letivo ?? '' },
    { id: 'reprovacoes', rotulo: 'Reprovações', padrao: false, valor: m => String(m.reprovacoes) },
    { id: 'pre_requisitos', rotulo: 'Pré-requisitos', padrao: false, valor: m => m.pre_requisitos.join(', ') }
];
const SITUACOES_EXPORT = [
    { id: 'Concluída', padrao: true },
    { id: 'Inscrito', padrao: true },
    { id: 'Reprovado', padrao: false },
    { id: 'Não cursada', padrao: false }
];

const marcados = nomeCampo => [...document.querySelectorAll(`input[name="${nomeCampo}"]:checked`)].map(c => c.value);

async function baixarBackup() {
    try {
        const foto = document.getElementById('expFoto').checked;
        const dados = await api(`/exportar/backup?aluno=${encodeURIComponent(nome)}&foto=${foto}`);
        baixarTxt(`backup_${slug(nome)}_${dataHoje()}.txt`, JSON.stringify(dados, null, 2));
        mostrarToast('Backup baixado!');
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

async function baixarListaMaterias() {
    const campos = CAMPOS_EXPORT.filter(c => marcados('campoExp').includes(c.id));
    const situacoes = marcados('situacaoExp');
    if (campos.length === 0 || situacoes.length === 0) {
        mostrarToast('Escolha ao menos um campo e uma situação.', 'erro');
        return;
    }
    try {
        const todas = await api(`/alunos/${encodeURIComponent(nome)}/materias-exportacao`);
        const lista = todas.filter(m => situacoes.includes(m.situacao));
        if (lista.length === 0) {
            mostrarToast('Nenhuma matéria com essas situações.', 'erro');
            return;
        }
        const blocos = lista.map(m =>
            campos.map(c => `${c.rotulo}: ${c.valor(m) || '—'}`).join('\n')
        );
        const cabecalho = `Matérias de ${nome} (${document.querySelector('.perfil-topo .curso').textContent})\nGerado em ${dataHoje()} · ${lista.length} matéria(s)\n`;
        baixarTxt(`materias_${slug(nome)}_${dataHoje()}.txt`, `${cabecalho}\n${blocos.join('\n\n')}\n`);
        mostrarToast('Lista baixada!');
    } catch (e) {
        mostrarToast(e.message, 'erro');
    }
}

// Selo com a média do período, mostrado acima de cada barra
function seloMedia(media) {
    return media === null || media === undefined
        ? '<div class="media-grafico vazia" title="Sem notas neste período">—</div>'
        : `<div class="media-grafico" title="Média ponderada pela carga horária">${media.toFixed(1)}</div>`;
}

function renderizarGrafico(periodos) {
    const maxTotal = Math.max(...periodos.map(p => p.total), 1);
    const colunas = periodos.map(p => `
        <div class="coluna-grafico" title="${p.periodo}º período: ${p.concluidas} concluída(s), ${p.inscritas} em curso, ${p.total} no total">
            ${seloMedia(p.media)}
            <div class="valor-grafico">${p.concluidas}/${p.total}</div>
            <div class="area-barra">
                <div class="trilho" style="height:${(p.total / maxTotal) * 100}%">
                    <div class="concl" style="height:${(p.concluidas / p.total) * 100}%"></div>
                    <div class="insc" style="height:${(p.inscritas / p.total) * 100}%"></div>
                </div>
            </div>
            <div class="rotulo-grafico">${p.periodo}º</div>
        </div>
    `).join('');

    return `
        <div class="grafico">${colunas}</div>
        <div class="legenda">
            <span><i style="background:#22c55e"></i>Concluídas</span>
            <span><i style="background:var(--accent-color)"></i>Cursando</span>
            <span><i style="background:var(--bg-card-disponivel)"></i>Restantes</span>
            <span><i class="sel-media"></i>Média das concluídas (ponderada pela carga horária)</span>
        </div>
    `;
}

function renderizarGraficoLetivo(periodos) {
    if (periodos.length === 0) {
        return '<p class="msg-vazia">Nenhuma matéria lançada ainda. Informe o "Período letivo" ao salvar uma matéria no dashboard.</p>';
    }

    const totalDe = p => p.aprovadas + p.reprovadas + p.inscritas;
    const maxTotal = Math.max(...periodos.map(totalDe), 1);

    const colunas = periodos.map(p => {
        const total = totalDe(p);
        const rotulo = p.periodo_letivo ? escapeHtml(p.periodo_letivo) : 'Sem período';
        const detalhe = [`${p.aprovadas} aprovada(s)`, `${p.reprovadas} reprovada(s)`, `${p.inscritas} em curso`].join(', ');
        const textoValor = [
            p.aprovadas ? `<span class="n-verde">${p.aprovadas}✓</span>` : '',
            p.reprovadas ? `<span class="n-vermelho">${p.reprovadas}✗</span>` : '',
            p.inscritas ? `<span class="n-azul">${p.inscritas}…</span>` : ''
        ].join(' ');
        return `
            <div class="coluna-grafico" title="${rotulo}: ${detalhe}${p.especial ? ' (período especial)' : ''}">
                ${seloMedia(p.media)}
                <div class="valor-grafico">${textoValor}</div>
                <div class="area-barra">
                    <div class="trilho" style="height:${(total / maxTotal) * 100}%">
                        <div class="concl" style="height:${(p.aprovadas / total) * 100}%"></div>
                        <div class="reprov" style="height:${(p.reprovadas / total) * 100}%"></div>
                        <div class="insc" style="height:${(p.inscritas / total) * 100}%"></div>
                    </div>
                </div>
                <div class="rotulo-grafico">${rotulo}${p.especial ? ' ⚠' : ''}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="grafico">${colunas}</div>
        <div class="legenda">
            <span><i style="background:#22c55e"></i>Aprovações</span>
            <span><i style="background:#ef4444"></i>Reprovações</span>
            <span><i style="background:var(--accent-color)"></i>Cursando</span>
            <span><i class="sel-media"></i>Média do período letivo (mesma regra do CR)</span>
            <span>⚠ período especial (reprovações não contam no CR)</span>
        </div>
    `;
}

// Gráfico de linhas (SVG): CR acumulado ao fim de cada período letivo + média do próprio período
function renderizarGraficoCR(periodos) {
    const pts = periodos.filter(p => p.cr_acumulado !== null && p.cr_acumulado !== undefined);
    if (pts.length === 0) {
        return '<p class="msg-vazia">O gráfico aparece quando houver notas lançadas em algum período letivo.</p>';
    }

    const W = 900, H = 290, ml = 46, mr = 30, mt = 30, mb = 40;
    const valores = pts.flatMap(p => [p.cr_acumulado, p.media]).filter(v => v !== null && v !== undefined);
    let ymin = Math.max(0, Math.floor((Math.min(...valores) - 0.3) * 2) / 2);
    let ymax = Math.min(10, Math.ceil((Math.max(...valores) + 0.3) * 2) / 2);
    if (ymax - ymin < 1) { ymax = Math.min(10, ymin + 1); ymin = ymax - 1; }
    const passo = (ymax - ymin) <= 3 ? 0.5 : 1;

    const largura = W - ml - mr;
    const x = i => pts.length === 1 ? ml + largura / 2 : ml + (i * largura) / (pts.length - 1);
    const y = v => mt + ((ymax - v) / (ymax - ymin)) * (H - mt - mb);

    let grade = '';
    for (let v = ymin; v <= ymax + 1e-9; v += passo) {
        grade += `<line class="cr-grade" x1="${ml}" x2="${W - mr}" y1="${y(v)}" y2="${y(v)}"/>
                  <text class="cr-eixo" x="${ml - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
    }

    const caminho = lista => lista.map(([i, v]) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const linhaCR = pts.map((p, i) => [i, p.cr_acumulado]);
    const linhaMedia = pts.map((p, i) => [i, p.media]).filter(([, v]) => v !== null && v !== undefined);

    const marcas = pts.map((p, i) => {
        const rotulo = p.periodo_letivo + (p.especial ? ' ⚠' : '');
        const anterior = i > 0 ? pts[i - 1].cr_acumulado : null;
        const delta = anterior === null ? '' : ` (${p.cr_acumulado - anterior >= 0 ? '+' : ''}${(p.cr_acumulado - anterior).toFixed(2)})`;
        const dica = `${p.periodo_letivo}\nCR acumulado: ${p.cr_acumulado.toFixed(2)}${delta}\nMédia do período: ${p.media === null || p.media === undefined ? '—' : p.media.toFixed(2)}`;
        const mediaPonto = p.media === null || p.media === undefined ? ''
            : `<circle class="cr-ponto-media" cx="${x(i)}" cy="${y(p.media)}" r="4"/>`;
        return `
            <g>
                <title>${escapeHtml(dica)}</title>
                ${mediaPonto}
                <circle class="cr-ponto" cx="${x(i)}" cy="${y(p.cr_acumulado)}" r="5.5"/>
                <text class="cr-valor" x="${x(i)}" y="${y(p.cr_acumulado) - 12}" text-anchor="middle">${p.cr_acumulado.toFixed(2)}</text>
                <text class="cr-eixo" x="${x(i)}" y="${H - 14}" text-anchor="middle">${escapeHtml(rotulo)}</text>
            </g>`;
    }).join('');

    const semPeriodo = periodos.some(p => p.periodo_letivo === null);

    return `
        <div class="grafico-linha">
            <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolução do CR por período letivo">
                ${grade}
                ${linhaMedia.length > 1 ? `<polyline class="cr-linha-media" points="${caminho(linhaMedia)}"/>` : ''}
                ${pts.length > 1 ? `<polyline class="cr-linha" points="${caminho(linhaCR)}"/>` : ''}
                ${marcas}
            </svg>
        </div>
        <div class="legenda">
            <span><i class="sel-cr"></i>CR acumulado ao fim do período</span>
            <span><i class="sel-media-linha"></i>Média do próprio período</span>
            <span>⚠ período especial (reprovações não contam no CR)</span>
        </div>
        ${semPeriodo ? '<p class="dica" style="margin-top:8px">Matérias sem período letivo não entram neste gráfico.</p>' : ''}
    `;
}

function renderizarMaterias(materias) {
    if (materias.length === 0) return '<p class="msg-vazia">Nenhuma matéria cursada ainda.</p>';

    const grupos = {};
    materias.forEach(m => (grupos[m.periodo] ??= []).push(m));

    return Object.keys(grupos).sort((a, b) => a - b).map(p => `
        <div class="bloco-periodo">
            <h3>${p}º Período</h3>
            <table class="tabela-materias">
                <thead>
                    <tr><th>Matéria</th><th>Situação</th><th>Nota</th><th>Reprov.</th><th>Tentativas</th></tr>
                </thead>
                <tbody>
                    ${grupos[p].map(linhaMateria).join('')}
                </tbody>
            </table>
        </div>
    `).join('');
}

const tentativasPorId = new Map();

const CLASSE_STATUS = { 'Concluída': 'badge-concluida', 'Inscrito': 'badge-inscrito', 'Reprovado': 'badge-reprovado' };

function linhaMateria(m) {
    const tentativas = m.tentativas.map(t => {
        tentativasPorId.set(t.id, { ...t, materia: m.nome });
        const partes = [
            t.periodo_letivo ? escapeHtml(t.periodo_letivo) : 'sem período',
            t.status,
            t.nota !== null ? t.nota.toFixed(1) : null,
            t.professor ? escapeHtml(t.professor) : null
        ].filter(Boolean);
        const aviso = t.status === 'Reprovado' && t.especial
            ? ' · <span class="tag-especial">período especial: não conta no CR</span>' : '';
        return `<div class="tentativa"><span>${partes.join(' · ')}${aviso}</span>
            <button class="btn-editar" data-tentativa="${t.id}" title="Editar ou excluir esta tentativa">✎</button></div>`;
    }).join('');

    return `
        <tr>
            <td>${escapeHtml(m.nome)}<div class="cod">${escapeHtml(m.id)} · ${m.horas}h</div></td>
            <td><span class="badge ${CLASSE_STATUS[m.situacao]}">${m.situacao}</span></td>
            <td>${m.nota_final !== null ? m.nota_final.toFixed(1) : '—'}</td>
            <td>${m.reprovacoes}</td>
            <td>${tentativas}</td>
        </tr>
    `;
}

// === EDIÇÃO DE UMA TENTATIVA ===
raiz.addEventListener('click', (e) => {
    const botao = e.target.closest('[data-tentativa]');
    if (botao) abrirEdicao(Number(botao.dataset.tentativa));
});

function abrirEdicao(id) {
    const t = tentativasPorId.get(id);
    if (!t) return;

    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML = `
        <div class="modal">
            <h3></h3>
            <p class="sub">Corrija os dados desta tentativa.</p>
            <div class="form-group"><label for="edStatus">Situação</label>
                <select id="edStatus">
                    <option value="Concluída">Concluída</option>
                    <option value="Inscrito">Inscrito</option>
                    <option value="Reprovado">Reprovado</option>
                </select></div>
            <div class="form-group"><label for="edNota">Nota (opcional)</label>
                <input type="number" id="edNota" step="0.1" min="0" max="10"></div>
            <div class="form-group"><label for="edPeriodo">Período letivo (ex: 2024.1)</label>
                <input type="text" id="edPeriodo"></div>
            <div class="form-group"><label for="edProf">Professor (opcional)</label>
                <input type="text" id="edProf"></div>
            <div class="modal-acoes">
                <button class="btn-primary" id="edSalvar">Salvar</button>
                <button class="btn-neutro" id="edCancelar">Cancelar</button>
            </div>
            <div class="modal-acoes"><button class="btn-danger" id="edExcluir">Excluir esta tentativa</button></div>
        </div>`;
    document.body.appendChild(fundo);

    // Valores entram via propriedades (sem montar HTML com texto do banco)
    fundo.querySelector('h3').textContent = t.materia;
    fundo.querySelector('#edStatus').value = t.status;
    fundo.querySelector('#edNota').value = t.nota ?? '';
    fundo.querySelector('#edPeriodo').value = t.periodo_letivo ?? '';
    fundo.querySelector('#edProf').value = t.professor ?? '';

    const fechar = () => fundo.remove();
    fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
    fundo.querySelector('#edCancelar').addEventListener('click', fechar);

    fundo.querySelector('#edSalvar').addEventListener('click', async () => {
        const nota = fundo.querySelector('#edNota').value;
        try {
            const res = await api(`/tentativas/${id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    status: fundo.querySelector('#edStatus').value,
                    nota: nota === '' ? null : parseFloat(nota),
                    periodo_letivo: fundo.querySelector('#edPeriodo').value.trim() || null,
                    professor: fundo.querySelector('#edProf').value.trim() || null
                })
            });
            fechar();
            mostrarToast(res.mensagem);
            carregarPerfil();
        } catch (err) {
            mostrarToast(err.message, 'erro');
        }
    });

    fundo.querySelector('#edExcluir').addEventListener('click', async () => {
        const ok = await confirmar({
            titulo: 'Excluir esta tentativa?',
            mensagem: `A tentativa de "${t.materia}" (${t.periodo_letivo ?? 'sem período'}) será apagada do histórico. Esta ação não pode ser desfeita.`,
            confirmarTexto: 'Excluir',
            perigo: true
        });
        if (!ok) return;
        try {
            const res = await api(`/tentativas/${id}`, { method: 'DELETE' });
            fechar();
            mostrarToast(res.mensagem);
            carregarPerfil();
        } catch (err) {
            mostrarToast(err.message, 'erro');
        }
    });
}

// === FOTO: recorta quadrado, reduz para 256px e envia como JPEG ===
function prepararImagem(arquivo, tamanho = 256) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(arquivo);
        img.onload = () => {
            const lado = Math.min(img.width, img.height);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = tamanho;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, tamanho, tamanho);
            ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2, lado, lado, 0, 0, tamanho, tamanho);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Arquivo de imagem inválido.'));
        };
        img.src = url;
    });
}

async function enviarFoto(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
        const imagem = await prepararImagem(arquivo);
        await api(`/alunos/${encodeURIComponent(nome)}/foto`, {
            method: 'PUT',
            body: JSON.stringify({ imagem })
        });
        atualizarVersaoFoto();
        mostrarToast('Foto atualizada!');
        carregarPerfil();
    } catch (err) {
        mostrarToast(err.message, 'erro');
    }
}