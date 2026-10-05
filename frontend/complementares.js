// Aba "Extensão e complementares" do perfil do aluno
(() => {
    const alunoNome = new URLSearchParams(location.search).get('nome');
    const abasEl = document.getElementById('abasPerfil');
    const perfilEl = document.getElementById('perfil');
    const extrasEl = document.getElementById('extras');
    if (!alunoNome || !extrasEl) return;

    const LIMITE_PDF = 5 * 1024 * 1024;
    let dados = null;

    const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
    const dataBr = (iso) => iso ? iso.split('-').reverse().join('/') : '';
    const atividadePorId = (id) => dados.atividades.find(a => a.id === id);

    // ---------- abas ----------
    function mostrarAba(aba) {
        // Cada painel declara a aba a que pertence (data-painel); só o da aba escolhida fica visível
        document.querySelectorAll('[data-painel]').forEach(p => p.classList.toggle('hidden', p.dataset.painel !== aba));
        abasEl.querySelectorAll('.tab').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
        history.replaceState(null, '', aba === 'resumo' ? location.pathname + location.search : `#${aba}`);
        document.dispatchEvent(new CustomEvent('aba-perfil', { detail: aba }));
    }
    abasEl.addEventListener('click', (e) => {
        const b = e.target.closest('.tab');
        if (b) mostrarAba(b.dataset.aba);
    });

    // ---------- carregamento ----------
    async function carregar() {
        try {
            dados = await api(`/alunos/${encodeURIComponent(alunoNome)}/complementares`);
        } catch (e) {
            extrasEl.innerHTML = `<p class="msg-erro">${escapeHtml(e.message)}</p>`;
            return;
        }
        renderizar();
    }

    // ---------- desenho ----------
    function cartaoResumo(titulo, r, extra = '') {
        const meta = r.necessarias;
        const pct = meta ? Math.min(100, (r.concluidas / meta) * 100) : 0;
        const pctInsc = meta ? Math.min(100, ((r.concluidas + (r.em_curso ?? 0)) / meta) * 100) : 0;
        const detalhe = !meta
            ? 'Meta do curso não definida (Admin → Formação).'
            : r.faltam === 0 ? '<span class="meta-ok">✓ Meta cumprida</span>'
            : `de ${fmt(meta)}h · <strong>faltam ${fmt(r.faltam)}h</strong>`;
        return `
            <div class="stat-card destaque resumo-req">
                <div class="rotulo">${titulo}</div>
                <div class="valor">${fmt(r.concluidas)}h</div>
                <div class="barra-mini">
                    ${r.em_curso ? `<div class="mini-insc" style="width:${pctInsc}%"></div>` : ''}
                    <div class="mini-ok" style="width:${pct}%"></div>
                </div>
                <div class="detalhe">${detalhe}${extra}</div>
            </div>`;
    }

    function renderizar() {
        const ex = dados.extensao, co = dados.complementares;

        const linhasExt = ex.itens.map(i => `
            <tr>
                <td>${escapeHtml(i.nome)}<div class="cod">${escapeHtml(i.id)} · ${i.tipo}</div></td>
                <td class="num">${i.horas_extensao}h</td>
                <td><span class="badge ${i.situacao === 'Concluída' ? 'badge-concluida' : i.situacao === 'Inscrito' ? 'badge-inscrito' : 'badge-neutro'}">${i.situacao}</span></td>
            </tr>`).join('');

        const resumoAc = co.por_atividade.map(p => {
            const pct = Math.min(100, (p.contado / p.maximo) * 100);
            const cheio = p.lancado > p.maximo;
            return `
            <div class="ac-linha">
                <div><div class="nome">${escapeHtml(p.nome)}</div><div class="regra">${escapeHtml(p.regra)}</div></div>
                <div class="barra-mini"><div class="mini-ok ${cheio ? 'limite' : ''}" style="width:${pct}%"></div></div>
                <div class="valor-ac ${cheio ? 'cheio' : ''}">${fmt(p.contado)} / ${p.maximo} AC${cheio ? ` <span title="Você lançou ${fmt(p.lancado)} AC, mas o máximo conta ${p.maximo}">⚠ limite</span>` : ''}</div>
            </div>`;
        }).join('');

        const linhasReg = co.registros.map(r => `
            <tr>
                <td>${dataBr(r.data) || '<span class="cod">—</span>'}</td>
                <td>${escapeHtml(r.atividade_nome)}${r.descricao ? `<div class="sub">${escapeHtml(r.descricao)}</div>` : ''}</td>
                <td class="num">${fmt(r.quantidade)} ${escapeHtml(r.unidade)}</td>
                <td class="num"><strong>${fmt(r.ac)}</strong> AC</td>
                <td><div class="acoes-linha">
                    ${r.tem_comprovante ? `<a href="${API_URL}/complementares/${r.id}/comprovante" target="_blank" rel="noopener" title="${escapeHtml(r.comprovante_nome ?? 'comprovante')}">📎 PDF</a>` : ''}
                    <button class="editar" data-editar="${r.id}" title="Editar">✎</button>
                    <button class="apagar" data-apagar="${r.id}" title="Excluir">🗑</button>
                </div></td>
            </tr>`).join('');

        extrasEl.innerHTML = `
            <div class="stats-grid">
                ${cartaoResumo('Horas de extensão', ex, ex.em_curso ? `<br>+ ${fmt(ex.em_curso)}h em curso` : '')}
                ${cartaoResumo('Horas complementares (AC)', co)}
            </div>

            <div class="admin-card">
                <h2>Horas de extensão</h2>
                <p class="dica">Contam as horas de extensão das matérias concluídas. Para definir quantas horas de extensão cada matéria vale, use Admin → Matérias → Editar.</p>
                ${ex.itens.length ? `
                <table class="tabela-simples">
                    <thead><tr><th>Matéria</th><th class="num">Extensão</th><th>Situação</th></tr></thead>
                    <tbody>${linhasExt}</tbody>
                </table>
                <p class="dica" style="margin-top:10px">Total previsto no currículo: ${fmt(ex.no_curriculo)}h${ex.necessarias ? ` (o curso exige ${fmt(ex.necessarias)}h)` : ''}.</p>`
                : '<p class="msg-vazia">Nenhuma matéria com horas de extensão cadastrada ainda.</p>'}
            </div>

            <div class="admin-card">
                <h2>Horas complementares (AC) · currículo 31.02.003</h2>
                <p class="dica">Escolha a atividade, informe a quantidade e anexe o comprovante em PDF. A conversão para AC e o limite de cada atividade seguem a tabela de pontuação do IC.</p>

                <div class="form-ac">
                    <div class="form-group"><label for="acAtividade">Atividade</label>
                        <select id="acAtividade">${dados.atividades.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join('')}</select></div>
                    <div class="form-group"><label for="acQtd" id="acQtdRotulo">Quantidade</label>
                        <input type="number" id="acQtd" min="0" step="0.5" placeholder="0"></div>
                    <div class="form-group"><label for="acData">Data (opcional)</label><input type="date" id="acData"></div>
                    <div class="form-group"><label for="acPdf">Comprovante em PDF (opcional, até 5 MB)</label><input type="file" id="acPdf" accept="application/pdf,.pdf"></div>
                    <div class="form-group cheio"><label for="acDesc">Descrição (opcional)</label>
                        <input type="text" id="acDesc" maxlength="200" placeholder="Ex.: Monitoria de Cálculo 1, Maratona de Programação 2025..."></div>
                    <div class="ac-previa" id="acPrevia"></div>
                    <button class="btn-primary" id="btnAddAc">Adicionar atividade</button>
                </div>

                <div class="sep-secao"></div>
                <h3 class="sub-titulo">Pontuação por atividade</h3>
                ${resumoAc ? `<div class="ac-resumo">${resumoAc}</div>` : '<p class="msg-vazia">Nenhuma atividade lançada ainda.</p>'}

                <div class="sep-secao"></div>
                <h3 class="sub-titulo">Atividades lançadas</h3>
                ${linhasReg ? `
                <table class="tabela-simples">
                    <thead><tr><th>Data</th><th>Atividade</th><th class="num">Quantidade</th><th class="num">Conversão</th><th></th></tr></thead>
                    <tbody>${linhasReg}</tbody>
                </table>` : '<p class="msg-vazia">Nada lançado ainda.</p>'}
            </div>`;

        ligarFormulario();
    }

    // ---------- formulário de nova atividade ----------
    function atualizarPrevia() {
        const a = atividadePorId(document.getElementById('acAtividade').value);
        const qtd = parseFloat(document.getElementById('acQtd').value);
        document.getElementById('acQtdRotulo').textContent = `Quantidade (${a.unidade})`;
        const ja = dados.complementares.por_atividade.find(p => p.id === a.id)?.lancado ?? 0;
        let html = `Regra: <b>${escapeHtml(a.regra)}</b> · máximo de <b>${a.maximo} AC</b> nesta atividade (já lançado: ${fmt(ja)} AC).`;
        if (qtd > 0) {
            const ac = Math.round(qtd * a.fator * 100) / 100;
            html += `<br>Esta atividade vale <b>${fmt(ac)} AC</b>`;
            if (ja + ac > a.maximo) html += ` · <span class="aviso">⚠ passa do limite: só ${fmt(Math.max(0, a.maximo - ja))} AC serão contados.</span>`;
        }
        document.getElementById('acPrevia').innerHTML = html;
    }

    function lerPdf(arquivo) {
        return new Promise((resolve, reject) => {
            if (!arquivo) return resolve(null);
            if (arquivo.type !== 'application/pdf' && !/\.pdf$/i.test(arquivo.name)) return reject(new Error('O comprovante precisa ser um arquivo PDF.'));
            if (arquivo.size > LIMITE_PDF) return reject(new Error('O comprovante passa de 5 MB. Comprima o PDF e tente de novo.'));
            const leitor = new FileReader();
            leitor.onload = () => resolve({ b64: String(leitor.result).split(',')[1], nome: arquivo.name });
            leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
            leitor.readAsDataURL(arquivo);
        });
    }

    function ligarFormulario() {
        document.getElementById('acAtividade').addEventListener('change', atualizarPrevia);
        document.getElementById('acQtd').addEventListener('input', atualizarPrevia);
        atualizarPrevia();

        document.getElementById('btnAddAc').addEventListener('click', async () => {
            const qtd = parseFloat(document.getElementById('acQtd').value);
            if (!(qtd > 0)) {
                mostrarToast('Informe a quantidade da atividade.', 'erro');
                return;
            }
            try {
                const pdf = await lerPdf(document.getElementById('acPdf').files[0]);
                const res = await api(`/alunos/${encodeURIComponent(alunoNome)}/complementares`, {
                    method: 'POST',
                    body: JSON.stringify({
                        atividade: document.getElementById('acAtividade').value,
                        quantidade: qtd,
                        descricao: document.getElementById('acDesc').value.trim() || null,
                        data: document.getElementById('acData').value || null,
                        comprovante_b64: pdf?.b64 ?? null,
                        comprovante_nome: pdf?.nome ?? null
                    })
                });
                mostrarToast(res.mensagem);
                await carregar();
            } catch (e) {
                mostrarToast(e.message, 'erro');
            }
        });
    }

    // ---------- editar / excluir ----------
    extrasEl.addEventListener('click', async (e) => {
        const editar = e.target.closest('[data-editar]');
        if (editar) return abrirEdicaoAc(Number(editar.dataset.editar));

        const apagar = e.target.closest('[data-apagar]');
        if (apagar) {
            const r = dados.complementares.registros.find(x => x.id === Number(apagar.dataset.apagar));
            const ok = await confirmar({
                titulo: 'Excluir esta atividade?',
                mensagem: `"${r.atividade_nome}" (${fmt(r.ac)} AC) será removida${r.tem_comprovante ? ', junto com o comprovante em PDF' : ''}. Isso não pode ser desfeito.`,
                confirmarTexto: 'Sim, excluir',
                cancelarTexto: 'Manter',
                perigo: true
            });
            if (!ok) return;
            try {
                const res = await api(`/complementares/${r.id}`, { method: 'DELETE' });
                mostrarToast(res.mensagem);
                await carregar();
            } catch (err) {
                mostrarToast(err.message, 'erro');
            }
        }
    });

    function abrirEdicaoAc(id) {
        const r = dados.complementares.registros.find(x => x.id === id);
        if (!r) return;
        const fundo = document.createElement('div');
        fundo.className = 'modal-fundo';
        fundo.innerHTML = `
            <div class="modal">
                <h3>Editar atividade</h3>
                <p class="sub">Corrija os dados desta atividade complementar.</p>
                <div class="form-group"><label for="eaAtividade">Atividade</label>
                    <select id="eaAtividade">${dados.atividades.map(a => `<option value="${a.id}">${escapeHtml(a.nome)}</option>`).join('')}</select></div>
                <div class="form-group"><label for="eaQtd" id="eaQtdRotulo">Quantidade</label><input type="number" id="eaQtd" min="0" step="0.5"></div>
                <div class="form-group"><label for="eaData">Data (opcional)</label><input type="date" id="eaData"></div>
                <div class="form-group"><label for="eaDesc">Descrição (opcional)</label><input type="text" id="eaDesc" maxlength="200"></div>
                <div class="form-group"><label>Comprovante em PDF</label>
                    ${r.tem_comprovante ? `<div class="arquivo-atual">Atual: <a href="${API_URL}/complementares/${r.id}/comprovante" target="_blank" rel="noopener">📎 ${escapeHtml(r.comprovante_nome ?? 'comprovante.pdf')}</a></div>
                    <label class="check-linha"><input type="checkbox" id="eaRemover"> Remover comprovante atual</label>` : ''}
                    <input type="file" id="eaPdf" accept="application/pdf,.pdf" style="margin-top:6px"></div>
                <div class="modal-acoes">
                    <button class="btn-primary" id="eaSalvar">Salvar</button>
                    <button class="btn-neutro" id="eaCancelar">Cancelar</button>
                </div>
            </div>`;
        document.body.appendChild(fundo);
        const $ = (s) => fundo.querySelector(s);
        $('#eaAtividade').value = r.atividade;
        $('#eaQtd').value = r.quantidade;
        $('#eaData').value = r.data ?? '';
        $('#eaDesc').value = r.descricao ?? '';
        const rotulo = () => { $('#eaQtdRotulo').textContent = `Quantidade (${atividadePorId($('#eaAtividade').value).unidade})`; };
        $('#eaAtividade').addEventListener('change', rotulo);
        rotulo();

        const fechar = () => { document.removeEventListener('keydown', teclar, true); fundo.remove(); };
        const teclar = (ev) => { if (ev.key === 'Escape') fechar(); };
        document.addEventListener('keydown', teclar, true);
        fundo.addEventListener('click', (ev) => { if (ev.target === fundo) fechar(); });
        $('#eaCancelar').addEventListener('click', fechar);

        $('#eaSalvar').addEventListener('click', async () => {
            const qtd = parseFloat($('#eaQtd').value);
            if (!(qtd > 0)) { mostrarToast('Informe a quantidade da atividade.', 'erro'); return; }
            try {
                const pdf = await lerPdf($('#eaPdf').files[0]);
                const res = await api(`/complementares/${id}`, {
                    method: 'PUT',
                    body: JSON.stringify({
                        atividade: $('#eaAtividade').value,
                        quantidade: qtd,
                        descricao: $('#eaDesc').value.trim() || null,
                        data: $('#eaData').value || null,
                        comprovante_b64: pdf?.b64 ?? null,
                        comprovante_nome: pdf?.nome ?? null,
                        remover_comprovante: !!$('#eaRemover')?.checked
                    })
                });
                fechar();
                mostrarToast(res.mensagem);
                await carregar();
            } catch (e) {
                mostrarToast(e.message, 'erro');
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        carregar();
        const aba = location.hash.slice(1);
        if (aba && abasEl.querySelector(`.tab[data-aba="${aba}"]`)) mostrarAba(aba);
    });
})();