'use strict';
const TIPOS = [['fb','Fundo branco'],['kit2_fb','Kit 2 fundo branco'],['kit3_fb','Kit 3 fundo branco'],['kit4_fb','Kit 4 fundo branco'],['ia','Foto IA'],['informativo','Informativo'],['tabela','Tabela de medidas'],['capa','Capa'],['capa_kit2','Capa kit 2'],['capa_kit3','Capa kit 3'],['capa_kit4','Capa kit 4'],['cena','Cena real']];
const TIPO_NOME = Object.fromEntries(TIPOS);
const STATUS_NOME = { gerada: 'Gerada (falta classificar)', conferencia: 'Em conferência', aprovada: 'Aprovada', reprovada: 'Reprovada / apagada' };

const MOTIVOS = ['Produto diferente do fundo branco', 'Sola errada', 'Sem logo ou logo errada', 'Pose ou pé diferente da cena', 'Cara de IA', 'Produto pequeno ou longe', 'Layout inventado', 'Cor errada', 'Medida errada', 'Capa repetida'];
const META = { informativo: 3, tabela: 1 };  // fixos por cor; fotos IA e capas sao definidos em cada anuncio
const MKT = { ML: 'Mercado Livre', SHP: 'Shopee', SHEIN: 'Shein', TIKTOK: 'TikTok', AMAZON: 'Amazon', MAGALU: 'Magalu', NETSHOES: 'Netshoes', TEMU: 'Temu', KWAI: 'Kwai' };
const FORMATO = { unitario: 'Unitário', kit2: 'Kit 2', kit3: 'Kit 3', kit4: 'Kit 4' };
const resumo = i => ({ id: i.id, produto: i.produto, cor: i.cor, tipo: i.tipo, status: i.status, tipo_nome: TIPO_NOME[i.tipo] || 'Sem tipo' });
function montagem(aid) {
  const a = DB.anuncios.find(x => x.id === aid); if (!a) throw new Error('Anúncio não encontrado.');
  const lig = DB.links.filter(l => l.an === aid && viva(img(l.img))).sort((x, y) => x.pos - y.pos || x.img - y.img), ok = l => img(l.img).status === 'aprovada';
  const capa = lig.find(l => l.papel === 'capa' && ok(l)), gal = lig.filter(l => l.papel === 'galeria' && ok(l));
  const cores = DB.cores.filter(c => c.an === aid && img(c.img)?.status === 'aprovada').sort((x, y) => x.pos - y.pos);
  const usados = new Set([...gal.map(l => l.img), ...cores.map(c => c.img), ...(capa ? [capa.img] : [])]);
  const prods = lig.map(l => img(l.img).produto).filter(Boolean), produto = demandaDe(a)?.produto || prods.sort((x, y) => prods.filter(p => p === y).length - prods.filter(p => p === x).length)[0] || '';
  const dentro = new Set(DB.links.filter(l => l.an === aid).map(l => l.img));
  return { anuncio: Object.assign({}, a), produto, capa: capa ? resumo(img(capa.img)) : null, galeria: gal.map(l => resumo(img(l.img))),
    cores: cores.map(c => Object.assign(resumo(img(c.img)), { nome_cor: c.cor })), disponiveis: lig.filter(l => !usados.has(l.img)).map(l => resumo(img(l.img))),
    sugestoes: produto ? DB.imgs.filter(i => i.produto === produto && i.status === 'aprovada' && !dentro.has(i.id)).map(resumo) : [],
    modo: a.modo || 'shopee', tamanhos: listaTamanhos(a.tamanhos), todas: lig.filter(ok).map(l => resumo(img(l.img))),
    variacoes: cores.map(c => ({ cor: c.cor, capa: resumo(img(c.img)), fotos: (DB.fotosCor || []).filter(f => f.an === aid && f.cor.toLowerCase() === c.cor.toLowerCase() && img(f.img)?.status === 'aprovada').sort((x, y) => x.pos - y.pos).map(f => resumo(img(f.img))) })) };
}
function listaTamanhos(t) {
  const out = []; String(t || '').replace(/(\d{1,2})\s*(?:-|a|até|ate)\s*(\d{1,2})\b/gi, '$1~$2').split(/[,;\s]+/).forEach(p => { const f = /^(\d{1,2})~(\d{1,2})$/.exec(p); if (f && +f[1] < +f[2] && +f[2] <= +f[1] + 20) for (let x = +f[1]; x <= +f[2]; x++) out.push(String(x)); else if (p) out.push(p.replace('~', '-').slice(0, 12)); });
  return out.filter((x, i) => out.findIndex(y => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 40);
}
function fotosDaCor(aid, cor, ids) { ids = ids.filter(Boolean).slice(0, 10).map(Number); DB.fotosCor = DB.fotosCor.filter(f => !(f.an === aid && f.cor.toLowerCase() === cor.toLowerCase())); ids.forEach((i, pos) => { ligar(i, aid); DB.fotosCor.push({ an: aid, cor, img: i, pos }); }); }

const demandaDe = a => DB.demandas.find(d => d.id === a.demanda);
function metasDe(a) {
  const d = demandaDe(a);
  return d ? { d, ia: d.metas.ia, informativo: d.metas.informativo, tabela: d.metas.tabela, capa: d.metas.capas[a.formato] ?? 0 } : { d: null, ia: a.meta_ia ?? 3, informativo: 3, tabela: 1, capa: a.meta_capa ?? 1 };
}
function faltas(aid) {
  const a = DB.anuncios.find(x => x.id === aid), mt = metasDe(a), m = montagem(aid), p = m.produto, r = [], kit = a.formato !== 'unitario';
  const pendente = i => i.status === 'conferencia' || i.status === 'gerada';
  const lig = DB.links.filter(l => l.an === aid).map(l => img(l.img)).filter(viva), pend = lig.filter(pendente);
  const sobra = (esp, fora) => { const s = []; if (esp) s.push(`${esp} esperando sua aprovação`); if (fora) s.push(`${fora} aprovada(s) ainda fora das fotos do anúncio`); return s.length ? ` (${s.join('; ')})` : ''; };
  const tipoCapa = kit ? 'capa_' + a.formato : 'capa', capas = lig.filter(i => i.tipo === tipoCapa);
  if (!m.capa) r.push('Falta escolher a capa (espaço 1)' + sobra(capas.filter(pendente).length, 0));
  const fotos = m.galeria.map(g => img(g.id)), nas = new Set(fotos.map(i => i.id));
  if (kit) { const fb = a.formato + '_fb'; if (![...fotos, ...m.cores].some(i => i.tipo === fb)) r.push(`Falta o fundo branco do ${FORMATO[a.formato].toLowerCase()} nas fotos ou em Cores` + sobra(pend.filter(i => i.tipo === fb).length, 0)); }
  else {
    let cores = [...new Set([...lig.map(i => i.cor), ...m.cores.map(c => c.cor)].filter(Boolean))].sort();
    if (!cores.length && p) cores = [...new Set(DB.imgs.filter(i => i.produto === p && viva(i) && i.cor && i.tipo === 'fb').map(i => i.cor))].sort();
    if (!cores.length) r.push('Nenhuma cor definida: coloque neste anúncio imagens com produto e cor preenchidos');
    cores.forEach(c => { for (const [t, um, varios] of [['ia', 'foto IA', 'fotos IA'], ['informativo', 'informativo', 'informativos'], ['tabela', 'tabela de medidas', 'tabelas de medidas']]) {
      const q = mt[t] - fotos.filter(i => i.tipo === t && i.cor === c).length; if (q <= 0) continue;
      const doProd = p ? DB.imgs.filter(i => i.produto === p && i.tipo === t && i.cor === c) : lig.filter(i => i.tipo === t && i.cor === c);
      r.push(`${q === 1 ? 'Falta 1 ' + um : 'Faltam ' + q + ' ' + varios} da cor ${c} nas fotos do anúncio` + sobra(doProd.filter(pendente).length, doProd.filter(i => i.status === 'aprovada' && !nas.has(i.id)).length)); } });
    const precisa = cores.length * (mt.ia + mt.informativo + mt.tabela);
    if (precisa > 9) r.push(`As metas pedem ${precisa} fotos além da capa, mas o anúncio comporta 9. Diminua as metas deste anúncio ou faça um anúncio por cor`);
    if (!m.cores.length) r.push('Falta pelo menos 1 foto em Cores (variações)' + sobra(pend.filter(i => i.tipo === 'fb').length, 0));
  }
  for (const [campo, nome] of [['titulo', 'o título'], ['preco', 'o preço'], ['descricao', 'a descrição']]) if (!(a[campo] || '').trim()) r.push('Falta preencher ' + nome);
  if (m.capa) { const o = DB.links.filter(l => l.img === m.capa.id && l.papel === 'capa' && l.an !== aid).map(l => DB.anuncios.find(x => x.id === l.an)?.nome).filter(Boolean); if (o.length) r.push(`A capa é a mesma do anúncio ${o.slice(0, 3).join(', ')}: troque a capa`); }
  if ((a.titulo || '').trim()) { const o = DB.anuncios.filter(x => x.id !== aid && (x.titulo || '').trim().toLowerCase() === a.titulo.trim().toLowerCase()).map(x => x.nome); if (o.length) r.push(`O título é igual ao do anúncio ${o.slice(0, 3).join(', ')}: troque o título`); }
  if (pend.length) r.push(`${pend.length} imagem(ns) do anúncio ainda em conferência: aprove ou reprove`);
  return { produto: p, itens: r, metaIA: mt.ia, metaCapa: mt.capa, kit, tarefa: mt.d?.tarefa || '', info: mt.informativo, tab: mt.tabela,
    capas: { meta: mt.capa, aprovadas: capas.filter(i => i.status === 'aprovada').length, esperando_aprovacao: capas.filter(pendente).length } };
}

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
      const resp = await r.json(), v = resp.atual;
      // bolinha da Fila de aprovacao: atualiza sozinha; se mudou, recarrega os dados (a fila aberta tambem atualiza)
      const bolha = document.getElementById('bolha');
      if (bolha && resp.fila != null && String(resp.fila) !== bolha.textContent) { bolha.textContent = resp.fila; bolha.hidden = !resp.fila;
        if (!ocupado() && (typeof ROTA === 'undefined' || ROTA === '/' || ROTA === '')) document.dispatchEvent(new Event('menork:mudou')); }
      if (!minha) { minha = v; return; }
      if (v === minha) return;
      if (ocupado()) { if (!avisou) { avisou = true; window.menork.aviso('Saiu a versão ' + v + ' do site. A página recarrega quando você terminar de digitar.', null, null, 20); } return; }
      window.menork.aviso('Site atualizado para a versão ' + v + '. Recarregando…', null, null, 5);
      setTimeout(() => location.reload(), 1500);
    } catch (_) { /* o site esta religando: tenta de novo no proximo giro */ }
  }
  olhar(); setInterval(olhar, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) olhar(); });
})();

// ===== Telas (no site de verdade elas sao montadas pelo servidor) =====
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROT = { gerada: 'Falta classificar', conferencia: 'Em conferência', aprovada: 'Aprovada', reprovada: 'Reprovada' };
const SEL_AN = new Set(); // anuncios marcados para mandar ao Grok publicar
let ROTA = (typeof SRV !== 'undefined' && SRV.rotaInicial?.()) || '/';
const rota = (caminho, p = {}) => { const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v)).toString(); return caminho + (q ? '?' + q : ''); };
const elo = (r, texto, cls = '') => `<a href="#" data-rota="${esc(r)}" class="${cls}">${texto}</a>`;
function cartao(i) {
  const an = anunciosDe(i.id).map(a => a.nome).join(' | ');
  return `<div class="cartao" data-id="${i.id}" data-status="${i.status}"><label class="marca"><input type="checkbox" aria-label="Selecionar"></label>
  <div class="foto"><img loading="lazy" src="${IMG(i.id)}" alt=""></div><div class="legenda"><b>${esc(i.produto || 'Sem produto')}${i.cor ? ' <em>' + esc(i.cor) + '</em>' : ''}</b>
  <span>${TIPO_NOME[i.tipo] || 'Sem tipo'}</span><span class="etiqueta s-${i.status}">${ROT[i.status] || i.status}</span>${i.motivo && i.status === 'reprovada' ? `<span class="motivo">${esc(i.motivo)}, por ${esc(i.origem)}</span>` : ''}${i.alertas?.length && i.status !== 'reprovada' ? `<span class="alerta-mini">${i.alertas.length} alerta(s) na conferência</span>` : ''}${i.parecida && i.status !== 'reprovada' ? `<span class="alerta-mini">Parecida com capa já usada</span>` : ''}${i.ref && i.status === 'aprovada' ? '<span class="ref-mini">Referência dos bots</span>' : ''}${an ? `<span class="uso" title="Usada no anúncio">${esc(an)}</span>` : ''}</div></div>`;
}
const ordenar = l => l.sort((a, b) => a.produto.localeCompare(b.produto) || a.cor.localeCompare(b.cor) || a.tipo.localeCompare(b.tipo) || a.id - b.id);
const pendentes = () => DB.imgs.filter(i => i.status === 'gerada' || i.status === 'conferencia');
const contar = (l, f) => l.reduce((m, i) => (m[f(i)] = (m[f(i)] || 0) + 1, m), {});

const TELAS = {
  fila(q) {
    let l = pendentes(); const porProd = contar(l, i => i.produto), sem = l.filter(i => i.status === 'gerada').length;
    const comAlerta = l.filter(i => i.alertas?.length || i.parecida).length, bots = DB.imgs.filter(i => i.status === 'reprovada' && i.origem !== 'você').length;
    if (q.produto) l = l.filter(i => i.produto === q.produto); if (q.so === 'sem') l = l.filter(i => i.status === 'gerada'); if (q.so === 'alerta') l = l.filter(i => i.alertas?.length || i.parecida);
    return `<div class="cabeca"><h1>Fila de aprovação <small>${l.length} esperando</small></h1><div class="acoes">
      ${l.length ? '<button class="b claro" id="selecionar-tudo">Selecionar tudo</button>' : ''}<button class="b claro" id="ler-agora">Procurar imagens novas</button><label class="b claro">Enviar imagens<input type="file" id="enviar" multiple accept="image/*" hidden></label></div></div>
    <div class="filtros">${elo('/', 'Todas', 'ficha ' + (!q.produto && !q.so ? 'ativo' : ''))}${sem ? elo('/?so=sem', `Falta classificar (${sem})`, 'ficha ' + (q.so === 'sem' ? 'ativo' : '')) : ''}${comAlerta ? elo('/?so=alerta', `Com alerta (${comAlerta})`, 'ficha ' + (q.so === 'alerta' ? 'ativo' : '')) : ''}
      ${Object.keys(porProd).filter(Boolean).sort().map(p => elo(rota('/', { produto: p }), `${esc(p)} (${porProd[p]})`, 'ficha ' + (q.produto === p ? 'ativo' : ''))).join('')}</div>
    ${bots ? `<p class="faixa-bots">Os bots já reprovaram ${bots} imagem(ns) antes de chegar aqui. ${elo('/erros', 'Ver lista de erros')}</p>` : ''}
    ${l.length ? `<p class="dica">Clique numa imagem para ver grande ao lado do fundo branco. No visor: <kbd>A</kbd> aprova, <kbd>R</kbd> reprova, <kbd>←</kbd> <kbd>→</kbd> trocam de imagem. Para marcar várias, marque a caixinha da primeira e clique nas outras; com <kbd>Shift</kbd> marca todas entre a última e a que você clicar.</p>
      <div class="grade" data-some-ao-decidir="1">${ordenar(l).map(cartao).join('')}</div>` : `<div class="vazio"><h2>Nada esperando aprovação</h2><p>Quando o gerador salvar imagens novas na pasta de entrada, elas aparecem aqui sozinhas.</p></div>`}`;
  },
  catalogo(q) {
    const vivas = DB.imgs.filter(viva), cont = contar(DB.imgs, i => i.status);
    let l = q.status ? DB.imgs.filter(i => i.status === q.status) : vivas.slice();
    for (const c of ['produto', 'cor', 'tipo']) if (q[c]) l = l.filter(i => i[c] === q[c]);
    if (q.anuncio) l = l.filter(i => anunciosDe(i.id).some(a => a.nome === q.anuncio));
    (q.q || '').toLowerCase().split(/\s+/).filter(Boolean).forEach(p => l = l.filter(i => [i.produto, i.cor, i.nome_original, TIPO_NOME[i.tipo] || '', ...anunciosDe(i.id).map(a => a.nome)].some(t => t.toLowerCase().includes(p))));
    const arv = {}; vivas.forEach(i => { (arv[i.produto] ??= {})[i.cor] = (arv[i.produto][i.cor] || 0) + 1; });
    const op = (v, t, sel) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(t)}</option>`;
    return `<div class="duas"><aside class="arvore"><h3>Produto e cor</h3>${elo('/catalogo', 'Todos os produtos', !q.produto ? 'ativo' : '')}
      ${Object.keys(arv).sort().map(p => `<details ${q.produto === p ? 'open' : ''}><summary>${elo(rota('/catalogo', { produto: p }) + (p ? '' : '?produto='), esc(p || '(sem produto)'), q.produto === p && !q.cor ? 'ativo' : '')}</summary>
        ${Object.keys(arv[p]).sort().map(c => elo(rota('/catalogo', { produto: p, cor: c }), `${esc(c || '(sem cor)')} <small>${arv[p][c]}</small>`, 'filho ' + (q.produto === p && q.cor === c && c ? 'ativo' : ''))).join('')}</details>`).join('')}</aside>
    <section><div class="cabeca"><h1>Catálogo <small>${l.length} imagem(ns)</small></h1>${l.length ? '<div class="acoes"><button class="b claro" id="selecionar-tudo">Selecionar tudo</button></div>' : ''}</div>
      <form class="filtros" data-busca="1"><select data-filtro="tipo">${op('', 'Todos os tipos', q.tipo || '')}${TIPOS.map(([k, v]) => op(k, v, q.tipo)).join('')}</select>
      <select data-filtro="status">${op('', 'Todas (menos reprovadas)', q.status || '')}${op('aprovada', `Aprovadas (${cont.aprovada || 0})`, q.status)}${op('conferencia', `Em conferência (${cont.conferencia || 0})`, q.status)}${op('gerada', `Falta classificar (${cont.gerada || 0})`, q.status)}</select>
      <select data-filtro="anuncio">${op('', 'Todos os anúncios', q.anuncio || '')}${DB.anuncios.map(a => op(a.nome, a.nome, q.anuncio)).join('')}</select>
      <input type="search" name="q" value="${esc(q.q || '')}" placeholder="Buscar…">${Object.keys(q).length ? elo('/catalogo', 'Limpar filtros', 'ficha') : ''}</form>
      ${l.length ? `<div class="grade">${ordenar(l).map(cartao).join('')}</div>` : `<div class="vazio"><h2>Nenhuma imagem aqui</h2><p>Mude os filtros ou espere o gerador mandar imagens.</p></div>`}
      <p class="pequeno">Reprovadas e já apagadas até hoje: ${cont.reprovada || 0}.</p></section></div>`;
  },
  capas(q) {
    let l = DB.imgs.filter(i => i.status === 'aprovada' && i.tipo.startsWith('capa') && !i.copia); // copia de marketplace nao entra no historico
    if (q.so === 'usadas') l = l.filter(i => anunciosDe(i.id).length); if (q.so === 'livres') l = l.filter(i => !anunciosDe(i.id).length);
    const g = {}; l.forEach(i => (g[i.produto || '(sem produto)'] ??= []).push(i));
    return `<div class="cabeca"><h1>Histórico de capas <small>${l.length} aprovada(s)</small></h1></div>
    <div class="filtros">${elo('/capas', 'Todas', 'ficha ' + (!q.so ? 'ativo' : ''))}${elo('/capas?so=usadas', 'Já usadas em anúncio', 'ficha ' + (q.so === 'usadas' ? 'ativo' : ''))}${elo('/capas?so=livres', 'Ainda sem anúncio', 'ficha ' + (q.so === 'livres' ? 'ativo' : ''))}</div>
    ${Object.keys(g).sort().map(p => `<h2 class="grupo">${esc(p)} <small>${g[p].length}</small></h2><div class="grade">${g[p].map(cartao).join('')}</div>`).join('') || `<div class="vazio"><h2>Nenhuma capa aprovada ainda</h2><p>Toda capa que você aprovar na fila aparece aqui, com o anúncio em que foi usada.</p></div>`}`;
  },
  anuncios() {
    const cart = a => { const m = montagem(a.id), rosto = m.capa || m.galeria[0] || m.disponiveis[0], n = (m.capa ? 1 : 0) + m.galeria.length, fl = faltas(a.id).itens.length;
      return `<a class="cartao anuncio ${SEL_AN.has(a.id) ? 'marcado' : ''}" href="#" data-rota="/anuncios/${a.id}"><label class="sel-an" title="Marcar para mandar ao Grok"><input type="checkbox" data-sel-an="${a.id}" ${SEL_AN.has(a.id) ? 'checked' : ''}></label><button type="button" class="excluir-card" data-excluir-an="${a.id}" title="Excluir este anúncio">Excluir</button>${rosto ? `<div class="foto"><img src="${IMG(rosto.id)}" alt=""></div>` : '<div class="foto sem-foto">Sem imagem</div>'}
      <div class="legenda"><b>${esc(a.nome)}</b><span>${FORMATO[a.formato]}</span><span>${n} foto(s) na ordem, ${m.cores.length} cor(es)</span><span class="${fl ? 'alerta-mini' : 'ok-mini'}">${fl ? fl + ' pendência(s)' : 'Completo'}</span>${faltas(a.id).capa_publicada ? `<span class="alerta-mini capa-pub" title="Uma capa deste anúncio já subiu para a loja em outro anúncio">⚠ capa já publicada</span>` : ''}</div></a>`; };
    const soltos = DB.anuncios.filter(a => !demandaDe(a));
    return `<div class="cabeca"><h1>Anúncios <small>${DB.anuncios.length}</small></h1><form class="acoes" id="novo-anuncio"><input name="nome" placeholder="Nome do anúncio novo" required>
      <select name="formato">${Object.entries(FORMATO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="b">Criar anúncio</button></form></div>
    ${DB.demandas.map(d => `<h2 class="grupo">${esc(d.tarefa)} <small>${d.marketplaces.map(m => MKT[m]).join(', ')}</small></h2><div class="grade larga">${DB.anuncios.filter(a => a.demanda === d.id).map(cart).join('')}</div>`).join('')}
    ${soltos.length ? `<h2 class="grupo">Sem tarefa do ClickUp <small>criados à mão</small></h2><div class="grade larga">${soltos.map(cart).join('')}</div>` : ''}
    ${window.PEDIDOS_PUBLICAR ? PEDIDOS_PUBLICAR() : ''}${window.BARRA_SEL_AN ? BARRA_SEL_AN() : ''}`;
  },
  anuncio(q, id) {
    const a = DB.anuncios.find(x => x.id === id); if (!a) return TELAS.anuncios();
    const d = demandaDe(a), fam = a.familia || a.id;
    const irmaos = DB.anuncios.filter(x => (d && x.demanda === d.id) || (x.familia || x.id) === fam);
    const repetido = f => irmaos.filter(x => x.formato === f).length > 1;
    return `${irmaos.length > 1 ? `<div class="abas">${irmaos.map(x => `<span class="aba">${elo('/anuncios/' + x.id, esc(repetido(x.formato) ? x.nome : FORMATO[x.formato]), x.id === a.id ? 'ativo' : '')}<button type="button" class="x-aba" data-excluir-an="${x.id}" title="Excluir ${esc(x.nome)}">×</button></span>`).join('')}${d ? `<span class="pequeno">Tarefa ${esc(d.tarefa)}</span>` : ''}</div>` : ''}
    <div class="cabeca"><h1>${esc(a.nome)} <small id="resumo">Montando o anúncio</small></h1><div class="acoes">
      <button class="b claro" id="montar-auto" title="Preenche capa, fotos e cores vazias com as imagens aprovadas deste anúncio">Montar sozinho</button>
      <button class="b claro" id="copiar-anuncio" data-id="${a.id}" title="Cria cópias deste anúncio ou leva as fotos dele para outros anúncios">Copiar fotos para outros</button>
      <label class="b claro">Enviar imagens<input type="file" id="enviar" data-anuncio="${esc(a.nome)}" multiple accept="image/*" hidden></label>
      ${INTEG().url && INTEG().tem_chave ? `<button class="b" id="enviar-sistema" data-id="${a.id}">${esc(INTEG().nome)}: fotos e anúncio</button>` : ''}
      ${INTEG().url && INTEG().tem_chave ? `<button class="b claro" id="estrutura-loja" data-id="${a.id}" title="Troca as fotos (2 a 9) e as capas das cores de vários anúncios que já estão na loja, mantendo a capa de cada um">Usar estas fotos em anúncios da loja</button>` : ''}
      <button class="b verde" id="baixar-zip" data-id="${a.id}">Exportar</button><button class="b claro" id="excluir-anuncio" data-id="${a.id}">Excluir</button></div></div>
    <div class="montagem"><div class="editor"><div class="topo-anuncio"><div class="bloco faltas" id="faltas"></div><div class="bloco dados-topo" id="dados-topo"></div></div><section id="editor" class="editor"></section></div><aside class="previa">
      <div class="troca" role="group" aria-label="Marketplace do anúncio"><button data-modo="ml"><span class="mk-marca ml"><img src="/marca-mk/ml" alt="" onerror="this.remove()"></span>Mercado Livre</button><button data-modo="shopee"><span class="mk-marca shopee"><img src="/marca-mk/shopee" alt="" onerror="this.remove()"></span>Shopee</button><button data-modo="tiktok"><span class="mk-marca tiktok"><img src="/marca-mk/tiktok" alt="" onerror="this.remove()"></span>TikTok</button></div>
      <div class="celular"><div class="tela" id="tela"></div></div><p class="pequeno" id="dica-previa">Prévia de como o anúncio aparece no celular. Deslize as fotos e toque nas cores.</p></aside></div>`;
  },
};

async function RENDER() {
  await SRV.carregar();
  const [caminho, busca = ''] = ROTA.split('?'), q = Object.fromEntries(new URLSearchParams(busca)), m = /^\/anuncios\/(\d+)$/.exec(caminho);
  const nome = m ? 'anuncio' : ({ '/': 'fila', '/catalogo': 'catalogo', '/capas': 'capas', '/anuncios': 'anuncios', '/referencias': 'referencias', '/erros': 'erros', '/painel': 'painel', '/medidas': 'medidas', '/demandas': 'demandas', '/integracoes': 'integracoes', '/lojas': 'lojas', '/criados': 'criados', '/clickup': 'clickup' }[caminho] || 'fila');
  window.AO_MUDAR = null;
  document.querySelector('main').innerHTML = TELAS[nome](q, m ? +m[1] : 0);
  document.querySelectorAll('.lateral nav a').forEach(a => a.classList.toggle('ativo', a.dataset.tela === (nome === 'anuncio' ? 'anuncios' : nome)));
  lateral();
  const dl = (id, l) => document.getElementById(id).innerHTML = [...new Set(l)].filter(Boolean).sort().map(v => `<option value="${esc(v)}">`).join('');
  dl('dl-produtos', DB.imgs.filter(viva).map(i => i.produto)); dl('dl-cores', DB.imgs.filter(viva).map(i => i.cor)); dl('dl-anuncios', DB.anuncios.map(a => a.nome));
  document.getElementById('barra').hidden = true;
  if (nome === 'anuncio' && document.getElementById('editor')) window.ANUNCIO(+m[1]);
}
function lateral() { const n = pendentes().length, b = document.getElementById('bolha'); b.textContent = n; b.hidden = !n; }
function IR(r, manterRolagem) { ROTA = r; SRV.rota?.(r); RENDER(); if (!manterRolagem) window.scrollTo(0, 0); }

document.addEventListener('click', e => {
  const a = e.target.closest('[data-rota]'); if (a) { e.preventDefault(); return IR(a.dataset.rota); }
  const z = e.target.closest('#baixar-zip'); if (z) return EXPORTAR(+z.dataset.id);
  const x = e.target.closest('#excluir-anuncio'); if (x) { if (!x.dataset.ok) { x.dataset.ok = 1; x.textContent = 'Confirmar exclusão'; x.classList.remove('claro'); x.classList.add('vermelho'); return; } SRV.excluirAnuncio(+x.dataset.id).then(() => { IR('/anuncios'); window.menork.aviso('Anúncio excluído. As imagens continuam no catálogo.'); }); }
});
document.addEventListener('change', e => {
  if (!e.target.dataset.filtro) return; const [, busca = ''] = ROTA.split('?'), q = Object.fromEntries(new URLSearchParams(busca));
  q[e.target.dataset.filtro] = e.target.value; IR(rota('/catalogo', q));
});
document.addEventListener('submit', e => {
  e.preventDefault(); const f = e.target;
  if (f.id === 'novo-anuncio') { const nome = f.nome.value.trim(); if (!nome) return; return SRV.novoAnuncio(nome, f.formato.value).then(id => IR('/anuncios/' + id)); }
  if (f.dataset.busca) { const [, busca = ''] = ROTA.split('?'), q = f.closest('.lateral') ? {} : Object.fromEntries(new URLSearchParams(busca)); q.q = f.q.value; IR(rota('/catalogo', q)); }
});
document.addEventListener('menork:mudou', () => SRV.carregar().then(() => { lateral(); window.AO_MUDAR?.(); }));

// ===== Ideias novas: motivo da reprovacao, conferencia, referencias, erros, painel, medidas, exportacao =====
const jan = () => document.getElementById('janela');
function abrirJanela(html) { jan().querySelector('.janela-caixa').innerHTML = html; jan().hidden = false; jan().querySelector('button')?.focus(); }
function fecharJanela(valor = null) { jan().hidden = true; const f = window._fimJanela; window._fimJanela = null; f?.(valor); }
window.PEDIR_MOTIVO = n => new Promise(res => { window._fimJanela = res;
  abrirJanela(`<h2>Por que reprovar${n > 1 ? ` estas ${n} imagens` : ''}?</h2><p class="pequeno">O motivo entra na lista de erros que os bots consultam para não repetir.</p>
    <div class="motivos">${MOTIVOS.map((m, k) => `<button class="b claro" data-motivo="${m}"><kbd>${(k + 1) % 10}</kbd> ${m}</button>`).join('')}</div>
    <form class="motivo-livre" id="motivo-livre"><label for="motivo-texto">Ou escreva o motivo com as suas palavras</label>
      <div class="acoes"><input id="motivo-texto" maxlength="200" placeholder="Ex.: o cadarço saiu de outra cor" autocomplete="off"><button class="b vermelho">Reprovar com este motivo</button></div>
      <p class="pequeno">Se escrever aqui e depois clicar num dos motivos de cima, os dois vão juntos (ex.: "Sola errada: sola ficou lisa").</p></form>
    <button class="b claro" data-fechar>Cancelar <kbd>Esc</kbd></button>`); });
const textoMotivo = () => (document.getElementById('motivo-texto')?.value || '').trim().replace(/\s+/g, ' ');
document.addEventListener('submit', e => { if (e.target.id !== 'motivo-livre') return; e.preventDefault(); e.stopImmediatePropagation();
  const t = textoMotivo(); if (!t) return document.getElementById('motivo-texto').focus(); fecharJanela(t); }, true);
document.addEventListener('click', e => {
  if (jan().hidden) return;
  const m = e.target.closest('[data-motivo]'); if (m) { const t = textoMotivo(); return fecharJanela(t ? `${m.dataset.motivo}: ${t}` : m.dataset.motivo); }
  if (e.target === jan() || e.target.closest('[data-fechar]')) fecharJanela();
});
document.addEventListener('keydown', e => {
  if (jan().hidden) return;
  e.stopImmediatePropagation();
  if (e.key === 'Escape') return fecharJanela();
  if (e.target.matches('input,textarea,select')) return;  // digitando o motivo: os numeros sao texto
  if (window._fimJanela && /^[0-9]$/.test(e.key)) { const m = MOTIVOS[(+e.key + 9) % 10]; if (m) fecharJanela(m); }
}, true);
async function copiar(texto, ok = 'Copiado.') { try { await navigator.clipboard.writeText(texto); window.menork.aviso(ok); } catch (e) { window.menork.aviso('Não consegui copiar sozinho. Selecione o texto e use Ctrl+C.'); } }
document.addEventListener('click', e => { const c = e.target.closest('[data-copiar]'); if (c) copiar(c.dataset.copiar, 'Caminho copiado.'); const t = e.target.closest('[data-copiar-de]'); if (t) copiar(document.getElementById(t.dataset.copiarDe).value, 'Lista copiada.'); });

// ---- o que aparece a mais no visor
const TIPOS_REF = ['informativo', 'cena', 'tabela', 'capa', 'capa_kit2', 'capa_kit3', 'capa_kit4'];
const COM_ESTILO = ['informativo', 'cena'];
const ESTILOS_BASE = ['Academia', 'Street', 'Sandália', 'Casual', 'Infantil', 'Social'];
const estilosConhecidos = () => [...new Set([...ESTILOS_BASE, ...DB.imgs.map(i => i.estilo).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
const campoEstilo = (id, valor, idCampo = '') => `<input ${idCampo ? `id="${idCampo}"` : ''} data-estilo="${id}" list="dl-estilos" value="${esc(valor || '')}" placeholder="Ex.: Academia" aria-label="Estilo"><datalist id="dl-estilos">${estilosConhecidos().map(e => `<option value="${esc(e)}">`).join('')}</datalist>`;
document.addEventListener('change', async e => { const t = e.target.closest('[data-estilo]'); if (!t) return; const id = +t.dataset.estilo;
  try { await window.menork.api('/api/acao', { ids: [id], acao: 'estilo', estilo: t.value }); window.menork.aviso(t.value.trim() ? 'Estilo salvo: ' + t.value.trim() : 'Estilo apagado.'); const visor = !!t.id; await RENDER(); if (visor) window.menork.abrir(id); } catch (err) { window.menork.aviso(err.message); } });
function listaEstilos() { let dl = document.getElementById('dl-estilos-barra'); if (!dl) { dl = document.createElement('datalist'); dl.id = 'dl-estilos-barra'; document.body.append(dl); }
  dl.innerHTML = estilosConhecidos().map(e => `<option value="${esc(e)}">`).join(''); const b = document.getElementById('l-estilo'); if (b) b.setAttribute('list', 'dl-estilos-barra'); }
document.addEventListener('menork:mudou', listaEstilos); setTimeout(listaEstilos, 1500);
window.AO_ABRIR = d => {
  const x = document.getElementById('v-extra'), p = [];
  if (d.status === 'reprovada') p.push(`<div class="nota ruim"><b>Reprovada: ${esc(d.motivo || 'sem motivo')}</b><span>por ${esc(d.origem || 'você')}</span></div>`);
  else if (d.alertas && d.status !== 'aprovada') p.push(d.alertas.length
    ? `<div class="nota ruim"><b>Conferência do bot: ${d.alertas.length} alerta(s)</b>${d.alertas.map(a => `<span>${esc(a)}</span>`).join('')}</div>`
    : `<div class="nota boa"><b>Conferência do bot sem alertas</b><span>O bot conferente comparou com o fundo branco e não achou diferença</span></div>`);
  if (d.parecida && d.status !== 'reprovada') { const o = img(d.parecida.id), an = anunciosDe(o.id).map(a => a.nome).join(', '); p.push(`<div class="nota ruim par"><img src="${IMG(o.id)}" alt=""><div><b>${d.parecida.pct}% parecida com uma capa já usada</b><span>${an ? 'Usada em ' + esc(an) : 'Já aprovada antes'}</span></div></div>`); }
  if (d.tipo === 'tabela' && MEDIDAS[d.produto]) p.push(`<div class="nota"><b>Medidas cadastradas de ${esc(d.produto)}</b><span class="medidas-mini">${MEDIDAS[d.produto].map(([n, c]) => `<i>${esc(n)} = ${esc(c)} cm</i>`).join('')}</span></div>`);
  if (d.status === 'aprovada' && TIPOS_REF.includes(d.tipo)) {
    p.push(`<button class="b claro" id="v-ref" data-id="${d.id}">${d.ref ? 'É referência dos bots. Tirar' : 'Usar como referência dos bots'}</button>`);
    if (d.ref && COM_ESTILO.includes(d.tipo)) p.push(`<label class="estilo-ref">Estilo da referência${campoEstilo(d.id, d.estilo, 'v-estilo')}</label>`);
  }
  x.innerHTML = p.join('');
};
document.addEventListener('click', async e => { const b = e.target.closest('#v-ref'); if (!b) return; const id = +b.dataset.id; await window.menork.api('/api/acao', { ids: [id], acao: 'referencia' }); await RENDER(); window.menork.abrir(id); });

// ---- o que falta no anuncio
window.AO_DESENHAR = async aid => {
  await SRV.carregar(); const c = document.getElementById('faltas'); if (!c) return; const f = faltas(aid), pd = PEDIDO(aid), pk = PACOTES(aid);
  const hora = t => esc(String(t || '').slice(0, 16));
  const pedido = !pd ? '' : pd.status === 'feito' ? `Pedido nº ${pd.id}: o bot ${esc(pd.bot || '')} marcou como feito em ${hora(pd.atualizado)}.` : pd.status === 'pego' ? `Pedido nº ${pd.id}: o bot ${esc(pd.bot || '')} pegou em ${hora(pd.atualizado)} e está fazendo.` : `Pedido nº ${pd.id} feito em ${hora(pd.quando)}. Esperando um bot pegar.`;
  // pendencias agrupadas: uma linha por cor, os campos de texto em etiquetas, o resto em lista
  const L = f.lista || f.itens.map(t => ({ tipo: '', cor: '', faltam: 1, texto: t, fora: 0, esperando: 0 }));
  const NOME = { ia: ['foto IA', 'fotos IA'], informativo: ['informativo', 'informativos'], tabela: ['tabela', 'tabelas'] };
  const CAMPO = { titulo: 'Título', preco: 'Preço', descricao: 'Descrição', tamanhos: 'Tamanhos' };
  const porCor = {}, campos = [], outros = [];
  L.forEach(i => { if (NOME[i.tipo] && i.cor) (porCor[i.cor] = porCor[i.cor] || []).push(i); else if (CAMPO[i.tipo] && /^Falta preencher/.test(i.texto)) campos.push(i.tipo); else outros.push(i.texto); });
  const prontas = L.reduce((n, i) => n + (i.fora || 0), 0), esperando = L.reduce((n, i) => n + (i.esperando || 0), 0);
  // cores com as mesmas pendencias viram uma linha so ("1 foto IA · 12 cores: ..."), para o bloco nao empurrar as fotos para baixo
  const iguais = {};
  Object.entries(porCor).forEach(([cor, it]) => { const chave = it.map(i => `${i.faltam} ${NOME[i.tipo][i.faltam === 1 ? 0 : 1]}`).join(' · '); (iguais[chave] = iguais[chave] || []).push(cor); });
  const linhasCor = Object.entries(iguais).map(([chave, cores]) => `<div class="falta-cor"><b title="${esc(cores.join(', '))}">${cores.length === 1 ? esc(cores[0]) : `${cores.length} cores`}</b>${chave.split(' · ').map(t => `<span class="chip-falta">${esc(t)}</span>`).join('')}${cores.length > 1 ? `<small class="cores-falta" title="${esc(cores.join(', '))}">${esc(cores.slice(0, 4).join(', '))}${cores.length > 4 ? ` e mais ${cores.length - 4}` : ''}</small>` : ''}</div>`).join('');
  const pedidoHtml = pedido ? `<span class="pequeno">${pedido}</span>` : '';
  const hist = (ENVIOS(aid).length ? `<h3>Envios para o ${esc(INTEG().nome)}</h3><ul class="envios-feitos">${ENVIOS(aid).map(v => `<li><b class="${v.ok ? 'ok-mini' : 'alerta-mini'}">${v.ok ? 'Enviado' : 'Falhou'}</b> em ${hora(v.quando)} por ${esc(v.por)}${v.id ? ` · código no ${esc(INTEG().nome)}: ${esc(v.id)}` : ''}${v.resposta ? ` · ${esc(v.resposta)}` : ''}</li>`).join('')}</ul>` : '') +
    (pk.length ? `<ul class="pacotes-feitos">${pk.map(p => `<li><b class="${p.status === 'completo' ? 'ok-mini' : 'alerta-mini'}">${p.status === 'completo' ? 'Completo' : 'Incompleto'}</b> Montado em ${hora(p.quando)} por ${esc(p.por)}${p.mk ? ' para ' + esc(MKT[p.mk] || p.mk) : ''}, ${p.arquivos} arquivo(s).${p.tem_zip ? ` <a href="/pacotes/${p.id}/zip">Abrir o ZIP guardado</a>` : ''}</li>`).join('')}</ul>` : '');
  c.innerHTML = `<div class="faltas-topo"><h2>${f.itens.length ? `Falta${f.itens.length === 1 ? '' : 'm'} ${f.itens.length} coisa${f.itens.length === 1 ? '' : 's'}` : 'Tudo pronto'} ${f.produto ? '<small>' + esc(f.produto) + '</small>' : ''}</h2>
    <div class="metas">${f.kit ? '' : `<label>IA por cor <input type="number" min="0" max="30" data-meta="ia" data-an="${aid}" value="${f.metaIA}"></label>`}<label>Capas <input type="number" min="0" max="40" data-meta="capa" data-an="${aid}" value="${f.metaCapa}"></label>
    <span class="pequeno" title="${f.tarefa ? 'Metas lidas da tarefa ' + esc(f.tarefa) + ' no ClickUp' : 'Anúncio sem tarefa: você define as metas'}">${f.kit ? '' : `+ ${f.info} info e ${f.tab} tabela por cor`} · capas ${f.capas.aprovadas}/${f.capas.meta}${f.capas.esperando_aprovacao ? ` (${f.capas.esperando_aprovacao} esperando)` : ''}</span></div></div>` +
    (f.itens.length ? `${linhasCor ? `<div class="faltas-cores">${linhasCor}</div>` : ''}
      ${campos.length ? `<div class="falta-cor"><b>Preencher</b>${campos.map(t => `<button type="button" class="chip-falta campo" data-foco="c-${t}" title="Ir para o campo">${CAMPO[t]}</button>`).join('')}</div>` : ''}
      ${outros.length ? `<ul>${outros.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      <div class="acoes pedir">${prontas ? `<button class="b verde" id="colocar-prontas" title="Coloca no anúncio as imagens aprovadas que já existem">Colocar ${prontas} aprovada${prontas === 1 ? '' : 's'} que já ${prontas === 1 ? 'existe' : 'existem'}</button>` : ''}<button class="b ${prontas ? 'claro' : ''}" id="pedir-bot" data-an="${aid}">Pedir ao bot o que falta</button>${esperando ? `<span class="pequeno">${esperando} esperando sua aprovação na fila.</span>` : ''}${pedidoHtml}</div>`
      : `<p class="completo">Nada faltando. O pacote deste anúncio pode ser montado.</p>${pedido ? `<p class="pequeno">${pedido}</p>` : ''}`) +
    (hist ? `<details class="historico"><summary>Pacotes e envios (${pk.length + ENVIOS(aid).length})</summary>${hist}</details>` : '');
};
document.addEventListener('click', async e => { const b = e.target.closest('#pedir-bot'); if (!b) return; const aid = +b.dataset.an;
  try { const texto = await SRV.pedir(aid); let copiou = true; try { await navigator.clipboard.writeText(texto); } catch (_) { copiou = false; }
    window.menork.aviso('Pedido registrado: os bots veem com o comando "pedidos".' + (copiou ? ' O texto também foi copiado; se quiser que comece já, cole no Grok Bot.' : ''), null, null, 12); window.AO_DESENHAR(aid);
  } catch (err) { window.menork.aviso(err.message); } });
document.addEventListener('change', async e => { const t = e.target; if (!t.dataset.meta) return; const valor = Math.max(0, parseInt(t.value) || 0);
  if (t.dataset.dem) { await SRV.meta({ dem: +t.dataset.dem, chave: t.dataset.meta, valor }); return RENDER(); }
  await SRV.meta({ an: +t.dataset.an, chave: t.dataset.meta, valor }); window.AO_DESENHAR(+t.dataset.an); });
document.addEventListener('change', async e => { const t = e.target; if (!t.dataset.demProd) return; await SRV.produtoDemanda(+t.dataset.demProd, t.value.trim().toUpperCase()); RENDER(); });

// ---- excluir anuncio direto da lista (dois cliques: excluir e confirmar)
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-excluir-an]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (!b.dataset.ok) { document.querySelectorAll('[data-excluir-an][data-ok]').forEach(x => { delete x.dataset.ok; x.textContent = x.dataset.texto || 'Excluir'; x.classList.remove('confirmar'); });
    b.dataset.texto = b.textContent; b.dataset.ok = 1; b.textContent = b.classList.contains('x-aba') ? 'Excluir?' : 'Confirmar exclusão'; b.classList.add('confirmar'); return; }
  const id = +b.dataset.excluirAn, nome = DB.anuncios.find(a => a.id === id)?.nome || 'Anúncio';
  try { await SRV.excluirAnuncio(id); await RENDER(); window.menork.aviso(`${nome} excluído. As imagens continuam no catálogo.`); } catch (err) { window.menork.aviso(err.message); }
}, true);
document.addEventListener('click', e => { if (e.target.closest('[data-excluir-an]')) return;
  document.querySelectorAll('[data-excluir-an][data-ok]').forEach(x => { delete x.dataset.ok; x.textContent = x.dataset.texto || 'Excluir'; x.classList.remove('confirmar'); }); });

