const API_URL = "http://127.0.0.1:8000";

// Evita injeção de HTML ao exibir nomes vindos do banco
function escapeHtml(texto) {
    const div = document.createElement('div');
    div.textContent = texto ?? '';
    return div.innerHTML;
}

// Notificação flutuante
function mostrarToast(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerText = mensagem;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// Janela de confirmação (substitui o confirm() do navegador).
// abrirConfirmacao devolve { ok, marcado }; "opcao" (texto) adiciona uma caixa de seleção extra.
function abrirConfirmacao({ titulo = 'Confirmar', mensagem = '', confirmarTexto = 'Confirmar', cancelarTexto = 'Cancelar', perigo = false, opcao = null } = {}) {
    return new Promise(resolve => {
        const fundo = document.createElement('div');
        fundo.className = 'modal-fundo topo';
        fundo.innerHTML = `
            <div class="modal confirm" role="alertdialog" aria-modal="true">
                <div class="confirm-icone ${perigo ? 'perigo' : ''}">${perigo ? '🗑️' : '❔'}</div>
                <h3></h3>
                <p class="confirm-msg"></p>
                ${opcao ? '<label class="confirm-opcao"><input type="checkbox"><span></span></label>' : ''}
                <div class="modal-acoes">
                    <button type="button" class="btn-neutro" data-resposta="0"></button>
                    <button type="button" class="${perigo ? 'btn-danger' : 'btn-primary'}" data-resposta="1"></button>
                </div>
            </div>`;
        fundo.querySelector('h3').textContent = titulo;
        fundo.querySelector('.confirm-msg').textContent = mensagem;
        if (opcao) fundo.querySelector('.confirm-opcao span').textContent = opcao;
        const [btnNao, btnSim] = fundo.querySelectorAll('button');
        btnNao.textContent = cancelarTexto;
        btnSim.textContent = confirmarTexto;
        document.body.appendChild(fundo);

        const fechar = (ok) => {
            document.removeEventListener('keydown', aoTeclar, true);
            const caixa = fundo.querySelector('.confirm-opcao input');
            const marcado = !!(caixa && caixa.checked);
            fundo.remove();
            resolve({ ok, marcado });
        };
        const aoTeclar = (ev) => {
            if (ev.key === 'Escape') { ev.stopPropagation(); fechar(false); }
        };
        document.addEventListener('keydown', aoTeclar, true);
        fundo.addEventListener('click', (ev) => {
            if (ev.target === fundo) fechar(false);
            const b = ev.target.closest('button[data-resposta]');
            if (b) fechar(b.dataset.resposta === '1');
        });
        // Em ações perigosas o foco começa em "Cancelar" (Enter sem querer não apaga nada)
        (perigo ? btnNao : btnSim).focus();
    });
}

// Versão simples: devolve true/false
function confirmar(opcoes) {
    return abrirConfirmacao(opcoes).then(r => r.ok);
}

// Lembra o último aluno escolhido entre as páginas
function salvarUltimoAluno(nome) {
    try { localStorage.setItem('uff_ultimo_aluno', nome); } catch { /* sem storage: tudo bem */ }
}
function lerUltimoAluno() {
    try { return localStorage.getItem('uff_ultimo_aluno'); } catch { return null; }
}

// Chamada à API: devolve o JSON ou lança Error com uma mensagem legível
async function api(caminho, opcoes = {}) {
    let response;
    try {
        response = await fetch(`${API_URL}${caminho}`, {
            headers: { 'Content-Type': 'application/json' },
            ...opcoes
        });
    } catch {
        throw new Error("Não foi possível conectar com a API. O backend está rodando?");
    }
    const dados = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(typeof dados.detail === 'string' ? dados.detail : "Dados inválidos.");
    }
    return dados;
}

// Baixa um texto como arquivo .txt
function baixarTxt(nomeArquivo, texto) {
    const url = URL.createObjectURL(new Blob([texto], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// "Ana Lúcia Silva" -> "ana_lucia_silva" (para nomes de arquivo)
function slug(texto) {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function dataHoje() {
    return new Date().toISOString().slice(0, 10);
}

// === AVATAR DO ALUNO (foto ou iniciais) ===
let fotoVersao = Date.now(); // muda após upload para furar o cache do navegador

function atualizarVersaoFoto() {
    fotoVersao = Date.now();
}

function iniciais(nome) {
    return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
}

function avatarHtml(nome, temFoto, grande = false) {
    const classe = grande ? 'avatar grande' : 'avatar';
    return temFoto
        ? `<img class="${classe}" src="${API_URL}/alunos/${encodeURIComponent(nome)}/foto?v=${fotoVersao}" alt="Foto de ${escapeHtml(nome)}">`
        : `<span class="${classe}">${escapeHtml(iniciais(nome))}</span>`;
}