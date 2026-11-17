// ===== Ligacao das telas com o servidor (site de verdade) =====
const DB = { imgs: [], anuncios: [], links: [], cores: [], demandas: [] };
const MEDIDAS = {};
let BOTS = [], CONTAS = [], INFO = {};
const IMG = id => '/mini/' + id, GRANDE = id => '/img/' + id;
const CAMINHO = i => i.caminho;
const img = id => DB.imgs.find(i => i.id === +id);
const viva = i => i && i.status !== 'reprovada';
const anunciosDe = iid => DB.links.filter(l => l.img === iid).map(l => DB.anuncios.find(a => a.id === l.an)).filter(Boolean);
const mandar = (url, corpo) => window.menork.api(url, corpo);
// No site, quem calcula o que falta e o servidor (a mesma conta que libera ou barra o pacote).
function faltas(aid) { return (DB.faltas || {})[aid] || { produto: '', itens: [], metaIA: 0, metaCapa: 0, kit: false, tarefa: '', info: 0, tab: 0, capas: { meta: 0, aprovadas: 0, esperando_aprovacao: 0 } }; }
const PACOTES = aid => (DB.pacotes || {})[aid] || [];
const PEDIDO = aid => (DB.pedidos || {})[aid];
const ENVIOS = aid => (DB.envios || {})[aid] || [];
const INTEG = () => DB.integracao || { nome: 'B2X', url: '', tem_chave: false, rascunho: true };
const SRV = {
  carregar: async () => {
    const r = await fetch('/api/estado');
    if (r.status === 401) { location.href = '/entrar'; throw new Error('Entre de novo com a senha.'); }
    const e = await r.json();
    Object.assign(DB, { imgs: e.imgs, anuncios: e.anuncios, links: e.links, cores: e.cores, demandas: e.demandas, faltas: e.faltas, pacotes: e.pacotes, pedidos: e.pedidos, envios: e.envios, integracao: e.integracao });
    for (const k in MEDIDAS) delete MEDIDAS[k];
    Object.assign(MEDIDAS, e.medidas); BOTS = e.bots; CONTAS = e.contas; INFO = e;
    const p = document.querySelector('.pulso'), l = e.leitor || {};
    if (p) { p.classList.toggle('ruim', !!l.erro); p.querySelector('span').textContent = l.erro ? 'Pasta de entrada fora do ar' : l.ultima_leitura ? 'Pasta lida às ' + l.ultima_leitura.slice(11, 16) : 'Lendo a pasta de entrada'; p.title = l.erro || ''; }
  },
  rotaInicial: () => decodeURIComponent(location.hash.slice(1)) || '/',
  rota: r => history.replaceState(null, '', '#' + r),
  excluirAnuncio: id => mandar('/api/anuncio-excluir', { id }),
  novoAnuncio: async (nome, formato) => (await mandar('/api/anuncio-novo', { nome, formato })).id,
  meta: o => mandar('/api/meta', o),
  produtoDemanda: (id, produto) => mandar('/api/demanda-produto', { id, produto }),
  medidas: (produto, linhas) => mandar('/api/medidas', { produto, linhas }),
  buscarClickup: async () => (await mandar('/api/clickup', {})).msg,
  pacote: async (aid, mk, forcar) => { location.href = `/anuncios/${aid}/zip?mk=${encodeURIComponent(mk)}${forcar ? '&forcar=1' : ''}`; setTimeout(() => window.AO_DESENHAR?.(aid), 2500); },
  copiar: d => mandar('/api/anuncio-copiar', d),
  lojas: async () => { const r = await fetch('/api/lojas'); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || 'Não deu certo.'); return j; },
  anunciosLoja: async (loja, busca, pagina, aoVivo) => { const r = await fetch(`/api/lojas/${encodeURIComponent(loja)}/anuncios?pagina=${pagina}&busca=${encodeURIComponent(busca)}${aoVivo ? '&fotos_ao_vivo=1' : ''}`); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || 'Não deu certo.'); return j; },
  salvarIntegracao: d => mandar('/api/integracao', d),
  testarIntegracao: () => mandar('/api/integracao/testar', {}),
  enviarSistema: (aid, forcar) => mandar(`/api/anuncios/${aid}/enviar`, { forcar }),
  pedir: async aid => (await mandar('/api/pedido', { an: aid })).texto,
};
function PAINEL_EXTRA() {
  const b = INFO.bot || {};
  const v = INFO.versao || {};
  const versao = `<div class="bloco"><h2>Versão do site <small>${v.sozinho ? `atualiza sozinho: confere a cada ${v.a_cada_minutos >= 60 ? Math.round(v.a_cada_minutos / 60) + ' h' : (v.a_cada_minutos || 2) + ' min'} e a página recarrega sozinha` : 'atualização só pelo botão'}</small></h2>
    <p>Instalada: <b>${esc(v.atual)}</b>${v.checada_em ? `<span class="pequeno"> · última consulta em ${esc(v.checada_em.slice(0, 16))}${v.remota ? ', versão publicada: ' + esc(v.remota) : ''}</span>` : ''}</p>
    ${v.erro ? `<p class="aviso-txt">${esc(v.erro)}</p>` : ''}
    <div class="acoes"><button class="b" id="buscar-atualizacao">Buscar atualização agora</button>${v.anterior ? `<button class="b claro" id="voltar-versao">Voltar à versão ${esc(v.anterior)}</button>` : ''}</div>
    <p class="pequeno">A atualização troca só os arquivos do programa. Suas imagens, anúncios, senha e o config.json não são tocados.</p></div>`;
  return versao + `<div class="bloco"><h2>Endereço e chave dos bots <small>é com isso que o Grok Bot fala com o site</small></h2>
    <div class="dem-grade"><div><h3>Endereço</h3><code>${esc(b.endereco)}</code><h3>Chave</h3><code>${esc(b.chave)}</code></div>
    <div><p class="pequeno">O arquivo <b>menork.ps1</b>, na pasta do site, já usa este endereço e esta chave sozinho. As instruções para colar no Grok Bot estão em <b>INSTRUCOES_GROK_BOT.md</b>.</p>
    <p class="pequeno">${INFO.clickup ? 'Chave do ClickUp configurada: o botão Buscar tarefas, em Demandas, lê a lista DEMANDAS.' : 'Sem chave do ClickUp no config.json: as demandas entram só pelo bot (comando demanda).'}</p></div></div></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#buscar-atualizacao'), v = e.target.closest('#voltar-versao'); if (!b && !v) return;
  if (v && !v.dataset.ok) { v.dataset.ok = 1; v.textContent = 'Confirmar: voltar à versão anterior'; return; }
  window.menork.aviso(b ? 'Consultando a versão publicada…' : 'Voltando à versão anterior…', null, null, 60);
  try { const r = await mandar('/api/atualizar', { acao: b ? 'buscar' : 'voltar' }); window.menork.aviso(r.msg, null, null, 15);
    if (r.religando) setTimeout(() => location.reload(), 7000); else RENDER();
  } catch (err) { window.menork.aviso(err.message, null, null, 15); }
});

// a pagina percebe sozinha quando o site foi atualizado e recarrega, sem atrapalhar quem esta digitando
(() => {
  let minha = null, avisou = false;
  const ocupado = () => { const a = document.activeElement, j = document.getElementById('janela');
    return !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox') || !!(j && !j.hidden); };
  async function olhar() {
    try {
      const r = await fetch('/api/versao', { cache: 'no-store' }); if (!r.ok) return;
      const v = (await r.json()).atual; if (!minha) { minha = v; return; }
      if (v === minha) return;
      if (ocupado()) { if (!avisou) { avisou = true; window.menork.aviso('Saiu a versão ' + v + ' do site. A página recarrega quando você terminar de digitar.', null, null, 20); } return; }
      window.menork.aviso('Site atualizado para a versão ' + v + '. Recarregando…', null, null, 5);
      setTimeout(() => location.reload(), 1500);
    } catch (_) { /* o site esta religando: tenta de novo no proximo giro */ }
  }
  olhar(); setInterval(olhar, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) olhar(); });
})();