// ---- copiar as fotos de um anuncio para outros
document.addEventListener('click', e => {
  const b = e.target.closest('#copiar-anuncio'); if (!b) return; const aid = +b.dataset.id, a = DB.anuncios.find(x => x.id === aid), f = faltas(aid);
  const outros = DB.anuncios.filter(x => x.id !== aid).sort((x, y) => (faltas(y.id).produto === f.produto) - (faltas(x.id).produto === f.produto) || x.nome.localeCompare(y.nome));
  abrirJanela(`<h2>Copiar as fotos de ${esc(a.nome)}</h2>
    <p class="pequeno">Leva as fotos 2 a 10 e as cores deste anúncio. Nos anúncios que já existem, só as imagens mudam: título, preço, descrição e metas ficam como estão.</p>
    <form id="form-copiar" data-id="${aid}" class="form-copiar">
      <label class="linha">Criar <input type="number" name="novos" min="0" max="50" value="${outros.length ? 0 : 9}"> anúncio(s) novo(s) iguais a este <span class="pequeno">(${esc(a.nome.replace(/\s+\d{1,3}$/, ''))} 02, 03…, com o mesmo preço e descrição)</span></label>
      <label class="linha"><input type="checkbox" name="titulo"> Nos novos, copiar também o título <span class="pequeno">(o site avisa enquanto ele estiver repetido)</span></label>
      ${outros.length ? `<h3>Levar as fotos para anúncios que já existem</h3><div class="lista-destinos">${outros.map(x => `<label><input type="checkbox" name="destino" value="${x.id}"> ${esc(x.nome)} <small>${esc(FORMATO[x.formato])}</small></label>`).join('')}</div>` : ''}
      <label class="linha"><input type="checkbox" name="capa"> Levar a capa também <span class="pequeno">(deixe desmarcado para escolher uma capa diferente em cada um)</span></label>
      <div class="acoes"><button class="b">Copiar</button><button type="button" class="b claro" data-fechar>Cancelar</button></div>
    </form>`);
});
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'form-copiar') return; e.preventDefault();
  const dados = { id: +f.dataset.id, novos: +f.novos.value || 0, titulo: f.titulo.checked, capa: f.capa.checked, destinos: [...f.querySelectorAll('[name=destino]:checked')].map(x => +x.value) };
  if (!dados.novos && !dados.destinos.length) return window.menork.aviso('Escolha quantos anúncios novos criar ou marque algum anúncio que já existe.');
  try { const r = await SRV.copiar(dados); fecharJanela(); await RENDER();
    window.menork.aviso([r.novos.length ? `${r.novos.length} anúncio(s) criado(s): ${r.novos.slice(0, 3).join(', ')}${r.novos.length > 3 ? '…' : ''}` : '', r.atualizados ? `fotos levadas para ${r.atualizados} anúncio(s)` : ''].filter(Boolean).join('; ') + '. Agora troque a capa e o título de cada um.', null, null, 12);
  } catch (err) { window.menork.aviso(err.message); }
});

// ---- B2X: trocar as fotos de um anuncio que ja existe ou criar um anuncio novo (Shopee e Mercado Livre)
const B2 = { passo: '' };
const b2get = url => window.menork.api(url), b2post = (url, corpo) => window.menork.api(url, corpo);
const B2CANAL = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', tiktokshop: 'TikTok' };
const semAc = t => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
function b2Tela(html) { abrirJanela(`<div class="b2x">${html}</div>`); }
function b2Carregando(txt) { b2Tela(`<h2>${esc(INTEG().nome)}</h2><p class="dica">${esc(txt)}</p>`); }
function b2Erro(err, voltar) { b2Tela(`<h2>Não deu certo</h2><div class="nota ruim"><span>${esc(err.message || err)}</span></div><div class="acoes">${voltar ? `<button class="b" data-b2="${voltar}">Voltar</button>` : ''}<button class="b claro" data-fechar>Fechar</button></div>`); }
const b2Lista = (t, xs) => xs && xs.length ? `<h3>${t}</h3><ul class="envios-feitos">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

async function b2Inicio(aid) {
  const a = DB.anuncios.find(x => x.id === aid); B2.aid = aid; B2.canal = a.modo === 'ml' ? 'mercadolivre' : a.modo === 'tiktok' ? 'tiktokshop' : 'shopee'; B2.lote = new Set([aid]);
  b2Carregando(`Buscando as lojas de ${B2CANAL[B2.canal]} no ${INTEG().nome}…`);
  try { const r = await b2get('/api/b2x/lojas?canal=' + B2.canal); B2.lojas = r.lojas; b2Lojas(); } catch (err) { b2Erro(err); }
}
// ---- escolher a loja: cartões de cliente com busca, depois as lojas do cliente separadas por CNPJ (no lugar da lista enorme)
// Fica no lugar de um <select>: guarda o valor num <input type=hidden id=...> e avisa com o evento change.
const SL = {};
const MK_NOME_SL = { shopee: 'Shopee', mercadolivre: 'Mercado Livre', tiktokshop: 'TikTok', shein: 'Shein' };
function seletorLoja(id, lojas, atual) {
  const st = SL[id] = { ...(SL[id] || {}), lojas, valor: lojas.some(l => l.id === atual) ? atual : '' };
  if (st.valor && st.trocando === undefined) st.trocando = false;
  if (!st.valor) st.trocando = true;
  return `<div class="sl" id="sl-${esc(id)}" data-sl="${esc(id)}">${slCorpo(id)}</div><input type="hidden" id="${esc(id)}" value="${esc(st.valor)}">`;
}
function slCorpo(id) {
  const st = SL[id], l = st.lojas.find(x => x.id === st.valor);
  if (l && !st.trocando) return `<div class="sl-escolhida"><span class="sl-ini">${esc((l.cliente || '?').slice(0, 1))}</span><span><b>${esc(l.cliente)}</b><small>${esc(l.nome)}${l.pj ? ' · ' + esc(l.pj) : ''} · ${esc(MK_NOME_SL[l.canal] || MKN[l.marketplace] || l.canal || '')}${l.aviso ? ` · <em class="aviso-txt">⚠ ${esc(l.aviso)}</em>` : ''}</small></span><button type="button" class="b claro mini" data-sl-trocar>Trocar loja</button></div>`;
  return `<input class="sl-busca" data-sl-busca placeholder="Buscar cliente ou loja…" value="${esc(st.busca || '')}" autocomplete="off"><div class="sl-lista">${slLista(id)}</div>`;
}
function slLista(id) {
  const st = SL[id], q = semAcento(st.busca || ''), grupos = new Map();
  st.lojas.forEach(l => { const g = grupos.get(l.cliente) || []; g.push(l); grupos.set(l.cliente, g); });
  if (st.cliente && grupos.has(st.cliente) && !q) {
    const ls = grupos.get(st.cliente), pjs = new Map();
    ls.forEach(l => { const k = l.pj || 'Sem CNPJ'; pjs.set(k, [...(pjs.get(k) || []), l]); });
    return `<button type="button" class="sl-voltar" data-sl-cliente="">‹ Todos os clientes</button><h4 class="sl-titulo">${esc(st.cliente)}</h4>
      ${[...pjs.entries()].sort().map(([pj, ls]) => `<div class="sl-pj"><span class="sl-pj-nome">${esc(pj)}</span><div class="sl-lojas">${ls.map(slBotao).join('')}</div></div>`).join('')}`;
  }
  const cli = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (q) {
    const achadas = st.lojas.filter(l => semAcento(l.cliente + ' ' + l.nome + ' ' + (l.pj || '')).includes(q));
    return achadas.length ? `<div class="sl-lojas">${achadas.slice(0, 60).map(l => slBotao(l, true)).join('')}</div>` : '<p class="pequeno">Nada encontrado.</p>';
  }
  return `<div class="sl-clientes">${cli.map(([c, ls]) => `<button type="button" class="sl-cli" data-sl-cliente="${esc(c)}"><span class="sl-ini">${esc(c.slice(0, 1))}</span><span><b>${esc(c)}</b><small>${ls.length} loja(s)${ls.some(l => l.aviso) ? ' · ⚠' : ''}</small></span></button>`).join('')}</div>`;
}
function slBotao(l, comCliente) {
  return `<button type="button" class="sl-loja ${l.aviso ? 'com-aviso' : ''}" data-sl-loja="${esc(l.id)}" title="${esc(l.aviso || '')}">${comCliente ? `<small>${esc(l.cliente)}</small>` : ''}<b>${esc(l.nome)}</b><small>${esc(MK_NOME_SL[l.canal] || MKN[l.marketplace] || l.canal || '')}${l.pj && comCliente ? ' · ' + esc(l.pj) : ''}${l.aviso ? ' · ⚠ ' + esc(l.aviso) : ''}</small></button>`;
}
function semAcento(t) { return String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function slRedesenhar(id) { const el = document.getElementById('sl-' + id); if (el) el.innerHTML = slCorpo(id); }
document.addEventListener('click', e => {
  const box = e.target.closest('[data-sl]'); if (!box) return;
  const id = box.dataset.sl, st = SL[id];
  if (e.target.closest('[data-sl-trocar]')) { st.trocando = true; st.cliente = (st.lojas.find(l => l.id === st.valor) || {}).cliente || ''; slRedesenhar(id); return; }
  const c = e.target.closest('[data-sl-cliente]'); if (c) { st.cliente = c.dataset.slCliente; st.busca = ''; slRedesenhar(id); return; }
  const lj = e.target.closest('[data-sl-loja]'); if (lj) {
    st.valor = lj.dataset.slLoja; st.trocando = false; st.busca = ''; slRedesenhar(id);
    const h = document.getElementById(id); h.value = st.valor; h.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
document.addEventListener('input', e => {
  const b = e.target.closest('[data-sl-busca]'); if (!b) return;
  const id = b.closest('[data-sl]').dataset.sl; SL[id].busca = b.value; b.parentElement.querySelector('.sl-lista').innerHTML = slLista(id);
});

// anúncios do mesmo produto (as cópias): escolher quantos mandar de uma vez
function b2IrmaosLista() {
  const a = DB.anuncios.find(x => x.id === B2.aid); if (!a) return [];
  const fam = a.familia || a.id, d = a.demanda;
  return DB.anuncios.filter(x => (x.familia || x.id) === fam || (d && x.demanda === d));
}
function b2Irmaos() {
  const l = b2IrmaosLista(); if (l.length < 2) return '';
  const enviado = id => (DB.envios?.[id] || []).find(e => e.ok && e.id);
  return `<div class="b2-irmaos"><div class="b2-irmaos-cab"><b>Quais anúncios deste produto mandar?</b> <span class="pequeno">${B2.lote.size} de ${l.length} marcado(s) · vale para "Criar anúncio novo"</span>
    <button type="button" class="b claro mini" data-b2-todos>${l.every(x => B2.lote.has(x.id)) ? 'Só este' : 'Marcar todos'}</button></div>
    <div class="b2-irmaos-lista">${l.map(x => { const e = enviado(x.id); return `<label class="${B2.lote.has(x.id) ? 'marcado' : ''}"><input type="checkbox" data-b2-irmao="${x.id}" ${B2.lote.has(x.id) ? 'checked' : ''}><span><b>${esc(x.nome)}</b><small>${esc((x.titulo || 'sem título').slice(0, 60))}${e ? ` · <em class="ja-criado">já criado (${esc(e.id)})</em>` : ''}</small></span></label>`; }).join('')}</div></div>`;
}
document.addEventListener('change', e => {
  const c = e.target.closest('[data-b2-irmao]'); if (!c) return;
  const id = +c.dataset.b2Irmao; c.checked ? B2.lote.add(id) : B2.lote.delete(id); if (!B2.lote.size) B2.lote.add(B2.aid);
  const box = document.querySelector('.b2-irmaos'); if (box) box.outerHTML = b2Irmaos();
});
document.addEventListener('click', e => {
  if (!e.target.closest('[data-b2-todos]')) return;
  const l = b2IrmaosLista(); B2.lote = l.every(x => B2.lote.has(x.id)) ? new Set([B2.aid]) : new Set(l.map(x => x.id));
  const box = document.querySelector('.b2-irmaos'); if (box) box.outerHTML = b2Irmaos();
});
function b2Lojas() {
  const nomeAn = DB.anuncios.find(x => x.id === B2.aid).nome;
  b2Tela(`<h2>${esc(INTEG().nome)}: ${esc(nomeAn)} <small>modo ${B2CANAL[B2.canal]}</small></h2>
    ${B2.lojas.length ? `<div class="campo-b2"><span>Loja</span>${seletorLoja('b2-loja', B2.lojas.map(l => ({ ...l, canal: B2.canal })), B2.loja)}</div>
    <p class="pequeno" id="b2-aviso-loja"></p>
    ${b2Irmaos()}
    <div class="b2-escolha"><button class="b" data-b2="trocar">Trocar fotos de anúncios que já existem (um ou vários)</button><button class="b claro" data-b2="criar">Criar anúncio novo</button></div>
    <p class="pequeno">Para usar outro marketplace, troque o modo do anúncio (botões em cima do celular).</p>`
    : `<div class="nota ruim"><span>Nenhuma loja de ${B2CANAL[B2.canal]} apareceu para esta chave.</span></div>`}
    <div class="acoes"><button class="b claro" data-fechar>Fechar</button></div>`);
  b2AvisoLoja();
}
function b2AvisoLoja() { const s = document.getElementById('b2-loja'); if (!s) return; const l = B2.lojas.find(x => x.id === s.value); B2.loja = s.value; B2.lojaNome = l ? l.cliente + ' · ' + l.nome : ''; const p = document.getElementById('b2-aviso-loja'); if (p) p.textContent = l && l.aviso ? 'Atenção: ' + l.aviso : ''; }

// ---------- trocar fotos
async function b2Anuncios(busca = '') {
  B2.busca = busca; b2Carregando('Buscando os anúncios da loja…');
  try { const r = await b2get(`/api/b2x/anuncios?loja=${encodeURIComponent(B2.loja)}&busca=${encodeURIComponent(busca)}`); B2.anuncios = r.anuncios;
    b2Tela(`<h2>Qual anúncio vai receber as fotos? <small>${esc(B2.lojaNome)}</small></h2>
      <form id="b2-busca" class="b2-linha"><input name="busca" value="${esc(busca)}" placeholder="Parte do título ou o código do anúncio"><button class="b claro">Buscar</button></form>
      <p class="pequeno">${r.total} anúncio(s)${r.lido_em ? ' · lista lida às ' + esc(String(r.lido_em).slice(11, 16)) : ''}</p>
      <div class="b2-anuncios">${r.anuncios.map(x => `<button class="b2-anuncio" data-b2-anuncio="${esc(x.id)}">${x.capa ? `<img src="${esc(x.capa)}" alt="" referrerpolicy="no-referrer">` : ''}<span><b>${esc(x.titulo)}</b><small>${esc(x.id)}${x.preco != null ? ' · R$ ' + esc(x.preco) : ''}${x.status ? ' · ' + esc(x.status) : ''}</small></span></button>`).join('') || '<p class="dica">Nenhum anúncio com esse título.</p>'}</div>
      <div class="acoes"><button class="b claro" data-b2="lojas">Voltar</button></div>`);
  } catch (err) { b2Erro(err, 'lojas'); }
}
async function b2Mapear(id) {
  B2.anuncio = id; b2Carregando('Lendo o anúncio e as cores dele…');
  try { const d = await b2get(`/api/b2x/anuncio?loja=${encodeURIComponent(B2.loja)}&anuncio=${encodeURIComponent(id)}&canal=${B2.canal}`); B2.det = d;
    const nossas = (await b2get('/api/anuncios/' + B2.aid)).variacoes.map(v => v.cor);
    const casa = c => nossas.find(x => semAc(x) === semAc(c)) || '';
    b2Tela(`<h2>Trocar as fotos <small>${esc(d.titulo)}</small></h2>
      <p class="pequeno">${esc(B2.lojaNome)} · ${esc(d.id)}${d.familia ? ' · Mercado Livre com um anúncio por cor e tamanho: cada cor vai para todos os tamanhos dela' : ''}</p>
      ${B2.canal === 'shopee' ? `<label class="linha"><input type="checkbox" id="b2-galeria" checked> Trocar também as fotos do anúncio (capa e galeria, até 9)</label>` : ''}
      <h3>Cor no marketplace → cor no site</h3>
      ${d.cores.length ? `<div class="b2-mapa">${d.cores.map(c => `<label><span>${esc(c)}</span><select data-b2-cor="${esc(c)}"><option value="">não mexer</option>${nossas.map(x => `<option ${x === casa(c) ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`).join('')}</div>`
        : '<p class="dica">Este anúncio não tem variação de cor.</p>'}
      <p class="pequeno">${B2.canal === 'shopee' ? 'Na Shopee vai a capa da variação de cada cor.' : 'No Mercado Livre vão as fotos da cor, na ordem (a 1ª é a principal).'} Primeiro o ${esc(INTEG().nome)} só simula; nada muda até você confirmar.</p>
      <div class="acoes"><button class="b" data-b2="simular">Simular a troca</button><button class="b claro" data-b2="anuncios">Voltar</button></div>`);
  } catch (err) { b2Erro(err, 'anuncios'); }
}
async function b2Simular() {
  const mapa = {}; document.querySelectorAll('[data-b2-cor]').forEach(s => { if (s.value) mapa[s.dataset.b2Cor] = s.value; });
  const galeria = !!document.getElementById('b2-galeria')?.checked;
  b2Carregando('Subindo as fotos e simulando a troca. Pode levar um minuto…');
  try { const r = await b2post('/api/b2x/fotos/simular', { aid: B2.aid, loja: B2.loja, anuncio: B2.anuncio, canal: B2.canal, mapa, galeria }); B2.token = r.token;
    b2Tela(`<h2>Simulação <small>nada foi trocado ainda</small></h2>
      ${r.envios.map(e => `<div class="nota ${e.ok ? '' : 'ruim'}"><b>${esc(e.rotulo)}: ${e.ok ? 'pronto para trocar' : 'recusado'}</b>${e.erro ? `<span>${esc(e.erro)}</span>` : ''}${e.mudancas.length ? `<span>Vai mudar: ${e.mudancas.map(esc).join(', ')}</span>` : ''}${e.avisos.map(a => `<span>${esc(a)}</span>`).join('')}</div>`).join('')}
      <div class="acoes">${r.pode_confirmar ? '<button class="b verde" data-b2="confirmar">Confirmar e trocar as fotos agora</button>' : ''}<button class="b claro" data-b2="mapear">Voltar</button></div>`);
  } catch (err) { b2Erro(err, 'mapear'); }
}
async function b2Confirmar() {
  b2Carregando('Trocando as fotos no marketplace…');
  try { const r = await b2post('/api/b2x/fotos/confirmar', { token: B2.token });
    b2Tela(`<h2>Resultado</h2>${r.envios.map(e => `<div class="nota ${e.ok ? '' : 'ruim'}"><b>${esc(e.rotulo)}: ${e.ok ? (e.situacao === 'parcial' ? 'feito em parte' : 'trocado') : 'não trocado'}</b>${e.erro ? `<span>${esc(e.erro)}</span>` : ''}${e.ainda_antigos.length ? `<span>O marketplace ainda mostra o antigo em: ${e.ainda_antigos.map(x => esc(typeof x === 'string' ? x : JSON.stringify(x))).join(', ')}. Pode levar alguns minutos.</span>` : ''}</div>`).join('')}
      <p class="pequeno">O jeito de desfazer ficou guardado no histórico do anúncio (Pacotes e envios).</p><div class="acoes"><button class="b" data-fechar>Fechar</button></div>`);
    window.AO_DESENHAR?.(B2.aid);
  } catch (err) { b2Erro(err, 'mapear'); }
}

// ---------- criar anuncio novo
// marca da Shopee: nunca cai numa marca qualquer da lista; usa a da última vez, "Sem marca" ou obriga a escolher
function opcoesMarca(f, atual) {
  const semMarca = f.marcas.find(x => /sem marca|no ?brand|nobrand|generic|generico|sin marca/.test(semAc(x.nome)));
  const sel = atual != null && atual !== '' ? String(atual) : f.sem_marca ? '0' : semMarca ? semMarca.id : '';
  return (f.sem_marca ? `<option value="0" ${sel === '0' ? 'selected' : ''}>Sem marca</option>` : '') + (sel === '' ? '<option value="" selected>escolha a marca</option>' : '') +
    f.marcas.map(x => `<option value="${esc(x.id)}" ${sel === String(x.id) ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
}
// ---- preencher a ficha sozinho: primeiro o que você usou da última vez nesta categoria, depois o que dá para tirar do anúncio
function chaveProduto(t) { return semAc(t).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !/^\d+$/.test(w)).slice(0, 2).join(' '); }
function refProduto() { const a = DB.anuncios.find(x => x.id === B2.aid); return ((a && a.nome) || '').trim().split(/\s+/)[0].toUpperCase(); }
// cada produto tem a sua ficha: 1º o que você preencheu para ESTE produto; 2º o que está escrito no título e na descrição;
// 3º só para campos iguais em todos (país, personalizado, quantidade, marca) o padrão. O resto fica para você escolher.
function autoFicha(f, m, mem) {
  const a = m.anuncio || {}, texto = semAc([a.titulo, a.descricao, a.nome, m.variacoes.map(v => v.cor).join(' ')].join(' ')), marcados = new Set(), escolher = new Set();
  const ref = refProduto(), fp = mem.ficha_produto || {}, fc = mem.ficha || {};
  const tipoTxt = semAc((B2.caminho || '') + ' ' + texto), tipo = /chinel|havaian|slide/.test(tipoTxt) ? 'chinelo' : /sandal|rasteir|tamanc|mule|papete/.test(tipoTxt) ? 'sandalia' : /bota|coturno/.test(tipoTxt) ? 'bota' : 'tenis';
  const caixa = { chinelo: [300, 28, 18, 6], sandalia: [400, 30, 20, 8], tenis: [800, 33, 22, 12], bota: [1200, 35, 25, 14] }[tipo];
  const env = mem.envio_produto || {};
  const val = { peso_g: env.peso_g || '', comprimento_cm: env.comprimento_cm || caixa[1], largura_cm: env.largura_cm || caixa[2], altura_cm: env.altura_cm || caixa[3],
    estoque: env.estoque || (mem.envio || {}).estoque || 10, sku: ref.replace(/[^A-Z0-9-]/g, '').slice(0, 12), tipo_anuncio: fc.tipo_anuncio || 'gold_special',
    marca: fp.marca ?? fc.marca, attr: {} };
  const genero = /infantil|menin[oa]|crianca|kids|bebe/.test(texto) ? ['infantil', 'menina', 'menino', 'criancas', 'unissex'] : /masculin|homem|\bmasc\b/.test(texto) ? ['masculino', 'homem', 'homens'] : /unissex/.test(texto) ? ['unissex'] : ['feminino', 'mulher', 'mulheres'];
  const valido = (o, v) => v != null && v !== '' && (!o.opcoes.length || o.opcoes.some(x => String(x.id) === String(v)));
  const geral = nome => /pais|origem|personaliz|quantidade|garantia|condicao/.test(nome);
  const porTexto = (o, nome, ops) => {
    const pega = re => { const x = ops.find(y => re.test(y.n)); return x ? x.id : null; };
    if (/genero|sexo|publico/.test(nome)) { const g = ops.find(x => genero.some(gg => x.n === gg || x.n.startsWith(gg))); return g ? g.id : null; }
    if (/salto/.test(nome)) return /salto alto|\bsalto\b.*\b(7|8|9|10)\s?cm/.test(texto) ? pega(/^alto/) : /plataforma|anabela|chunky|salto medio/.test(texto) ? pega(/^medio/) : /rasteir|sem salto|chinelo|slide/.test(texto) ? pega(/sem salto/) : /salto baixo/.test(texto) ? pega(/^baixo/) : null;
    if (/cinto|fecho|fechamento/.test(nome)) return /sem cadarc|slip.?on|calce facil|elastic/.test(texto) ? pega(/sem cadarc/) : /cadarc|amarr/.test(texto) ? pega(/laco|cordao|cadarc/) : /velcro/.test(texto) ? pega(/gancho|velcro/) : /ziper/.test(texto) ? pega(/ziper/) : /fivela/.test(texto) ? pega(/fivela/) : null;
    if (ops.length) { const x = ops.filter(y => y.n.length > 3 && !/^(sim|nao|outros?)$/.test(y.n) && new RegExp('\\b' + y.n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(texto)).sort((p, q) => q.n.length - p.n.length)[0]; return x ? x.id : null; }
    if (/modelo|referencia|\bref\b/.test(nome)) return ref || null;
    if (/material|composic/.test(nome)) { const t = (texto.match(/\b(eva|borracha|sintetico|couro|tecido|pvc|camurca|nobuck|lona|malha|knit)\b/) || [])[1]; return t ? t.charAt(0).toUpperCase() + t.slice(1) : null; }
    return null;
  };
  const padrao = (o, nome, ops) => {
    const pega = re => { const x = ops.find(y => re.test(y.n)); return x ? x.id : null; };
    if (/pais|origem/.test(nome)) return ops.length ? pega(/^brasil/) : 'Brasil';
    if (/personaliz/.test(nome)) return ops.length ? pega(/^nao$/) : null;
    if (/quantidade/.test(nome)) return ops.length ? pega(/^1\b/) : '1';
    return null;
  };
  for (const o of [...f.obrigatorios, ...(f.opcionais || [])]) {
    const nome = semAc(o.nome), ops = o.opcoes.map(x => ({ id: x.id, n: semAc(x.nome) }));
    let v = (fp.attr || {})[o.id];
    if (!valido(o, v)) v = porTexto(o, nome, ops);
    if (!valido(o, v) && geral(nome)) v = valido(o, (fc.attr || {})[o.id]) ? fc.attr[o.id] : padrao(o, nome, ops);
    if (valido(o, v)) { val.attr[o.id] = v; marcados.add(o.id); } else escolher.add(o.id);
  }
  const deste = Object.keys(fp.attr || {}).length;
  const origem = (deste ? `Usei o que você preencheu para o ${ref} da última vez.` : `Primeira vez do ${ref || 'produto'} nesta categoria: preenchi o que está no título e na descrição, e país/personalizado/quantidade pelo padrão. O que é deste produto e não está escrito fica para você escolher.`) +
    (env.peso_g ? ` Peso e caixa: os que você usou no ${ref}.` : ` O peso é com você. Caixa: padrão de ${{ chinelo: 'chinelo', sandalia: 'sandália', tenis: 'tênis', bota: 'bota' }[tipo]} (mude se a deste produto for outra).`) + ` Depois de validar, todo anúncio do ${ref || 'produto'} vem assim.`;
  return { val, marcados, escolher, origem };
}
async function b2Categorias(busca) {
  const a = DB.anuncios.find(x => x.id === B2.aid), det = await b2get('/api/anuncios/' + B2.aid).catch(() => null);
  B2.titulo = det?.anuncio?.titulo || a.titulo || '';
  if (!B2.titulo.trim()) return b2Erro(new Error('Preencha o título do anúncio no site antes de criar.'), 'lojas');
  b2Carregando('Procurando a categoria certa…');
  try { const [r, mem] = await Promise.all([b2post('/api/b2x/categorias', { loja: B2.loja, titulo: B2.titulo, busca: busca || '' }),
      b2get(`/api/b2x/memoria?canal=${B2.canal}&chave=${encodeURIComponent(chaveProduto(B2.titulo))}`).catch(() => ({}))]);
    const lembrada = mem.categoria, cats = lembrada ? [{ ...lembrada, motivo: 'usada da última vez para este tipo de produto', lembrada: 1 }, ...r.categorias.filter(c => String(c.id) !== String(lembrada.id))] : r.categorias;
    b2Tela(`<h2>Categoria <small>${esc(B2.lojaNome)}</small></h2><p class="pequeno">Sugestões para "${esc(B2.titulo)}". Se nenhuma servir, busque com outras palavras.</p>
      <div class="b2-anuncios">${cats.map((c, i) => `<button class="b2-anuncio ${i === 0 ? 'sugerida' : ''}" data-b2-cat="${esc(c.id)}" data-b2-cam="${esc(c.caminho)}"><span><b>${i === 0 ? '★ ' : ''}${esc(c.caminho)}</b><small>${esc(c.id)}${c.motivo ? ' · ' + esc(c.motivo) : ''}</small></span></button>`).join('') || '<p class="dica">Nenhuma sugestão.</p>'}</div>
      <form id="b2-busca-cat" class="b2-linha"><input name="busca" value="${esc(busca || '')}" placeholder="Ex.: chinelo feminino"><button class="b claro">Buscar</button></form>
      <div class="acoes"><button class="b claro" data-b2="lojas">Voltar</button></div>`);
  } catch (err) { b2Erro(err, 'lojas'); }
}
// TikTok: marca (opcional), depósito de onde sai e a tabela de medidas (a categoria de calçado exige)
function tkCampos(f, val, m, temTabela) {
  const ref = refProduto(), med = (typeof MEDIDAS !== 'undefined' && MEDIDAS[ref]) || [], tams = m.tamanhos || [];
  const temMed = tams.length && tams.every(t => med.some(([n]) => String(n).trim() === String(t).trim() || String(t).split('/').pop().trim() === String(n).trim()));
  const modo = val.tabela_modo || (temTabela ? 'imagem' : temMed ? 'medidas' : f.tabela_modelos.length ? 'modelo' : 'imagem');
  const op = (v, t, ok = true) => `<option value="${v}" ${modo === v ? 'selected' : ''} ${ok ? '' : 'disabled'}>${t}</option>`;
  const marca = f.marcas.length ? `<label>Marca <small class="pequeno">opcional</small><select name="marca"><option value="">Sem marca</option>${f.marcas.map(x => `<option value="${esc(x.id)}" ${String(val.marca || '') === String(x.id) ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>` : '';
  const dep = f.depositos.length > 1 ? `<label>Sai do depósito<select name="deposito">${f.depositos.map(x => `<option value="${esc(x.id)}" ${(val.deposito ? val.deposito === x.id : x.padrao) ? 'selected' : ''}>${esc(x.nome)}${x.padrao ? ' (padrão)' : ''}</option>`).join('')}</select></label>` : '';
  return `<h3>TikTok</h3><div class="b2-grade">${marca}${dep}
    <label class="${f.tabela_exige ? 'pedir' : ''}">Tabela de medidas${f.tabela_exige ? ' <em class="auto-tag escolher">esta categoria exige</em>' : ''}<select name="tabela_modo">
      ${op('imagem', 'A imagem da tabela do anúncio' + (temTabela ? '' : ' (não tem)'), temTabela)}
      ${op('medidas', `As medidas de ${esc(ref)} da aba Medidas` + (temMed ? '' : ' (faltam tamanhos)'), temMed)}
      ${op('modelo', 'Um modelo de tabela da loja' + (f.tabela_modelos.length ? '' : ' (a loja não tem)'), f.tabela_modelos.length)}
      ${f.tabela_exige ? '' : op('', 'Não mandar')}</select></label>
    ${f.tabela_modelos.length ? `<label>Modelo da loja<select name="tabela_modelo">${f.tabela_modelos.map(x => `<option value="${esc(x.id)}" ${val.tabela_modelo === x.id ? 'selected' : ''}>${esc(x.nome || x.id)}</option>`).join('')}</select></label>` : ''}</div>
    ${temMed ? `<p class="pequeno">Medidas de ${esc(ref)}: ${med.map(([n, c]) => `${esc(n)} = ${esc(c)} cm`).join(', ')}. Com "medidas", o B2X desenha a tabela que o TikTok lê.</p>` : `<p class="pequeno">Para usar as medidas, cadastre os tamanhos de ${esc(ref)} em ${elo('/medidas', 'Medidas')}.</p>`}`;
}
async function b2Ficha(cat, caminho) {
  B2.categoria = cat; B2.caminho = caminho; b2Carregando('Lendo o que essa categoria pede…');
  try { const f = await b2get(`/api/b2x/ficha?loja=${encodeURIComponent(B2.loja)}&categoria=${encodeURIComponent(cat)}`); B2.ficha = f;
    const [m, mem] = await Promise.all([b2get('/api/anuncios/' + B2.aid), b2get(`/api/b2x/memoria?canal=${B2.canal}&categoria=${encodeURIComponent(cat)}&produto=${encodeURIComponent(refProduto())}`).catch(() => ({}))]);
    const temTabela = [...m.galeria, ...m.todas].some(i => i.tipo === 'tabela');
    const auto = B2.form ? null : autoFicha(f, m, mem), val = B2.form || auto.val, marcados = auto ? auto.marcados : new Set();
    const escolher = auto ? auto.escolher : new Set();
    const tag = id => marcados.has(id) ? ' <em class="auto-tag">preenchido sozinho</em>' : escolher.has(id) ? ' <em class="auto-tag escolher">escolha deste produto</em>' : '';
    const campo = o => o.opcoes.length ? `<label class="${marcados.has(o.id) ? 'auto' : ''}">${esc(o.nome)}${tag(o.id)}<select data-b2-attr="${esc(o.id)}"><option value="">escolha</option>${o.opcoes.map(x => `<option value="${esc(x.id)}" ${String((val.attr || {})[o.id]) === String(x.id) ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`
      : `<label class="${marcados.has(o.id) ? 'auto' : ''}">${esc(o.nome)}${tag(o.id)}<input data-b2-attr="${esc(o.id)}" data-texto="1" value="${esc((val.attr || {})[o.id] || '')}"></label>`;
    const faltam = f.obrigatorios.filter(o => !(val.attr || {})[o.id]).length, faltamOpc = (f.opcionais || []).filter(o => !(val.attr || {})[o.id]).length;
    b2Tela(`<h2>Ficha do anúncio <small>${esc(caminho)}</small></h2>
      <p class="pequeno">${esc(B2.lojaNome)} · ${m.variacoes.length} cor(es) × ${m.tamanhos.length} tamanho(s) = ${m.variacoes.length * m.tamanhos.length} variações · preço R$ ${esc(m.anuncio.preco)}</p>
      ${auto ? `<div class="nota ${faltam ? 'ruim' : ''}"><b>${faltam ? `Preenchi o que deu. Falta${faltam > 1 ? 'm' : ''} ${faltam} campo(s) obrigatório(s) para você escolher.` : faltamOpc ? `Os obrigatórios estão prontos. ${faltamOpc} detalhe(s) deste produto ficaram para você escolher (deixam o anúncio completo).` : 'Preenchi tudo sozinho. Confira e valide.'}</b><span>${auto.origem}</span></div>` : ''}
      <form id="b2-ficha" class="b2-ficha">
        ${f.obrigatorios.length ? `<h3>A categoria pede</h3><div class="b2-grade">${f.obrigatorios.map(campo).join('')}</div>` : ''}
        ${(f.opcionais || []).length ? `<h3>Mais detalhes <small class="pequeno">não são obrigatórios, mas deixam o anúncio completo (a loja mostra "Complete: x de y")</small></h3><div class="b2-grade">${f.opcionais.map(campo).join('')}</div>` : ''}
        ${B2.canal === 'shopee' ? `<h3>Marca</h3><div class="b2-grade"><label>Marca<select name="marca">${opcoesMarca(f, val.marca)}</select></label></div>` : ''}
        ${B2.canal === 'tiktokshop' ? tkCampos(f, val, m, temTabela) : ''}
        ${B2.canal === 'mercadolivre' && f.tipos_anuncio.length ? `<h3>Tipo de anúncio</h3><div class="b2-grade"><label>Tipo<select name="tipo_anuncio">${f.tipos_anuncio.map(x => `<option value="${esc(x.id)}" ${val.tipo_anuncio === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>` : ''}
        <h3>Embalagem e estoque</h3><div class="b2-grade">
          <label class="${val.peso_g ? "" : "pedir"}">Peso (g)${val.peso_g ? "" : " <em class=\"auto-tag escolher\">você preenche</em>"}<input name="peso_g" inputmode="decimal" value="${esc(val.peso_g)}" placeholder="peso com a caixa, ex.: 650" required></label><label>Comprimento (cm)<input name="comprimento_cm" inputmode="decimal" value="${esc(val.comprimento_cm)}"></label>
          <label>Largura (cm)<input name="largura_cm" inputmode="decimal" value="${esc(val.largura_cm)}"></label><label>Altura (cm)<input name="altura_cm" inputmode="decimal" value="${esc(val.altura_cm)}"></label>
          <label>Estoque de cada variação<input name="estoque" inputmode="numeric" value="${esc(val.estoque)}"></label><label>Começo do SKU (opcional)<input name="sku" value="${esc(val.sku)}" placeholder="Ex.: TA01"></label></div>
        ${B2.canal === 'shopee' ? `<label class="linha"><input type="checkbox" name="tabela" ${temTabela ? 'checked' : 'disabled'}> Mandar a tabela de medidas do anúncio ${temTabela ? '' : '(este anúncio não tem tabela aprovada)'}${f.tabela_exige ? ' · esta categoria exige' : ''}</label>` : (f.tabela_exige && B2.canal === 'mercadolivre' ? '<p class="pequeno">Esta categoria do Mercado Livre exige tabela de medidas: se a validação reclamar, ela precisa ser criada no B2X.</p>' : '')}
        ${f.dica ? `<p class="pequeno">${esc(f.dica)}</p>` : ''}
        <div class="acoes"><button class="b">Validar (nada é publicado)</button><button type="button" class="b claro" data-b2="categorias">Voltar</button></div></form>`);
  } catch (err) { b2Erro(err, 'categorias'); }
}
function b2LerFicha(f) {
  const attr = {}, atributos = [];
  f.querySelectorAll('[data-b2-attr]').forEach(x => { if (!x.value.trim()) return; attr[x.dataset.b2Attr] = x.value.trim(); atributos.push(x.dataset.texto ? { id: x.dataset.b2Attr, texto: x.value.trim() } : { id: x.dataset.b2Attr, opcao: x.value }); });
  const v = k => f.elements[k]?.value ?? '';
  const marcaSel = f.elements.marca, marca = marcaSel ? { id: marcaSel.value, nome: marcaSel.selectedOptions[0]?.textContent || '' } : null;
  const tkx = B2.canal === 'tiktokshop' ? { tabela_modo: v('tabela_modo'), tabela_modelo: v('tabela_modelo'), deposito: v('deposito') } : {};
  B2.form = { ...tkx, attr, peso_g: v('peso_g'), comprimento_cm: v('comprimento_cm'), largura_cm: v('largura_cm'), altura_cm: v('altura_cm'), estoque: v('estoque'), sku: v('sku'), tipo_anuncio: v('tipo_anuncio') || 'gold_special', marca: marca?.id, tabela: !!f.elements.tabela?.checked };
  return { aid: B2.aid, loja: B2.loja, canal: B2.canal, categoria: B2.categoria, atributos, marca, peso_g: B2.form.peso_g, comprimento_cm: B2.form.comprimento_cm, largura_cm: B2.form.largura_cm, altura_cm: B2.form.altura_cm, estoque: B2.form.estoque, sku: B2.form.sku, tipo_anuncio: B2.form.tipo_anuncio, tabela: B2.form.tabela, ...tkx };
}
async function b2Validar(corpo) {
  B2.corpo = corpo; b2Carregando('Subindo as fotos e validando com o marketplace. Pode levar um minuto…');
  try { const r = await b2post('/api/b2x/criar', corpo); B2.pedido = r.pedido_id;
    if (r.validado && B2.form) b2post('/api/b2x/memoria', { canal: B2.canal, categoria: B2.categoria, caminho: B2.caminho, chave: chaveProduto(B2.titulo), produto: refProduto(), ...B2.form }).catch(() => {});
    b2Tela(`<h2>${r.validado ? 'Validado: pode criar' : 'O marketplace pediu correções'} <small>nada foi publicado ainda</small></h2>
      <p class="pequeno">${esc(B2.lojaNome)} · ${esc(B2.caminho)} · ${r.variacoes} variações · ${r.fotos} foto(s) enviadas</p>
      ${r.problemas.length ? `<div class="nota ruim"><b>Corrigir</b>${r.problemas.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}${b2Lista('Avisos', r.avisos)}
      <p class="pequeno">${B2.canal === 'shopee' ? 'Na Shopee o anúncio nasce OCULTO' : B2.canal === 'tiktokshop' ? 'No TikTok o anúncio passa pela análise do TikTok antes de vender' : 'No Mercado Livre o anúncio nasce PAUSADO'}: revise lá e ative quando estiver tudo certo.</p>
      ${r.validado && B2.lote.size > 1 ? `<p class="pequeno">Validei o <b>${esc(DB.anuncios.find(x => x.id === B2.aid).nome)}</b>. Os outros ${B2.lote.size - 1} usam a mesma categoria e ficha; cada um é validado na hora de criar, com o título e as fotos dele.</p>` : ''}
      <div class="acoes">${r.validado ? `<button class="b verde" data-b2="publicar">${B2.lote.size > 1 ? `Criar os ${B2.lote.size} anúncios` : 'Criar o anúncio'}</button>` : ''}<button class="b claro" data-b2="ficha">Voltar e corrigir</button></div>`);
  } catch (err) { b2Erro(err, 'ficha'); }
}
async function b2PublicarLote() {
  const ids = [B2.aid, ...[...B2.lote].filter(x => x !== B2.aid)], res = [];
  for (let i = 0; i < ids.length; i++) {
    const aid = ids[i], nome = DB.anuncios.find(x => x.id === aid)?.nome || '#' + aid;
    b2Carregando(`Criando ${i + 1} de ${ids.length}: ${nome}… (sobe as fotos e cria; não feche a janela)`);
    try {
      let pedido = B2.pedido;
      const suf = aid === B2.aid ? '' : '-' + ((nome.match(/(\d+)\s*$/) || [])[1] || String(i + 1));
      const corpo = { ...B2.corpo, aid, sku: B2.corpo.sku ? (B2.corpo.sku + suf).slice(0, 30) : '' };
      if (aid !== B2.aid) { const v = await b2post('/api/b2x/criar', corpo); if (!v.validado) { res.push({ aid, nome, ok: false, msg: (v.problemas || []).slice(0, 2).join('; ') || 'não passou na validação' }); continue; } pedido = v.pedido_id; }
      const r = await b2post('/api/b2x/criar', { ...corpo, confirmar: true, pedido_id: pedido });
      res.push({ aid, nome, ok: r.criado, fila: r.na_fila, ids: r.anuncio_ids || [], msg: r.criado ? '' : r.na_fila ? 'na fila do marketplace (o site acompanha sozinho)' : (r.problemas || []).slice(0, 2).join('; '), promo: r.promocao_shopee });
    } catch (err) { res.push({ aid, nome, ok: false, msg: err.message }); }
  }
  const okN = res.filter(r => r.ok).length;
  b2Tela(`<h2>${okN} de ${res.length} anúncio(s) criado(s) <small>${esc(B2.lojaNome)}</small></h2>
    <div class="lt-res">${res.map(r => `<div class="nota ${r.ok || r.fila ? '' : 'ruim'}"><b>${esc(r.nome)}: ${r.ok ? 'criado ' + r.ids.map(esc).join(', ') : r.fila ? 'na fila' : 'não criado'}</b>${r.msg ? `<span>${esc(r.msg)}</span>` : ''}
      ${r.ok && ['shopee', 'tiktokshop'].includes(B2.canal) && r.ids.length ? `<span><button class="b claro mini" data-promo-shp="${esc(r.ids[0])}" data-loja="${esc(B2.loja)}" data-preco="${esc(r.promo || '')}">Colocar numa promoção</button></span>` : ''}</div>`).join('')}</div>
    <p class="pequeno">${B2.canal === 'shopee' ? 'Na Shopee eles nascem OCULTOS' : B2.canal === 'tiktokshop' ? 'No TikTok passam pela análise do TikTok' : 'No Mercado Livre nascem PAUSADOS'}: revise e ative no marketplace. Tudo fica em "Anúncios criados".</p>
    <div class="acoes"><button class="b" data-fechar>Fechar</button></div>`);
  window.AO_DESENHAR?.(B2.aid);
}
async function b2Publicar() {
  if (B2.lote && B2.lote.size > 1) return b2PublicarLote();
  b2Carregando('Criando o anúncio no marketplace. Não feche esta janela…');
  try { const r = await b2post('/api/b2x/criar', { ...B2.corpo, confirmar: true, pedido_id: B2.pedido });
    B2.promoShp = r.promocao_shopee || '';
    if (r.na_fila) return b2Fila(r.pedido_id);
    // Shopee com preço promocional: já abre a escolha da promoção (você escolhe, simula e confirma)
    if (r.criado && ['shopee', 'tiktokshop'].includes(B2.canal) && r.promocao_shopee && r.anuncio_ids?.length) return psAbrir(B2.loja, r.anuncio_ids[0], r.promocao_shopee, B2.aid);
    b2Tela(r.criado ? `<h2>Anúncio criado</h2><div class="nota"><b>${esc(B2CANAL[B2.canal])}: ${r.anuncio_ids.map(esc).join(', ')}</b><span>Situação: ${esc(({ UNLIST: 'oculto', unlist: 'oculto', paused: 'pausado', PAUSED: 'pausado', active: 'ativo', NORMAL: 'ativo' })[r.status] || r.status || (B2.canal === 'shopee' ? 'oculto' : 'pausado'))}. Revise no marketplace e ative.</span>${r.divergencias.map(x => `<span>Ficou diferente: ${esc(x)}</span>`).join('')}</div>${r.promocao ? `<div class="nota ${r.promocao.ok ? '' : 'ruim'}"><span>${esc(r.promocao.msg)}</span></div>` : ''}${b2Lista('Avisos', r.avisos)}<div class="acoes">${B2.canal === 'shopee' && r.anuncio_ids.length ? `<button class="b verde" data-promo-shp="${esc(r.anuncio_ids[0])}" data-loja="${esc(B2.loja)}" data-preco="${esc(r.promocao_shopee || '')}">Colocar numa promoção</button>` : ''}<button class="b ${B2.canal === 'shopee' ? 'claro' : ''}" data-fechar>Fechar</button></div>`
      : `<h2>Não foi criado</h2>${r.incerto ? '<div class="nota ruim"><span>A resposta ficou incerta. Não crie de novo: confira a loja no marketplace antes. Repetir por aqui usa o mesmo pedido e não duplica.</span></div>' : ''}<div class="nota ruim">${r.problemas.map(p => `<span>${esc(p)}</span>`).join('') || '<span>O marketplace não devolveu o código do anúncio.</span>'}</div><div class="acoes"><button class="b" data-b2="publicar">Tentar de novo (não duplica)</button><button class="b claro" data-b2="ficha">Voltar</button></div>`);
    window.AO_DESENHAR?.(B2.aid);
  } catch (err) { b2Erro(err, 'ficha'); }
}

document.addEventListener('click', e => {
  const ini = e.target.closest('#enviar-sistema'); if (ini) return b2Inicio(+ini.dataset.id);
  const an = e.target.closest('[data-b2-anuncio]'); if (an) return b2Mapear(an.dataset.b2Anuncio);
  const cat = e.target.closest('[data-b2-cat]'); if (cat) { B2.form = null; return b2Ficha(cat.dataset.b2Cat, cat.dataset.b2Cam); }
  const b = e.target.closest('[data-b2]'); if (!b) return;
  const p = b.dataset.b2; b2AvisoLoja();
  if (['trocar', 'criar'].includes(p) && !B2.loja) return window.menork.aviso('Escolha a loja primeiro.');
  ({ lojas: b2Lojas, trocar: () => { SEL_AN.clear(); SEL_AN.add(B2.aid); LT.pares = []; LT.capas = null; LT.capaModo = null; LT.loja = B2.loja; LT.lista = null; LT.busca = ''; return ltJanela(); }, anuncios: () => b2Anuncios(B2.busca || ''), mapear: () => b2Mapear(B2.anuncio), simular: b2Simular, confirmar: b2Confirmar,
     criar: () => b2Categorias(''), categorias: () => b2Categorias(''), ficha: () => b2Ficha(B2.categoria, B2.caminho), publicar: b2Publicar }[p] || (() => {}))();
});
document.addEventListener('change', e => { if (e.target.id === 'b2-loja') b2AvisoLoja(); });
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'b2-busca') { e.preventDefault(); return b2Anuncios(f.busca.value.trim()); }
  if (f.id === 'b2-busca-cat') { e.preventDefault(); return b2Categorias(f.busca.value.trim()); }
  if (f.id === 'b2-ficha') { e.preventDefault(); return b2Validar(b2LerFicha(f)); }
});

// ---- exportar por marketplace
function EXPORTAR(aid) {
  const m = montagem(aid), fotos = [m.capa, ...m.galeria].filter(Boolean), base = m.anuncio.nome.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  if (!fotos.length) return window.menork.aviso('Este anúncio ainda não tem capa nem fotos na ordem.');
  const d = demandaDe(DB.anuncios.find(a => a.id === aid)), mks = d ? d.marketplaces : ['SHP', 'ML'];
  const lista = prefixo => `<ol>${fotos.map((f, n) => `<li>${prefixo}_${String(n + 1).padStart(2, '0')}${n === 0 ? '_capa' : ''}.jpg <small>${esc(f.tipo_nome)}${f.cor ? ', ' + esc(f.cor) : ''}</small></li>`).join('')}</ol>
    ${m.cores.length ? `<p class="pequeno">Variações: ${m.cores.map(c => `${prefixo}_cor_${esc(c.nome_cor.toLowerCase())}.jpg`).join(', ')}</p>` : ''}`;
  const pend = faltas(aid).itens;
  abrirJanela(`<h2>Exportar ${esc(m.anuncio.nome)}</h2>${pend.length ? `<div class="nota ruim"><b>Anúncio incompleto: os bots não conseguem baixar este pacote</b>${pend.map(t => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    <p class="pequeno">${d ? 'Um pacote para cada marketplace marcado na tarefa do ClickUp.' : 'Anúncio sem tarefa: pacotes padrão.'} Cada pacote sai com as fotos na ordem de subida, as variações e o texto do anúncio, e fica registrado na tela do anúncio.</p>
    <div class="pacotes">${mks.map(k => `<div><h3>Pacote ${MKT[k]}</h3>${lista(k.toLowerCase() + '_' + base)}<button class="b ${pend.length ? 'claro' : ''}" data-pacote="${k}" data-an="${aid}" ${pend.length ? 'data-forcar="1"' : ''}>${pend.length ? 'Baixar mesmo assim, incompleto' : 'Baixar pacote ' + MKT[k]}</button></div>`).join('')}</div><button class="b claro" data-fechar>Fechar</button>`);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-pacote]'); if (b) SRV.pacote(+b.dataset.an, b.dataset.pacote, !!b.dataset.forcar); });

let REFS_ESCOLHIDAS = [];
document.addEventListener('click', e => {
  const u = e.target.closest('[data-usar-ref]');
  if (u) { const id = +u.dataset.usarRef, k = REFS_ESCOLHIDAS.indexOf(id);
    if (k >= 0) REFS_ESCOLHIDAS.splice(k, 1); else if (REFS_ESCOLHIDAS.length >= 5) return window.menork.aviso('O gerar.ps1 aceita no máximo 5 referências. Tire uma para colocar outra.'); else REFS_ESCOLHIDAS.push(id);
    const y = window.scrollY; RENDER(); window.scrollTo(0, y); }
  if (e.target.closest('[data-limpar-refs]')) { REFS_ESCOLHIDAS = []; RENDER(); }
});

document.addEventListener('click', e => { if (!e.target.closest('#buscar-clickup')) return;
  window.menork.aviso('Lendo a lista DEMANDAS…', null, null, 60);
  SRV.buscarClickup().then(msg => RENDER().then(() => window.menork.aviso(msg, null, null, 9))).catch(err => window.menork.aviso(err.message, null, null, 12)); });

document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'form-integ') return; e.preventDefault();
  try { await SRV.salvarIntegracao({ nome: f.nome.value, url: f.url.value, chave: f.chave.value, rascunho: true }); await RENDER(); window.menork.aviso('Integração salva.'); } catch (err) { window.menork.aviso(err.message, null, null, 10); }
});
document.addEventListener('click', async e => {
  if (e.target.closest('#testar-integ')) { window.menork.aviso('Salvando e testando a conexão…', null, null, 30); try {
    const f = document.getElementById('form-integ'); if (f) await SRV.salvarIntegracao({ nome: f.nome.value, url: f.url.value, chave: f.chave.value, rascunho: true });
    const r = await SRV.testarIntegracao(); await RENDER(); window.menork.aviso(r.msg, null, null, 12); } catch (err) { window.menork.aviso(err.message, null, null, 12); } }
  const ap = e.target.closest('#apagar-chave'); if (ap) { if (!ap.dataset.ok) { ap.dataset.ok = 1; ap.textContent = 'Confirmar: apagar a chave'; ap.classList.add('vermelho'); return; } await SRV.salvarIntegracao({ ...INTEG(), chave: '', apagar_chave: true }); await RENDER(); window.menork.aviso('Chave apagada.'); }
});

// ---- telas novas
// ---- lojas dos clientes (lidas do sistema do usuario)
const LOJAS = { clientes: null, erro: '', anuncios: {}, carregando: false };
async function carregarLojas(forcar) {
  if (LOJAS.carregando || (LOJAS.clientes && !forcar)) return; LOJAS.carregando = true; LOJAS.erro = '';
  try { LOJAS.clientes = (await SRV.lojas()).clientes; } catch (e) { LOJAS.erro = e.message; LOJAS.clientes = null; }
  LOJAS.carregando = false; if (ROTA.startsWith('/lojas')) RENDER();
}
async function carregarAnuncios(loja, busca, pagina, aoVivo) {
  const ch = loja + '|' + busca; const atual = LOJAS.anuncios[ch];
  if (atual && atual.carregando) return;
  LOJAS.anuncios[ch] = { ...(atual || { lista: [], total: 0 }), carregando: true, erro: '', aoVivo: !!aoVivo };
  try { const r = await SRV.anunciosLoja(loja, busca, pagina, aoVivo);
    LOJAS.anuncios[ch] = { lista: pagina > 1 ? [...(atual?.lista || []), ...r.anuncios] : r.anuncios, total: r.total, pagina, carregando: false, diag: r.diagnostico, lidoEm: r.lido_em };
  } catch (e) { LOJAS.anuncios[ch] = { lista: atual?.lista || [], total: 0, pagina, carregando: false, erro: e.message }; }
  if (ROTA.startsWith('/lojas')) RENDER();
}
document.addEventListener('submit', e => { const f = e.target; if (f.id !== 'busca-loja') return; e.preventDefault(); IR(rota('/lojas', { loja: f.dataset.loja, busca: f.busca.value.trim() })); });
document.addEventListener('click', e => {
  if (e.target.closest('#recarregar-lojas')) {
    const q = Object.fromEntries(new URLSearchParams(ROTA.split('?')[1] || ''));
    if (q.loja && LOJAS.clientes) { const b = q.busca || ''; delete LOJAS.anuncios[q.loja + '|' + b]; carregarAnuncios(q.loja, b, 1, true); RENDER(); window.menork.aviso('Buscando as fotos de novo no marketplace…'); return; }
    LOJAS.anuncios = {}; carregarLojas(true);
  }
  const m = e.target.closest('[data-mais-loja]'); if (m) { const [, busca = ''] = [0, ...(m.dataset.busca ? [m.dataset.busca] : [])]; carregarAnuncios(m.dataset.maisLoja, m.dataset.busca || '', (+m.dataset.pagina || 1) + 1); }
});

Object.assign(TELAS, {
  lojas(q) {
    const i = INTEG(), nome = esc(i.nome || 'sistema');
    const topo = (titulo, sub, extra = '') => `<div class="cabeca"><h1>${titulo}${sub ? ` <small>${sub}</small>` : ''}</h1><div class="acoes">${extra}<button class="b claro" id="recarregar-lojas">Atualizar</button></div></div>`;
    if (!i.url || !i.tem_chave) return `<div class="cabeca"><h1>Lojas dos clientes</h1></div><div class="vazio"><h2>Ligue o ${nome} primeiro</h2><p>As lojas e os anúncios vêm do ${nome}. Configure o endereço e a chave em ${elo('/integracoes', 'Integrações')}.</p></div>`;
    if (!LOJAS.clientes && !LOJAS.erro) { carregarLojas(); return `<div class="cabeca"><h1>Lojas dos clientes</h1></div><div class="vazio"><h2>Buscando os clientes no ${nome}…</h2></div>`; }
    if (LOJAS.erro) return `${topo('Lojas dos clientes', '')}<div class="vazio"><h2>Não consegui ler as lojas</h2><p>${esc(LOJAS.erro)}</p></div>`;
    const MKNOME = { SHP: 'Shopee', ML: 'Mercado Livre', SHEIN: 'Shein', TIKTOK: 'TikTok', AMAZON: 'Amazon', MAGALU: 'Magalu', TEMU: 'Temu', KWAI: 'Kwai', NETSHOES: 'Netshoes' };
    const ativa = l => (l.status || 'active') === 'active' && !l.aviso;
    const icone = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5"/><path d="M13.5 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1.2.7 2 2 2.3 4.1"/></svg>';
    const cliente = LOJAS.clientes.find(c => c.id === q.cliente);
    const todas = LOJAS.clientes.flatMap(c => c.lojas.map(l => ({ ...l, cliente: c.nome, cliente_id: c.id })));
    const loja = todas.find(l => l.id === q.loja) || null;
    const caminho = (...p) => `<nav class="trilha">${p.join('<span>›</span>')}</nav>`;

    if (loja) {  // anuncios da loja, na largura toda
      const busca = q.busca || '', ch = loja.id + '|' + busca, st = LOJAS.anuncios[ch];
      if (!st) carregarAnuncios(loja.id, busca, 1);
      const itens = st?.lista || [];
      return `${caminho(elo('/lojas', 'Clientes'), elo(rota('/lojas', { cliente: loja.cliente_id }), esc(loja.cliente)), esc(loja.nome))}
        ${topo(esc(loja.nome), `${esc(loja.cliente)} · ${esc(MKNOME[loja.marketplace] || loja.marketplace)}${st && !st.carregando ? ` · ${st.total} anúncio(s)` : ''}`, `<button class="b" data-criar-loja="${esc(loja.id)}">+ Criar anúncio</button>`)}
        ${loja.aviso ? `<p class="dica aviso-txt">${esc(loja.aviso)}</p>` : ''}
        <form class="busca-loja" id="busca-loja" data-loja="${esc(loja.id)}"><input type="search" name="busca" value="${esc(busca)}" placeholder="Buscar pelo título nesta loja"><button class="b claro">Buscar</button></form>
        ${st?.erro ? `<div class="vazio"><h2>Não consegui ler os anúncios</h2><p>${esc(st.erro)}</p></div>` : ''}
        ${st?.diag && !st.carregando ? `<p class="pequeno">${st.diag.com_capa} com foto, ${st.diag.sem_capa} sem foto${st.diag.fotos_ao_vivo ? ' (fotos lidas agora no marketplace)' : ''}.${st.diag.sem_capa ? ' Clique em <b>Atualizar</b> para buscar as fotos de novo.' : ''}</p>` : ''}
        ${st?.carregando ? `<p class="dica">${st.aoVivo ? 'Lendo as fotos agora no marketplace; pode levar até 1 minuto…' : 'Buscando os anúncios…'}</p>` : ''}
        ${itens.length ? `<div class="grade anuncios-loja">${itens.map(a => `<div class="cartao">${a.foto ? `<div class="foto"><img loading="lazy" src="${esc(a.foto)}" alt="" referrerpolicy="no-referrer" data-foto-mk="${esc(a.foto)}"></div>` : '<div class="foto sem-foto">Sem foto</div>'}
          <div class="legenda"><b title="${esc(a.titulo)}">${esc(a.titulo)}</b>${a.preco ? `<span class="preco-loja">R$ ${esc(a.preco)}</span>` : ''}
          <span>${[a.status, a.estoque != null ? a.estoque + ' em estoque' : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="pequeno">${esc(a.id)}</span><span class="botoes-card"><button class="b claro" data-abrir-mk="${esc(a.id)}" data-loja="${esc(loja.id)}">Abrir e modificar</button><button class="b claro" data-duplicar="${esc(a.id)}" data-loja="${esc(loja.id)}" data-titulo="${esc(a.titulo)}">Duplicar</button></span>${a.link ? `<a class="abrir" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir no marketplace</a>` : ''}</div></div>`).join('')}</div>` : (st && !st.carregando && !st.erro ? `<div class="vazio"><h2>Nenhum anúncio${busca ? ' com esse título' : ''}</h2></div>` : '')}
        ${st && !st.carregando && itens.length < st.total ? `<div class="acoes"><button class="b claro" data-mais-loja="${esc(loja.id)}" data-busca="${esc(busca)}" data-pagina="${st.pagina}">Carregar mais (${st.total - itens.length} restantes)</button></div>` : ''}`;
    }
    if (cliente) {  // lojas de um cliente, separadas por CNPJ
      const fmtCnpj = c => { const d = String(c || '').replace(/\D/g, ''); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || ''); };
      const pjs = (cliente.pjs || []).slice().sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
      const doPj = p => cliente.lojas.filter(l => l.pj && (l.pj === p.codigo || l.pj === p.rotulo));
      const usadas = new Set(pjs.flatMap(p => doPj(p).map(l => l.id)));
      const grupos = [...pjs.map(p => ({ p, lojas: doPj(p) })), { p: null, lojas: cliente.lojas.filter(l => !usadas.has(l.id)) }].filter(g => g.p || g.lojas.length);
      const cardLoja = l => `<a href="#" class="card-loja" data-rota="${esc(rota('/lojas', { loja: l.id }))}">
          <span class="mk-sigla mk-${esc(l.marketplace)}">${esc(l.marketplace)}</span>
          <span class="txt"><b><i class="bolinha ${ativa(l) ? '' : 'bolinha-aviso'}"></i>${esc(l.nome)}</b><small>${esc(MKNOME[l.marketplace] || l.marketplace)}</small>${l.aviso ? `<small class="aviso-txt" title="${esc(l.aviso)}">${esc(l.aviso)}</small>` : ''}</span></a>`;
      return `<div class="trilha-voltar"><a href="#" class="b claro" data-rota="/lojas">← Voltar aos clientes</a>${caminho(elo('/lojas', 'Clientes'), esc(cliente.nome))}</div>
        ${topo(esc(cliente.nome), [cliente.gestor ? 'gestor ' + esc(cliente.gestor) : '', pjs.length + ' CNPJ(s)', cliente.lojas.length + ' loja(s)'].filter(Boolean).join(' · '))}
        <div class="bloco pjs"><h2>Selecione o CNPJ e a loja</h2>
        ${grupos.map(g => `<details class="pj" open><summary>
            <span class="ico-pj"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="3" width="12" height="14" rx="1.5"/><path d="M7.5 6.5h1M11.5 6.5h1M7.5 9.5h1M11.5 9.5h1M9 17v-3h2v3"/></svg></span>
            <span class="txt">${g.p ? `<span class="linha1">${g.p.codigo ? `<em class="cod">${esc(g.p.codigo)}</em>` : ''}<code>${esc(fmtCnpj(g.p.cnpj))}</code></span><small>${esc(g.p.rotulo)}</small>` : '<span class="linha1"><b>Sem CNPJ vinculado</b></span><small>lojas que não estão ligadas a nenhum CNPJ no B2X</small>'}</span>
            <em class="qtd">${g.lojas.length} loja${g.lojas.length === 1 ? '' : 's'}</em></summary>
            <div class="grade-lojas">${g.lojas.map(cardLoja).join('') || '<p class="pequeno">Nenhuma loja neste CNPJ.</p>'}</div></details>`).join('') || '<p class="pequeno">Este cliente não tem lojas.</p>'}</div>`;
    }
    // todos os clientes em cards
    const busca = (q.q || '').trim().toLowerCase();
    const lista = LOJAS.clientes.filter(c => !busca || [c.nome, ...(c.pjs || []).map(p => p.rotulo + ' ' + p.cnpj)].join(' ').toLowerCase().includes(busca));
    return `${topo('Lojas dos clientes', `${todas.length} loja(s) de ${LOJAS.clientes.length} cliente(s), lidas do ${nome}`)}
      <form class="busca-loja" id="busca-cliente"><input type="search" name="q" value="${esc(q.q || '')}" placeholder="Buscar cliente, empresa ou CNPJ"><button class="b claro">Buscar</button></form>
      <div class="grade-clientes">${lista.map(c => { const at = c.lojas.filter(ativa).length, mks = {}; c.lojas.forEach(l => mks[l.marketplace] = (mks[l.marketplace] || 0) + 1);
        return `<a href="#" class="card-cliente" data-rota="${esc(rota('/lojas', { cliente: c.id }))}">
          <span class="ico">${icone}</span>
          <span class="txt"><b><i class="bolinha ${at === c.lojas.length ? '' : 'bolinha-aviso'}"></i>${esc(c.nome)}</b><small>${esc(c.pjs?.[0]?.rotulo || c.pjs?.[0]?.cnpj || '')}</small></span>
          <span class="nums"><em>${c.lojas.length} loja(s)</em><em class="${at === c.lojas.length ? 'n-ok' : 'n-aviso'}">${at} ativa(s)</em>${Object.entries(mks).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `<em class="mk-sigla mk-${esc(m)}">${esc(m)} ${n}</em>`).join('')}</span></a>`; }).join('') || '<p class="pequeno">Nenhum cliente com esse nome.</p>'}</div>`;
  },
  integracoes() {
    const i = INTEG();
    return `<div class="cabeca"><h1>Integrações <small>ligue o site ao B2X para mandar fotos e criar anúncios</small></h1></div>
    <div class="bloco"><h2>${esc(i.nome)} <small>${i.url && i.tem_chave ? 'configurado' : 'ainda não configurado'}</small></h2>
      <form class="integ-form" id="form-integ">
        <label>Nome do sistema<input type="text" name="nome" value="${esc(i.nome)}" maxlength="30"></label>
        <label>Endereço da API<input type="url" name="url" value="${esc(i.url)}" placeholder="a Base da API, no começo da documentação (termina em /api-b2x)"></label>
        <label class="largo">Chave da API ${i.tem_chave ? '<span class="ok-mini">· chave salva (por segurança ela não aparece)</span>' : ''}<input type="password" name="chave" autocomplete="off" placeholder="${i.tem_chave ? 'deixe vazio para manter a chave salva' : 'cole aqui a chave gerada no seu sistema'}"></label>
        <input type="hidden" name="rascunho" value="1">
        <div class="acoes largo"><button class="b">Salvar</button><button type="button" class="b claro" id="testar-integ">Testar conexão</button>${i.tem_chave ? '<button type="button" class="b claro" id="apagar-chave">Apagar a chave</button>' : ''}</div>
      </form></div>
    <div class="bloco"><h2>Como funciona</h2><ul class="envios-feitos">
      <li>Dentro de cada anúncio aparece o botão <b>${esc(i.nome)}: fotos e anúncio</b>. Ele segue o modo do anúncio (Shopee ou Mercado Livre).</li>
      <li><b>Trocar fotos de um anúncio que já existe:</b> você escolhe a loja e o anúncio, liga cada cor do marketplace a uma cor do site, simula e só então confirma.</li>
      <li><b>Criar anúncio novo:</b> escolhe a loja, a categoria e preenche o que ela pede. O site valida antes; na Shopee o anúncio nasce oculto e no Mercado Livre pausado, para você revisar e ativar.</li>
      <li>As fotos sobem para o ${esc(i.nome)} na hora de enviar. O site nunca apaga nada no marketplace.</li>
      <li>A chave fica guardada só no seu PC. Ela não vai para o GitHub nem aparece na tela.</ul></div>
    ${window.GASTOS_CONFIG ? GASTOS_CONFIG() : ''}`;
  },
  demandas() {
    const campo = (d, chave, rotulo, valor) => `<label>${rotulo}<input type="number" min="0" max="40" data-dem="${d.id}" data-meta="${chave}" value="${valor}"></label>`;
    return `<div class="cabeca"><h1>Demandas <small>${DB.demandas.length} tarefa(s) do ClickUp viraram cadastro</small></h1><div class="acoes"><button class="b claro" id="buscar-clickup">Buscar tarefas no ClickUp</button></div></div>
    <p class="dica">O site só lê a lista DEMANDAS, nunca escreve nela. Vira cadastro a tarefa que tem Link Pasta e INFO JOAO preenchidos; as outras (estoque, preços, vídeos) são ignoradas.</p>
    ${DB.demandas.slice().reverse().map(d => { const ads = DB.anuncios.filter(a => a.demanda === d.id);
      return `<div class="bloco demanda"><h2>${esc(d.tarefa)} <small>${esc(d.status)}</small><span class="mkts">${d.marketplaces.map(m => `<i>${MKT[m]}</i>`).join('')}</span></h2>
      <div class="dem-grade"><div><h3>Pedido na tarefa (INFO JOAO)</h3><pre>${esc(d.info)}</pre><h3>Link Pasta</h3><code>${esc(d.pasta)}</code><h3>Código do produto nas imagens</h3><input data-dem-prod="${d.id}" value="${esc(d.produto)}" aria-label="Código do produto" size="14"><p class="pequeno">É por este código que o site liga as imagens à tarefa (ex.: CI9 em ci9ia_CARAMELO_01).</p></div>
      <div><h3>O que o site entendeu <small>corrija se leu errado</small></h3><div class="entendeu">${campo(d, 'ia', 'Fotos IA por cor', d.metas.ia)}${campo(d, 'informativo', 'Informativos por cor', d.metas.informativo)}${campo(d, 'tabela', 'Tabelas por cor', d.metas.tabela)}${d.metas.formatos.map(f => campo(d, 'capa:' + f, 'Capas ' + FORMATO[f].toLowerCase(), d.metas.capas[f])).join('')}</div>
        <p class="pequeno">${d.metas.medidas.length ? `Medidas lidas do texto: ${d.metas.medidas.map(([n, c]) => `${esc(n)} = ${esc(c)} cm`).join(', ')}. ${elo('/medidas', 'Ver em Medidas')}` : 'O texto não traz medidas. Cadastre em ' + elo('/medidas', 'Medidas') + '.'}</p>
        <h3>Anúncios criados</h3><div class="dem-ads">${ads.map(a => { const n = faltas(a.id).itens.length; return `<a href="#" data-rota="/anuncios/${a.id}" class="b claro">${FORMATO[a.formato]} <small class="${n ? 'alerta-mini' : 'ok-mini'}">${n ? n + ' pendência(s)' : 'completo'}</small></a>`; }).join('')}</div></div></div></div>`; }).join('')}`;
  },
  referencias(q) {
    const refs = DB.imgs.filter(i => i.ref && i.status === 'aprovada');
    REFS_ESCOLHIDAS = REFS_ESCOLHIDAS.filter(id => refs.some(i => i.id === id));
    const ABAS = [['capa', 'Capas'], ['informativo', 'Informativos'], ['cena', 'Cenas para foto IA'], ['tabela', 'Tabelas']];
    const daAba = (aba, i) => aba === 'capa' ? i.tipo.startsWith('capa') : i.tipo === aba;
    const qtd = Object.fromEntries(ABAS.map(([k]) => [k, refs.filter(i => daAba(k, i)).length]));
    const aba = q.tipo && qtd[q.tipo] !== undefined ? q.tipo : (ABAS.find(([k]) => qtd[k]) || ABAS[0])[0];
    let l = refs.filter(i => daAba(aba, i)); const comEstilo = COM_ESTILO.includes(aba);
    const estilos = comEstilo ? [...new Set(l.map(i => i.estilo || ''))].sort((a, b) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b)) : [];
    if (comEstilo && q.estilo) l = l.filter(i => (i.estilo || '—') === q.estilo);
    const grupos = {}; l.forEach(i => (grupos[comEstilo ? (i.estilo || 'Sem estilo') : (i.produto || 'Sem produto')] ??= []).push(i));
    const cmd = '-Referencias ' + REFS_ESCOLHIDAS.map(id => '"' + CAMINHO(img(id)) + '"').join(',');
    const ficha = i => { const on = REFS_ESCOLHIDAS.includes(i.id);
      return `<div class="ref ${on ? 'escolhida' : ''}">${cartao(i)}${comEstilo ? `<label class="estilo-ref">Estilo${campoEstilo(i.id, i.estilo)}</label>` : ''}<div class="caminho"><code>${esc(CAMINHO(i))}</code><div class="acoes"><button class="b ${on ? '' : 'claro'}" data-usar-ref="${i.id}">${on ? 'No comando (' + (REFS_ESCOLHIDAS.indexOf(i.id) + 1) + '). Tirar' : 'Usar no comando'}</button><button class="b claro" data-copiar="${esc(CAMINHO(i))}">Copiar caminho</button><button class="b claro tirar-ref" data-tirar-ref="${i.id}" title="Deixa de ser referência dos bots; a imagem continua no Catálogo">Remover referência</button></div></div></div>`; };
    const semEstilo = comEstilo ? l.filter(i => !i.estilo).length : 0;
    return `<div class="cabeca"><h1>Referências aprovadas <small>${refs.length} imagem(ns) que os bots devem copiar</small></h1></div>
    <div class="bloco comando"><h2>Comando para o gerar.ps1 <small>${REFS_ESCOLHIDAS.length} de 5 arquivos escolhidos</small></h2>
      ${REFS_ESCOLHIDAS.length ? `<textarea id="txt-cmd" rows="3" readonly>${esc(cmd)}</textarea><div class="acoes"><button class="b" data-copiar-de="txt-cmd">Copiar comando</button><button class="b claro" data-limpar-refs>Limpar escolha</button></div>` : '<p class="pequeno">Clique em "Usar no comando" nas referências abaixo (até 5). O site monta o trecho <code>-Referencias "caminho1","caminho2"</code> com o caminho de cada arquivo.</p>'}</div>
    <div class="abas-ref">${ABAS.map(([k, nome]) => elo(rota('/referencias', { tipo: k }), `${nome} <small>${qtd[k]}</small>`, k === aba ? 'ativo' : '')).join('')}</div>
    ${comEstilo && estilos.length ? `<div class="filtros">${elo(rota('/referencias', { tipo: aba }), 'Todos os estilos', 'ficha ' + (!q.estilo ? 'ativo' : ''))}${estilos.map(e => elo(rota('/referencias', { tipo: aba, estilo: e || '—' }), esc(e || 'Sem estilo'), 'ficha ' + (q.estilo === (e || '—') ? 'ativo' : ''))).join('')}</div>` : ''}
    ${aba === 'cena' ? '<p class="dica">São as cenas que o gerador usa para criar as fotos IA: ele junta o fundo branco do modelo com uma cena do estilo certo.</p>' : ''}
    ${REF_NOVAS.soltar(aba, ABAS.find(([k]) => k === aba)[1], comEstilo || aba === 'capa' || aba === 'tabela')}
    ${semEstilo ? `<p class="dica aviso-txt">${semEstilo} referência(s) sem estilo. Para dar estilo a várias de uma vez, marque a caixinha no canto de cada imagem, escreva o estilo no campo "Estilo" da barra que aparece embaixo e clique em Aplicar.</p>` : ''}
    ${Object.keys(grupos).sort((a, b) => (a === 'Sem estilo') - (b === 'Sem estilo') || a.localeCompare(b)).map(g => `<h2 class="grupo">${esc(g)} <small>${grupos[g].length}</small></h2><div class="grade larga">${grupos[g].map(ficha).join('')}</div>`).join('')
      || `<div class="vazio"><h2>Nenhuma referência de ${esc(ABAS.find(([k]) => k === aba)[1].toLowerCase())}</h2><p>Abra uma imagem aprovada desse tipo e clique em "Usar como referência dos bots"${comEstilo ? '; depois escolha o estilo dela' : ''}.</p></div>`}`;
  },
  erros(q) {
    let l = DB.imgs.filter(i => i.status === 'reprovada'); const porMotivo = contar(l, i => i.motivo || 'Sem motivo'), max = Math.max(1, ...Object.values(porMotivo));
    const texto = l.map(i => `${i.produto || 'sem produto'} ${i.cor} | ${TIPO_NOME[i.tipo] || 'sem tipo'} | ${i.motivo || 'Sem motivo'} | reprovada por ${i.origem || 'você'}`).join('\n');
    if (q.motivo) l = l.filter(i => (i.motivo || 'Sem motivo') === q.motivo);
    return `<div class="cabeca"><h1>Lista de erros <small>${l.length} reprovada(s)${q.motivo ? ' por ' + esc(q.motivo) : ''}</small></h1></div>
    <div class="dois-blocos"><div class="bloco"><h2>Motivos mais comuns</h2><div class="barras">${Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([m, n]) => `<a href="#" data-rota="${esc(rota('/erros', { motivo: q.motivo === m ? '' : m }))}" class="${q.motivo === m ? 'ativo' : ''}"><span>${esc(m)}</span><i style="width:${n / max * 100}%"></i><b>${n}</b></a>`).join('') || '<p class="pequeno">Nenhuma reprovação ainda.</p>'}</div></div>
    <div class="bloco"><h2>Lista para os bots <small>eles consultam antes de gerar</small></h2><textarea id="txt-erros" rows="6" readonly>${esc(texto)}</textarea><button class="b claro" data-copiar-de="txt-erros">Copiar lista</button></div></div>
    ${l.length ? `<div class="grade">${l.slice().reverse().map(cartao).join('')}</div>` : '<div class="vazio"><h2>Nenhuma reprovada aqui</h2></div>'}`;
  },
  painel() {
    const pont = { ok: 'boa', trabalhando: 'andando', parado: 'ruim' }, rot = { ok: 'Livre', trabalhando: 'Trabalhando', parado: 'Parado' };
    return `<div class="cabeca"><h1>Painel <small>o que falta, o que os bots estão fazendo e como estão as contas</small></h1></div>
      <div class="bloco"><h2>Visual do site <small>teste: dá para voltar quando quiser</small></h2><div class="fundo-escolha tema-escolha">${[['escuro', 'Escuro', 'o de sempre, cinza e branco'], ['azul', 'Azul (teste)', 'preto azulado, letra Inter, cartões que acendem em azul']].map(([k, n, d]) => `<button type="button" data-tema="${k}" class="${(document.documentElement.dataset.tema || 'escuro') === k ? 'ativo' : ''}"><i class="f-${k}"></i><b>${n}</b><small class="pequeno">${d}</small></button>`).join('')}</div></div>
      <div class="bloco"><h2>Fundo da tela <small>fica salvo neste computador${document.documentElement.dataset.tema === 'azul' ? ' · no visual Azul o fundo é o dele' : ''}</small></h2><div class="fundo-escolha">${[['luz', 'Preto com luz', 'limpo, luz prateada passando devagar'], ['naipes', 'Naipes', 'couro escuro com naipes em relevo'], ['fumaca', 'Fumaça do Coringa', 'roxo e verde mexendo devagar'], ['feltro', 'Mesa de pôquer', 'feltro verde com luz de mesa'], ['coringa', 'Losangos', 'grafite com losangos de arlequim'], ['agua', 'Água escura', 'o antigo, animado'], ['liso', 'Liso', 'preto, sem nada']].map(([k, n, d]) => `<button type="button" data-fundo="${k}" class="${(document.documentElement.dataset.fundo || 'luz') === k ? 'ativo' : ''}"><i class="f-${k}"></i><b>${n}</b><small class="pequeno">${d}</small></button>`).join('')}</div></div>
    <div class="bloco"><h2>Demandas por anúncio</h2><div class="demandas">${DB.anuncios.map(a => { const f = faltas(a.id); return `<div><a href="#" data-rota="/anuncios/${a.id}"><b>${esc(a.nome)}</b></a>${f.itens.length ? `<ul>${f.itens.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="completo">Completo</p>'}</div>`; }).join('')}</div></div>
    <div class="dois-blocos"><div class="bloco"><h2>Bots <small>cada bot avisa o que está fazendo</small></h2>${BOTS.length ? `<table class="tabela">${BOTS.map(([n, s, d]) => `<tr><td><span class="ponto ${pont[s] || ''}"></span>${esc(n)}</td><td>${rot[s] || esc(s)}</td><td class="pequeno">${esc(d)}</td></tr>`).join('')}</table>` : '<p class="pequeno">Nenhum bot avisou o status ainda.</p>'}</div>
    <div class="bloco"><h2>Contas do gerador <small>hoje</small></h2>${CONTAS.length ? `<table class="tabela"><tr><th>Conta</th><th>Geradas</th><th>Reprovadas</th><th>Limite</th></tr>${CONTAS.map(([n, g, r, v]) => `<tr><td>${esc(n)}</td><td>${g}</td><td>${r} <span class="pequeno">(${g ? Math.round(r / g * 100) : 0}%)</span></td><td class="${v === 'Disponível' ? '' : 'aviso-txt'}">${esc(v)}</td></tr>`).join('')}</table>` : '<p class="pequeno">Nenhuma conta informada pelos bots ainda.</p>'}</div></div>
    ${typeof PAINEL_EXTRA === 'function' ? PAINEL_EXTRA() : ''}`;
  },
  medidas() {
    const prods = [...new Set([...Object.keys(MEDIDAS), ...DB.imgs.filter(viva).map(i => i.produto).filter(Boolean)])].sort();
    return `<div class="cabeca"><h1>Medidas por produto <small>cadastre uma vez; a tabela é sempre conferida com estes valores</small></h1></div>
    <div class="grade larga medidas">${prods.map(p => `<div class="bloco" data-produto="${esc(p)}"><h2>${esc(p)}</h2><table class="tabela"><tr><th>Numeração</th><th>Comprimento (cm)</th><th></th></tr>
      ${(MEDIDAS[p] || []).map(([n, c], k) => `<tr><td><input data-med="0" data-k="${k}" value="${esc(n)}" size="4" aria-label="Numeração"></td><td><input data-med="1" data-k="${k}" value="${esc(c)}" size="6" aria-label="Centímetros"></td><td><button class="b claro" data-tirar-med="${k}" title="Tirar esta linha">×</button></td></tr>`).join('')}</table>
      <button class="b claro" data-nova-med>Adicionar numeração</button></div>`).join('')}</div>`;
  },
});
document.addEventListener('change', e => { const t = e.target; if (!t.dataset.med) return; const p = t.closest('[data-produto]').dataset.produto; MEDIDAS[p][+t.dataset.k][+t.dataset.med] = t.value.trim(); SRV.medidas(p, MEDIDAS[p]).then(() => window.menork.aviso('Medida salva.')); });
document.addEventListener('click', e => {
  const n = e.target.closest('[data-nova-med]'), t = e.target.closest('[data-tirar-med]'); if (!n && !t) return;
  const p = e.target.closest('[data-produto]').dataset.produto; MEDIDAS[p] ??= [];
  if (n) { const u = MEDIDAS[p][MEDIDAS[p].length - 1]; MEDIDAS[p].push([u ? String(+u[0] + 1 || '') : '', '']); } else MEDIDAS[p].splice(+t.dataset.tirarMed, 1);
  SRV.medidas(p, MEDIDAS[p]).then(RENDER);
});
document.addEventListener('click', e => { if (e.target.closest('#colocar-prontas')) document.getElementById('montar-auto')?.click(); });
document.addEventListener('click', e => { const b = e.target.closest('[data-foco]'); if (!b) return; const c = document.getElementById(b.dataset.foco); if (c) { c.scrollIntoView({ block: 'center', behavior: 'smooth' }); c.focus({ preventScroll: true }); } });

// ---- referencias novas: arrastar, escolher ou colar (Ctrl+V) na pagina Referencias
const REF_NOVAS = {
  itens: [], tipo: '', seq: 0,
  TIPO_NOME: { capa: 'Capa', informativo: 'Informativo', cena: 'Cena', tabela: 'Tabela' },
  aceita: f => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name || ''),
  soltar(aba, nomeAba) {
    const lista = this.tipo === aba ? this.itens : [];
    const campo = (it, k, rot, lista_, ph) => `<label>${rot}<input data-ref-nova="${it.id}" data-campo="${k}" value="${esc(it[k])}" ${lista_ ? `list="${lista_}"` : ''} placeholder="${ph}" ${k === 'estilo' ? '' : 'style="text-transform:uppercase"'}></label>`;
    return `<div class="solta-ref" data-solta-ref="${aba}" tabindex="0" role="button" aria-label="Adicionar referências de ${esc(nomeAba)}">
        <input type="file" id="ref-arquivos" multiple accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" hidden>
        <b>Arraste imagens aqui ou clique para escolher</b><span>JPG, PNG ou WEBP, várias de uma vez. Também dá para colar com Ctrl+V. Entram como ${esc(this.TIPO_NOME[aba].toLowerCase())}.</span></div>
      ${lista.length ? `<div class="bloco ref-previa"><h2>${lista.length} referência(s) nova(s) <small>${esc(nomeAba)} · ainda não salvas</small></h2>
        <div class="ref-todas"><span class="pequeno">Preencher todas:</span>${campo({ id: 'todas', produto: '', cor: '', estilo: '' }, 'produto', 'Produto/REF', 'dl-produtos', 'TA01')}${campo({ id: 'todas', produto: '', cor: '', estilo: '' }, 'cor', 'Cor', 'dl-cores', 'CREME PALHA')}${campo({ id: 'todas', produto: '', cor: '', estilo: '' }, 'estilo', 'Estilo', 'dl-estilos-ref', 'Casual')}</div>
        <div class="ref-novas">${lista.map(it => `<div class="ref-nova" data-item="${it.id}"><div class="foto"><img src="${it.url}" alt=""></div><span class="nome" title="${esc(it.arquivo.name)}">${esc(it.arquivo.name)}</span>
          ${campo(it, 'produto', 'Produto/REF', 'dl-produtos', 'TA01')}${campo(it, 'cor', 'Cor', 'dl-cores', 'CREME PALHA')}${campo(it, 'estilo', 'Estilo', 'dl-estilos-ref', 'Casual')}
          <button type="button" class="b claro" data-tirar-nova="${it.id}">Tirar</button></div>`).join('')}</div>
        <datalist id="dl-estilos-ref">${estilosConhecidos().map(e => `<option value="${esc(e)}">`).join('')}</datalist>
        <div class="acoes"><button class="b" id="salvar-refs">Salvar ${lista.length} como referência</button><button class="b claro" id="cancelar-refs">Cancelar</button></div></div>` : ''}`;
  },
  juntar(arquivos, aba) {
    const bons = [...arquivos].filter(f => this.aceita(f)), ruins = arquivos.length - bons.length;
    if (ruins) window.menork.aviso(`${ruins} arquivo(s) ignorado(s): só JPG, PNG ou WEBP.`);
    if (!bons.length) return;
    if (this.tipo !== aba) this.limpar();
    this.tipo = aba;
    bons.forEach(f => this.itens.push({ id: ++this.seq, arquivo: f, url: URL.createObjectURL(f), produto: '', cor: '', estilo: (ROTA.match(/estilo=([^&]+)/) || [])[1] ? decodeURIComponent(ROTA.match(/estilo=([^&]+)/)[1]).replace(/^—$/, '') : '' }));
    this.redesenhar();
  },
  limpar() { this.itens.forEach(it => URL.revokeObjectURL(it.url)); this.itens = []; this.tipo = ''; },
  redesenhar() { const y = window.scrollY; document.querySelector('main').innerHTML = TELAS.referencias(Object.fromEntries(new URLSearchParams(ROTA.split('?')[1] || ''))); window.scrollTo(0, y); },
  async salvar(botao) {
    if (!this.itens.length) return;
    const f = new FormData(); f.append('tipo', this.tipo);
    this.itens.forEach(it => f.append('arquivos', it.arquivo, it.arquivo.name || 'colada.png'));
    f.append('dados', JSON.stringify(this.itens.map(it => ({ produto: it.produto, cor: it.cor, estilo: it.estilo }))));
    botao.disabled = true; botao.textContent = 'Salvando…';
    try {
      const r = await window.menork.api('/api/referencias/nova', f, true);
      this.limpar(); await RENDER();
      window.menork.aviso(`${r.salvas} referência(s) salva(s)` + (r.repetidas ? `, ${r.repetidas} já existia(m) no catálogo e virou(aram) referência` : '') + (r.erros.length ? `. Não deu: ${r.erros.join('; ')}` : '.'), null, null, 12);
    } catch (err) { botao.disabled = false; botao.textContent = 'Tentar salvar de novo'; window.menork.aviso(err.message, null, null, 12); }
  },
};
document.addEventListener('click', async e => {
  const z = e.target.closest('[data-solta-ref]'); if (z && !e.target.closest('input')) return document.getElementById('ref-arquivos')?.click();
  const t = e.target.closest('[data-tirar-nova]'); if (t) { const k = REF_NOVAS.itens.findIndex(x => x.id === +t.dataset.tirarNova); if (k >= 0) { URL.revokeObjectURL(REF_NOVAS.itens[k].url); REF_NOVAS.itens.splice(k, 1); } return REF_NOVAS.redesenhar(); }
  if (e.target.closest('#cancelar-refs')) { REF_NOVAS.limpar(); return REF_NOVAS.redesenhar(); }
  const s = e.target.closest('#salvar-refs'); if (s) return REF_NOVAS.salvar(s);
  const r = e.target.closest('[data-tirar-ref]'); if (!r) return;
  if (!r.dataset.ok) { r.dataset.ok = 1; r.textContent = 'Confirmar: remover'; r.classList.add('vermelho'); setTimeout(() => { if (r.isConnected) { delete r.dataset.ok; r.textContent = 'Remover referência'; r.classList.remove('vermelho'); } }, 5000); return; }
  try { await window.menork.api('/api/acao', { ids: [+r.dataset.tirarRef], acao: 'ref_nao' }); REFS_ESCOLHIDAS = REFS_ESCOLHIDAS.filter(x => x !== +r.dataset.tirarRef); await RENDER(); window.menork.aviso('Removida das referências. A imagem continua no Catálogo.'); } catch (err) { window.menork.aviso(err.message); }
});
document.addEventListener('keydown', e => { const z = e.target.closest?.('[data-solta-ref]'); if (z && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); document.getElementById('ref-arquivos')?.click(); } });
document.addEventListener('change', e => { if (e.target.id !== 'ref-arquivos') return; const z = e.target.closest('[data-solta-ref]'); REF_NOVAS.juntar(e.target.files, z.dataset.soltaRef); e.target.value = ''; });
document.addEventListener('input', e => {
  const c = e.target.closest('[data-ref-nova]'); if (!c) return; const k = c.dataset.campo, v = c.value;
  if (c.dataset.refNova === 'todas') { REF_NOVAS.itens.forEach(it => { it[k] = v; }); document.querySelectorAll(`.ref-nova [data-campo="${k}"]`).forEach(x => { x.value = v; }); return; }
  const it = REF_NOVAS.itens.find(x => x.id === +c.dataset.refNova); if (it) it[k] = v;
});
['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { const z = e.target.closest?.('[data-solta-ref]'); if (!z) return; e.preventDefault(); z.classList.add('em-cima'); }));
document.addEventListener('dragleave', e => { const z = e.target.closest?.('[data-solta-ref]'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('em-cima'); });
document.addEventListener('drop', e => { const z = e.target.closest?.('[data-solta-ref]'); if (!z) return; e.preventDefault(); z.classList.remove('em-cima'); REF_NOVAS.juntar(e.dataTransfer.files, z.dataset.soltaRef); });
document.addEventListener('paste', e => {
  const z = document.querySelector('[data-solta-ref]'); if (!z) return;
  if (e.target.closest?.('input, textarea')) return; // colar texto num campo continua normal
  const arquivos = [...(e.clipboardData?.items || [])].filter(i => i.kind === 'file').map(i => i.getAsFile()).filter(Boolean)
    .map((f, k) => f.name && f.name !== 'image.png' ? f : new File([f], `colada_${Date.now()}_${k + 1}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }));
  if (!arquivos.length) return; e.preventDefault(); REF_NOVAS.juntar(arquivos, z.dataset.soltaRef);
});

// ---- Lojas dos clientes: abrir um anuncio e modificar (titulo, descricao, preco, estoque, fotos)
const MK = { atual: null };
const lojaPorId = id => (LOJAS.clientes || []).flatMap(c => c.lojas.map(l => ({ ...l, cliente: c.nome }))).find(l => l.id === id);
async function mkAbrir(lojaId, anuncioId) {
  const loja = lojaPorId(lojaId); MK.loja = loja; b2Carregando('Lendo o anúncio no ' + INTEG().nome + '…');
  try { MK.atual = await b2get(`/api/b2x/anuncio?loja=${encodeURIComponent(lojaId)}&anuncio=${encodeURIComponent(anuncioId)}&canal=${encodeURIComponent(loja?.canal || '')}`); mkMostrar(); }
  catch (err) { b2Erro(err); }
}
function mkMostrar() {
  const d = MK.atual, l = MK.loja, podeFotos = ['shopee', 'mercadolivre'].includes(l?.canal);
  const fotos = d.fotos.length ? d.fotos : (d.capa ? [d.capa] : []);
  const vs = d.lista_variacoes;
  b2Tela(`<h2>${esc(d.titulo || d.id)} <small>${esc(l?.cliente || '')} · ${esc(l?.nome || '')}</small></h2>
    <p class="pequeno">${esc(d.id)}${d.status ? ' · ' + esc(d.status) : ''}${d.preco != null ? ' · R$ ' + esc(d.preco) : ''}${d.estoque != null ? ' · ' + esc(d.estoque) + ' em estoque' : ''}${d.familia ? ' · um anúncio por cor e tamanho' : ''}</p>
    ${fotos.length ? `<div class="mk-fotos">${fotos.map(u => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" loading="lazy">`).join('')}</div>` : ''}
    ${vs.length ? `<details class="mk-vars"><summary>${vs.length} variação(ões)</summary><table class="tabela"><tr><th>Cor</th><th>Tamanho</th><th>Preço</th><th>Estoque</th><th>SKU</th></tr>${vs.map(v => `<tr><td>${esc(v.cor)}</td><td>${esc(v.tamanho)}</td><td>${v.preco != null ? esc(v.preco) : ''}</td><td>${v.estoque != null ? esc(v.estoque) : ''}</td><td class="pequeno">${esc(v.sku)}</td></tr>`).join('')}</table></details>` : ''}
    <form id="mk-editar" class="b2-ficha"><h3>Modificar <small class="pequeno">só o que você preencher muda</small></h3>
      <div class="b2-grade"><label class="largo2">Título novo<input name="titulo" placeholder="${esc(d.titulo)}" maxlength="255"></label>
        <label>Preço novo<input name="preco" inputmode="decimal" placeholder="Ex.: 49,90"></label><label>Estoque novo${vs.length > 1 ? ' (todas as variações)' : ''}<input name="estoque" inputmode="numeric" placeholder="Ex.: 20"></label></div>
      <label class="campo-b2">Descrição nova<textarea name="descricao" rows="4" placeholder="${d.descricao ? 'Deixe vazio para manter a atual' : ''}">${''}</textarea></label>
      ${['shopee', 'tiktokshop'].includes(l?.canal) ? `<h3>Promoção <small class="pequeno">coloque este anúncio numa promoção que a loja já tem e ajuste o preço</small></h3>
        <div class="b2-linha"><button type="button" class="b claro" data-promo-shp="${esc(d.id)}" data-loja="${esc(l.id)}">Colocar numa promoção</button></div>` : ''}
      ${l?.canal === 'mercadolivre' ? `<h3>Promoção <small class="pequeno">desconto direto do Mercado Livre; o preço do anúncio fica como o cheio, riscado</small></h3>
        <div class="b2-linha"><input id="mk-promo" inputmode="decimal" placeholder="Preço promocional, ex.: 59,90"><button type="button" class="b claro" id="mk-promo-simular">Simular promoção</button></div>` : ''}
      <div class="acoes"><button class="b">Simular a mudança</button>${podeFotos ? '<button type="button" class="b claro" id="mk-fotos">Trocar fotos com um anúncio do site</button>' : ''}${d.url ? `<a class="b claro" href="${esc(d.url)}" target="_blank" rel="noopener">Abrir no marketplace</a>` : ''}<button type="button" class="b claro" data-fechar>Fechar</button></div></form>`);
}
function mkEscolherAnuncio() {
  const modo = MK.loja.canal === 'mercadolivre' ? 'ml' : 'shopee';
  const ads = DB.anuncios.slice().sort((a, b) => (b.modo === modo) - (a.modo === modo) || a.nome.localeCompare(b.nome));
  b2Tela(`<h2>Qual anúncio do site tem as fotos? <small>para ${esc(MK.atual.titulo)}</small></h2>
    <label class="campo-b2">Anúncio do site<select id="mk-aid">${ads.map(a => `<option value="${a.id}">${esc(a.nome)}${a.modo === modo ? '' : ' (vai mudar para o modo ' + (modo === 'ml' ? 'Mercado Livre' : 'Shopee') + ')'}</option>`).join('')}</select></label>
    <p class="pequeno">As fotos saem do modo ${modo === 'ml' ? 'Mercado Livre (fotos de cada cor)' : 'Shopee (9 fotos e a capa de cada cor)'} desse anúncio. Depois você liga as cores e simula antes de trocar.</p>
    <div class="acoes"><button class="b" id="mk-seguir">Seguir</button><button class="b claro" id="mk-voltar">Voltar</button></div>`);
}
async function mkSeguirFotos() {
  const aid = +document.getElementById('mk-aid').value, modo = MK.loja.canal === 'mercadolivre' ? 'ml' : 'shopee', a = DB.anuncios.find(x => x.id === aid);
  if (a && a.modo !== modo) await window.menork.api('/api/anuncios/' + aid, { acao: 'modo', modo });
  Object.assign(B2, { aid, canal: MK.loja.canal, loja: MK.loja.id, lojaNome: MK.loja.cliente + ' · ' + MK.loja.nome, busca: '' });
  b2Mapear(MK.atual.id);
}
async function mkSimular(f) {
  const corpo = { loja: MK.loja.id, anuncio: MK.atual.id, canal: MK.loja.canal, familia: MK.atual.familia, titulo: f.titulo.value, preco: f.preco.value, estoque: f.estoque.value, descricao: f.descricao.value };
  b2Carregando('Simulando a mudança…');
  try { const r = await b2post('/api/b2x/editar/simular', corpo); B2.token = r.token;
    b2Tela(`<h2>Simulação <small>nada mudou ainda</small></h2>
      ${r.envios.map(e => `<div class="nota ${e.ok ? '' : 'ruim'}"><b>${esc(e.rotulo)}: ${e.ok ? 'pronto' : 'recusado'}</b>${e.erro ? `<span>${esc(e.erro)}</span>` : ''}${e.mudancas.length ? `<span>Vai mudar: ${e.mudancas.map(esc).join(', ')}</span>` : ''}${e.avisos.map(a => `<span>${esc(a)}</span>`).join('')}</div>`).join('')}
      <div class="acoes">${r.pode_confirmar ? '<button class="b verde" id="mk-confirmar">Confirmar a mudança</button>' : ''}<button class="b claro" id="mk-voltar">Voltar</button></div>`);
  } catch (err) { b2Erro(err); }
}
async function mkConfirmar() {
  b2Carregando('Mudando no marketplace…');
  try { const r = await b2post('/api/b2x/confirmar', { token: B2.token });
    b2Tela(`<h2>Resultado</h2>${r.envios.map(e => `<div class="nota ${e.ok ? '' : 'ruim'}"><b>${esc(e.rotulo)}: ${e.ok ? 'feito' : 'não feito'}</b>${e.erro ? `<span>${esc(e.erro)}</span>` : ''}${e.ainda_antigos.length ? '<span>O marketplace ainda mostra o valor antigo em parte; pode levar alguns minutos.</span>' : ''}</div>`).join('')}
      <div class="acoes"><button class="b" id="mk-reabrir">Ver o anúncio de novo</button><button class="b claro" data-fechar>Fechar</button></div>`);
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-abrir-mk]'); if (a) return mkAbrir(a.dataset.loja, a.dataset.abrirMk);
  if (e.target.closest('#mk-fotos')) return mkEscolherAnuncio();
  if (e.target.closest('#mk-seguir')) return mkSeguirFotos();
  if (e.target.closest('#mk-voltar')) return mkMostrar();
  if (e.target.closest('#mk-confirmar')) return mkConfirmar();
  if (e.target.closest('#mk-reabrir')) return mkAbrir(MK.loja.id, MK.atual.id);
});
document.addEventListener('submit', e => { if (e.target.id !== 'mk-editar') return; e.preventDefault(); mkSimular(e.target); });

// foto de marketplace que o navegador nao abriu: tenta pelo nosso servidor; se ainda falhar, mostra "Sem foto" so nela
document.addEventListener('error', e => {
  const img = e.target; if (!(img instanceof HTMLImageElement) || !img.dataset.fotoMk && !img.closest('.mk-fotos, .b2-anuncio')) return;
  const orig = img.dataset.fotoMk || img.getAttribute('src');
  if (!img.dataset.viaServidor && /^https:/.test(orig)) { img.dataset.viaServidor = 1; img.src = '/api/b2x/foto?u=' + encodeURIComponent(orig); return; }
  const caixa = img.closest('.foto'); if (caixa) { caixa.classList.add('sem-foto'); caixa.textContent = 'Sem foto'; } else img.remove();
}, true);
document.addEventListener('submit', e => { if (e.target.id !== 'busca-cliente') return; e.preventDefault(); IR(rota('/lojas', { q: e.target.q.value.trim() })); });

// ---- DUPLICAR um anuncio para outra loja (previa -> ajustes -> confirmar)
const DUP = {};
const todasLojas = () => (LOJAS.clientes || []).flatMap(c => c.lojas.map(l => ({ ...l, cliente: c.nome, cliente_id: c.id })));
const MKN = { SHP: 'Shopee', ML: 'Mercado Livre', SHEIN: 'Shein', TIKTOK: 'TikTok', AMAZON: 'Amazon', MAGALU: 'Magalu', TEMU: 'Temu', KWAI: 'Kwai', NETSHOES: 'Netshoes' };
function dupInicio(loja, anuncio, titulo) {
  Object.assign(DUP, { loja, anuncio, titulo, previa: null });
  const origem = todasLojas().find(l => l.id === loja), lojas = todasLojas().filter(l => l.id !== loja)
    .sort((a, b) => (b.cliente_id === origem?.cliente_id) - (a.cliente_id === origem?.cliente_id) || a.cliente.localeCompare(b.cliente) || a.nome.localeCompare(b.nome));
  const grupos = {}; lojas.forEach(l => (grupos[l.cliente] = grupos[l.cliente] || []).push(l));
  b2Tela(`<h2>Duplicar anúncio <small>${esc(titulo)}</small></h2>
    <p class="pequeno">De: ${esc(origem?.cliente || '')} · ${esc(origem?.nome || '')} (${esc(MKN[origem?.marketplace] || '')}) · ${esc(anuncio)}</p>
    <label class="campo-b2">Loja de destino<select id="dup-destino"><option value="${esc(loja)}">A mesma loja (cópia aqui)</option>${Object.entries(grupos).map(([c, ls]) => `<optgroup label="${esc(c)}">${ls.map(l => `<option value="${esc(l.id)}">${esc(l.nome)} · ${esc(MKN[l.marketplace] || l.marketplace)}${(l.status || 'active') !== 'active' || l.aviso ? ' ⚠' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
    <p class="pequeno">Primeiro o ${esc(INTEG().nome)} monta a prévia do que vai ser copiado. Nada é criado antes do seu ok.</p>
    <div class="acoes"><button class="b" id="dup-previa">Ver a prévia</button><button class="b claro" data-fechar>Fechar</button></div>`);
}
async function dupPrevia() {
  DUP.destino = document.getElementById('dup-destino').value; b2Carregando('Montando a prévia da cópia…');
  try { const p = await b2get(`/api/b2x/clonar/previa?loja=${encodeURIComponent(DUP.loja)}&anuncio=${encodeURIComponent(DUP.anuncio)}&destino=${encodeURIComponent(DUP.destino)}`); DUP.previa = p; dupMostrar(); }
  catch (err) { b2Erro(err); }
}
function dupMostrar() {
  const p = DUP.previa, r = p.resumo, dest = todasLojas().find(l => l.id === DUP.destino), ml = dest?.marketplace === 'ML';
  const faixa = r.preco_min == null ? '—' : (r.preco_min === r.preco_max ? `R$ ${r.preco_min}` : `R$ ${r.preco_min} a ${r.preco_max}`);
  b2Tela(`<h2>Prévia da cópia <small>nada foi criado ainda</small></h2>
    <p class="pequeno">${esc(p.origem.loja_nome || '')} → <b>${esc(p.destino.loja_nome || dest?.nome || '')}</b> (${esc(p.destino.canal || '')})</p>
    ${r.fotos.length ? `<div class="mk-fotos">${r.fotos.map(u => `<img src="${esc(u)}" alt="" referrerpolicy="no-referrer" data-foto-mk="${esc(u)}">`).join('')}</div>` : ''}
    <div class="dup-resumo"><span><b>${r.variacoes}</b> variação(ões)</span><span><b>${r.cores.length}</b> cor(es)${r.cores.length ? ': ' + r.cores.map(esc).join(', ') : ''}</span><span>Tamanhos: ${r.tamanhos.map(esc).join(', ') || '—'}</span><span>Preço: ${esc(faixa)}</span><span>Estoque total: ${r.estoque_total}</span></div>
    ${p.pendencias.length ? `<div class="nota ruim"><b>Pendências no destino</b>${p.pendencias.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    ${p.avisos.length ? `<div class="nota"><b>Avisos</b>${p.avisos.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
    <form id="dup-form" class="b2-ficha"><h3>Mudar antes de copiar <small class="pequeno">vazio = igual ao original</small></h3>
      <div class="b2-grade"><label class="largo2">Título<input name="titulo" value="${esc(r.titulo)}" maxlength="255"></label>
      <label>Preço de todas as variações<input name="preco" inputmode="decimal" placeholder="manter"></label><label>Estoque de todas<input name="estoque" inputmode="numeric" placeholder="manter"></label>
      <label>Final do SKU<input name="sku_sufixo" placeholder="ex.: -B"></label>
      ${ml || !r.peso_g ? `<label>Peso (g)<input name="peso_g" inputmode="decimal" value="${esc(r.peso_g || '')}" placeholder="ex.: 600"></label><label>Comprimento (cm)<input name="comprimento_cm" value="${esc(r.medidas[0] || '')}"></label><label>Largura (cm)<input name="largura_cm" value="${esc(r.medidas[1] || '')}"></label><label>Altura (cm)<input name="altura_cm" value="${esc(r.medidas[2] || '')}"></label>` : ''}</div>
      <div class="acoes"><button class="b verde">Confirmar e duplicar</button><button type="button" class="b claro" id="dup-voltar">Voltar</button></div></form>`);
}
async function dupConfirmar(f) {
  const corpo = { loja_origem: DUP.loja, anuncio: DUP.anuncio, loja_destino: DUP.destino, chave: DUP.previa.chave };
  ['titulo', 'preco', 'estoque', 'sku_sufixo', 'peso_g', 'comprimento_cm', 'largura_cm', 'altura_cm'].forEach(k => { if (f.elements[k] && f.elements[k].value.trim()) corpo[k] = f.elements[k].value.trim(); });
  if (corpo.titulo === DUP.previa.resumo.titulo) delete corpo.titulo;
  b2Carregando('Duplicando o anúncio no marketplace. Pode levar alguns minutos; não feche esta janela…');
  try { const r = await b2post('/api/b2x/clonar', corpo);
    b2Tela(r.ok ? `<h2>Anúncio duplicado</h2><div class="nota"><b>Criado: ${r.novos_ids.map(esc).join(', ')}</b>${r.repetido ? '<span>(essa cópia já tinha sido feita; nada foi duplicado de novo)</span>' : ''}${r.divergencias.map(x => `<span>Ficou diferente: ${esc(x)}</span>`).join('')}${r.depois.map(x => `<span>${esc(x)}</span>`).join('')}</div>${b2Lista('Avisos', r.avisos)}
        <div class="acoes"><button class="b" data-ir-loja="${esc(DUP.destino)}">Ver a loja de destino</button><button class="b claro" data-fechar>Fechar</button></div>`
      : `<h2>Não foi duplicado</h2><div class="nota ruim">${r.erros.map(x => `<span>${esc(x)}</span>`).join('') || '<span>O marketplace não devolveu o código do anúncio novo.</span>'}</div>${b2Lista('Avisos', r.avisos)}<div class="acoes"><button class="b claro" id="dup-voltar">Voltar e ajustar</button><button class="b claro" data-fechar>Fechar</button></div>`);
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-duplicar]'); if (d) return dupInicio(d.dataset.loja, d.dataset.duplicar, d.dataset.titulo);
  if (e.target.closest('#dup-previa')) return dupPrevia();
  if (e.target.closest('#dup-voltar')) return DUP.previa ? dupMostrar() : dupInicio(DUP.loja, DUP.anuncio, DUP.titulo);
  const ir = e.target.closest('[data-ir-loja]'); if (ir) { fecharJanela(); const k = Object.keys(LOJAS.anuncios).filter(x => x.startsWith(ir.dataset.irLoja + '|')); k.forEach(x => delete LOJAS.anuncios[x]); return IR(rota('/lojas', { loja: ir.dataset.irLoja })); }
});
document.addEventListener('submit', e => { if (e.target.id !== 'dup-form') return; e.preventDefault(); dupConfirmar(e.target); });

// ---- CRIAR anuncio novo na loja: categoria -> ficha -> fotos -> variacoes -> envio -> revisar -> publicar
const CR = {};
const PASSOS_CR = ['Categoria', 'Ficha', 'Fotos', 'Variações', 'Envio', 'Revisar'];
function crTela(passo, html) {
  CR.passo = passo;
  b2Tela(`<div class="cr"><ol class="passos">${PASSOS_CR.map((p, i) => `<li class="${i === passo ? 'atual' : i < passo ? 'feito' : ''}">${p}</li>`).join('')}</ol>
    <p class="pequeno">${esc(CR.loja.cliente)} · ${esc(CR.loja.nome)} · ${esc(MKN[CR.loja.marketplace] || CR.loja.marketplace)}</p>${html}</div>`);
}
function crInicio(lojaId) {
  const loja = todasLojas().find(l => l.id === lojaId);
  Object.assign(CR, { loja, canal: loja.canal, titulo: '', descricao: '', categoria: '', caminho: '', ficha: null, attr: {}, marca: '', tipo_anuncio: 'gold_special',
    cores: [], fotos: { galeria: [], tabela: [] }, tamanhos: '', grade: {}, sku_pai: '', embalagem: { peso_g: '', comprimento_cm: 30, largura_cm: 20, altura_cm: 12 },
    envio: '', frete_gratis: false, medidas: {}, pedido: '', resultado: null });
  crCategoria();
}
function crCategoria(lista) {
  const ads = DB.anuncios.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  crTela(0, `<h2>Criar anúncio <small>passo 1: título e categoria</small></h2>
    <form id="cr-cat" class="b2-ficha">
      <div class="cr-puxar"><select id="cr-aid"><option value="">Puxar título, descrição, fotos e tamanhos de um anúncio do site (opcional)</option>${ads.map(a => `<option value="${a.id}">${esc(a.nome)}</option>`).join('')}</select><button type="button" class="b claro" id="cr-puxar">Puxar</button></div>
      <label class="campo-b2">Título<input name="titulo" value="${esc(CR.titulo)}" maxlength="255" required placeholder="Ex.: Tênis feminino chunky confortável"></label>
      <label class="campo-b2">Descrição<textarea name="descricao" rows="4" required>${esc(CR.descricao)}</textarea></label>
      <div class="b2-linha"><input name="busca" placeholder="Outras palavras para achar a categoria (opcional)"><button class="b">Buscar categoria</button></div></form>
    ${lista ? `<div class="b2-anuncios">${lista.map(c => `<button class="b2-anuncio ${c.id === CR.categoria ? 'escolhida' : ''}" data-cr-cat="${esc(c.id)}" data-cam="${esc(c.caminho)}"><span><b>${esc(c.caminho)}</b><small>${esc(c.id)}${c.motivo ? ' · ' + esc(c.motivo) : ''}</small></span></button>`).join('') || '<p class="dica">Nenhuma categoria. Tente outras palavras.</p>'}</div>` : ''}
    <div class="acoes"><button class="b claro" data-fechar>Fechar</button></div>`);
}
async function crPuxar() {
  const aid = +document.getElementById('cr-aid').value; if (!aid) return window.menork.aviso('Escolha um anúncio do site.');
  b2Carregando('Subindo as fotos do anúncio do site para o B2X…');
  try { const r = await b2post('/api/b2x/fotos/do-site', { aid, canal: CR.canal });
    Object.assign(CR, { titulo: r.titulo || CR.titulo, descricao: r.descricao || CR.descricao, tamanhos: r.tamanhos.join(', ') || CR.tamanhos, preco: r.preco || CR.preco });
    CR.cores = r.cores.map(c => c.cor); CR.fotos = { galeria: r.galeria.map(u => ({ url: u })), tabela: CR.fotos.tabela };
    r.cores.forEach(c => { CR.fotos['cor:' + c.cor] = c.fotos.map(u => ({ url: u })); });
    window.menork.aviso(`Puxei ${r.galeria.length + r.cores.reduce((n, c) => n + c.fotos.length, 0)} foto(s), ${r.cores.length} cor(es) e ${r.tamanhos.length} tamanho(s).`);
    crCategoria();
  } catch (err) { b2Erro(err); }
}
async function crBuscarCat(f) {
  CR.titulo = f.titulo.value.trim(); CR.descricao = f.descricao.value.trim();
  if (!CR.titulo) return window.menork.aviso('Preencha o título.');
  b2Carregando('Procurando a categoria…');
  try { const r = await b2post('/api/b2x/categorias', { loja: CR.loja.id, titulo: CR.titulo, busca: f.busca.value.trim() }); crCategoria(r.categorias); } catch (err) { b2Erro(err); }
}
async function crFicha(cat, cam) {
  if (cat) { CR.categoria = cat; CR.caminho = cam; CR.ficha = null; }
  if (!CR.descricao) return window.menork.aviso('Preencha a descrição antes.');
  if (!CR.ficha) { b2Carregando('Lendo o que essa categoria pede…');
    try { CR.ficha = await b2get(`/api/b2x/ficha?loja=${encodeURIComponent(CR.loja.id)}&categoria=${encodeURIComponent(CR.categoria)}`); } catch (err) { return b2Erro(err); } }
  const f = CR.ficha;
  const campo = o => o.opcoes.length ? `<label>${esc(o.nome)}<select data-cr-attr="${esc(o.id)}"><option value="">escolha</option>${o.opcoes.map(x => `<option value="${esc(x.id)}" ${CR.attr[o.id] === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`
    : `<label>${esc(o.nome)}<input data-cr-attr="${esc(o.id)}" data-texto="1" value="${esc(CR.attr[o.id] || '')}"></label>`;
  crTela(1, `<h2>Ficha <small>${esc(CR.caminho)}</small></h2><form id="cr-ficha" class="b2-ficha">
    ${f.obrigatorios.length ? `<h3>A categoria pede</h3><div class="b2-grade">${f.obrigatorios.map(campo).join('')}</div>` : '<p class="pequeno">Esta categoria não pede nada obrigatório.</p>'}
    ${(f.opcionais || []).length ? `<h3>Mais detalhes <small class="pequeno">não são obrigatórios, mas deixam o anúncio completo</small></h3><div class="b2-grade">${f.opcionais.map(campo).join('')}</div>` : ''}
    ${CR.canal === 'shopee' ? `<h3>Marca</h3><div class="b2-grade"><label>Marca<select name="marca">${opcoesMarca(f, CR.marca)}</select></label></div>`
      : CR.canal === 'mercadolivre' ? (f.tipos_anuncio.length ? `<h3>Tipo de anúncio</h3><div class="b2-grade"><label>Tipo<select name="tipo_anuncio">${f.tipos_anuncio.map(x => `<option value="${esc(x.id)}" ${CR.tipo_anuncio === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>` : '')
      : `<h3>Marca</h3><div class="b2-grade"><label>Marca<input name="marca" value="${esc(CR.marca)}"></label></div>`}
    ${f.dica ? `<p class="pequeno">${esc(f.dica)}</p>` : ''}
    <div class="acoes"><button class="b">Seguir para as fotos</button><button type="button" class="b claro" data-cr-ir="0">Voltar</button></div></form>`);
}
function crLerFicha(f) {
  CR.attr = {}; f.querySelectorAll('[data-cr-attr]').forEach(x => { if (x.value.trim()) CR.attr[x.dataset.crAttr] = x.value.trim(); });
  if (f.elements.marca) CR.marca = f.elements.marca.value; if (f.elements.tipo_anuncio) CR.tipo_anuncio = f.elements.tipo_anuncio.value;
}
function crZona(chave, titulo, max, dica) {
  const l = CR.fotos[chave] || [];
  return `<div class="cr-zona"><div class="cr-zona-topo"><b>${esc(titulo)}</b><small>${l.length} de ${max}${dica ? ' · ' + esc(dica) : ''}</small></div>
    <div class="cr-fotos">${l.map((x, i) => `<span class="cr-foto"><img src="${esc(x.url)}" alt="" referrerpolicy="no-referrer"><button type="button" data-cr-tirar="${esc(chave)}" data-i="${i}" title="Tirar">×</button>${i === 0 ? '<i>1ª</i>' : ''}</span>`).join('')}
    ${l.length < max ? `<label class="cr-mais" data-cr-zona="${esc(chave)}" data-max="${max}">+ Fotos<input type="file" multiple accept="image/jpeg,image/png,image/webp" hidden></label>` : ''}</div></div>`;
}
function crFotos() {
  const ml = CR.canal === 'mercadolivre';
  crTela(2, `<h2>Fotos <small>${ml ? 'no Mercado Livre cada cor tem as suas fotos' : 'fotos do anúncio e uma por cor'}</small></h2>
    <form id="cr-cores" class="b2-linha"><input name="cores" value="${esc(CR.cores.join(', '))}" placeholder="Cores, separadas por vírgula (ex.: BEGE, PRETO). Vazio = sem variação de cor"><button class="b claro">Atualizar cores</button></form>
    ${ml ? '' : crZona('galeria', 'Fotos do anúncio (a 1ª é a capa)', 9)}
    ${CR.cores.map(c => crZona('cor:' + c, (ml ? 'Fotos da cor ' : 'Foto da variação ') + c, ml ? 10 : 1, ml ? 'a 1ª é a principal' : 'aparece quando o cliente toca na cor')).join('')}
    ${ml && !CR.cores.length ? crZona('galeria', 'Fotos do anúncio (a 1ª é a principal)', 10) : ''}
    ${CR.canal === 'shopee' ? crZona('tabela', 'Tabela de medidas (imagem)', 1, 'a Shopee pede em calçados') : ''}
    <div class="acoes"><button class="b" data-cr-ir="3">Seguir para as variações</button><button class="b claro" data-cr-ir="1">Voltar</button></div>`);
}
async function crSubir(zona, arquivos) {
  const chave = zona.dataset.crZona, max = +zona.dataset.max, ja = (CR.fotos[chave] || []).length;
  const lista = [...arquivos].slice(0, Math.max(0, max - ja)); if (!lista.length) return;
  const f = new FormData(); lista.forEach(a => f.append('arquivos', a, a.name));
  zona.classList.add('subindo'); zona.firstChild.textContent = 'Subindo…';
  try { const r = await window.menork.api('/api/b2x/fotos/subir', f, true); CR.fotos[chave] = [...(CR.fotos[chave] || []), ...r.fotos]; crFotos(); }
  catch (err) { window.menork.aviso(err.message, null, null, 10); crFotos(); }
}
const crTams = () => String(CR.tamanhos || '').split(/[,;\s]+/).map(t => t.trim()).filter(Boolean);
function crVariacoes() {
  const cores = CR.cores.length ? CR.cores : [''], tams = crTams().length ? crTams() : [''];
  const ch = (c, t) => c + '|' + t, g = CR.grade;
  cores.forEach(c => tams.forEach(t => { g[ch(c, t)] = g[ch(c, t)] || { preco: CR.preco || '', estoque: '10', sku: '' }; }));
  crTela(3, `<h2>Variações <small>${cores.length} cor(es) × ${tams.length} tamanho(s) = ${cores.length * tams.length}</small></h2>
    <form id="cr-tams" class="b2-linha"><input name="tamanhos" value="${esc(CR.tamanhos)}" placeholder="Tamanhos: 34, 35, 36 ou 33/34, 35/36"><button class="b claro">Atualizar tamanhos</button></form>
    <div class="cr-todos"><span class="pequeno">Preencher todas:</span><input id="cr-p-todos" inputmode="decimal" placeholder="Preço"><input id="cr-e-todos" inputmode="numeric" placeholder="Estoque"><input id="cr-s-base" placeholder="Base do SKU (ex.: TA01)"><button type="button" class="b claro" id="cr-aplicar-todos">Aplicar</button></div>
    <div class="cr-grade-wrap"><table class="tabela cr-grade"><tr><th>Cor</th><th>Tamanho</th><th>SKU</th><th>Preço</th><th>Estoque</th></tr>
    ${cores.flatMap(c => tams.map(t => { const v = g[ch(c, t)]; return `<tr data-v="${esc(ch(c, t))}"><td>${esc(c || '—')}</td><td>${esc(t || '—')}</td><td><input data-k="sku" value="${esc(v.sku)}"></td><td><input data-k="preco" inputmode="decimal" value="${esc(v.preco)}" placeholder="49,90"></td><td><input data-k="estoque" inputmode="numeric" value="${esc(v.estoque)}"></td></tr>`; })).join('')}</table></div>
    <label class="campo-b2">SKU pai (opcional)<input id="cr-sku-pai" value="${esc(CR.sku_pai)}" placeholder="Ex.: TA01-BEGE"></label>
    ${CR.canal === 'mercadolivre' ? `<label class="campo-b2">Preço promocional (opcional)<input id="cr-promo" inputmode="decimal" value="${esc(CR.promo || '')}" placeholder="Ex.: 59,90 · os preços da tabela são o preço cheio, riscado"></label>
      <p class="pequeno">Depois de criado entra a promoção (desconto direto do Mercado Livre) com esse preço, renovada sozinha a cada 30 dias.</p>` : ''}
    <div class="acoes"><button class="b" data-cr-ir="4">Seguir para o envio</button><button class="b claro" data-cr-ir="2">Voltar</button></div>`);
}
function crLerGrade() {
  document.querySelectorAll('.cr-grade tr[data-v]').forEach(tr => { const v = CR.grade[tr.dataset.v]; tr.querySelectorAll('input[data-k]').forEach(i => { v[i.dataset.k] = i.value.trim(); }); });
  const sp = document.getElementById('cr-sku-pai'); if (sp) CR.sku_pai = sp.value.trim();
  const pr = document.getElementById('cr-promo'); if (pr) CR.promo = pr.value.trim();
}
async function crEnvio() {
  const ml = CR.canal === 'mercadolivre', e = CR.embalagem;
  if (ml && !CR.envioInfo) { b2Carregando('Lendo as formas de envio da conta…'); try { CR.envioInfo = await b2get('/api/b2x/envio?loja=' + encodeURIComponent(CR.loja.id)); } catch (err) { CR.envioInfo = { modos: [], logisticas: [], obs: err.message }; } }
  const ei = CR.envioInfo;
  crTela(4, `<h2>Envio <small>embalagem${ml ? ', modalidade e medidas do pé' : ''}</small></h2><form id="cr-envio" class="b2-ficha">
    <div class="b2-grade"><label>Peso (g)<input name="peso_g" inputmode="decimal" value="${esc(e.peso_g)}"></label><label>Comprimento (cm)<input name="comprimento_cm" inputmode="decimal" value="${esc(e.comprimento_cm)}"></label>
      <label>Largura (cm)<input name="largura_cm" inputmode="decimal" value="${esc(e.largura_cm)}"></label><label>Altura (cm)<input name="altura_cm" inputmode="decimal" value="${esc(e.altura_cm)}"></label></div>
    ${ml ? `<h3>Mercado Livre</h3><div class="b2-grade"><label>Modalidade<select name="envio"><option value="">a da conta${ei?.usa ? ' (' + esc(ei.usa) + ')' : ''}</option><option value="me2" ${CR.envio === 'me2' ? 'selected' : ''}>Mercado Envios</option><option value="not_specified" ${CR.envio === 'not_specified' ? 'selected' : ''}>A combinar</option></select></label>
      <label class="linha"><input type="checkbox" name="frete_gratis" ${CR.frete_gratis ? 'checked' : ''}> Frete grátis</label></div>
      ${ei?.logisticas?.length ? `<p class="pequeno">Logísticas da conta: ${ei.logisticas.map(esc).join(' · ')}</p>` : ''}${ei?.o_que_fazer ? `<p class="pequeno aviso-txt">${esc(ei.o_que_fazer)}</p>` : ''}
      ${crTams().length ? `<h3>Medidas do pé <small class="pequeno">opcional: com elas o B2X escolhe ou cria a tabela de medidas</small></h3><div class="b2-grade">${crTams().map(t => `<label>Tamanho ${esc(t)} (cm)<input data-medida="${esc(t)}" inputmode="decimal" value="${esc(CR.medidas[t] || '')}"></label>`).join('')}</div>` : ''}` : ''}
    <div class="acoes"><button class="b">Revisar</button><button type="button" class="b claro" data-cr-ir="3">Voltar</button></div></form>`);
}
function crLerEnvio(f) {
  ['peso_g', 'comprimento_cm', 'largura_cm', 'altura_cm'].forEach(k => { CR.embalagem[k] = f.elements[k].value.trim(); });
  if (f.elements.envio) { CR.envio = f.elements.envio.value; CR.frete_gratis = f.elements.frete_gratis.checked; }
  f.querySelectorAll('[data-medida]').forEach(i => { CR.medidas[i.dataset.medida] = i.value.trim(); });
}
function crCorpo(extra = {}) {
  const ml = CR.canal === 'mercadolivre', cores = CR.cores.length ? CR.cores : [''], tams = crTams().length ? crTams() : [''];
  const fotoCor = c => (CR.fotos['cor:' + c] || []).map(x => x.url);
  const variacoes = cores.flatMap(c => tams.map(t => { const v = CR.grade[c + '|' + t] || {}; return { cor: c, tamanho: t, sku: v.sku, preco: v.preco, estoque: v.estoque, fotos: c ? fotoCor(c) : (ml ? CR.fotos.galeria.map(x => x.url) : []) }; }));
  const marca = CR.canal === 'shopee' ? { id: CR.marca || '0', nome: CR.ficha?.marcas.find(m => m.id === CR.marca)?.nome || '' } : { nome: CR.marca };
  return { loja: CR.loja.id, canal: CR.canal, categoria: CR.categoria, titulo: CR.titulo, descricao: CR.descricao, variacoes,
    fotos: CR.fotos.galeria.map(x => x.url), tabela_url: CR.fotos.tabela[0]?.url || '', sku_pai: CR.sku_pai, marca, tipo_anuncio: CR.tipo_anuncio,
    atributos: Object.entries(CR.attr).map(([id, v]) => CR.ficha.obrigatorios.find(o => o.id === id)?.opcoes.length ? { id, opcao: v } : { id, texto: v }),
    envio: CR.envio, frete_gratis: CR.frete_gratis, preco_promocional: CR.canal === 'mercadolivre' ? (CR.promo || '') : '', medidas_pe: Object.fromEntries(Object.entries(CR.medidas).filter(([, v]) => v)), ...CR.embalagem, ...extra };
}
function crRevisar(r) {
  const c = crCorpo(), nf = c.fotos.length + new Set(c.variacoes.flatMap(v => v.fotos)).size;
  crTela(5, `<h2>Revisar <small>${r ? (r.validado ? 'validado: pode publicar' : 'o marketplace pediu correções') : 'confira e valide'}</small></h2>
    <div class="dup-resumo"><span><b>${esc(CR.titulo)}</b></span><span>${esc(CR.caminho)}</span><span>${c.variacoes.length} variação(ões)</span><span>${nf} foto(s)</span><span>Embalagem ${esc(c.peso_g)} g · ${esc(c.comprimento_cm)}×${esc(c.largura_cm)}×${esc(c.altura_cm)} cm</span></div>
    ${r?.problemas?.length ? `<div class="nota ruim"><b>Corrigir</b>${r.problemas.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}${r ? b2Lista('Avisos', r.avisos) : ''}
    <p class="pequeno">${CR.canal === 'shopee' ? 'Na Shopee o anúncio nasce OCULTO' : CR.canal === 'mercadolivre' ? 'No Mercado Livre o anúncio nasce PAUSADO' : 'O anúncio nasce sem vender'}: revise no marketplace e ative quando estiver tudo certo.</p>
    <div class="acoes">${r?.validado ? '<button class="b verde" id="cr-publicar">Publicar</button>' : '<button class="b" id="cr-validar">Validar (nada é publicado)</button>'}<button class="b claro" data-cr-ir="4">Voltar</button></div>`);
}
async function crValidar() {
  b2Carregando('Validando com o marketplace…');
  try { const r = await b2post('/api/b2x/criar-loja', crCorpo()); CR.pedido = r.pedido_id; crRevisar(r); } catch (err) { b2Erro(err); }
}
async function crPublicar() {
  b2Carregando('Publicando no marketplace. Não feche esta janela…');
  try { const r = await b2post('/api/b2x/criar-loja', crCorpo({ confirmar: true, pedido_id: CR.pedido })); if (r.pedido_id) CR.pedido = r.pedido_id;
    if (r.criado) { CR.promoFeita = r.promocao || null; return crFim({ estado: 'criado', final: true, anuncio_id: r.anuncio_ids.join(', '), erros: [], avisos: r.avisos, etapa: r.status }); }
    if (r.problemas.length && !r.na_fila && !CR.pedido) return crRevisar(r);
    crAcompanhar();
  } catch (err) { b2Erro(err); }
}
async function crAcompanhar() {
  clearTimeout(CR.relogio);
  try { const s = await b2get(`/api/b2x/criar/status?pedido_id=${encodeURIComponent(CR.pedido)}&loja=${encodeURIComponent(CR.loja.id)}`);
    if (s.final || s.parar) return crFim(s);
    b2Tela(`<h2>Publicando <small>${esc(s.estado)}</small></h2><div class="cr-andamento"><span class="abertura-barra"><i></i></span><p>${esc(s.etapa || 'Em andamento…')}</p></div>
      <p class="pequeno">Confere de novo sozinho em ${s.de_novo_em} s. Pode deixar esta janela aberta.</p>
      <div class="acoes"><button class="b claro" id="cr-cancelar">Cancelar a criação</button></div>`);
    CR.relogio = setTimeout(() => { if (document.querySelector('.cr-andamento')) crAcompanhar(); }, Math.max(4, s.de_novo_em) * 1000);
  } catch (err) { b2Erro(err); }
}
async function crFim(s) {
  const ok = ['criado', 'publicado', 'enviado', 'em_analise'].includes(s.estado) && s.estado !== 'recusado';
  if (ok && CR.canal === 'mercadolivre' && CR.promo && !CR.promoFeita && s.anuncio_id) {  // criado pela fila: aplica a promocao agora
    b2Carregando('Anúncio criado. Aplicando a promoção…');
    const ids = String(s.anuncio_id).split(',').map(x => x.trim()).filter(Boolean);
    try { const sim = await b2post('/api/b2x/desconto-ml', { loja: CR.loja.id, anuncios: ids, preco: CR.promo });
      CR.promoFeita = sim.ok ? await b2post('/api/b2x/desconto-ml', { loja: CR.loja.id, anuncios: ids, preco: CR.promo, confirmar: true, pedido_id: sim.pedido_id })
        .then(f => ({ ok: f.ok, msg: f.ok ? `Promoção de R$ ${CR.promo} aplicada (renova sozinha a cada 30 dias).` : 'A promoção não entrou: ' + f.problemas.join('; ') }))
        : { ok: false, msg: 'A promoção não entrou: ' + sim.problemas.join('; ') };
    } catch (err) { CR.promoFeita = { ok: false, msg: 'A promoção não entrou: ' + err.message }; }
  }
  b2Tela(ok ? `<h2>Anúncio criado</h2><div class="nota"><b>${esc(MKN[CR.loja.marketplace] || '')}: ${esc(s.anuncio_id || '')}</b><span>Situação: ${esc(s.estado)}${s.etapa ? ' · ' + esc(s.etapa) : ''}</span></div>${CR.promoFeita ? `<div class="nota ${CR.promoFeita.ok ? '' : 'ruim'}"><span>${esc(CR.promoFeita.msg)}</span></div>` : ''}${b2Lista('Avisos', s.avisos)}
      <div class="acoes"><button class="b" data-ir-loja="${esc(CR.loja.id)}">Ver na loja</button><button class="b claro" data-fechar>Fechar</button></div>`
    : `<h2>Não foi publicado <small>${esc(s.estado)}</small></h2><div class="nota ruim">${s.motivo ? `<span>${esc(s.motivo)}</span>` : ''}${s.erros.map(x => `<span>${esc(x)}</span>`).join('') || (s.motivo ? '' : '<span>O marketplace não confirmou a criação.</span>')}</div>
      ${s.estado === 'incerto' ? '<p class="pequeno aviso-txt">Ficou incerto: confira a loja antes de tentar de novo. Tentar por aqui usa o mesmo pedido e não duplica.</p>' : ''}
      <div class="acoes"><button class="b claro" data-cr-ir="5">Voltar e corrigir</button><button class="b claro" data-fechar>Fechar</button></div>`);
}
async function crCancelar(b) {
  if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = 'Confirmar: cancelar a criação'; b.classList.add('vermelho'); return; }
  clearTimeout(CR.relogio); b2Carregando('Cancelando…');
  try { const r = await b2post('/api/b2x/criar/cancelar', { pedido_id: CR.pedido, loja: CR.loja.id, confirmar: true });
    b2Tela(`<h2>Criação cancelada</h2><div class="nota"><span>${esc(r.estado_antes)} → ${esc(r.estado_depois)}${r.motivo ? ' · ' + esc(r.motivo) : ''}</span></div><div class="acoes"><button class="b claro" data-fechar>Fechar</button></div>`);
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  const c = e.target.closest('[data-criar-loja]'); if (c) return crInicio(c.dataset.criarLoja);
  if (e.target.closest('#cr-puxar')) return crPuxar();
  const cat = e.target.closest('[data-cr-cat]'); if (cat) { const f = document.getElementById('cr-cat'); CR.titulo = f.titulo.value.trim(); CR.descricao = f.descricao.value.trim(); return crFicha(cat.dataset.crCat, cat.dataset.cam); }
  const t = e.target.closest('[data-cr-tirar]'); if (t) { CR.fotos[t.dataset.crTirar].splice(+t.dataset.i, 1); return crFotos(); }
  if (e.target.closest('#cr-aplicar-todos')) { crLerGrade(); const p = document.getElementById('cr-p-todos').value.trim(), es = document.getElementById('cr-e-todos').value.trim(), base = document.getElementById('cr-s-base').value.trim().toUpperCase();
    Object.entries(CR.grade).forEach(([k, v]) => { const [cor, tam] = k.split('|'); if (p) v.preco = p; if (es) v.estoque = es; if (base) v.sku = [base, cor.replace(/[^A-Za-z0-9]+/g, '').toUpperCase().slice(0, 8), tam.replace(/[^A-Za-z0-9]+/g, '')].filter(Boolean).join('-'); }); return crVariacoes(); }
  if (e.target.closest('#cr-validar')) return crValidar();
  if (e.target.closest('#cr-publicar')) return crPublicar();
  const cc = e.target.closest('#cr-cancelar'); if (cc) return crCancelar(cc);
  const ir = e.target.closest('[data-cr-ir]'); if (!ir) return;
  const de = CR.passo, para = +ir.dataset.crIr;
  if (de === 1) { const f = document.getElementById('cr-ficha'); if (f) crLerFicha(f); }
  if (de === 3) crLerGrade();
  if (de === 2 && para === 3 && !CR.fotos.galeria.length && !CR.cores.some(c => (CR.fotos['cor:' + c] || []).length)) return window.menork.aviso('Coloque pelo menos uma foto.');
  [crCategoria, () => crFicha(), crFotos, crVariacoes, crEnvio, () => crRevisar()][para]();
});
document.addEventListener('change', e => { const z = e.target.closest('[data-cr-zona]'); if (z && e.target.files?.length) crSubir(z, e.target.files); });
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'cr-cat') { e.preventDefault(); return crBuscarCat(f); }
  if (f.id === 'cr-ficha') { e.preventDefault(); crLerFicha(f); return crFotos(); }
  if (f.id === 'cr-cores') { e.preventDefault(); CR.cores = [...new Set(f.cores.value.split(',').map(x => x.trim().toUpperCase()).filter(Boolean))]; return crFotos(); }
  if (f.id === 'cr-tams') { e.preventDefault(); crLerGrade(); CR.tamanhos = f.tamanhos.value; return crVariacoes(); }
  if (f.id === 'cr-envio') { e.preventDefault(); crLerEnvio(f); return crRevisar(); }
});

// ---- mandar anuncios do site para o Grok publicar numa loja do B2X
let PUB = { lista: null, carregando: false };
async function carregarPub() { if (PUB.carregando || !INTEG().tem_chave) return; PUB.carregando = true; try { PUB.lista = (await b2get('/api/pedidos/publicar')).pedidos; } catch (_) { PUB.lista = []; } PUB.carregando = false; if (ROTA === '/anuncios') RENDER(); }
window.PEDIDOS_PUBLICAR = () => {
  if (!INTEG().tem_chave) return '';
  if (!PUB.lista) { carregarPub(); return ''; }
  const abertos = PUB.lista.filter(p => ['aberto', 'pego'].includes(p.status)), feitos = PUB.lista.filter(p => p.status === 'feito').slice(0, 12);
  if (!abertos.length && !feitos.length) return '';
  const nome = id => DB.anuncios.find(a => a.id === id)?.nome || ('#' + id);
  const linha = p => p.tipo === 'tarefa' ? `<li><b class="${p.status === 'feito' ? 'ok-mini' : 'alerta-mini'}">${{ aberto: 'Esperando o Grok', pego: 'Grok fazendo', feito: 'Feito' }[p.status] || esc(p.status)}</b> Pedido ${p.id}: “${esc((p.texto || '').slice(0, 90))}${(p.texto || '').length > 90 ? '…' : ''}” · ${(p.anuncios || []).length} anúncio(s) → ${esc(p.loja_nome || '')}${(p.alvos || []).length ? ` · ${p.alvos.length} da loja liberado(s)` : ''}${p.bot ? ' · ' + esc(p.bot) : ''}${p.resposta ? ' · ' + esc(p.resposta) : ''}</li>`
    : `<li><b class="${p.status === 'feito' ? 'ok-mini' : 'alerta-mini'}">${{ aberto: 'Esperando o Grok', pego: 'Grok publicando', feito: 'Feito' }[p.status] || esc(p.status)}</b> ${esc(nome(p.anuncio_id))} → ${esc(p.loja_nome || '')} (${esc(p.marketplace || '')})${p.bot ? ' · ' + esc(p.bot) : ''}${p.resposta ? ' · ' + esc(p.resposta) : ''}</li>`;
  return `<div class="bloco pedidos-pub"><h2>Mandados para o Grok <small>${abertos.length} em andamento</small><button class="b claro mini" id="atualizar-pub">Atualizar</button></h2><ul class="envios-feitos">${abertos.map(linha).join('')}${feitos.map(linha).join('')}</ul></div>`;
};
window.BARRA_SEL_AN = () => SEL_AN.size ? `<div class="barra-sel-an"><b>${SEL_AN.size} anúncio(s) marcado(s)</b><button class="b verde" id="mandar-grok">Mandar para o Grok publicar</button><button class="b" id="trocar-lote" title="Trocar só as fotos de anúncios que já estão numa loja, todos de uma vez">Trocar fotos na loja</button><button class="b" id="mandar-grok-pedido" title="Escreva o que o Grok deve fazer com estes anúncios, por exemplo substituir anúncios que já estão na loja">Mandar para o Grok com pedido</button><button class="b claro" id="marcar-familia" title="Marca também os outros anúncios da mesma família">Marcar a família</button><button class="b claro" id="limpar-sel-an">Limpar</button></div>` : '';
async function pubJanela() {
  if (!LOJAS.clientes) { b2Carregando('Buscando as lojas no B2X…'); await carregarLojas(); if (!LOJAS.clientes) return b2Erro(new Error(LOJAS.erro || 'Não consegui ler as lojas.')); }
  const ads = [...SEL_AN].map(id => DB.anuncios.find(a => a.id === id)).filter(Boolean);
  const lojas = todasLojas().filter(l => ['shopee', 'mercadolivre'].includes(l.canal)), grupos = {};
  lojas.forEach(l => (grupos[l.cliente] = grupos[l.cliente] || []).push(l));
  b2Tela(`<h2>Mandar para o Grok publicar <small>${ads.length} anúncio(s)</small></h2>
    <ul class="envios-feitos pub-lista">${ads.map(a => { const fl = faltas(a.id).itens.length; return `<li><b>${esc(a.nome)}</b>${a.titulo ? ' · ' + esc(a.titulo) : ' · <span class="aviso-txt">sem título (o Grok cria)</span>'}${fl ? ` · ${fl} pendência(s)` : ''}</li>`; }).join('')}</ul>
    <div class="campo-b2"><span>Loja onde o Grok vai publicar</span>${seletorLoja('pub-loja', lojas, PUB.loja)}</div>
    <p class="pequeno">O Grok arruma o que estiver incompleto (título diferente para cada um, descrição, tamanhos), valida e publica. Ele só consegue publicar estes anúncios, nesta loja. Na Shopee o anúncio nasce oculto e no Mercado Livre pausado. O modo de cada anúncio muda para o marketplace da loja.</p>
    <div class="acoes"><button class="b verde" id="pub-confirmar">Mandar ${ads.length} para o Grok</button><button class="b claro" data-fechar>Cancelar</button></div>`);
}
// pedido escrito para o Grok: anuncios do site + loja + anuncios da loja que ele pode mexer + o texto
const TF = { alvos: new Map(), busca: '', lista: null, texto: '', loja: '' };
async function tfJanela() {
  if (!LOJAS.clientes) { b2Carregando('Buscando as lojas no B2X…'); await carregarLojas(); if (!LOJAS.clientes) return b2Erro(new Error(LOJAS.erro || 'Não consegui ler as lojas.')); }
  TF.ads = [...SEL_AN].map(id => DB.anuncios.find(a => a.id === id)).filter(Boolean);
  const lojas = todasLojas().filter(l => ['shopee', 'mercadolivre'].includes(l.canal)), grupos = {};
  lojas.forEach(l => (grupos[l.cliente] = grupos[l.cliente] || []).push(l));
  if (!lojas.some(l => l.id === TF.loja)) { TF.loja = ''; TF.alvos.clear(); TF.lista = null; }
  b2Tela(`<h2>Mandar para o Grok com pedido <small>${TF.ads.length} anúncio(s) do site</small></h2>
    <ol class="envios-feitos pub-lista tf-ads">${TF.ads.map(a => `<li><b>${esc(a.nome)}</b>${a.titulo ? ' · ' + esc(a.titulo) : ''}</li>`).join('')}</ol>
    <div class="campo-b2"><span>Loja</span>${seletorLoja('tf-loja', lojas, TF.loja)}</div>
    ${!TF.loja ? '' : `<div class="tf-alvos"><div class="tf-cab"><b>Anúncios da loja que o Grok pode mexer</b> <span class="pequeno">${TF.alvos.size ? TF.alvos.size + ' escolhido(s)' : 'nenhum: o Grok só pode publicar novos'}</span></div>
      <div class="tf-chips">${[...TF.alvos.values()].map(x => `<span class="tf-chip">${x.foto ? `<img src="${esc(x.foto)}" alt="">` : ''}${esc(x.id)} · ${esc((x.titulo || '').slice(0, 40))}<button type="button" data-tf-tirar="${esc(x.id)}" title="Tirar">×</button></span>`).join('')}</div>
      <form id="tf-busca" class="b2-linha"><input name="busca" value="${esc(TF.busca)}" placeholder="Buscar na loja pelo título ou código"><button class="b claro">Buscar</button></form>
      <div class="tf-lista">${TF.lista === null ? '<p class="pequeno">Carregando os anúncios da loja…</p>' : TF.lista.length ? TF.lista.map(x => `<label class="tf-item ${TF.alvos.has(x.id) ? 'escolhido' : ''}"><input type="checkbox" data-tf-alvo="${esc(x.id)}" ${TF.alvos.has(x.id) ? 'checked' : ''}>${x.foto ? `<img src="${esc(x.foto)}" alt="" onerror="this.style.visibility='hidden'">` : '<span class="tf-semfoto"></span>'}<span><b>${esc(x.titulo)}</b><small>${esc(x.id)}${x.preco ? ' · R$ ' + esc(x.preco) : ''}${x.status ? ' · ' + esc(x.status) : ''}</small></span></label>`).join('') : '<p class="pequeno">Nada encontrado.</p>'}</div></div>`}
    <label class="campo-b2">O que o Grok deve fazer<textarea id="tf-texto" rows="3" placeholder="Ex.: Substitua os anúncios que separei pelos do site, na ordem: o primeiro da loja pelo TA101 unitário 02, o segundo pelo 03… Troque também o título.">${esc(TF.texto)}</textarea></label>
    <p class="pequeno">O Grok só consegue mexer nos anúncios da loja que você marcou e só usa os anúncios do site desta lista. Ele simula antes de trocar e nunca apaga nada.</p>
    <div class="acoes"><button class="b verde" id="tf-confirmar">Mandar pedido para o Grok</button><button class="b claro" data-fechar>Cancelar</button></div>`);
  if (TF.loja && TF.lista === null) tfBuscar();
}
async function tfBuscar() {
  const loja = TF.loja;
  try { const r = await SRV.anunciosLoja(loja, TF.busca, 1, false); if (loja !== TF.loja) return; TF.lista = r.anuncios || []; }
  catch (err) { TF.lista = []; window.menork.aviso(err.message); }
  if (document.getElementById('tf-texto')) { TF.texto = document.getElementById('tf-texto').value; tfJanela(); }
}
async function tfConfirmar() {
  TF.texto = document.getElementById('tf-texto').value.trim();
  if (!TF.loja) return window.menork.aviso('Escolha a loja.');
  if (TF.texto.length < 5) return window.menork.aviso('Escreva o que o Grok deve fazer.');
  b2Carregando('Criando o pedido…');
  try { const r = await b2post('/api/pedidos/tarefa', { ids: TF.ads.map(a => a.id), loja: TF.loja, texto: TF.texto, alvos: [...TF.alvos.values()].map(x => ({ id: x.id, titulo: x.titulo })) });
    SEL_AN.clear(); PUB.lista = null; TF.alvos.clear(); TF.texto = ''; TF.lista = null;
    b2Tela(`<h2>Pronto: pedido ${r.pedido} para o Grok</h2><p>Mande esta mensagem para o Grok no Grok Bot:</p>
      <textarea id="txt-pub" rows="4" readonly>${esc(r.texto)}</textarea>
      <div class="acoes"><button class="b" data-copiar-de="txt-pub">Copiar mensagem</button><button class="b claro" data-fechar>Fechar</button></div>
      <p class="pequeno">O andamento aparece na página Anúncios, em "Mandados para o Grok".</p>`);
    await SRV.carregar(); RENDER();
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('#mandar-grok-pedido')) return tfJanela();
  if (e.target.closest('#tf-confirmar')) return tfConfirmar();
  const t = e.target.closest('[data-tf-tirar]'); if (t) { TF.texto = document.getElementById('tf-texto')?.value || TF.texto; TF.alvos.delete(t.dataset.tfTirar); return tfJanela(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'tf-loja') { TF.texto = document.getElementById('tf-texto')?.value || TF.texto; TF.loja = e.target.value; TF.alvos.clear(); TF.lista = null; TF.busca = ''; return tfJanela(); }
  const cx = e.target.closest('[data-tf-alvo]'); if (!cx) return;
  const x = (TF.lista || []).find(i => i.id === cx.dataset.tfAlvo); TF.texto = document.getElementById('tf-texto')?.value || TF.texto;
  cx.checked && x ? TF.alvos.set(x.id, x) : TF.alvos.delete(cx.dataset.tfAlvo); tfJanela();
});
document.addEventListener('submit', e => { if (e.target.id !== 'tf-busca') return; e.preventDefault(); TF.texto = document.getElementById('tf-texto')?.value || TF.texto; TF.busca = e.target.busca.value.trim(); TF.lista = null; tfJanela(); });

async function pubConfirmar() {
  const loja = document.getElementById('pub-loja').value; if (!loja) return window.menork.aviso('Escolha a loja.'); PUB.loja = loja; b2Carregando('Criando os pedidos…');
  try { const r = await b2post('/api/pedidos/publicar', { ids: [...SEL_AN], loja }); SEL_AN.clear(); PUB.lista = null;
    b2Tela(`<h2>Pronto: ${r.pedidos.length} pedido(s) para o Grok</h2><p>Mande esta mensagem para o Grok no Grok Bot:</p>
      <textarea id="txt-pub" rows="4" readonly>${esc(r.texto)}</textarea>
      <div class="acoes"><button class="b" data-copiar-de="txt-pub">Copiar mensagem</button><button class="b claro" data-fechar>Fechar</button></div>
      <p class="pequeno">O andamento aparece na página Anúncios, em "Mandados para o Grok publicar".</p>`);
    await SRV.carregar(); RENDER();
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  const cx = e.target.closest('[data-sel-an]');
  if (cx || e.target.closest('.sel-an')) { e.stopPropagation(); if (!cx) return; const id = +cx.dataset.selAn; cx.checked ? SEL_AN.add(id) : SEL_AN.delete(id); return RENDER(); }
  if (e.target.closest('#limpar-sel-an')) { SEL_AN.clear(); return RENDER(); }
  if (e.target.closest('#marcar-familia')) { const fams = new Set([...SEL_AN].map(id => DB.anuncios.find(a => a.id === id)?.familia).filter(Boolean));
    DB.anuncios.forEach(a => { if (a.familia && fams.has(a.familia) || fams.has(a.id)) SEL_AN.add(a.id); }); return RENDER(); }
  if (e.target.closest('#mandar-grok')) return pubJanela();
  if (e.target.closest('#pub-confirmar')) return pubConfirmar();
  if (e.target.closest('#atualizar-pub')) { PUB.lista = null; return RENDER(); }
  const cp = e.target.closest('[data-copiar-de]'); if (cp) { const t = document.getElementById(cp.dataset.copiarDe); t.select(); navigator.clipboard?.writeText(t.value); window.menork.aviso('Mensagem copiada.'); }
}, true);

// promocao (desconto direto) num anuncio do ML que ja existe
async function mkPromoSimular() {
  const preco = document.getElementById('mk-promo').value.trim(); if (!preco) return window.menork.aviso('Digite o preço promocional.');
  MK.promo = preco; b2Carregando('Simulando a promoção…');
  try { const r = await b2post('/api/b2x/desconto-ml', { loja: MK.loja.id, anuncios: [MK.atual.id], preco }); MK.promoPedido = r.pedido_id;
    b2Tela(`<h2>Promoção <small>simulação, nada mudou ainda</small></h2>
      <div class="nota ${r.ok ? '' : 'ruim'}"><b>${r.ok ? 'Pronto para aplicar' : 'Recusada'}</b>${r.itens.map(i => `<span>${esc(i.anuncio || '')}: R$ ${esc(i.preco_atual ?? '')} → R$ ${esc(i.preco_promocional ?? preco)}${i.desconto != null ? ` (${esc(i.desconto)}% OFF)` : ''}</span>`).join('')}${r.problemas.map(x => `<span>${esc(x)}</span>`).join('')}${r.avisos.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      <p class="pequeno">Vale por 30 dias e renova sozinha.</p>
      <div class="acoes">${r.ok ? '<button class="b verde" id="mk-promo-confirmar">Confirmar a promoção</button>' : ''}<button class="b claro" id="mk-voltar">Voltar</button></div>`);
  } catch (err) { b2Erro(err); }
}
async function mkPromoConfirmar() {
  b2Carregando('Aplicando a promoção…');
  try { const r = await b2post('/api/b2x/desconto-ml', { loja: MK.loja.id, anuncios: [MK.atual.id], preco: MK.promo, confirmar: true, pedido_id: MK.promoPedido });
    b2Tela(`<h2>${r.ok ? 'Promoção aplicada' : 'A promoção não entrou'}</h2><div class="nota ${r.ok ? '' : 'ruim'}"><span>${r.ok ? `R$ ${esc(MK.promo)} no anúncio ${esc(MK.atual.id)}; o Mercado Livre pode levar alguns minutos para mostrar.` : r.problemas.map(esc).join('<br>')}</span></div>
      <div class="acoes"><button class="b" id="mk-reabrir">Ver o anúncio de novo</button><button class="b claro" data-fechar>Fechar</button></div>`);
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('#mk-promo-simular')) return mkPromoSimular();
  if (e.target.closest('#mk-promo-confirmar')) return mkPromoConfirmar();
});

// Shopee: mostra as promocoes que a loja ja tem; voce escolhe uma, ajusta o preco, simula e confirma
const PS = {};
const reais = v => v == null || v === '' || isNaN(Number(String(v).replace(',', '.'))) ? (v ?? '') : 'R$ ' + Number(String(v).replace(',', '.')).toFixed(2).replace('.', ',');
async function psAbrir(loja, anuncio, preco, aid) {
  Object.assign(PS, { loja, anuncio, preco: preco ? String(preco).replace('.', ',') : (PS.anuncio === anuncio ? PS.preco : ''), escolhida: null, lista: null, voltarMk: !!(MK.atual && MK.atual.id === anuncio) });
  b2Carregando('Lendo as promoções da loja na Shopee…');
  try { const r = await b2get('/api/b2x/promocoes-loja?loja=' + encodeURIComponent(loja) + (aid ? '&aid=' + aid : '')); PS.lista = r.promocoes; PS.avisos = r.avisos; PS.escolhida = r.sugerida || null; PS.sugerida = r.sugerida || '';
    // a promoção do mesmo modelo já vem escolhida no topo
    if (r.sugerida) PS.lista = [...PS.lista.filter(p => p.id === r.sugerida), ...PS.lista.filter(p => p.id !== r.sugerida)];
    psMostrar(); }
  catch (err) { b2Erro(err); }
}
function psMostrar(msg = '') {
  const L = PS.lista || [], abertas = L.filter(p => p.pode_incluir);
  if (!PS.escolhida && abertas.length) PS.escolhida = abertas[0].id;
  const esc_ = PS.lista.find(p => p.id === PS.escolhida), relampago = esc_?.tipo === 'relampago';
  const card = p => `<label class="ps-promo ${p.pode_incluir ? '' : 'fechada'} ${p.id === PS.escolhida ? 'escolhida' : ''}"><input type="radio" name="ps" value="${esc(p.id)}" ${p.id === PS.escolhida ? 'checked' : ''} ${p.pode_incluir ? '' : 'disabled'}>
    <span><div><b>${esc(p.nome || p.tipo_nome)}</b>${p.nome ? ` <em class="ps-tipo">${esc(p.tipo_nome)}</em>` : ''}${p.renova ? ' <em class="ps-tipo">renova sozinha</em>' : ''}${p.id === PS.sugerida ? ' <em class="ps-tipo ps-mesmo">mesmo modelo</em>' : ''}</div>
    <small>${esc(p.inicio)} até ${esc(p.fim)}${p.produtos != null ? ` · ${esc(p.produtos)} produto(s)` : ''}${p.vagas_livres != null ? ` · ${esc(p.vagas_livres)} vaga(s)` : ''}${p.status ? ' · ' + esc(p.status.replace(/_/g, ' ')) : ''}</small>
    ${p.pode_incluir ? '' : `<small class="ps-motivo">Não aceita anúncio novo agora${p.motivo ? ': ' + esc(p.motivo) : ''}</small>`}</span></label>`;
  b2Tela(`<h2>Colocar numa promoção <small>anúncio ${esc(PS.anuncio)} · Shopee</small></h2>
    ${msg}
    ${L.length ? `<div class="ps-lista">${L.map(card).join('')}</div>` : '<div class="nota ruim"><span>Esta loja não tem promoção de desconto ou relâmpago em andamento ou agendada. Crie uma no painel da Shopee (ou no B2X) e volte aqui.</span></div>'}
    ${PS.avisos?.length ? b2Lista('Avisos', PS.avisos) : ''}
    ${abertas.length ? `<div class="b2-grade"><label>Preço promocional<input id="ps-preco" inputmode="decimal" value="${esc(PS.preco || '')}" placeholder="Ex.: 49,90"></label>
      ${relampago ? `<label>Estoque da relâmpago (por variação)<input id="ps-estoque" inputmode="numeric" value="${esc(PS.estoque || '10')}"></label>` : ''}</div>
      <p class="pequeno">O mesmo preço vai para todas as cores e tamanhos. O preço cheio do anúncio continua como o riscado.</p>` : ''}
    <div class="acoes">${abertas.length ? '<button class="b" id="ps-simular">Simular</button>' : ''}${PS.voltarMk ? '<button class="b claro" id="mk-voltar">Voltar</button>' : ''}<button class="b claro" data-fechar>Fechar</button></div>`);
}
async function psEnviar(confirmar) {
  const p = PS.lista.find(x => x.id === PS.escolhida); if (!p) return window.menork.aviso('Escolha uma promoção.');
  if (!confirmar) { PS.preco = document.getElementById('ps-preco')?.value.trim() || ''; PS.estoque = document.getElementById('ps-estoque')?.value.trim() || '10'; }
  if (!PS.preco) return window.menork.aviso('Digite o preço promocional.');
  b2Carregando(confirmar ? 'Colocando o anúncio na promoção…' : 'Simulando…');
  try {
    const r = await b2post('/api/b2x/promocao-incluir', { loja: PS.loja, id: p.id, tipo: p.tipo, anuncio: PS.anuncio, preco: PS.preco, estoque_promocional: PS.estoque, confirmar, pedido_id: confirmar ? PS.pedido : '' });
    if (!confirmar) PS.pedido = r.pedido_id;
    const tabela = r.itens.length ? `<table class="tabela"><tr><th>Variação</th><th>Preço cheio</th><th>Na promoção</th><th>Desconto</th></tr>${r.itens.map(i => `<tr><td>${esc(i.variacao)}</td><td>${esc(reais(i.preco_atual))}</td><td><b>${esc(reais(i.preco_promocional))}</b></td><td>${i.desconto != null ? esc(i.desconto) + '%' : ''}</td></tr>`).join('')}</table>` : '';
    if (confirmar && r.ok && CR_H.lista) { CR_H.lista = null; if (ROTA.startsWith('/criados')) RENDER(); }
    if (confirmar) return b2Tela(`<h2>${r.ok ? 'Anúncio na promoção' : 'Não entrou na promoção'}</h2>
      <div class="nota ${r.ok ? '' : 'ruim'}"><span>${r.ok ? `Anúncio ${esc(PS.anuncio)} em <b>${esc(p.nome || p.tipo_nome)}</b> por ${esc(reais(PS.preco))}. A Shopee pode levar 1 minuto para mostrar.` : ''}</span>${r.problemas.map(x => `<span>${esc(x)}</span>`).join('')}</div>${tabela}
      <div class="acoes">${PS.voltarMk ? '<button class="b" id="mk-reabrir">Ver o anúncio de novo</button>' : ''}<button class="b claro" data-fechar>Fechar</button></div>`);
    b2Tela(`<h2>Simulação <small>nada mudou ainda</small></h2>
      <div class="nota ${r.ok ? '' : 'ruim'}"><b>${r.ok ? 'Pronto para colocar' : 'A Shopee recusaria'}: ${esc(p.nome || p.tipo_nome)}</b>${r.problemas.map(x => `<span>${esc(x)}</span>`).join('')}${r.avisos.map(x => `<span>${esc(x)}</span>`).join('')}</div>${tabela}
      <div class="acoes">${r.ok ? '<button class="b verde" id="ps-confirmar">Confirmar e colocar na promoção</button>' : ''}<button class="b claro" id="ps-voltar">Voltar e ajustar</button></div>`);
  } catch (err) { b2Erro(err); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-promo-shp]'); if (a) return psAbrir(a.dataset.loja, a.dataset.promoShp, a.dataset.preco, a.dataset.aid || B2.aid || '');
  if (e.target.closest('#ps-simular')) return psEnviar(false);
  if (e.target.closest('#ps-confirmar')) return psEnviar(true);
  if (e.target.closest('#ps-voltar')) return psMostrar();
});
document.addEventListener('change', e => { if (e.target.name !== 'ps' || !PS.lista) return; PS.preco = document.getElementById('ps-preco')?.value.trim() || PS.preco; PS.escolhida = e.target.value; psMostrar(); });

// criacao na fila do B2X (janela do anuncio do site): o servidor acompanha e aplica a promocao; a tela so mostra
async function b2Fila(pedido) {
  clearTimeout(B2.relogio);
  try { const s = await b2get(`/api/b2x/criar/status?pedido_id=${encodeURIComponent(pedido)}&loja=${encodeURIComponent(B2.loja)}`);
    if (s.final || s.parar) {
      const ok = s.anuncio_id && !['recusado', 'apagado', 'parado'].includes(s.estado);
      return b2Tela(ok ? `<h2>Anúncio criado</h2><div class="nota"><b>${esc(B2CANAL[B2.canal])}: ${esc(s.anuncio_id)}</b><span>Situação: ${esc(s.estado)}. ${B2.canal === 'mercadolivre' ? 'Se o anúncio tem preço cheio maior, a promoção entra sozinha em instantes.' : B2.promoShp ? `Subiu com o preço cheio; o site coloca sozinho na promoção do mesmo modelo por ${esc(reais(B2.promoShp))}. Se não achar, fica em Anúncios criados › Falta promoção.` : ''}</span></div><div class="acoes">${['shopee', 'tiktokshop'].includes(B2.canal) && B2.promoShp ? `<button class="b verde" data-promo-shp="${esc(String(s.anuncio_id).split(',')[0])}" data-loja="${esc(B2.loja)}" data-preco="${esc(B2.promoShp)}">Colocar na promoção agora</button>` : ''}<button class="b ${['shopee', 'tiktokshop'].includes(B2.canal) && B2.promoShp ? 'claro' : ''}" data-fechar>Fechar</button></div>`
        : `<h2>Não foi criado <small>${esc(s.estado)}</small></h2><div class="nota ruim">${s.motivo ? `<span>${esc(s.motivo)}</span>` : ''}${s.erros.map(x => `<span>${esc(x)}</span>`).join('')}</div><div class="acoes"><button class="b claro" data-b2="ficha">Voltar</button></div>`);
    }
    b2Tela(`<h2>Publicando <small>${esc(s.estado)}</small></h2><div class="cr-andamento"><span class="abertura-barra"><i></i></span><p>${esc(s.etapa || 'Na fila do B2X…')}</p></div>
      <p class="pequeno">Pode fechar esta janela: o site continua acompanhando e registra o resultado no histórico do anúncio.</p><div class="acoes"><button class="b claro" data-fechar>Fechar</button></div>`);
    B2.relogio = setTimeout(() => { if (document.querySelector('.cr-andamento')) b2Fila(pedido); }, Math.max(4, s.de_novo_em) * 1000);
  } catch (err) { b2Erro(err); }
}

// ---- gasto das IAs, pequeno no rodapé da barra lateral (só lê; não gasta crédito)
const GASTO = { dados: null };
const usd = v => v == null ? '—' : 'US$ ' + Number(v).toFixed(2).replace('.', ',');
async function gastoLer(forcar) {
  try { const r = await fetch(forcar ? '/api/gastos/atualizar' : '/api/gastos', { method: forcar ? 'POST' : 'GET' }); if (!r.ok) return; GASTO.dados = await r.json(); } catch (_) { return; }
  gastoDesenhar(); if (GASTO.dados.lendo) setTimeout(() => gastoLer(), 4000);
}
function gastoDesenhar() {
  const el = document.getElementById('gastos'), d = GASTO.dados; if (!el || !d) return;
  el.hidden = !d.configurado;
  if (!d.configurado) return;
  el.innerHTML = `<div class="gastos-cab"><span>Gasto das IAs</span><button type="button" id="gastos-atualizar" title="Ler de novo (não gasta crédito)">${d.lendo ? '…' : '↻'}</button></div>` +
    (d.contas.length ? d.contas.map(c => `<a href="#" data-rota="/integracoes" class="gasto-linha${c.erro ? ' ruim' : ''}" title="${esc(c.erro ? c.nome + ': ' + c.erro : `${c.nome}: hoje ${usd(c.hoje)}, este mês ${usd(c.mes)}${c.limite ? ' de ' + usd(c.limite) : ''}${d.lido_em ? ' · lido às ' + d.lido_em : ''}`)}"><b>${esc(c.nome)}</b><span>${c.erro ? 'erro' : `${usd(c.hoje)} <i>hoje</i> · ${usd(c.mes)}${c.limite ? '/' + Number(c.limite).toFixed(0) : ''} <i>mês</i>`}</span>${c.limite && !c.erro ? `<em class="gasto-barra"><u style="width:${Math.min(100, c.mes / c.limite * 100).toFixed(0)}%" class="${c.mes / c.limite > .8 ? 'alto' : ''}"></u></em>` : ''}</a>`).join('') : '<span class="gasto-linha">Lendo…</span>');
}
document.addEventListener('click', e => { if (e.target.closest('#gastos-atualizar')) { e.preventDefault(); e.stopPropagation(); if (GASTO.dados) GASTO.dados.lendo = true; gastoDesenhar(); gastoLer(true); } });
if (typeof window !== 'undefined' && location.pathname !== '/demo' && !window.DEMO) { setTimeout(() => gastoLer(), 1500); setInterval(() => gastoLer(), 5 * 60 * 1000); }

// configuração na tela Integrações
const GC = { lista: null, editando: null };
async function gcCarregar() { try { GC.lista = (await b2get('/api/gastos/contas')).contas; } catch (_) { GC.lista = []; } if (ROTA === '/integracoes') RENDER(); }
window.GASTOS_CONFIG = () => {
  if (!GC.lista) { gcCarregar(); return '<div class="bloco"><h2>Gasto das IAs</h2><p class="pequeno">Carregando…</p></div>'; }
  const ed = GC.editando, c = ed && ed !== 'novo' ? GC.lista.find(x => x.id === ed) : null;
  const form = ed ? `<form class="integ-form" id="form-gasto" data-id="${esc(c?.id || '')}">
      <label>Serviço<select name="servico"><option value="xai" ${c?.servico === 'xai' ? 'selected' : ''}>Grok (xAI)</option><option value="openai" ${c?.servico === 'openai' ? 'selected' : ''}>ChatGPT (OpenAI)</option></select></label>
      <label>Nome na tela<input name="nome" value="${esc(c?.nome || '')}" maxlength="30" placeholder="Ex.: Grok, Chat 1, Chat 2"></label>
      <label class="largo">Chave ${c?.tem_chave ? '<span class="ok-mini">· salva (não aparece)</span>' : ''}<input type="password" name="chave" autocomplete="off" placeholder="${c?.tem_chave ? 'deixe vazio para manter' : 'xAI: Management Key · OpenAI: Admin Key (sk-admin-…)'}"></label>
      <label>Team ID (só xAI, opcional)<input name="time" value="${esc(c?.time || '')}" placeholder="console.x.ai > Settings > Team"></label>
      <label>Limite do mês em US$ (opcional)<input name="limite" value="${esc(c?.limite || '')}" inputmode="decimal" placeholder="Ex.: 50"></label>
      <div class="acoes largo"><button class="b">Salvar</button><button type="button" class="b claro" id="gasto-cancelar">Cancelar</button>${c ? `<button type="button" class="b claro" data-gasto-apagar="${esc(c.id)}">Tirar esta conta</button>` : ''}</div></form>` : '';
  return `<div class="bloco"><h2>Gasto das IAs <small>aparece pequeno no canto da barra lateral</small></h2>
    ${GC.lista.length ? `<ul class="envios-feitos">${GC.lista.map(x => `<li><b>${esc(x.nome)}</b> · ${x.servico === 'xai' ? 'Grok (xAI)' : 'ChatGPT (OpenAI)'}${x.limite ? ' · limite US$ ' + esc(x.limite) : ''} <button type="button" class="b claro mini" data-gasto-editar="${esc(x.id)}">Mudar</button></li>`).join('')}</ul>` : '<p class="pequeno">Nenhuma conta ainda.</p>'}
    ${form || '<div class="acoes"><button type="button" class="b claro" id="gasto-novo">+ Adicionar conta</button></div>'}
    <p class="pequeno">Só lê o gasto, de 30 em 30 minutos ou no ↻: isso não gasta crédito. Use uma chave que só lê. xAI: crie uma <b>Management Key</b> em console.x.ai › Settings › Management Keys. OpenAI: crie uma <b>Admin Key</b> em platform.openai.com › Settings › Organization › Admin keys. As chaves ficam só no seu PC.</p></div>`;
};
document.addEventListener('click', e => {
  if (e.target.closest('#gasto-novo')) { GC.editando = 'novo'; return RENDER(); }
  if (e.target.closest('#gasto-cancelar')) { GC.editando = null; return RENDER(); }
  const ed = e.target.closest('[data-gasto-editar]'); if (ed) { GC.editando = ed.dataset.gastoEditar; return RENDER(); }
  const ap = e.target.closest('[data-gasto-apagar]'); if (ap) { b2post('/api/gastos/contas', { apagar: ap.dataset.gastoApagar }).then(r => { GC.lista = r.contas; GC.editando = null; RENDER(); gastoLer(); }).catch(err => window.menork.aviso(err.message)); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'form-gasto') return; e.preventDefault();
  const f = e.target, d = Object.fromEntries(new FormData(f)); d.id = f.dataset.id;
  b2post('/api/gastos/contas', d).then(r => { GC.lista = r.contas; GC.editando = null; RENDER(); window.menork.aviso('Conta salva. Lendo o gasto…'); setTimeout(() => gastoLer(true), 300); }).catch(err => window.menork.aviso(err.message));
});

// ---- trocar SÓ as fotos de vários anúncios da loja de uma vez (cada anúncio do site → um anúncio da loja)
const LT = { loja: '', pares: [], lista: null, busca: '', ativo: 0, res: null, seq: 0, manterCapa: null, capaModo: null, galeria: true, cores: true, capas: null, escolhendo: null };
const ltModelo = () => SEL_AN.size === 1;  // um anuncio do site (a estrutura) -> varios anuncios da loja
function ltLoja() { return todasLojas().find(l => l.id === LT.loja); }
async function ltJanela() {
  if (!LOJAS.clientes) { b2Carregando('Buscando as lojas no B2X…'); await carregarLojas(); if (!LOJAS.clientes) return b2Erro(new Error(LOJAS.erro || 'Não consegui ler as lojas.')); }
  const ids = [...SEL_AN];
  if ([...new Set(LT.pares.map(p => p.aid))].join() !== ids.join()) { LT.pares = ids.map(aid => ({ k: ++LT.seq, aid, alvo: null })); LT.res = null; LT.manterCapa = null; }
  if (LT.capaModo === null) LT.capaModo = ids.some(aid => !montagem(aid).capa) ? 'manter' : 'site';  // estrutura sem capa: cada anuncio da loja fica com a capa dele
  if (ltModelo() && LT.capas === null) { LT.capas = []; b2get(`/api/anuncios/${ids[0]}/capas-livres`).then(r => { LT.capas = r.capas; ltDistribuir(); if (document.getElementById('lt-simular')) ltJanela(); }).catch(() => {}); }
  const lojas = todasLojas().filter(l => ['shopee', 'mercadolivre'].includes(l.canal));
  if (!lojas.some(l => l.id === LT.loja)) { LT.loja = ''; LT.lista = null; }
  const nomeAd = aid => DB.anuncios.find(a => a.id === aid)?.nome || '#' + aid;
  if (LT.ativo >= LT.pares.length) LT.ativo = 0;
  const prontos = LT.pares.filter(p => p.alvo).length;
  b2Tela(`<h2>Trocar fotos na loja <small>${LT.pares.length} anúncio(s) · só as fotos</small></h2>
    <div class="campo-b2"><span>Loja</span>${seletorLoja('lt-loja', lojas, LT.loja)}</div>
    ${!LT.loja ? '' : `<p class="pequeno">${ltModelo() ? `Clique em <b>todos</b> os anúncios da loja que vão receber a estrutura de <b>${esc(nomeAd(ids[0]))}</b> (clique de novo para tirar).` : 'Clique num anúncio do site (à esquerda) e depois no anúncio da loja que vai receber as fotos dele.'}</p>
    ${ltLoja()?.canal === 'shopee' ? `<div class="lt-opcoes">
      <label class="linha"><input type="checkbox" id="lt-galeria" ${LT.galeria ? 'checked' : ''}> <span><b>Trocar as fotos do anúncio</b> (as da estrutura)</span></label>
      <label class="linha"><input type="checkbox" id="lt-cores" ${LT.cores ? 'checked' : ''}> <span><b>Trocar as capas das cores</b> (variações)</span></label>
      ${LT.galeria ? `<div class="lt-capa-modo"><b>Capa (foto 1):</b>
        <label><input type="radio" name="lt-capa" value="manter" ${LT.capaModo === 'manter' ? 'checked' : ''}> manter a que cada anúncio já tem na loja</label>
        ${ltModelo() ? `<label><input type="radio" name="lt-capa" value="outra" ${LT.capaModo === 'outra' ? 'checked' : ''}> uma capa diferente do site em cada anúncio <small>(${(LT.capas || []).length} capa(s) do produto; as já publicadas ficam por último)</small></label>` : ''}
        ${ids.some(aid => montagem(aid).capa) ? `<label><input type="radio" name="lt-capa" value="site" ${LT.capaModo === 'site' ? 'checked' : ''}> a capa do anúncio do site</label>` : ''}</div>` : ''}</div>` : ''}
    <div class="lt-grade"><ol class="lt-pares">${LT.pares.map((p, i) => `<li class="${i === LT.ativo ? 'ativo' : ''}" data-lt-ativo="${i}">${LT.capaModo === 'outra' && LT.galeria && p.alvo ? `<button type="button" class="lt-capa" data-lt-capa="${i}" title="Trocar a capa deste">${p.capa ? `<img src="/mini/${p.capa}" alt="">` : '<em>sem capa</em>'}</button>` : ''}<b>${esc(nomeAd(p.aid))}</b><span>→ ${p.alvo ? `${p.alvo.foto ? `<img src="${esc(p.alvo.foto)}" alt="">` : ''}${esc(p.alvo.titulo.slice(0, 50))} <small>${esc(p.alvo.id)}</small> <button type="button" class="x" data-lt-tirar="${i}" title="Tirar">×</button>` : '<em>escolha na loja</em>'}</span></li>`).join('')}</ol>
    <div><form id="lt-busca" class="b2-linha"><input name="busca" value="${esc(LT.busca)}" placeholder="Buscar na loja pelo título ou código"><button class="b claro">Buscar</button></form>
      <div class="tf-lista lt-lista">${LT.lista === null ? '<p class="pequeno">Carregando os anúncios da loja…</p>' : LT.lista.length ? LT.lista.map(x => { const usado = LT.pares.findIndex(p => p.alvo?.id === x.id); return `<button type="button" class="tf-item ${usado >= 0 ? 'escolhido' : ''}" data-lt-alvo="${esc(x.id)}">${x.foto ? `<img src="${esc(x.foto)}" alt="" onerror="this.style.visibility='hidden'">` : '<span class="tf-semfoto"></span>'}<span><b>${esc(x.titulo)}</b><small>${esc(x.id)}${x.preco ? ' · R$ ' + esc(x.preco) : ''}${usado >= 0 ? ' · ← ' + esc(nomeAd(LT.pares[usado].aid)) : ''}</small></span></button>`; }).join('') : '<p class="pequeno">Nada encontrado.</p>'}</div></div></div>`}
    <p class="pequeno">Muda só as fotos${ltLoja()?.canal === 'shopee' ? ' (as 9 do anúncio e a capa de cada cor)' : ltLoja() ? ' (as fotos de cada cor)' : ''}. Título, preço, descrição e estoque ficam como estão. Primeiro simula; nada muda até você confirmar.</p>
    <div class="acoes"><button class="b verde" id="lt-simular" ${prontos && LT.loja ? '' : 'disabled'}>Simular ${prontos || ''} troca(s)</button><button class="b claro" data-fechar>Cancelar</button></div>`);
  if (LT.loja && LT.lista === null) ltBuscar();
}
// cada anuncio da loja ganha uma capa diferente: primeiro as que nunca subiram, depois as ja publicadas
function ltDistribuir() {
  if (!LT.capas) return;
  const ordem = [...LT.capas].sort((a, b) => (a.publicada - b.publicada) || (a.em_anuncio - b.em_anuncio));
  const usadas = new Set(LT.pares.map(p => p.capa).filter(Boolean));
  LT.pares.forEach(p => { if (p.alvo && !p.capa) { const c = ordem.find(x => !usadas.has(x.id)); if (c) { p.capa = c.id; usadas.add(c.id); } } });
}
function ltEscolherCapa(i) {
  const p = LT.pares[i], usadas = new Set(LT.pares.filter((x, j) => j !== i).map(x => x.capa));
  const fundo = document.createElement('div'); fundo.className = 'troca-capa-fundo';
  fundo.innerHTML = `<div class="troca-capa"><div class="tc-cab"><h3>Capa para <b>${esc(p.alvo.titulo.slice(0, 50))}</b> <small>clique para escolher</small></h3><button type="button" class="b claro mini" data-tc-fechar>Fechar</button></div>
    <div class="tc-grade">${(LT.capas || []).map(c => `<button type="button" class="tc-foto ${c.id === p.capa ? 'atual' : ''}" data-tc-img="${c.id}" ${usadas.has(c.id) ? 'title="Já escolhida para outro anúncio desta troca"' : ''}><img loading="lazy" src="/mini/${c.id}" alt="">${c.id === p.capa ? '<em>esta</em>' : usadas.has(c.id) ? '<em class="tc-ja">em outro</em>' : c.publicada ? '<em class="tc-ja">já publicada</em>' : ''}<small class="tc-cor">${esc(c.cor || '')}</small></button>`).join('') || '<p class="pequeno">Nenhuma capa aprovada deste produto.</p>'}</div></div>`;
  document.body.appendChild(fundo);
  fundo.addEventListener('click', ev => {
    if (ev.target === fundo || ev.target.closest('[data-tc-fechar]')) return fundo.remove();
    const f = ev.target.closest('[data-tc-img]'); if (!f) return;
    p.capa = +f.dataset.tcImg; if (LT.res) delete LT.res[p.k]; fundo.remove(); ltJanela();
  });
}
async function ltBuscar() {
  const loja = LT.loja;
  try { const r = await SRV.anunciosLoja(loja, LT.busca, 1, false); if (loja !== LT.loja) return; LT.lista = r.anuncios || []; } catch (err) { LT.lista = []; window.menork.aviso(err.message); }
  if (document.getElementById('lt-simular')) ltJanela();
}
async function ltSimular(manter) {
  const l = ltLoja(), pares = LT.pares.filter(p => p.alvo), nomeAd = aid => DB.anuncios.find(a => a.id === aid)?.nome || '#' + aid;
  LT.res = LT.res && manter ? LT.res : {};
  for (let i = 0; i < pares.length; i++) {
    const p = pares[i]; b2Carregando(`Simulando ${i + 1} de ${pares.length}: ${nomeAd(p.aid)}… (sobe as fotos, pode levar um minuto)`);
    const r = LT.res[p.k] = LT.res[p.k] || {};
    try {
      if (!r.cores) { const d = await b2get(`/api/b2x/anuncio?loja=${encodeURIComponent(l.id)}&anuncio=${encodeURIComponent(p.alvo.id)}&canal=${l.canal}`); r.cores = d.cores; r.familia = d.familia;
        r.nossas = (await b2get('/api/anuncios/' + p.aid)).variacoes.map(v => v.cor);
        r.mapa = Object.fromEntries(r.cores.map(c => [c, r.nossas.find(x => semAc(x) === semAc(c)) || ''])); }
      const mapa = Object.fromEntries(Object.entries(r.mapa).filter(([, v]) => v));
      const outra = l.canal === 'shopee' && LT.galeria && LT.capaModo === 'outra';
      if (outra && !p.capa) throw new Error('Escolha uma capa para este anúncio (ou mude para "manter a que cada anúncio já tem").');
      const s = await b2post('/api/b2x/fotos/simular', { aid: p.aid, loja: l.id, anuncio: p.alvo.id, canal: l.canal, mapa, galeria: l.canal === 'shopee' && LT.galeria, trocar_cores: LT.cores, ajustar_modo: true, manter_capa_loja: LT.capaModo === 'manter', capa_img: outra ? p.capa : null });
      Object.assign(r, { token: s.token, envios: s.envios, ok: s.pode_confirmar, erro: '' });
    } catch (err) { Object.assign(r, { token: null, ok: false, erro: err.message }); }
  }
  ltResultado();
}
function ltResultado(final) {
  const pares = LT.pares.filter(p => p.alvo), nomeAd = aid => DB.anuncios.find(a => a.id === aid)?.nome || '#' + aid;
  const okN = pares.filter(p => LT.res[p.k]?.ok).length;
  b2Tela(`<h2>${final ? 'Resultado' : 'Simulação'} <small>${final ? '' : 'nada foi trocado ainda'}</small></h2>
    <div class="lt-res">${pares.map(p => { const r = LT.res[p.k] || {}, sem = LT.cores ? (r.cores || []).filter(c => !r.mapa?.[c]) : [];
      return `<div class="nota ${(final ? r.feito : r.ok) ? '' : 'ruim'}"><b>${esc(nomeAd(p.aid))} → ${esc(p.alvo.titulo.slice(0, 50))} (${esc(p.alvo.id)}): ${final ? (r.feito ? 'fotos trocadas' : 'não trocado') : r.ok ? 'pronto' : 'não dá para trocar'}</b>
        ${r.erro ? `<span>${esc(r.erro)}</span>` : ''}${(final ? r.final || [] : r.envios || []).filter(e => !e.ok && e.erro).map(e => `<span>${esc(e.rotulo)}: ${esc(e.erro)}</span>`).join('')}
        ${!final && sem.length ? `<span>Cores da loja sem par no site (ficam com as fotos antigas): ${sem.map(c => `<label class="lt-cor">${esc(c)} → <select data-lt-cor="${p.k}" data-cor="${esc(c)}"><option value="">não mexer</option>${(r.nossas || []).map(x => `<option>${esc(x)}</option>`).join('')}</select></label>`).join(' ')}</span>` : ''}</div>`; }).join('')}</div>
    <div class="acoes">${final ? '<button class="b" data-fechar>Fechar</button>' : `${okN ? `<button class="b verde" id="lt-confirmar">Confirmar e trocar ${okN} agora</button>` : ''}<button class="b claro" id="lt-resimular">Simular de novo</button><button class="b claro" id="lt-voltar">Voltar</button>`}</div>`);
}
async function ltConfirmar() {
  const pares = LT.pares.filter(p => p.alvo && LT.res[p.k]?.ok);
  for (let i = 0; i < pares.length; i++) {
    const r = LT.res[pares[i].k]; b2Carregando(`Trocando ${i + 1} de ${pares.length}…`);
    try { const f = await b2post('/api/b2x/fotos/confirmar', { token: r.token }); r.final = f.envios; r.feito = f.envios.some(e => e.ok); }
    catch (err) { r.feito = false; r.erro = err.message; }
  }
  ltResultado(true); SEL_AN.clear(); LT.pares = []; LT.res = LT.res; await SRV.carregar(); RENDER();
}
document.addEventListener('click', e => {
  if (e.target.closest('#trocar-lote')) return ltJanela();
  const est = e.target.closest('#estrutura-loja'); if (est) { SEL_AN.clear(); SEL_AN.add(+est.dataset.id); LT.pares = []; LT.capas = null; LT.capaModo = null; return ltJanela(); }
  if (e.target.closest('#lt-simular')) return ltSimular(false);
  if (e.target.closest('#lt-resimular')) return ltSimular(true);
  if (e.target.closest('#lt-confirmar')) return ltConfirmar();
  if (e.target.closest('#lt-voltar')) return ltJanela();
  const lc = e.target.closest('[data-lt-capa]'); if (lc) { e.stopPropagation(); return ltEscolherCapa(+lc.dataset.ltCapa); }
  const t = e.target.closest('[data-lt-tirar]'); if (t) { e.stopPropagation(); LT.pares[+t.dataset.ltTirar].alvo = null; LT.ativo = +t.dataset.ltTirar; return ltJanela(); }
  const a = e.target.closest('[data-lt-ativo]'); if (a) { LT.ativo = +a.dataset.ltAtivo; return ltJanela(); }
  const al = e.target.closest('[data-lt-alvo]'); if (al) {
    const x = LT.lista.find(i => i.id === al.dataset.ltAlvo); if (!x) return;
    if (ltModelo()) {  // a mesma estrutura vai para varios anuncios da loja: clicar liga e desliga
      const ja = LT.pares.findIndex(p => p.alvo?.id === x.id);
      if (ja >= 0) { if (LT.pares.length > 1) LT.pares.splice(ja, 1); else LT.pares[ja].alvo = null; }
      else { const livre = LT.pares.find(p => !p.alvo); if (livre) livre.alvo = x; else LT.pares.push({ k: ++LT.seq, aid: LT.pares[0].aid, alvo: x }); }
      LT.res = null; ltDistribuir(); return ltJanela();
    }
    LT.pares.forEach(p => { if (p.alvo?.id === x.id) p.alvo = null; });
    LT.pares[LT.ativo].alvo = x; if (LT.res) delete LT.res[LT.pares[LT.ativo].k];
    const prox = LT.pares.findIndex(p => !p.alvo); if (prox >= 0) LT.ativo = prox;
    return ltJanela();
  }
});
document.addEventListener('change', e => {
  if (e.target.id === 'lt-galeria') { LT.galeria = e.target.checked; LT.res = null; return ltJanela(); }
  if (e.target.id === 'lt-cores') { LT.cores = e.target.checked; LT.res = null; return ltJanela(); }
  if (e.target.name === 'lt-capa') { LT.capaModo = e.target.value; LT.res = null; ltDistribuir(); return ltJanela(); }
  if (e.target.id === 'lt-loja') { LT.loja = e.target.value; LT.lista = null; LT.busca = ''; LT.pares.forEach(p => p.alvo = null); LT.res = null; LT.ativo = 0; return ltJanela(); }
  const c = e.target.closest('[data-lt-cor]'); if (c) { const r = LT.res[+c.dataset.ltCor]; if (r) r.mapa[c.dataset.cor] = c.value; }
});
document.addEventListener('submit', e => { if (e.target.id !== 'lt-busca') return; e.preventDefault(); LT.busca = e.target.busca.value.trim(); LT.lista = null; ltJanela(); });
document.addEventListener('click', e => {
  const b = e.target.closest('.fundo-escolha [data-fundo]'); if (!b) return;
  try { localStorage.setItem('fundo_v2', b.dataset.fundo); } catch (_) {}
  location.reload();
});

// ---- Anúncios criados: tudo que foi mandado para as lojas (por você ou pelo Grok), com o status, para conferir
const CR_H = { lista: null, filtro: 'todos', conferindo: new Set() };
const CR_ST = { criado: ['ok', 'Criado'], na_fila: ['espera', 'Na fila do marketplace'], criando: ['espera', 'Criando'], erro: ['ruim', 'Não subiu'],
  cancelado: ['ruim', 'Cancelado'], esperando_grok: ['espera', 'Esperando o Grok'], grok_fazendo: ['espera', 'Grok fazendo'], grok_terminou: ['aviso', 'Grok terminou (sem criação registrada)'] };
async function crhCarregar() { try { CR_H.lista = (await b2get('/api/criacoes')).criacoes; } catch (err) { CR_H.lista = []; window.menork.aviso(err.message); } if (ROTA.startsWith('/criados')) RENDER(); }
async function crhConferir(id) {
  CR_H.conferindo.add(id); RENDER();
  try { const r = await b2post(`/api/criacoes/${id}/conferir`, {}); const i = CR_H.lista.findIndex(x => x.id === id); if (i >= 0) CR_H.lista[i] = r; }
  catch (err) { window.menork.aviso(err.message); }
  CR_H.conferindo.delete(id); RENDER();
}
Object.assign(TELAS, {
  criados() {
    if (!CR_H.lista) { crhCarregar(); return '<div class="cabeca"><h1>Anúncios criados</h1></div><p class="pequeno">Carregando…</p>'; }
    const lojaNome = id => { const l = (typeof todasLojas === 'function' && LOJAS.clientes) ? todasLojas().find(x => x.id === id) : null; return l ? `${l.cliente} · ${l.nome}` : id; };
    if (!LOJAS.clientes && typeof carregarLojas === 'function' && !LOJAS.carregando) carregarLojas().then(() => ROTA.startsWith('/criados') && RENDER());
    const grupo = r => ({ criado: 'ok', erro: 'ruim', cancelado: 'ruim' }[r.status] || 'espera');
    const conta = { todos: CR_H.lista.length, ok: 0, espera: 0, ruim: 0, promo: 0 }; CR_H.lista.forEach(r => { conta[grupo(r)]++; if (r.falta_promo) conta.promo++; });
    const l = CR_H.lista.filter(r => CR_H.filtro === 'todos' || (CR_H.filtro === 'promo' ? r.falta_promo : grupo(r) === CR_H.filtro));
    const mk = c => ({ shopee: 'Shopee', mercadolivre: 'Mercado Livre', tiktokshop: 'TikTok' }[c] || c || '');
    return `<div class="cabeca"><h1>Anúncios criados <small>tudo que foi mandado para as lojas, por você ou pelo Grok</small></h1><div class="acoes"><button class="b claro" id="crh-atualizar">Atualizar</button></div></div>
      <div class="crh-filtros">${[['todos', 'Todos'], ['ok', 'Criados'], ['espera', 'Esperando'], ['ruim', 'Não subiram'], ['promo', 'Falta promoção']].map(([k, n]) => `<button type="button" data-crh-filtro="${k}" class="${CR_H.filtro === k ? 'ativo' : ''}">${n} <b>${conta[k]}</b></button>`).join('')}</div>
      ${l.length ? `<div class="bloco crh"><table class="tabela crh-tabela"><tr><th>Quando</th><th>Anúncio</th><th>Loja</th><th>Quem</th><th>Status</th><th></th></tr>
      ${l.map(r => { const [cls, txt] = CR_ST[r.status] || ['aviso', r.status || '?']; const ids = (r.anuncio_ids || '').split(',').filter(Boolean);
        return `<tr><td class="pequeno">${esc((r.quando || '').replace('T', ' ').slice(0, 16))}</td>
          <td><b>${esc(r.anuncio_nome || r.titulo || '—')}</b>${r.titulo && r.anuncio_nome ? `<small class="crh-sub">${esc(r.titulo.slice(0, 70))}</small>` : ''}${ids.length ? `<small class="crh-sub">Código: ${ids.map(esc).join(', ')}</small>` : ''}</td>
          <td>${esc(lojaNome(r.loja))}<small class="crh-sub">${esc(mk(r.canal))}</small></td><td class="pequeno">${esc(r.por || '')}</td>
          <td><span class="crh-st crh-${cls}">${txt}</span>${r.situacao_loja ? `<small class="crh-sub">Na loja: ${esc(r.situacao_loja)}</small>` : ''}${r.falta_promo ? `<small class="crh-sub crh-falta">Falta a promoção: subiu com o preço cheio. Promo: ${esc(reais(r.falta_promo))}</small>` : r.promo_feita ? `<small class="crh-sub">Na promoção: ${esc(r.promo_feita)}</small>` : ''}${r.mensagem ? `<small class="crh-sub crh-msg" title="${esc(r.mensagem)}">${esc(r.mensagem.slice(0, 140))}</small>` : ''}</td>
          <td><div class="crh-acoes">${r.falta_promo && ids.length ? `<button class="b verde mini" data-promo-shp="${esc(ids[0])}" data-loja="${esc(r.loja)}" data-preco="${esc(r.falta_promo)}" data-aid="${esc(r.anuncio_id || '')}">Colocar na promoção</button>` : ''}${typeof r.id === 'number' ? `<button class="b claro mini" data-crh-conferir="${r.id}" ${CR_H.conferindo.has(r.id) ? 'disabled' : ''}>${CR_H.conferindo.has(r.id) ? 'Conferindo…' : 'Conferir agora'}</button>` : ''}${r.url ? `<a class="b claro mini" href="${esc(r.url)}" target="_blank" rel="noopener">Abrir na loja</a>` : ''}${r.anuncio_id ? `<a class="b claro mini" href="#" data-rota="/anuncios/${r.anuncio_id}">Ver no site</a>` : ''}</div></td></tr>`; }).join('')}</table></div>`
      : `<div class="vazio"><h2>${CR_H.lista.length ? 'Nada neste filtro' : 'Nenhum anúncio criado ainda'}</h2><p>Os anúncios que você ou o Grok mandarem para as lojas aparecem aqui, com o status.</p></div>`}
      <p class="pequeno">"Conferir agora" pergunta ao B2X: se está na fila, o andamento; se já foi criado, a situação do anúncio na loja (ativo, em análise, pausado…). Os que você criou pelo site antes desta versão não aparecem; os pedidos ao Grok aparecem todos.</p>`;
  }
});
document.addEventListener('click', e => {
  const f = e.target.closest('[data-crh-filtro]'); if (f) { CR_H.filtro = f.dataset.crhFiltro; return RENDER(); }
  const c = e.target.closest('[data-crh-conferir]'); if (c) return crhConferir(+c.dataset.crhConferir);
  if (e.target.closest('#crh-atualizar')) { CR_H.lista = null; RENDER(); }
});
document.addEventListener('click', e => {
  const b = e.target.closest('.tema-escolha [data-tema]'); if (!b) return;
  try { localStorage.setItem('tema', b.dataset.tema); } catch (_) {}
  location.reload();
});

// ---- ClickUp dentro do site: árvore de listas, quadro por status, detalhe da tarefa. Toda mudança pede confirmação; nada é apagado.
const CK = { arvore: null, erro: '', lista: (() => { try { return localStorage.getItem('ck_lista') || ''; } catch (_) { return ''; } })(), dados: null, carregando: false,
  modo: (() => { try { return localStorage.getItem('ck_modo') || 'lista'; } catch (_) { return 'lista'; } })(), busca: '', aberta: null, tarefa: null, fechadas: true, recolhidos: new Set(), semArvore: (() => { try { return !!localStorage.getItem('ck_sem_arvore'); } catch (_) { return false; } })(), novaEm: null, arrastando: null, confirmar: null };
const ckData = ms => ms ? new Date(+ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
const ckPri = { urgent: ['Urgente', '#f50000'], high: ['Alta', '#ffcc00'], normal: ['Normal', '#6fddff'], low: ['Baixa', '#d8d8d8'] };
async function ckArvore(atualizar) {
  try { CK.arvore = await b2get('/api/clickup/arvore' + (atualizar ? '?atualizar=1' : '')); CK.erro = ''; } catch (err) { CK.erro = err.message; CK.arvore = { workspaces: [] }; }
  if (!CK.lista) { const l = CK.arvore.workspaces.flatMap(w => w.espacos.flatMap(e => [...e.listas, ...e.pastas.flatMap(f => f.listas)]))[0]; if (l) CK.lista = l.id; }
  if (ROTA.startsWith('/clickup')) { RENDER(); if (CK.lista && !CK.dados) ckLista(CK.lista); }
}
async function ckLista(id) {
  CK.lista = id; CK.carregando = true; try { localStorage.setItem('ck_lista', id); } catch (_) {}
  if (ROTA.startsWith('/clickup')) RENDER();
  try { CK.dados = await b2get(`/api/clickup/lista/${encodeURIComponent(id)}?fechadas=${CK.fechadas ? 1 : 0}`); CK.erro = ''; } catch (err) { CK.dados = null; CK.erro = err.message; }
  CK.carregando = false; if (ROTA.startsWith('/clickup')) RENDER();
}
async function ckAbrir(id) {
  CK.aberta = id; CK.tarefa = null; RENDER();
  try { CK.tarefa = await b2get('/api/clickup/tarefa/' + encodeURIComponent(id)); } catch (err) { CK.tarefa = { erro: err.message }; }
  if (CK.aberta === id) RENDER();
}
function ckAvatar(a) { return a.foto ? `<img class="ck-av" src="${esc(a.foto)}" alt="" title="${esc(a.nome)}">` : `<span class="ck-av" style="background:${esc(a.cor)}" title="${esc(a.nome)}">${esc(a.iniciais || (a.nome || '?').slice(0, 2).toUpperCase())}</span>`; }
function ckCartao(t) {
  const pr = ckPri[t.prioridade], atrasada = t.prazo && +t.prazo < Date.now() && !/complete|fechad|conclu|done/i.test(t.status);
  return `<div class="ck-cartao" draggable="true" data-ck-tarefa="${esc(t.id)}"><b>${esc(t.nome)}</b>
    ${t.etiquetas.length ? `<div class="ck-tags">${t.etiquetas.slice(0, 3).map(g => `<span style="background:${esc(g.cor)}">${esc(g.nome)}</span>`).join('')}</div>` : ''}
    <div class="ck-rodape">${t.responsaveis.slice(0, 3).map(ckAvatar).join('')}<span class="ck-meta">${t.subtarefas ? `☰ ${t.subtarefas}` : ''}${t.prazo ? `<em class="${atrasada ? 'atrasada' : ''}">⏱ ${ckData(t.prazo)}</em>` : ''}${pr ? `<i style="color:${pr[1]}" title="Prioridade ${pr[0]}">⚑</i>` : ''}</span></div></div>`;
}
Object.assign(TELAS, {
  clickup() {
    if (!CK.arvore) { ckArvore(); return '<div class="cabeca"><h1>ClickUp</h1></div><p class="pequeno">Lendo o seu workspace no ClickUp…</p>'; }
    if (CK.lista && !CK.dados && !CK.carregando && !CK.erro) setTimeout(() => ckLista(CK.lista));
    const arvore = CK.arvore.workspaces.map(w => `<div class="ck-ws">${CK.arvore.workspaces.length > 1 ? `<h4>${esc(w.nome)}</h4>` : ''}${w.espacos.map(e => `<details class="ck-espaco" open><summary><i style="background:${esc(e.cor || '#7b68ee')}"></i>${esc(e.nome)}</summary>
      ${e.listas.map(l => `<a href="#" class="ck-li ${l.id === CK.lista ? 'ativa' : ''}" data-ck-lista="${esc(l.id)}">${esc(l.nome)}${l.tarefas != null ? `<small>${l.tarefas}</small>` : ''}</a>`).join('')}
      ${e.pastas.map(f => `<details class="ck-pasta" ${f.listas.some(l => l.id === CK.lista) ? 'open' : ''}><summary>${esc(f.nome)}</summary>${f.listas.map(l => `<a href="#" class="ck-li ${l.id === CK.lista ? 'ativa' : ''}" data-ck-lista="${esc(l.id)}">${esc(l.nome)}${l.tarefas != null ? `<small>${l.tarefas}</small>` : ''}</a>`).join('')}</details>`).join('')}</details>`).join('')}</div>`).join('');
    const d = CK.dados, q = semAc(CK.busca);
    const tarefas = d ? d.tarefas.filter(t => !q || semAc(t.nome + ' ' + t.etiquetas.map(g => g.nome).join(' ') + ' ' + t.responsaveis.map(a => a.nome).join(' ')).includes(q)) : [];
    let corpo = '';
    if (CK.erro === 'SEM_CHAVE') return `<div class="cabeca"><h1>ClickUp <small>ligue a sua conta uma vez</small></h1></div>
      <div class="bloco ck-ligar"><h2>Cole a sua chave pessoal do ClickUp</h2>
      <ol><li>Abra <a href="https://app.clickup.com/settings/apps" target="_blank" rel="noopener"><b>app.clickup.com/settings/apps</b></a> (ou: clique na sua foto no ClickUp › <b>Configurações</b> › <b>Apps</b>).</li><li>Em <b>API Token</b>, clique em <b>Generate</b> (Gerar). Se já tiver, clique em <b>Copy</b> (Copiar).</li><li>Cole aqui embaixo e clique em <b>Ligar</b>. Ela começa com <b>pk_</b>.</li></ol>
      <form class="ck-chave-form" data-ck-chave><input type="password" name="chave" placeholder="pk_..." autocomplete="off"><button class="b">Ligar</button></form>
      <p class="pequeno">A chave fica guardada só no seu PC (no banco do site). Não vai para o GitHub e não aparece na tela.</p></div>`;
    if (CK.erro) corpo = `<div class="nota ruim"><b>Não deu para ler o ClickUp</b><span>${esc(CK.erro)}</span></div>`;
    else if (!d) corpo = '<p class="pequeno">Carregando a lista…</p>';
    else if (CK.modo === 'quadro') {
      const cols = [...d.status]; tarefas.forEach(t => { if (!cols.some(c => c.nome === t.status)) cols.push({ nome: t.status, cor: t.cor }); });
      corpo = `<div class="ck-quadro">${cols.filter(c => CK.fechadas || c.tipo !== 'closed' || tarefas.some(t => t.status === c.nome)).map(c => { const ts = tarefas.filter(t => t.status === c.nome);
        return `<section class="ck-col" data-ck-col="${esc(c.nome)}"><header style="--c:${esc(c.cor)}"><span class="ck-st">${esc(c.nome)}</span><small>${ts.length}</small></header>
          <div class="ck-cartoes">${ts.map(ckCartao).join('')}</div>
          ${CK.novaEm === c.nome ? `<form class="ck-nova" data-ck-nova="${esc(c.nome)}"><input name="nome" placeholder="Nome da tarefa" autocomplete="off" autofocus><div class="acoes"><button class="b mini">Criar</button><button type="button" class="b claro mini" data-ck-cancelar-nova>Cancelar</button></div></form>`
            : `<button type="button" class="ck-add" data-ck-add="${esc(c.nome)}">+ Nova tarefa</button>`}</section>`; }).join('')}</div>`;
    } else {
      // igual à visão "Lista" do ClickUp: grupos por status (recolhíveis) e as mesmas colunas da visão
      const cols = d.colunas || [], grupos = [...d.status]; tarefas.forEach(t => { if (!grupos.some(c => c.nome === t.status)) grupos.push({ nome: t.status, cor: t.cor }); });
      // igual ao ClickUp: hoje / ontem / há N dias (até 6), depois 18/9/26
      const ckQuando = ms => { if (!ms) return '<span class="ck-vazio">–</span>'; const d = new Date(+ms), h = new Date(); h.setHours(0, 0, 0, 0); const dias = Math.round((h - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
        return dias <= 0 ? 'Hoje' : dias === 1 ? 'Ontem' : dias < 7 ? `há ${dias} dias` : `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`; };
      const ckLarg = c => Math.max(90, Math.min(320, +c.largura || 160));  // a mesma largura da coluna no ClickUp
      const pill = v => v.cor ? `<span class="ck-pill" style="--c:${esc(v.cor)}">${esc(v.texto)}</span>` : `<span class="ck-txt" title="${esc(v.texto)}">${esc(v.texto)}</span>`;
      const celula = (t, c) => {
        if (c.chave === 'priority') return ckPri[t.prioridade] ? `<span class="ck-prio"><i style="color:${ckPri[t.prioridade][1]}">⚑</i>${ckPri[t.prioridade][0]}</span>` : '<span class="ck-vazio">–</span>';
        if (c.chave === 'status') return `<span class="ck-st-cel" style="--c:${esc(t.cor)}"><i></i>${esc(t.status)}</span>`;
        if (c.chave === 'assignee') return t.responsaveis.map(ckAvatar).join('') || '<span class="ck-vazio">–</span>';
        if (c.chave === 'dueDate') return t.prazo ? `<span class="${+t.prazo < Date.now() ? 'ck-atrasada' : ''}">${ckData(t.prazo)}</span>` : '<span class="ck-vazio">–</span>';
        if (c.chave === 'dateUpdated') return ckQuando(t.atualizada);
        if (c.chave === 'dateCreated') return ckQuando(t.criada);
        if (c.chave === 'tag') return t.etiquetas.map(g => `<span class="ck-pill" style="--c:${esc(g.cor)}">${esc(g.nome)}</span>`).join('');
        const v = (t.campos || {})[c.chave] || []; if (!v.length) return '<span class="ck-vazio">–</span>';
        return c.tipo === 'drop_down' && v[0].cor ? `<span class="ck-bloco" style="--c:${esc(v[0].cor)}">${esc(v[0].texto)}</span>` : v.map(pill).join('');
      };
      corpo = `<div class="ck-lista">${grupos.filter(g => tarefas.some(t => t.status === g.nome) || g.tipo !== 'closed').map(g => { const ts = tarefas.filter(t => t.status === g.nome), fechado = CK.recolhidos.has(g.nome);
        return `<section class="ck-grupo"><header><button type="button" class="ck-seta ${fechado ? 'fechado' : ''}" data-ck-recolher="${esc(g.nome)}">▾</button><span class="ck-st" style="--c:${esc(g.cor)}">${esc(g.nome)}</span><small>${ts.length}</small></header>
          ${fechado ? '' : `<div class="ck-rolagem"><table class="ck-tab" style="width:${360 + cols.reduce((t, c) => t + ckLarg(c), 0)}px"><thead><tr><th class="ck-nome">Name</th>${cols.map(c => `<th style="width:${ckLarg(c)}px;max-width:${ckLarg(c)}px">${esc(c.nome)}</th>`).join('')}</tr></thead><tbody>
          ${ts.map(t => `<tr data-ck-tarefa="${esc(t.id)}"><td class="ck-nome"><div class="ck-nome-in"><i class="ck-bola" style="background:${esc(t.cor)}"></i><b>${esc(t.nome)}</b>${t.subtarefas ? `<small class="ck-sub">☰ ${t.subtarefas}</small>` : ''}</div></td>${cols.map(c => `<td>${celula(t, c)}</td>`).join('')}</tr>`).join('')}
          </tbody></table></div>
          ${CK.novaEm === g.nome ? `<form class="ck-nova ck-nova-lista" data-ck-nova="${esc(g.nome)}"><input name="nome" placeholder="Nome da tarefa" autocomplete="off" autofocus><button class="b mini">Criar</button><button type="button" class="b claro mini" data-ck-cancelar-nova>Cancelar</button></form>`
            : `<button type="button" class="ck-add" data-ck-add="${esc(g.nome)}">+ Adicionar tarefa</button>`}`}</section>`; }).join('') || '<p class="pequeno">Nada encontrado.</p>'}</div>`;
    }
    const t = CK.tarefa;
    const painel = CK.aberta ? `<aside class="ck-painel">${!t ? '<p class="pequeno">Abrindo a tarefa…</p>' : t.erro ? `<div class="nota ruim"><span>${esc(t.erro)}</span></div>` : `
      <div class="ck-painel-cab"><button type="button" class="b claro mini" data-ck-fechar>✕ Fechar</button>${t.url ? `<a class="b claro mini" href="${esc(t.url)}" target="_blank" rel="noopener">Abrir no ClickUp</a>` : ''}</div>
      <h2>${esc(t.nome)}</h2>
      <div class="ck-linha"><label>Status <select data-ck-status="${esc(t.id)}">${(d ? d.status : [{ nome: t.status }]).map(s => `<option ${s.nome === t.status ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
        ${t.responsaveis.length ? `<span class="ck-resp">${t.responsaveis.map(a => `${ckAvatar(a)} ${esc(a.nome)}`).join(' · ')}</span>` : ''}${t.prazo ? `<span class="pequeno">Prazo ${ckData(t.prazo)}</span>` : ''}</div>
      ${t.etiquetas.length ? `<div class="ck-tags">${t.etiquetas.map(g => `<span style="background:${esc(g.cor)}">${esc(g.nome)}</span>`).join('')}</div>` : ''}
      ${t.descricao ? `<div class="ck-desc">${esc(t.descricao).replace(/\n/g, '<br>')}</div>` : '<p class="pequeno">Sem descrição.</p>'}
      ${t.campos.length ? `<dl class="ck-campos">${t.campos.map(c => `<dt>${esc(c.nome)}</dt><dd>${(c.valores || []).map(v => v.cor ? `<span class="ck-pill" style="--c:${esc(v.cor)}">${esc(v.texto)}</span>` : esc(v.texto)).join(' ')}</dd>`).join('')}</dl>` : ''}
      <h3>Comentários <small class="pequeno">${t.comentarios.length}</small></h3>
      <form class="ck-comentar" data-ck-comentar="${esc(t.id)}"><textarea name="texto" rows="2" placeholder="Escreva um comentário"></textarea><button class="b mini">Comentar</button></form>
      <div class="ck-coments">${t.comentarios.map(c => `<div><b>${esc(c.quem)}</b> <small class="pequeno">${c.quando ? new Date(+c.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</small><p>${esc(c.texto)}</p></div>`).join('')}</div>`}</aside>` : '';
    const conf = CK.confirmar ? `<div class="ck-confirma"><div class="bloco"><h3>${esc(CK.confirmar.titulo)}</h3><p>${esc(CK.confirmar.texto)}</p><div class="acoes"><button class="b" data-ck-sim>Sim, mudar</button><button class="b claro" data-ck-nao>Cancelar</button></div></div></div>` : '';
    return `<div class="cabeca"><h1>ClickUp <small>${d ? `${esc([d.espaco, d.pasta].filter(Boolean).join(' › '))} › <b>${esc(d.nome)}</b> · ${d.tarefas.length} tarefa(s)` : 'o seu workspace aqui dentro'}</small></h1>
      <div class="acoes"><input class="ck-busca" placeholder="Buscar tarefa…" value="${esc(CK.busca)}" data-ck-busca><div class="ck-modo"><button type="button" data-ck-modo="lista" class="${CK.modo === 'lista' ? 'ativo' : ''}">☰ Lista</button><button type="button" data-ck-modo="quadro" class="${CK.modo === 'quadro' ? 'ativo' : ''}">▦ Quadro</button></div>
      <label class="pequeno ck-fech"><input type="checkbox" data-ck-fechadas ${CK.fechadas ? 'checked' : ''}> fechadas</label><button class="b claro" data-ck-atualizar>${CK.carregando ? 'Lendo…' : 'Atualizar'}</button></div></div>
      <div class="ck-grade ${CK.semArvore ? 'sem-arvore' : ''}"><button type="button" class="ck-recolhe" data-ck-arvore title="${CK.semArvore ? 'Mostrar as listas' : 'Esconder as listas e usar a tela toda'}">${CK.semArvore ? '»' : '«'}</button><nav class="ck-arvore">${arvore || '<p class="pequeno">Nenhuma lista.</p>'}</nav><div class="ck-centro">${corpo}</div></div>${painel}${conf}`;
  }
});
function ckPerguntar(titulo, texto, fazer) { CK.confirmar = { titulo, texto, fazer }; RENDER(); }
async function ckMudarStatus(id, status) {
  const t = CK.dados?.tarefas.find(x => x.id === id); if (!t || t.status === status) return;
  ckPerguntar('Mudar o status no ClickUp?', `"${t.nome}": ${t.status} → ${status}`, async () => {
    try { const r = await b2post(`/api/clickup/tarefa/${encodeURIComponent(id)}/status`, { status }); Object.assign(t, r); if (CK.tarefa?.id === id) Object.assign(CK.tarefa, { status: r.status, cor: r.cor }); window.menork.aviso('Status mudado no ClickUp.'); }
    catch (err) { window.menork.aviso(err.message); }
    RENDER();
  });
}
document.addEventListener('click', e => {
  if (!ROTA.startsWith('/clickup')) return;
  const l = e.target.closest('[data-ck-lista]'); if (l) { e.preventDefault(); CK.dados = null; CK.aberta = null; return ckLista(l.dataset.ckLista); }
  const m = e.target.closest('[data-ck-modo]'); if (m) { CK.modo = m.dataset.ckModo; try { localStorage.setItem('ck_modo', CK.modo); } catch (_) {} return RENDER(); }
  if (e.target.closest('[data-ck-arvore]')) { CK.semArvore = !CK.semArvore; try { localStorage.setItem('ck_sem_arvore', CK.semArvore ? '1' : ''); } catch (_) {} return RENDER(); }
  const rc = e.target.closest('[data-ck-recolher]'); if (rc) { const g = rc.dataset.ckRecolher; CK.recolhidos.has(g) ? CK.recolhidos.delete(g) : CK.recolhidos.add(g); return RENDER(); }
  if (e.target.closest('[data-ck-atualizar]')) { CK.arvore = null; CK.dados = null; return ckArvore(true); }
  if (e.target.closest('[data-ck-fechar]')) { CK.aberta = null; CK.tarefa = null; return RENDER(); }
  if (e.target.closest('[data-ck-sim]')) { const f = CK.confirmar?.fazer; CK.confirmar = null; RENDER(); return f && f(); }
  if (e.target.closest('[data-ck-nao]')) { CK.confirmar = null; return RENDER(); }
  const a = e.target.closest('[data-ck-add]'); if (a) { CK.novaEm = a.dataset.ckAdd; RENDER(); return document.querySelector('.ck-nova input')?.focus(); }
  if (e.target.closest('[data-ck-cancelar-nova]')) { CK.novaEm = null; return RENDER(); }
  const t = e.target.closest('[data-ck-tarefa]'); if (t && !e.target.closest('a')) return ckAbrir(t.dataset.ckTarefa);
});
document.addEventListener('input', e => { const b = e.target.closest('[data-ck-busca]'); if (!b) return; CK.busca = b.value; const pos = b.selectionStart; RENDER(); const n = document.querySelector('[data-ck-busca]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } });
document.addEventListener('change', e => {
  if (e.target.matches('[data-ck-fechadas]')) { CK.fechadas = e.target.checked; CK.dados = null; return ckLista(CK.lista); }
  const s = e.target.closest('[data-ck-status]'); if (s) { const v = s.value; s.value = CK.tarefa?.status || v; return ckMudarStatus(s.dataset.ckStatus, v); }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.matches('[data-ck-nova]')) { e.preventDefault(); const nome = f.nome.value.trim(), status = f.dataset.ckNova; if (!nome) return;
    return ckPerguntar('Criar a tarefa no ClickUp?', `"${nome}" na lista ${CK.dados?.nome || ''}, status ${status}`, async () => {
      try { const r = await b2post(`/api/clickup/lista/${encodeURIComponent(CK.lista)}/tarefa`, { nome, status }); CK.dados.tarefas.unshift(r); CK.novaEm = null; window.menork.aviso('Tarefa criada no ClickUp.'); }
      catch (err) { window.menork.aviso(err.message); }
      RENDER(); }); }
  if (f.matches('[data-ck-chave]')) { e.preventDefault(); const chave = f.chave.value.trim(); f.querySelector('button').disabled = true;
    return b2post('/api/clickup/chave', { chave }).then(r => { window.menork.aviso('ClickUp ligado' + (r.usuario ? ': ' + r.usuario : '') + '.'); CK.erro = ''; CK.arvore = null; CK.dados = null; RENDER(); })
      .catch(err => { window.menork.aviso(err.message); f.querySelector('button').disabled = false; }); }
  if (f.matches('[data-ck-comentar]')) { e.preventDefault(); const texto = f.texto.value.trim(); if (!texto) return; const id = f.dataset.ckComentar;
    f.querySelector('button').disabled = true;
    b2post(`/api/clickup/tarefa/${encodeURIComponent(id)}/comentario`, { texto }).then(() => { window.menork.aviso('Comentário enviado.'); return ckAbrir(id); }).catch(err => { window.menork.aviso(err.message); f.querySelector('button').disabled = false; }); }
});
document.addEventListener('dragstart', e => { const c = e.target.closest?.('.ck-cartao'); if (!c) return; CK.arrastando = c.dataset.ckTarefa; c.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragend', () => { document.querySelectorAll('.ck-cartao.arrastando,.ck-col.alvo').forEach(x => x.classList.remove('arrastando', 'alvo')); });
document.addEventListener('dragover', e => { const col = e.target.closest?.('[data-ck-col]'); if (!col || !CK.arrastando) return; e.preventDefault(); document.querySelectorAll('.ck-col.alvo').forEach(x => x !== col && x.classList.remove('alvo')); col.classList.add('alvo'); });
document.addEventListener('drop', e => { const col = e.target.closest?.('[data-ck-col]'); if (!col || !CK.arrastando) return; e.preventDefault(); const id = CK.arrastando; CK.arrastando = null; col.classList.remove('alvo'); ckMudarStatus(id, col.dataset.ckCol); });

(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const prazo = +document.body.dataset.desfazer || 60;

  async function api(url, corpo, formulario) {
    const r = await fetch(url, formulario ? { method: 'POST', body: corpo } :
      { method: corpo ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined });
    if (r.status === 401) { location.href = '/entrar'; throw new Error('sessão'); }
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || e.erro || 'Não deu certo.'); }
    return r.json();
  }



  // ---- avisos
  let relogio;
  function aviso(texto, botao, aoClicar, segundos = 6) {
    const a = $('#aviso'); a.textContent = texto; a.hidden = false;
    if (botao) { const b = document.createElement('button'); b.textContent = botao; b.onclick = () => { a.hidden = true; aoClicar(); }; a.append(b); }
    clearTimeout(relogio); relogio = setTimeout(() => a.hidden = true, segundos * 1000);
  }

  // ---- decidir (aprovar / reprovar)
  const cartao = id => $(`.cartao[data-id="${id}"]`);
  const ROTULO = { aprovada: 'Aprovada', conferencia: 'Em conferência', gerada: 'Falta classificar' };
  function pintar(id, status) {
    const c = cartao(id); if (!c) return;
    c.dataset.status = status;
    const e = $('.etiqueta', c); if (e) { e.className = 'etiqueta s-' + status; e.textContent = ROTULO[status] || status; }
  }
  async function decidir(ids, acao, motivo) {
    if (acao === 'reprovar' && !motivo) { motivo = await window.PEDIR_MOTIVO(ids.length); if (!motivo) return false; }
    try { await api('/api/acao', { ids, acao, motivo }); } catch (e) { return aviso(e.message); }
    const some = acao === 'reprovar' || ids.some(id => cartao(id)?.closest('[data-some-ao-decidir]'));
    const guardados = ids.map(id => cartao(id)).filter(Boolean);
    guardados.forEach(c => { c.classList.remove('marcado'); $('input', c).checked = false; });
    if (some) guardados.forEach(c => c.hidden = true); else ids.forEach(id => pintar(id, 'aprovada'));
    atualizarBarra(); document.dispatchEvent(new Event('menork:mudou'));
    const n = ids.length, s = n > 1 ? 's' : '';
    if (acao === 'reprovar') {
      aviso(`${n} reprovada${s}. Será apagada de vez em ${prazo}s.`, 'Desfazer', async () => {
        await api('/api/acao', { ids, acao: 'desfazer' }); document.dispatchEvent(new Event('menork:mudou')); guardados.forEach(c => c.hidden = false); aviso('Reprovação desfeita.');
      }, Math.min(prazo - 5, 30));
    } else aviso(`${n} aprovada${s}.`);
  }

  // ---- seleção em lote
  const marcados = () => $$('.cartao.marcado:not([hidden])').map(c => +c.dataset.id);
  function atualizarBarra() {
    const b = $('#barra'); if (!b) return;
    const n = marcados().length; b.hidden = n === 0; document.body.classList.toggle('selecionando', n > 0); $('#barra-qtd').textContent = n;
    const t = $('#selecionar-tudo'), vis = $$('.cartao[data-id]:not([hidden])').length;
    if (t) t.textContent = vis && n >= vis ? 'Desmarcar tudo' : 'Selecionar tudo';
  }
  // Shift: marca todas entre a ultima clicada e esta (como no Windows)
  let ultimoMarcado = null;
  function marcar(c, sim) { $('.marca input', c).checked = sim; c.classList.toggle('marcado', sim); }
  function marcarFaixa(c) {
    const todos = $$('.cartao[data-id]:not([hidden])'), a = todos.findIndex(x => x.dataset.id === ultimoMarcado), b = todos.indexOf(c);
    if (a < 0 || b < 0) return false;
    todos.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => marcar(x, true)); return true;
  }
  document.addEventListener('click', e => {
    const cx = e.target.closest('.marca input'); if (!cx) return;
    const c = cx.closest('.cartao');
    if (e.shiftKey && cx.checked && marcarFaixa(c)) { atualizarBarra(); }
    ultimoMarcado = c.dataset.id;
  }, true);
  document.addEventListener('change', e => {
    if (!e.target.matches('.marca input')) return;
    e.target.closest('.cartao').classList.toggle('marcado', e.target.checked); atualizarBarra();
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('#selecionar-tudo'); if (!b) return;
    const todos = $$('.cartao[data-id]:not([hidden])'), tudo = todos.length && todos.every(c => c.classList.contains('marcado'));
    todos.forEach(c => marcar(c, !tudo)); atualizarBarra();
  });
  $('#barra-todas')?.addEventListener('click', () => { $$('.cartao[data-id]:not([hidden])').forEach(c => { c.classList.add('marcado'); $('input', c).checked = true; }); atualizarBarra(); });
  $('#barra-limpar')?.addEventListener('click', () => { $$('.cartao.marcado').forEach(c => { c.classList.remove('marcado'); $('input', c).checked = false; }); atualizarBarra(); });
  $$('[data-lote]').forEach(b => b.addEventListener('click', async () => {
    const ids = marcados(), acao = b.dataset.lote; if (!ids.length) return;
    if (acao === 'excluir') {
      if (!b.dataset.ok) { b.dataset.ok = 1; b.textContent = `Confirmar: excluir ${ids.length}`; b.classList.add('vermelho'); b.classList.remove('claro');
        setTimeout(() => { if (b.dataset.ok) { delete b.dataset.ok; b.textContent = 'Excluir'; b.classList.remove('vermelho'); b.classList.add('claro'); } }, 6000); return; }
      delete b.dataset.ok; b.textContent = 'Excluindo…';
      try { await api('/api/acao', { ids, acao: 'excluir' }); RENDER(); aviso(`${ids.length} imagem(ns) excluída(s) de vez.`); }
      catch (e) { b.textContent = 'Excluir'; aviso(e.message); }
      return;
    }
    if (acao === 'ref_sim' || acao === 'ref_nao') {
      const aprovadas = ids.filter(id => cartao(id)?.dataset.status === 'aprovada');
      if (!aprovadas.length) return aviso('Só imagem aprovada pode virar referência. Aprove primeiro.');
      try { await api('/api/acao', { ids: aprovadas, acao });
        const msg = `${aprovadas.length} imagem(ns) ${acao === 'ref_sim' ? 'agora são referência dos bots' : 'saíram das referências'}.` + (aprovadas.length < ids.length ? ` ${ids.length - aprovadas.length} não aprovada(s) ficaram de fora.` : '');
        await RENDER(); aviso(msg, null, null, 8); } catch (e) { aviso(e.message); }
      return;
    }
    if (acao !== 'classificar') return decidir(ids, acao);
    const d = { ids, acao, produto: $('#l-produto').value, cor: $('#l-cor').value, tipo: $('#l-tipo').value, anuncio: $('#l-anuncio').value };
    const estilo = ($('#l-estilo')?.value || '').trim();
    if (!d.produto && !d.cor && !d.tipo && !d.anuncio && !estilo) return aviso('Preencha produto, cor, tipo, anúncio ou estilo antes de aplicar.');
    try {
      if (d.produto || d.cor || d.tipo || d.anuncio) await api('/api/acao', d);
      if (estilo) await api('/api/acao', { ids, acao: 'estilo', estilo });
      RENDER();
    } catch (e) { aviso(e.message); }
  }));

  // ---- visor
  const visor = $('#visor'); let atual = null;
  const visiveis = () => $$('.cartao[data-id]:not([hidden])').map(c => +c.dataset.id);
  document.addEventListener('click', e => {
    const c = e.target.closest('.cartao[data-id]');
    if (!c || e.target.closest('.marca')) return;
    if (marcados().length || e.ctrlKey || e.metaKey || e.shiftKey) {  // selecionando: clicar no cartao marca/desmarca
      if (e.shiftKey && ultimoMarcado && marcarFaixa(c)) { ultimoMarcado = c.dataset.id; window.getSelection()?.removeAllRanges(); atualizarBarra(); return; }
      const caixa = $('.marca input', c); marcar(c, !caixa.checked); ultimoMarcado = c.dataset.id; atualizarBarra(); return;
    }
    abrir(+c.dataset.id);
  });
  async function abrir(id) {
    let d; try { d = await api('/api/imagens/' + id); } catch (e) { return aviso(e.message); }
    atual = d; visor.hidden = false;
    $('#v-img').src = GRANDE(id);
    $('#v-titulo').textContent = [d.produto, d.cor, d.tipo_nome].filter(Boolean).join(' · ') || 'Imagem';
    $('#v-arquivo').textContent = `${d.nome_original} · ${d.largura}×${d.altura} · entrou em ${d.criado_em}`;
    const st = $('#v-status'); st.className = 'etiqueta s-' + d.status; st.textContent = d.status_nome;
    $('#v-produto').value = d.produto; $('#v-cor').value = d.cor; $('#v-tipo').value = d.tipo; $('#v-anuncio').value = '';
    $('#v-anuncios').innerHTML = '';
    d.anuncios.forEach(a => {
      const s = document.createElement('span'); s.textContent = a.nome;
      const x = document.createElement('button'); x.textContent = '×'; x.title = 'Tirar deste anúncio';
      x.onclick = async () => { await api('/api/acao', { ids: [id], acao: 'desvincular', anuncio_id: a.id }); document.dispatchEvent(new Event('menork:mudou')); abrir(id); };
      s.append(x); $('#v-anuncios').append(s);
    });
    const fbs = d.tipo === 'fb' ? [] : d.fundo_branco;
    $('#v-fb-bloco').hidden = !fbs.length; $('.visor-fotos').classList.toggle('sozinha', !fbs.length);
    const op = $('#v-fb-opcoes'); op.innerHTML = '';
    const mostrar = f => { $('#v-fb').src = GRANDE(f.id); $('#v-fb-cor').textContent = f.cor ? '· ' + f.cor : ''; $$('img', op).forEach(i => i.classList.toggle('ativo', +i.dataset.id === f.id)); };
    if (fbs.length > 1) fbs.forEach(f => { const i = document.createElement('img'); i.src = IMG(f.id); i.dataset.id = f.id; i.title = f.cor; i.onclick = () => mostrar(f); op.append(i); });
    if (fbs.length) mostrar(fbs[0]);
    $('#v-aprovar').hidden = d.status === 'aprovada'; $('#v-reprovar').hidden = d.status === 'reprovada'; window.AO_ABRIR?.(d);
  }
  const fechar = () => { visor.hidden = true; atual = null; };
  function passo(delta, depoisDeSumir) {
    const lista = visiveis(); if (!atual) return;
    let i = lista.indexOf(atual.id);
    if (i < 0) i = depoisDeSumir ?? 0; else i += delta;
    if (!lista.length || i < 0 || i >= lista.length) return depoisDeSumir !== undefined || !lista.length ? fechar() : null;
    abrir(lista[i]);
  }
  async function decidirNoVisor(acao) {
    if (!atual) return;
    const lista = visiveis(), pos = lista.indexOf(atual.id), id = atual.id;
    if (await decidir([id], acao) === false) return;
    const nova = visiveis();
    if (nova.includes(id)) return pos + 1 < nova.length ? abrir(nova[pos + 1]) : abrir(id);
    nova.length ? abrir(nova[Math.min(pos, nova.length - 1)]) : fechar();
  }
  $('#v-fechar').onclick = fechar;
  visor.addEventListener('click', e => { if (e.target === visor) fechar(); });
  $('#v-ant').onclick = () => passo(-1); $('#v-prox').onclick = () => passo(1);
  $('#v-aprovar').onclick = () => decidirNoVisor('aprovar'); $('#v-reprovar').onclick = () => decidirNoVisor('reprovar');
  $('#v-salvar').onclick = async () => {
    try {
      await api('/api/acao', { ids: [atual.id], acao: 'classificar', limpar: true, produto: $('#v-produto').value, cor: $('#v-cor').value, tipo: $('#v-tipo').value, anuncio: $('#v-anuncio').value });
      const id = atual.id; RENDER(); abrir(id);
    } catch (e) { aviso(e.message); }
  };
  document.addEventListener('keydown', e => {
    if (visor.hidden || !document.getElementById('janela').hidden || e.target.matches('input,select,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') fechar(); else if (k === 'arrowright') passo(1); else if (k === 'arrowleft') passo(-1);
    else if (k === 'a' && !$('#v-aprovar').hidden) decidirNoVisor('aprovar'); else if (k === 'r') decidirNoVisor('reprovar');
  });

  window.menork = { api, aviso, abrir };

  // ---- enviar e procurar
  document.addEventListener('change', async e => {
    if (e.target.id !== 'enviar') return;
    const f = new FormData(); [...e.target.files].forEach(a => f.append('arquivos', a)); f.append('anuncio', e.target.dataset.anuncio || '');
    aviso('Enviando…', null, null, 120);
    try {
      const r = await api('/api/enviar', f, true);
      
      RENDER(); aviso(`${r.novas} imagem(ns) nova(s)` + (r.repetidas ? `, ${r.repetidas} já existia(m) no catálogo` : '') + '.');
    } catch (err) { aviso(err.message); }
  });
  document.addEventListener('click', async e => {
    if (!e.target.closest('#ler-agora')) return;
    aviso('Procurando na pasta de entrada…', null, null, 120);
    try {
      const r = await api('/api/ler-agora', {});
      if (r.erro) return aviso(r.erro, null, null, 12);
      RENDER(); aviso(r.importadas ? `${r.importadas} imagem(ns) nova(s).` : 'Nenhuma imagem nova na pasta.');
    } catch (e) { aviso(e.message); }
  });
})();

window.ANUNCIO = (ID) => {
  const { api, aviso, abrir } = window.menork;
  const editor = document.getElementById('editor'), tela = document.getElementById('tela');
  // Shopee: 9 fotos do anuncio (1a = capa) + uma capa por variacao de cor + tamanhos.
  // Mercado Livre: cada cor tem as suas fotos (ate 10, 1a = principal) + tamanhos; titulo ate 60 caracteres.
  const MODOS = { shopee: { nome: 'Shopee', fotos: 9 }, ml: { nome: 'Mercado Livre', fotos: 10, titulo: 60 }, tiktok: { nome: 'TikTok', fotos: 9, titulo: 255 } };
  const tk = () => E.modo === 'tiktok';
  let E = null, corAtiva = null, corPrevia = null, abaBanco = null;
  // banco de imagens embaixo das variacoes, separado por botoes
  const ABAS_BANCO = [
    ['ia', 'IA', t => t === 'ia' || t === 'cena'], ['informativo', 'Informativo', t => t === 'informativo'],
    ['tabela', 'Tabela', t => t === 'tabela'], ['capa', 'Capa', t => (t || '').startsWith('capa')],
    ['fb', 'Fundo branco', t => /(^|_)fb$/.test(t || '')], ['sem', 'Sem tipo', t => !t]];
  const TIPOS_SEL = [['ia', 'Foto IA'], ['informativo', 'Informativo'], ['tabela', 'Tabela'], ['capa', 'Capa'], ['fb', 'Fundo branco'], ['cena', 'Cena real']];
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ml = () => E.modo === 'ml';
  const variacao = cor => E.variacoes.find(v => v.cor === cor);

  async function carregar() { E = await api('/api/anuncios/' + ID); desenhar(); }
  async function fazer(corpo) {
    try { E = await api('/api/anuncios/' + ID, corpo); desenhar(); } catch (e) { aviso(e.message); }
  }

  // ------------------------------------------------------------ editor
  const botao = (acao, texto, titulo, extra = '') => `<button type="button" data-acao="${acao}" title="${esc(titulo || texto)}" ${extra}>${texto}</button>`;
  function peca(i, botoes, opcoes = {}) {
    const pendente = i.status !== 'aprovada';
    return `<div class="peca ${pendente ? 'pendente' : ''}" data-img="${i.id}" ${opcoes.arrasta ? 'draggable="true"' : ''}>
      <div class="foto" data-ver="${i.id}"><img loading="lazy" src="${IMG(i.id)}" alt=""></div>
      <span class="rotulo">${esc(i.tipo_nome)}${i.cor ? ' <em>' + esc(i.cor) + '</em>' : ''}</span>
      <div class="botoes">${pendente ? '<button type="button" data-ver="' + i.id + '">Aprovar primeiro</button>' : botoes}</div></div>`;
  }
  const vaga = texto => `<div class="vaga">${texto}</div>`;
  // os 9 espacos da Shopee/TikTok como ficaram, com os vazios no meio (pos 1..8 = espacos 2..9)
  function espacosShopee() {
    const arr = Array(MODOS.shopee.fotos).fill(null); arr[0] = E.capa || null; const sobra = [];
    E.galeria.forEach(i => { const p = +i.pos; if (p >= 1 && p < arr.length && !arr[p]) arr[p] = i; else sobra.push(i); });
    sobra.forEach(i => { const k = arr.findIndex((x, n) => n > 0 && !x); if (k > 0) arr[k] = i; });
    return arr;
  }

  function espacos(lista, total, primeiro) {
    return Array.from({ length: total }, (_, n) => { const i = lista[n], rot = n === 0 ? primeiro : String(n + 1), cls = n === 0 ? 'capa' : '';
      return i ? `<div class="slot cheio ${cls} ${(E.capa_publicada || []).some(p => p.imagem === i.id) ? 'ja-publicada' : ''}" data-pos="${n}" data-img="${i.id}" draggable="true" title="${esc(i.tipo_nome)}${i.cor ? ', ' + esc(i.cor) : ''}"><b>${rot}</b><img src="${IMG(i.id)}" data-ver="${i.id}" alt=""><button type="button" data-tirar-slot="${i.id}" title="Tirar" aria-label="Tirar">×</button></div>`
        : `<div class="slot vazio ${cls}" data-pos="${n}"><b>${rot}</b><span>${n === 0 ? 'Solte a ' + primeiro.toLowerCase() + ' aqui' : 'Vazio'}</span></div>`; }).join('');
  }

  function blocoTamanhos() {
    const cores = E.variacoes.length, t = E.tamanhos.length;
    return `<div class="bloco"><h2>Variação 2: Tamanho <small>${t ? t + ' tamanho(s)' : 'nenhum ainda'}</small></h2>
      <label class="campo-tam">Tamanhos<input id="c-tamanhos" data-campo="tamanhos" value="${esc(E.anuncio.tamanhos)}" placeholder="Ex.: 33/34, 35/36, 37/38 ou 34 a 39"></label>
      <div class="chips-tam">${E.tamanhos.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      ${cores && t ? `<p class="pequeno">${cores} cor(es) × ${t} tamanho(s) = <b>${cores * t} variações</b>. ${ml() ? 'O Mercado Livre cria uma variação para cada cor com cada tamanho.' : (tk() ? 'O TikTok' : 'A Shopee') + ' cruza a Variação 1 com a Variação 2 sozinha.'}</p>` : ''}</div>`;
  }

  function desenharEditor() {
    const a = E.anuncio, foco = document.activeElement?.id, M = MODOS[E.modo];
    if (ml() && !variacao(corAtiva)) corAtiva = E.variacoes[0]?.cor ?? null;
    const v = ml() ? variacao(corAtiva) : null;
    const lista = ml() ? (v ? v.fotos : []) : espacosShopee();
    const cheias = lista.filter(Boolean).length;
    document.getElementById('resumo').textContent = ml()
      ? `Mercado Livre: ${E.variacoes.length} cor(es), cada uma com as suas fotos`
      : `${M.nome}: ${cheias} de ${M.fotos} fotos, ${E.variacoes.length} variação(ões) de cor`;
    document.querySelectorAll('.troca [data-modo]').forEach(b => b.classList.toggle('ativo', b.dataset.modo === E.modo));
    const dica = document.getElementById('dica-previa');
    if (dica) dica.textContent = ml() ? 'Prévia no jeito do Mercado Livre: toque numa cor e as fotos mudam para as daquela cor.' : tk() ? 'Prévia no jeito do TikTok Shop: deslize as fotos e toque numa cor para ver a foto daquela variação. As fotos são as mesmas do modo Shopee.' : 'Prévia no jeito da Shopee: deslize as fotos e toque numa cor para ver a capa daquela variação.';

    const fotosCol = ml()
      ? (E.variacoes.length ? `<h2>Fotos da cor ${v ? esc(v.cor) : ''} <small>${v ? v.fotos.length : 0} de 10 · a 1ª é a principal da cor</small></h2>
         <div class="slots" id="slots">${espacos(lista, M.fotos, 'Principal')}</div>`
        : `<h2>Fotos da cor</h2>${vaga('Nenhuma cor ainda. Clique em Nova cor numa foto de fundo branco, aqui embaixo.')}`)
      : `<h2>Fotos do anúncio <small>${cheias} de ${M.fotos} · a 1ª é a capa · arraste para mudar a ordem</small></h2><div class="slots" id="slots">${espacos(lista, M.fotos, 'Capa')}</div>`;

    const limite = M.titulo ? ` maxlength="${M.titulo + 40}"` : '';
    // titulo, precos e descricao: compactos, numa caixa que abre e fecha (fica no fim; as fotos vem primeiro)
    const faltaDados = [!a.titulo && 'título', !a.preco && 'preço', !a.descricao && 'descrição'].filter(Boolean);
    const dados = `<h2>Título, preço e descrição ${faltaDados.length ? `<em class="falta-dados">falta ${faltaDados.join(', ')}</em>` : ''}</h2>
      <div class="dados compacto">
        <label class="largo">Título <small id="conta-titulo"></small><input id="c-titulo" data-campo="titulo" value="${esc(a.titulo)}"${limite} placeholder="Ex.: Chinelo feminino nuvem confortável"></label>
        ${ml() ? `<label>Preço cheio (riscado)<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>
        <label title="O anúncio sobe com o preço cheio e este entra como Desconto direto do Mercado Livre (o desconto do próprio vendedor, igual ao da Central de promoções; não entra em campanha do ML). O B2X renova a cada 30 dias. Depois de criado, para tirar o desconto pode ser preciso ir no painel do ML.">Preço promocional ⓘ<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>`
        : `<label>Preço cheio (riscado)<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>
        <label title="${tk() ? 'No TikTok' : 'Na Shopee'} o anúncio sobe com o preço cheio e, depois de criado, entra sozinho na promoção da loja com o nome do modelo (ex.: PROMO TJ01) com este preço. Se a loja não tiver uma só, você escolhe em Anúncios criados.">Preço promocional ⓘ<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>`}
        <label class="largo">Descrição<textarea id="c-descricao" data-campo="descricao" rows="2" placeholder="Texto da descrição do anúncio">${esc(a.descricao)}</textarea></label>
      </div>`;

    const chip = x => `<div class="peca var-cor chip-cor ${ml() && x.cor === corAtiva ? 'escolhida' : ''} ${(E.capa_publicada || []).some(p => p.imagem === x.capa.id) ? 'ja-publicada' : ''}" data-cor="${esc(x.cor)}" data-cor-alvo="${esc(x.cor)}">
        <button type="button" class="chip-foto" ${ml() ? `data-cor-aba="${esc(x.cor)}"` : `data-trocar-capa="${esc(x.cor)}"`} title="${ml() ? 'Montar as fotos desta cor' : 'Trocar a capa da variação: mostra as fotos IA desta cor'}"><img loading="lazy" src="/mini/${(ml() && x.fotos[0] ? x.fotos[0] : x.capa).id}" alt=""></button>
        <span class="chip-txt"><input class="nome-cor" value="${esc(x.cor)}" aria-label="Nome da cor"><small>${ml() ? x.fotos.length + ' de 10 fotos' : 'capa da variação'}</small></span>
        <button type="button" class="chip-tirar" data-acao="tirar_cor" title="Tirar esta cor do anúncio">×</button></div>`;
    const cores = `<div class="bloco cores-compacto"><h2>Variação 1: Cor <small>${E.variacoes.length} cor(es) · ${ml() ? 'clique numa cor para montar as fotos dela lá em cima' : 'arraste uma imagem para cima de uma cor para trocar a capa da variação'}</small></h2>
      <div class="chips-cor">${E.variacoes.map(chip).join('') || `<p class="pequeno">Nenhuma cor ainda. Clique em ${ml() ? 'Nova cor' : 'Cor'} numa foto aqui embaixo.</p>`}</div></div>`;

    const usadas = new Set(ml() ? (v ? v.fotos.map(i => i.id) : []) : [E.capa?.id, ...E.galeria.map(i => i.id), ...E.variacoes.map(x => x.capa.id)]);
    const fora = [...E.todas.filter(i => !usadas.has(i.id)), ...E.disponiveis.filter(i => i.status !== 'aprovada')];
    const colocar = ml()
      ? (v ? botao('foto_cor', 'Foto da cor', 'Coloca nas fotos da cor ' + v.cor) : '') + botao('cor', 'Nova cor', 'Cria uma cor nova com esta foto como principal')
      : botao('capa', 'Capa') + botao('foto', 'Foto') + botao('variacao', 'Cor', 'Usa como capa da variação de uma cor');
    const proprias = new Set(E.todas.map(i => i.id));
    const todasBanco = [...fora, ...E.sugestoes.filter(i => !usadas.has(i.id))];
    const grupos = ABAS_BANCO.map(([k, nome, f]) => [k, nome, todasBanco.filter(i => f(i.tipo))]).filter(([k, , l]) => l.length || k !== 'sem');
    if (!grupos.some(g => g[0] === abaBanco && g[2].length)) abaBanco = (grupos.find(g => g[2].length) || grupos[0])[0];
    const atual = grupos.find(g => g[0] === abaBanco)[2];
    const selTipo = i => i.tipo ? '' : `<select class="mini-tipo" data-classificar="${i.id}" title="Dizer o tipo desta imagem"><option value="">Tipo…</option>${TIPOS_SEL.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select>`;
    const banco = `<div class="bloco banco"><h2>Imagens para usar no anúncio <small>arraste para cima ou use os botões</small></h2>
      <div class="abas-banco">${grupos.map(([k, nome, l]) => `<button type="button" data-aba-banco="${k}" class="${k === abaBanco ? 'ativo' : ''}" ${l.length ? '' : 'disabled'}>${nome} <b>${l.length}</b></button>`).join('')}</div>
      <div class="trilho banco-trilho ${atual.length > 14 ? 'duas' : ''}">${atual.map(i => peca(i, colocar + (proprias.has(i.id) ? botao('desvincular', '×', 'Tirar deste anúncio') : '') + selTipo(i), { arrasta: i.status === 'aprovada' })).join('') || vaga('Nada aqui.')}</div></div>`;
    // guarda onde voce deixou as rolagens: redesenhar nao pode jogar a coluna de volta para o topo
    const rolBanco = editor.querySelector('.banco-trilho')?.scrollLeft || 0, rolCol = editor.querySelector('.slots-col')?.scrollTop || 0, rolAbas = editor.querySelector('.abas-cor')?.scrollTop || 0, rolJanela = window.scrollY;
    // aviso: capa que ja subiu para a loja em outro anuncio
    const pub = E.capa_publicada || [], nomeLoja = id => (typeof todasLojas === 'function' && typeof LOJAS !== 'undefined' && LOJAS.clientes && todasLojas().find(x => x.id === id)) || null;
    const avisoPub = pub.length ? `<div class="nota ruim capa-pub-aviso"><b>⚠ Capa já publicada em outro anúncio</b>${pub.map(p => { const l = nomeLoja(p.loja);
      return `<span><img src="${IMG(p.imagem)}" alt=""> A ${esc(p.onde)} já subiu no anúncio <a href="#" data-rota="/anuncios/${p.anuncio_id}"><b>${esc(p.anuncio)}</b></a>${l ? ' na loja ' + esc(l.cliente + ' · ' + l.nome) : ''}${p.quando ? ' em ' + esc(p.quando.split('-').reverse().join('/')) : ''}${p.ids ? ' (código ' + esc(p.ids.split(',')[0]) + ')' : ''}.</span>`; }).join('')}
      <small>Pode usar mesmo assim; o aviso é só para você não repetir capa sem querer. Troque clicando na cor ou arrastando outra imagem.</small></div>` : '';
    const pubIds = new Set(pub.map(p => p.imagem));
    editor.innerHTML = `${avisoPub}<div class="editor-um">
      <div class="bloco fotos-principal"><div class="fotos-e-video"><div class="fp-fotos">${fotosCol}</div>${caixaVideo(a)}</div></div>
      ${banco}
      <div class="resto">${cores}${blocoTamanhos()}</div></div>`;
    const topo = document.getElementById('dados-topo');
    if (topo) topo.innerHTML = dados; else editor.querySelector('.resto').insertAdjacentHTML('beforeend', `<div class="bloco">${dados}</div>`);
    // banco logo embaixo das fotos, em 2 linhas que rolam para o lado (a roda do mouse rola para o lado)
    const trilho = editor.querySelector('.banco-trilho');
    if (trilho) { trilho.scrollLeft = rolBanco; trilho.addEventListener('wheel', ev => { if (Math.abs(ev.deltaY) > Math.abs(ev.deltaX) && trilho.scrollWidth > trilho.clientWidth) { trilho.scrollLeft += ev.deltaY; ev.preventDefault(); } }, { passive: false }); }
    const col = editor.querySelector('.slots-col'), abas = editor.querySelector('.abas-cor');
    if (col) col.scrollTop = rolCol; if (abas) abas.scrollTop = rolAbas;
    if (Math.abs(window.scrollY - rolJanela) > 1) window.scrollTo(0, rolJanela);
    if (foco) document.getElementById(foco)?.focus({ preventScroll: true });
    contarTitulo();
  }
  function contarTitulo() {
    const t = document.getElementById('c-titulo'), c = document.getElementById('conta-titulo'); if (!t || !c) return;
    const max = MODOS[E.modo].titulo, n = t.value.trim().length;
    c.textContent = max ? `${n} de ${max} caracteres` : n + ' caracteres';
    c.classList.toggle('passou', !!max && n > max);
  }

  // ---- trocar a capa da variacao: clica na cor e aparecem as fotos IA daquela cor do produto; clicou, trocou
  const semAc = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function mesmaCor(corImg, corVar) {
    const a = semAc(corImg), b = semAc(corVar); if (!a || !b) return false;
    if (a === b) return true;
    const pal = b.split(' '), sig = pal.map(w => w[0]).join('');
    if (a.replace(/ /g, '') === sig) return true;  // Grok: PD = Palha/Dourado, CN = Caramelo/Natural
    if (pal.length === 1 && a.length <= 3 && b.startsWith(a)) return true;  // CA = Caramelo
    return false;
  }
  function trocarCapa(cor) {
    const v = variacao(cor); if (!v) return;
    const prod = (E.produto || E.anuncio.nome.split(/\s+/)[0] || '').toUpperCase();
    const vistos = new Set(), todas = [];
    const juntar = l => (l || []).forEach(i => { if (i && !vistos.has(i.id)) { vistos.add(i.id); todas.push(i); } });
    juntar(E.todas); juntar(E.sugestoes); juntar((typeof DB !== 'undefined' && DB.imgs) || []);
    const doBanco = new Set([...(E.todas || []), ...(E.sugestoes || [])].map(i => i.id));  // o banco ja traz as do codigo parecido (TA01 x TA101)
    const ia = todas.filter(i => i.status === 'aprovada' && ['ia', 'cena'].includes(i.tipo) && (doBanco.has(i.id) || !i.produto || !prod || String(i.produto).toUpperCase() === prod) && mesmaCor(i.cor, cor));
    const fundo = document.createElement('div'); fundo.className = 'troca-capa-fundo';
    fundo.innerHTML = `<div class="troca-capa"><div class="tc-cab"><h3>Capa da variação <b>${esc(cor)}</b> <small>${ia.length} foto(s) IA desta cor${prod ? ' do ' + esc(prod) : ''} · clique para trocar</small></h3><button type="button" class="b claro mini" data-tc-fechar>Fechar</button></div>
      <div class="tc-grade">${ia.map(i => `<button type="button" class="tc-foto ${i.id === v.capa.id ? 'atual' : ''}" data-tc-img="${i.id}" title="${esc(i.cor || '')}"><img loading="lazy" src="${IMG(i.id)}" alt="">${i.id === v.capa.id ? '<em>atual</em>' : ''}</button>`).join('')
        || `<p class="pequeno">Nenhuma foto IA aprovada da cor ${esc(cor)}${prod ? ' do ' + esc(prod) : ''}. Arraste qualquer imagem para cima da cor para trocar.</p>`}</div></div>`;
    document.body.appendChild(fundo);
    const fechar = () => { fundo.remove(); document.removeEventListener('keydown', esc_); };
    const esc_ = ev => { if (ev.key === 'Escape') fechar(); };
    document.addEventListener('keydown', esc_);
    fundo.addEventListener('click', ev => {
      if (ev.target === fundo || ev.target.closest('[data-tc-fechar]')) return fechar();
      const f = ev.target.closest('[data-tc-img]'); if (!f) return;
      fechar(); if (+f.dataset.tcImg === v.capa.id) return;
      fazer({ acao: 'cor', cor, imagem: +f.dataset.tcImg }).then(() => aviso('Capa da variação ' + cor + ' trocada.'));
    });
  }

  function escolherCor(p, imagem) {  // mostra as cores como botoes na propria imagem
    if (!E.variacoes.length) return fazer({ acao: 'cor', imagem });
    const caixa = p.querySelector('.botoes'); caixa.classList.add('escolha');
    caixa.innerHTML = '<span class="pequeno">Capa da variação de:</span>' +
      E.variacoes.map(x => `<button type="button" data-acao="var_para" data-para="${esc(x.cor)}">${esc(x.cor)}</button>`).join('') +
      '<button type="button" data-acao="var_para" data-para="">Cor nova</button>';
  }

  editor.addEventListener('click', e => {
    const ab = e.target.closest('[data-aba-banco]'); if (ab) { abaBanco = ab.dataset.abaBanco; return desenharEditor(); }
    if (e.target.closest('select')) return;
    const tc = e.target.closest('[data-trocar-capa]'); if (tc) return trocarCapa(tc.dataset.trocarCapa);
    const aba = e.target.closest('[data-cor-aba]'); if (aba) { corAtiva = corPrevia = aba.dataset.corAba; return desenhar(); }
    const ts = e.target.closest('[data-tirar-slot]');
    if (ts) return ml() ? fazer({ acao: 'tirar_foto_cor', cor: corAtiva, imagem: +ts.dataset.tirarSlot }) : fazer({ acao: 'tirar', imagem: +ts.dataset.tirarSlot });
    if (e.target.closest('.slot.vazio')) return aviso('Arraste uma imagem aprovada para cá, ou use os botões nas imagens ao lado.');
    const ver = e.target.closest('[data-ver]'); if (ver) return abrir(+ver.dataset.ver);
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const p = b.closest('.peca'), imagem = +p.dataset.img, acao = b.dataset.acao;
    if (acao === 'tirar_cor') {
      if (!b.dataset.ok) { b.dataset.ok = 1; b.classList.add('confirmar'); b.textContent = 'Tirar?'; setTimeout(() => { if (b.isConnected) { delete b.dataset.ok; b.classList.remove('confirmar'); b.textContent = '×'; } }, 4000); return; }
      return fazer({ acao, cor: p.dataset.cor });
    }
    if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(() => document.dispatchEvent(new Event('menork:mudou')));
    if (acao === 'variacao') return escolherCor(p, imagem);
    if (acao === 'var_para') return fazer({ acao: 'cor', imagem, cor: b.dataset.para });
    if (acao === 'foto_cor') return fazer({ acao, cor: corAtiva, imagem });
    if (acao === 'foto' && E.galeria.length >= MODOS.shopee.fotos - 1) return aviso('As 9 fotos já estão preenchidas. Tire uma para colocar outra.');
    if (acao === 'cor' && ml()) { const img = [...E.todas, ...E.sugestoes].find(i => i.id === imagem); corAtiva = img?.cor || null; }
    fazer({ acao, imagem });
  });
  const ouvir = (tipo, fn) => { editor.addEventListener(tipo, fn); document.getElementById('dados-topo')?.addEventListener(tipo, fn); };
  ouvir('input', e => {
    const campo = e.target.dataset.campo; if (!campo) return;
    E.anuncio[campo] = e.target.value; contarTitulo(); desenharPrevia();
  });
  ouvir('change', e => {
    if (e.target.dataset.classificar) return e.target.value && api('/api/acao', { ids: [+e.target.dataset.classificar], acao: 'classificar', tipo: e.target.value }).then(carregar).catch(err => aviso(err.message));
    const campo = e.target.dataset.campo;
    if (campo === 'tamanhos') return fazer({ acao: 'dados', tamanhos: e.target.value }).then(() => window.AO_DESENHAR?.(ID));
    if (campo) return api('/api/anuncios/' + ID, { acao: 'dados', [campo]: e.target.value }).then(() => window.AO_DESENHAR?.(ID)).catch(err => aviso(err.message));
    if (e.target.classList.contains('nome-cor')) {
      const antiga = e.target.closest('.peca').dataset.cor;
      if (corAtiva === antiga) corAtiva = e.target.value.trim() || antiga;
      fazer({ acao: 'renomear_cor', cor: antiga, novo: e.target.value });
    }
  });
  // arrastar: entre os espacos, de uma imagem para um espaco, ou de uma imagem para uma cor
  let arr = null;
  // ---- video do anuncio: guarda no PC e vai junto quando criar na Shopee
  function caixaVideo(a) {
    const nota = ml() ? '<small class="video-nota">O Mercado Livre não aceita vídeo pela API: ele vai só na Shopee.</small>' : '<small class="video-nota">MP4 de 10 a 60 s. Vai junto quando criar o anúncio na Shopee.</small>';
    if (a.video) return `<div class="video-caixa"><h3>Vídeo</h3><video src="/api/anuncios/${a.id}/video?v=${encodeURIComponent(a.video)}" controls muted playsinline preload="metadata"></video>
      <div class="video-acoes"><label class="b claro mini">Trocar<input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" data-video-arquivo hidden></label><button type="button" class="b claro mini" data-video-tirar>Tirar</button></div>${nota}</div>`;
    return `<div class="video-caixa"><h3>Vídeo</h3><label class="video-zona" data-video-zona><input type="file" accept="video/mp4,video/quicktime,.mp4,.mov" data-video-arquivo hidden>
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg><b>Colocar vídeo</b><span>arraste aqui ou clique</span></label>${nota}</div>`;
  }
  async function mandarVideo(f) {
    if (!f) return;
    if (!/\.(mp4|mov|m4v)$/i.test(f.name)) return aviso('Mande o vídeo em MP4.');
    const z = editor.querySelector('.video-caixa'); if (z) z.classList.add('enviando');
    aviso(`Enviando o vídeo (${(f.size / 1048576).toFixed(1)} MB)…`);
    const fd = new FormData(); fd.append('arquivo', f);
    try { const r = await fetch(`/api/anuncios/${ID}/video`, { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || 'Não consegui guardar o vídeo.'); aviso('Vídeo colocado no anúncio.'); carregar(); }
    catch (err) { aviso(err.message); z?.classList.remove('enviando'); }
  }
  editor.addEventListener('change', e => { if (e.target.matches('[data-video-arquivo]')) mandarVideo(e.target.files[0]); });
  editor.addEventListener('click', e => {
    const t = e.target.closest('[data-video-tirar]'); if (!t) return;
    if (t.dataset.certeza !== '1') { t.dataset.certeza = '1'; t.textContent = 'Tirar mesmo?'; return; }
    fetch(`/api/anuncios/${ID}/video`, { method: 'DELETE' }).then(() => { aviso('Vídeo tirado do anúncio (o arquivo continua no PC).'); carregar(); });
  });
  editor.addEventListener('dragover', e => { const z = e.target.closest('[data-video-zona]'); if (z && e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); z.classList.add('alvo'); } });
  editor.addEventListener('dragleave', e => { e.target.closest('[data-video-zona]')?.classList.remove('alvo'); });
  editor.addEventListener('drop', e => { const z = e.target.closest('[data-video-zona]'); if (!z || !e.dataTransfer?.files?.length) return; e.preventDefault(); e.stopPropagation(); z.classList.remove('alvo'); mandarVideo(e.dataTransfer.files[0]); }, true);
  const limpar = () => editor.querySelectorAll('.arrastando,.alvo').forEach(x => x.classList.remove('arrastando', 'alvo'));
  editor.addEventListener('dragstart', e => {
    const s = e.target.closest('.slot.cheio, .peca[draggable="true"]'); if (!s) return;
    arr = { img: +s.dataset.img, de: s.classList.contains('slot') ? +s.dataset.pos : null }; s.classList.add('arrastando');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(arr.img)); } catch (_) {}
  });
  editor.addEventListener('dragover', e => {
    const s = e.target.closest('.slot, [data-cor-alvo]'); if (!arr || !s) return; e.preventDefault();
    editor.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo')); s.classList.add('alvo');
  });
  editor.addEventListener('drop', e => {
    const s = e.target.closest('.slot, [data-cor-alvo]'); if (!arr || !s) return; e.preventDefault();
    const a = arr; arr = null; limpar();
    if (s.dataset.corAlvo !== undefined) {
      return ml() ? fazer({ acao: 'foto_cor', cor: s.dataset.corAlvo, imagem: a.img }) : fazer({ acao: 'cor', cor: s.dataset.corAlvo, imagem: a.img });
    }
    const para = +s.dataset.pos;
    if (ml()) {
      const v = variacao(corAtiva); if (!v) return;
      const fotos = v.fotos.map(i => i.id); if (a.de !== null) fotos.splice(a.de, 1); else if (fotos.includes(a.img)) fotos.splice(fotos.indexOf(a.img), 1);
      fotos.splice(Math.min(para, fotos.length), 0, a.img);
      if (fotos.length > MODOS.ml.fotos) return aviso('As 10 fotos desta cor já estão preenchidas. Tire uma para colocar outra.');
      return fazer({ acao: 'slots_cor', cor: corAtiva, ids: fotos });
    }
    // espaco vazio: a foto vai exatamente para ele (pode ficar vazio no meio); espaco com foto: as duas trocam de lugar
    const esp = espacosShopee().map(i => i ? i.id : null), de = a.de !== null ? a.de : esp.indexOf(a.img);
    if (de === para) return;
    if (de >= 0) { esp[de] = esp[para]; esp[para] = a.img; }
    else {  // veio do banco: entra no espaco; se tinha foto, ela anda para o proximo vazio
      const tinha = esp[para]; esp[para] = a.img;
      if (tinha) { const k = esp.findIndex((x, n) => n > para && !x), k2 = k > 0 ? k : esp.findIndex((x, n) => n > 0 && !x);
        if (k2 < 0) return aviso('As 9 fotos já estão preenchidas. Tire uma para colocar outra.'); esp[k2] = tinha; }
    }
    fazer({ acao: 'slots', ids: esp });
  });
  editor.addEventListener('dragend', () => { arr = null; limpar(); });
  document.getElementById('montar-auto').onclick = async () => {
    const antes = JSON.stringify([E.capa, E.galeria, E.variacoes]);
    await fazer({ acao: 'auto' });
    aviso(antes === JSON.stringify([E.capa, E.galeria, E.variacoes]) ? 'Nada para preencher: aprove e coloque imagens neste anúncio primeiro.' : 'Estrutura preenchida com as imagens aprovadas.');
  };
  document.querySelectorAll('.troca [data-modo]').forEach(b => {
    b.onclick = () => { if (E && b.dataset.modo !== E.modo) { corPrevia = null; fazer({ acao: 'modo', modo: b.dataset.modo }).then(() => window.AO_DESENHAR?.(ID)); } };
  });

  // ------------------------------------------------------------ previa
  const numero = t => { const v = parseFloat(String(t).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  const reais = t => { const v = numero(t); return v === null ? esc(t) : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function desenharPrevia() {
    const a = E.anuncio;
    if (corPrevia && !variacao(corPrevia)) corPrevia = null;
    const cor = variacao(corPrevia) || (ml() ? E.variacoes[0] : null);
    const fotos = ml() ? (cor ? cor.fotos : []) : [E.capa, ...E.galeria].filter(Boolean);
    const sobre = !ml() && corPrevia ? cor : null;
    const p = numero(a.preco), pa = numero(a.preco_antigo);
    const desconto = p && pa && pa > p ? Math.round((1 - p / pa) * 100) : 0;
    const rolagem = tela.querySelector('.rolo')?.scrollTop || 0;
    const fotosHtml = `<div class="vitrine">
        <div class="carrossel" id="carrossel">${fotos.map(f => `<img src="${GRANDE(f.id)}" alt="">`).join('') || `<div class="sem">${ml() ? 'Sem fotos nesta cor' : 'Sem capa'}</div>`}</div>
        ${sobre ? `<img class="sobre" src="${GRANDE(sobre.capa.id)}" alt="">` : ''}
        ${fotos.length ? `<span class="conta" id="conta">${sobre ? esc(sobre.cor) : '1/' + fotos.length}</span>` : ''}
        <span class="voltar" aria-hidden="true">‹</span></div>`;
    const precoHtml = `<div class="preco">${pa && desconto ? `<s>${reais(a.preco_antigo)}</s>` : ''}<strong>${a.preco ? reais(a.preco) : 'R$ 0,00'}</strong>${desconto ? `<b class="off">${desconto}% OFF</b>` : ''}</div>`;
    const tituloHtml = `<p class="titulo ${a.titulo ? '' : 'falta'}">${esc(a.titulo) || 'Título do anúncio'}</p>`;
    const escolhida = ml() ? cor : sobre;
    const coresHtml = E.variacoes.length ? `<div class="cores"><span>Cor${escolhida ? ': <b>' + esc(escolhida.cor) + '</b>' : ` <em>${E.variacoes.length} opções</em>`}</span><div>${E.variacoes.map(c => `<button type="button" data-cor="${esc(c.cor)}" class="${escolhida && c.cor === escolhida.cor ? 'ativa' : ''}" title="${esc(c.cor)}"><img src="/mini/${(ml() && c.fotos[0] ? c.fotos[0] : c.capa).id}" alt="${esc(c.cor)}"></button>`).join('')}</div></div>` : '';
    const tamHtml = E.tamanhos.length ? `<div class="cores tams"><span>Tamanho <em>${E.tamanhos.length} opções</em></span><div>${E.tamanhos.map(t => `<i>${esc(t)}</i>`).join('')}</div></div>` : '';
    const descHtml = `<div class="descricao"><h4>Descrição</h4><p class="${a.descricao ? '' : 'falta'}">${esc(a.descricao) || 'A descrição aparece aqui.'}</p></div>`;
    const comprar = tk() ? '<div class="comprar"><span>Adicionar ao carrinho</span><span class="forte">Comprar com cupom</span></div>' : '<div class="comprar"><span>Adicionar ao carrinho</span><span class="forte">Comprar agora</span></div>';
    tela.className = 'tela ' + (ml() ? 'modelo-b mk-ml' : tk() ? 'modelo-a mk-tiktok' : 'modelo-a mk-shopee');
    tela.innerHTML = ml()
      ? `<div class="rolo"><div class="miolo"><span class="novo">Novo</span>${tituloHtml}</div>${fotosHtml}${coresHtml}${tamHtml}<div class="miolo">${precoHtml}</div><div class="miolo empilha"><span class="forte">Comprar agora</span><span>Adicionar ao carrinho</span></div>${descHtml}</div>`
      : `<div class="rolo">${fotosHtml}<div class="miolo">${precoHtml}${tituloHtml}</div>${coresHtml}${tamHtml}${descHtml}</div>${comprar}`;
    tela.querySelector('.rolo').scrollTop = rolagem;
    const car = document.getElementById('carrossel'), conta = document.getElementById('conta');
    car?.addEventListener('scroll', () => {
      if (sobre) { corPrevia = null; return desenharPrevia(); }
      if (conta) conta.textContent = (Math.round(car.scrollLeft / car.clientWidth) + 1) + '/' + fotos.length;
    }, { passive: true });
  }
  tela.addEventListener('click', e => {
    const c = e.target.closest('[data-cor]');
    if (c) { corPrevia = !ml() && corPrevia === c.dataset.cor ? null : c.dataset.cor; return desenharPrevia(); }
    if (e.target.closest('.sobre')) { corPrevia = null; desenharPrevia(); }
  });

  function desenhar() { desenharEditor(); desenharPrevia(); window.AO_DESENHAR?.(ID); }
  window.AO_MUDAR = carregar;
  carregar().catch(e => aviso(e.message));
};

RENDER().catch(e => window.menork.aviso(e.message)).finally(() => window.ABERTURA_FIM?.());