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
  anunciosLoja: async (loja, busca, pagina) => { const r = await fetch(`/api/lojas/${encodeURIComponent(loja)}/anuncios?pagina=${pagina}&busca=${encodeURIComponent(busca)}`); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || 'Não deu certo.'); return j; },
  salvarIntegracao: d => mandar('/api/integracao', d),
  testarIntegracao: () => mandar('/api/integracao/testar', {}),
  enviarSistema: (aid, forcar) => mandar(`/api/anuncios/${aid}/enviar`, { forcar }),
  pedir: async aid => (await mandar('/api/pedido', { an: aid })).texto,
};
function PAINEL_EXTRA() {
  const b = INFO.bot || {};
  const v = INFO.versao || {};
  const versao = `<div class="bloco"><h2>Versão do site <small>${v.sozinho ? 'atualiza sozinho ao ligar e a cada algumas horas' : 'atualização só pelo botão'}</small></h2>
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

// ===== Telas (no site de verdade elas sao montadas pelo servidor) =====
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ROT = { gerada: 'Falta classificar', conferencia: 'Em conferência', aprovada: 'Aprovada', reprovada: 'Reprovada' };
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
      <button class="b claro" id="ler-agora">Procurar imagens novas</button><label class="b claro">Enviar imagens<input type="file" id="enviar" multiple accept="image/*" hidden></label></div></div>
    <div class="filtros">${elo('/', 'Todas', 'ficha ' + (!q.produto && !q.so ? 'ativo' : ''))}${sem ? elo('/?so=sem', `Falta classificar (${sem})`, 'ficha ' + (q.so === 'sem' ? 'ativo' : '')) : ''}${comAlerta ? elo('/?so=alerta', `Com alerta (${comAlerta})`, 'ficha ' + (q.so === 'alerta' ? 'ativo' : '')) : ''}
      ${Object.keys(porProd).filter(Boolean).sort().map(p => elo(rota('/', { produto: p }), `${esc(p)} (${porProd[p]})`, 'ficha ' + (q.produto === p ? 'ativo' : ''))).join('')}</div>
    ${bots ? `<p class="faixa-bots">Os bots já reprovaram ${bots} imagem(ns) antes de chegar aqui. ${elo('/erros', 'Ver lista de erros')}</p>` : ''}
    ${l.length ? `<p class="dica">Clique numa imagem para ver grande ao lado do fundo branco. No visor: <kbd>A</kbd> aprova, <kbd>R</kbd> reprova, <kbd>←</kbd> <kbd>→</kbd> trocam de imagem. Para marcar várias, marque a caixinha da primeira; depois é só clicar nas outras imagens.</p>
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
    <section><div class="cabeca"><h1>Catálogo <small>${l.length} imagem(ns)</small></h1></div>
      <form class="filtros" data-busca="1"><select data-filtro="tipo">${op('', 'Todos os tipos', q.tipo || '')}${TIPOS.map(([k, v]) => op(k, v, q.tipo)).join('')}</select>
      <select data-filtro="status">${op('', 'Todas (menos reprovadas)', q.status || '')}${op('aprovada', `Aprovadas (${cont.aprovada || 0})`, q.status)}${op('conferencia', `Em conferência (${cont.conferencia || 0})`, q.status)}${op('gerada', `Falta classificar (${cont.gerada || 0})`, q.status)}</select>
      <select data-filtro="anuncio">${op('', 'Todos os anúncios', q.anuncio || '')}${DB.anuncios.map(a => op(a.nome, a.nome, q.anuncio)).join('')}</select>
      <input type="search" name="q" value="${esc(q.q || '')}" placeholder="Buscar…">${Object.keys(q).length ? elo('/catalogo', 'Limpar filtros', 'ficha') : ''}</form>
      ${l.length ? `<div class="grade">${ordenar(l).map(cartao).join('')}</div>` : `<div class="vazio"><h2>Nenhuma imagem aqui</h2><p>Mude os filtros ou espere o gerador mandar imagens.</p></div>`}
      <p class="pequeno">Reprovadas e já apagadas até hoje: ${cont.reprovada || 0}.</p></section></div>`;
  },
  capas(q) {
    let l = DB.imgs.filter(i => i.status === 'aprovada' && i.tipo.startsWith('capa'));
    if (q.so === 'usadas') l = l.filter(i => anunciosDe(i.id).length); if (q.so === 'livres') l = l.filter(i => !anunciosDe(i.id).length);
    const g = {}; l.forEach(i => (g[i.produto || '(sem produto)'] ??= []).push(i));
    return `<div class="cabeca"><h1>Histórico de capas <small>${l.length} aprovada(s)</small></h1></div>
    <div class="filtros">${elo('/capas', 'Todas', 'ficha ' + (!q.so ? 'ativo' : ''))}${elo('/capas?so=usadas', 'Já usadas em anúncio', 'ficha ' + (q.so === 'usadas' ? 'ativo' : ''))}${elo('/capas?so=livres', 'Ainda sem anúncio', 'ficha ' + (q.so === 'livres' ? 'ativo' : ''))}</div>
    ${Object.keys(g).sort().map(p => `<h2 class="grupo">${esc(p)} <small>${g[p].length}</small></h2><div class="grade">${g[p].map(cartao).join('')}</div>`).join('') || `<div class="vazio"><h2>Nenhuma capa aprovada ainda</h2><p>Toda capa que você aprovar na fila aparece aqui, com o anúncio em que foi usada.</p></div>`}`;
  },
  anuncios() {
    const cart = a => { const m = montagem(a.id), rosto = m.capa || m.galeria[0] || m.disponiveis[0], n = (m.capa ? 1 : 0) + m.galeria.length, fl = faltas(a.id).itens.length;
      return `<a class="cartao anuncio" href="#" data-rota="/anuncios/${a.id}"><button type="button" class="excluir-card" data-excluir-an="${a.id}" title="Excluir este anúncio">Excluir</button>${rosto ? `<div class="foto"><img src="${IMG(rosto.id)}" alt=""></div>` : '<div class="foto sem-foto">Sem imagem</div>'}
      <div class="legenda"><b>${esc(a.nome)}</b><span>${FORMATO[a.formato]}</span><span>${n} foto(s) na ordem, ${m.cores.length} cor(es)</span><span class="${fl ? 'alerta-mini' : 'ok-mini'}">${fl ? fl + ' pendência(s)' : 'Completo'}</span></div></a>`; };
    const soltos = DB.anuncios.filter(a => !demandaDe(a));
    return `<div class="cabeca"><h1>Anúncios <small>${DB.anuncios.length}</small></h1><form class="acoes" id="novo-anuncio"><input name="nome" placeholder="Nome do anúncio novo" required>
      <select name="formato">${Object.entries(FORMATO).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button class="b">Criar anúncio</button></form></div>
    ${DB.demandas.map(d => `<h2 class="grupo">${esc(d.tarefa)} <small>${d.marketplaces.map(m => MKT[m]).join(', ')}</small></h2><div class="grade larga">${DB.anuncios.filter(a => a.demanda === d.id).map(cart).join('')}</div>`).join('')}
    ${soltos.length ? `<h2 class="grupo">Sem tarefa do ClickUp <small>criados à mão</small></h2><div class="grade larga">${soltos.map(cart).join('')}</div>` : ''}`;
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
      ${INTEG().url ? `<button class="b" id="enviar-sistema" data-id="${a.id}">Enviar para o ${esc(INTEG().nome)}</button>` : ''}
      <button class="b verde" id="baixar-zip" data-id="${a.id}">Exportar</button><button class="b claro" id="excluir-anuncio" data-id="${a.id}">Excluir</button></div></div>
    <div class="montagem"><div class="editor"><div class="bloco faltas" id="faltas"></div><section id="editor" class="editor"></section></div><aside class="previa">
      <div class="troca" role="group" aria-label="Marketplace do anúncio"><button data-modo="ml"><span class="mk-marca ml"><img src="/marca-mk/ml" alt="" onerror="this.remove()"></span>Mercado Livre</button><button data-modo="shopee"><span class="mk-marca shopee"><img src="/marca-mk/shopee" alt="" onerror="this.remove()"></span>Shopee</button></div>
      <div class="celular"><div class="tela" id="tela"></div></div><p class="pequeno" id="dica-previa">Prévia de como o anúncio aparece no celular. Deslize as fotos e toque nas cores.</p></aside></div>`;
  },
};

async function RENDER() {
  await SRV.carregar();
  const [caminho, busca = ''] = ROTA.split('?'), q = Object.fromEntries(new URLSearchParams(busca)), m = /^\/anuncios\/(\d+)$/.exec(caminho);
  const nome = m ? 'anuncio' : ({ '/': 'fila', '/catalogo': 'catalogo', '/capas': 'capas', '/anuncios': 'anuncios', '/referencias': 'referencias', '/erros': 'erros', '/painel': 'painel', '/medidas': 'medidas', '/demandas': 'demandas', '/integracoes': 'integracoes' }[caminho] || 'fila');
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
  const linhasCor = Object.entries(porCor).map(([cor, it]) => `<div class="falta-cor"><b>${esc(cor)}</b>${it.map(i => `<span class="chip-falta" title="${esc(i.texto)}">${i.faltam} ${NOME[i.tipo][i.faltam === 1 ? 0 : 1]}</span>`).join('')}</div>`).join('');
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

// ---- enviar para o sistema do usuario (B2X)
document.addEventListener('click', async e => {
  const b = e.target.closest('#enviar-sistema'); if (!b) return; const aid = +b.dataset.id, nome = INTEG().nome, pend = faltas(aid).itens;
  if (pend.length && !b.dataset.forcar) {
    abrirJanela(`<h2>Enviar ao ${esc(nome)} incompleto?</h2><div class="nota ruim"><b>O anúncio ainda tem pendências</b>${pend.map(t => `<span>${esc(t)}</span>`).join('')}</div>
      <p class="pequeno">Os bots só conseguem enviar anúncios completos. Você pode enviar assim mesmo${INTEG().rascunho ? ', e ele entra como rascunho' : ''}.</p>
      <div class="acoes"><button class="b" data-enviar-forcado="${aid}">Enviar mesmo assim</button><button class="b claro" data-fechar>Cancelar</button></div>`);
    return;
  }
  window.menork.aviso(`Enviando ao ${nome}…`, null, null, 120);
  try { const r = await SRV.enviarSistema(aid, false); window.menork.aviso(r.msg, null, null, 10); window.AO_DESENHAR(aid); } catch (err) { window.menork.aviso(err.message, null, null, 15); window.AO_DESENHAR(aid); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-enviar-forcado]'); if (!b) return; const aid = +b.dataset.enviarForcado; fecharJanela();
  window.menork.aviso(`Enviando ao ${INTEG().nome}…`, null, null, 120);
  try { const r = await SRV.enviarSistema(aid, true); window.menork.aviso(r.msg, null, null, 10); } catch (err) { window.menork.aviso(err.message, null, null, 15); }
  window.AO_DESENHAR(aid);
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
  try { await SRV.salvarIntegracao({ nome: f.nome.value, url: f.url.value, chave: f.chave.value, rascunho: f.rascunho.checked }); await RENDER(); window.menork.aviso('Integração salva.'); } catch (err) { window.menork.aviso(err.message, null, null, 10); }
});
document.addEventListener('click', async e => {
  if (e.target.closest('#testar-integ')) { window.menork.aviso('Testando a conexão…', null, null, 30); try { const r = await SRV.testarIntegracao(); window.menork.aviso(r.msg, null, null, 12); } catch (err) { window.menork.aviso(err.message, null, null, 12); } }
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
async function carregarAnuncios(loja, busca, pagina) {
  const ch = loja + '|' + busca; const atual = LOJAS.anuncios[ch];
  if (atual && atual.carregando) return;
  LOJAS.anuncios[ch] = { ...(atual || { lista: [], total: 0 }), carregando: true, erro: '' };
  try { const r = await SRV.anunciosLoja(loja, busca, pagina);
    LOJAS.anuncios[ch] = { lista: pagina > 1 ? [...(atual?.lista || []), ...r.anuncios] : r.anuncios, total: r.total, pagina, carregando: false };
  } catch (e) { LOJAS.anuncios[ch] = { lista: atual?.lista || [], total: 0, pagina, carregando: false, erro: e.message }; }
  if (ROTA.startsWith('/lojas')) RENDER();
}
document.addEventListener('submit', e => { const f = e.target; if (f.id !== 'busca-loja') return; e.preventDefault(); IR(rota('/lojas', { loja: f.dataset.loja, busca: f.busca.value.trim() })); });
document.addEventListener('click', e => {
  if (e.target.closest('#recarregar-lojas')) { LOJAS.anuncios = {}; carregarLojas(true); }
  const m = e.target.closest('[data-mais-loja]'); if (m) { const [, busca = ''] = [0, ...(m.dataset.busca ? [m.dataset.busca] : [])]; carregarAnuncios(m.dataset.maisLoja, m.dataset.busca || '', (+m.dataset.pagina || 1) + 1); }
});

Object.assign(TELAS, {
  lojas(q) {
    const i = INTEG(), nome = esc(i.nome || 'sistema');
    if (!i.url || !i.tem_chave) return `<div class="cabeca"><h1>Lojas dos clientes</h1></div><div class="vazio"><h2>Ligue o ${nome} primeiro</h2><p>As lojas e os anúncios vêm do ${nome}. Configure o endereço e a chave em ${elo('/integracoes', 'Integrações')}.</p></div>`;
    if (!LOJAS.clientes && !LOJAS.erro) { carregarLojas(); return `<div class="cabeca"><h1>Lojas dos clientes</h1></div><div class="vazio"><h2>Buscando os clientes no ${nome}…</h2></div>`; }
    if (LOJAS.erro) return `<div class="cabeca"><h1>Lojas dos clientes</h1><div class="acoes"><button class="b claro" id="recarregar-lojas">Tentar de novo</button></div></div><div class="vazio"><h2>Não consegui ler as lojas</h2><p>${esc(LOJAS.erro)}</p></div>`;
    const todas = LOJAS.clientes.flatMap(c => c.lojas.map(l => ({ ...l, cliente: c.nome })));
    const loja = todas.find(l => l.id === q.loja) || null, busca = q.busca || '';
    const lista = `<aside class="bloco lojas-lista">${LOJAS.clientes.map(c => `<details ${c.lojas.some(l => l.id === q.loja) || LOJAS.clientes.length <= 3 ? 'open' : ''}><summary>${esc(c.nome)} <small>${c.lojas.length} loja(s)</small></summary>
      ${c.lojas.map(l => elo(rota('/lojas', { loja: l.id }), `<span class="mk">${esc(MKT[l.marketplace] ? l.marketplace : (l.marketplace || '—'))}</span>${esc(l.nome)}`, l.id === q.loja ? 'ativo' : '')).join('') || '<p class="pequeno">Sem lojas.</p>'}</details>`).join('') || '<p class="pequeno">Nenhum cliente no sistema.</p>'}</aside>`;
    let direita;
    if (!loja) direita = `<div class="vazio"><h2>Escolha uma loja</h2><p>Clique numa loja de um cliente, à esquerda, para ver os anúncios dela.</p></div>`;
    else {
      const ch = loja.id + '|' + busca, st = LOJAS.anuncios[ch];
      if (!st) carregarAnuncios(loja.id, busca, 1);
      const itens = st?.lista || [];
      direita = `<div class="cabeca"><h1>${esc(loja.nome)} <small>${esc(loja.cliente)} · ${esc(MKT[loja.marketplace] || loja.marketplace)}${st && !st.carregando ? ` · ${st.total} anúncio(s)` : ''}</small></h1>
        ${loja.url ? `<div class="acoes"><a class="b claro" href="${esc(loja.url)}" target="_blank" rel="noopener">Abrir a loja no ${esc(MKT[loja.marketplace] || 'marketplace')}</a></div>` : ''}</div>
        <form class="busca-loja" id="busca-loja" data-loja="${esc(loja.id)}"><input type="search" name="busca" value="${esc(busca)}" placeholder="Buscar pelo título nesta loja"><button class="b claro">Buscar</button></form>
        ${st?.erro ? `<div class="vazio"><h2>Não consegui ler os anúncios</h2><p>${esc(st.erro)}</p></div>` : ''}
        ${itens.length ? `<div class="grade anuncios-loja">${itens.map(a => `<div class="cartao">${a.foto ? `<div class="foto"><img loading="lazy" src="${esc(a.foto)}" alt="" referrerpolicy="no-referrer"></div>` : '<div class="foto sem-foto">Sem foto</div>'}
          <div class="legenda"><b title="${esc(a.titulo)}">${esc(a.titulo)}</b>${a.preco ? `<span class="preco-loja">R$ ${esc(a.preco)}</span>` : ''}
          <span>${[a.status, a.vendas != null ? a.vendas + ' venda(s)' : '', a.estoque != null ? a.estoque + ' em estoque' : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="pequeno">${esc(a.id)}</span>${a.link ? `<a class="abrir" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir no marketplace</a>` : ''}</div></div>`).join('')}</div>` : (st && !st.carregando && !st.erro ? `<div class="vazio"><h2>Nenhum anúncio${busca ? ' com esse título' : ''}</h2></div>` : '')}
        ${st?.carregando ? `<p class="dica">Buscando anúncios no ${nome}…</p>` : ''}
        ${st && !st.carregando && itens.length < st.total ? `<div class="acoes"><button class="b claro" data-mais-loja="${esc(loja.id)}" data-busca="${esc(busca)}" data-pagina="${st.pagina}">Carregar mais (${st.total - itens.length} restantes)</button></div>` : ''}`;
    }
    return `<div class="cabeca"><h1>Lojas dos clientes <small>${todas.length} loja(s) de ${LOJAS.clientes.length} cliente(s), lidas do ${nome}</small></h1><div class="acoes"><button class="b claro" id="recarregar-lojas">Atualizar</button></div></div>
      <div class="lojas-tela">${lista}<section>${direita}</section></div>`;
  },
  integracoes() {
    const i = INTEG();
    return `<div class="cabeca"><h1>Integrações <small>ligue o site ao seu sistema para enviar anúncios prontos</small></h1></div>
    <div class="bloco"><h2>${esc(i.nome)} <small>${i.url && i.tem_chave ? 'configurado' : 'ainda não configurado'}</small></h2>
      <form class="integ-form" id="form-integ">
        <label>Nome do sistema<input type="text" name="nome" value="${esc(i.nome)}" maxlength="30"></label>
        <label>Endereço da API<input type="url" name="url" value="${esc(i.url)}" placeholder="https://seu-sistema.com.br/api"></label>
        <label class="largo">Chave da API ${i.tem_chave ? '<span class="ok-mini">· chave salva (por segurança ela não aparece)</span>' : ''}<input type="password" name="chave" autocomplete="off" placeholder="${i.tem_chave ? 'deixe vazio para manter a chave salva' : 'cole aqui a chave gerada no seu sistema'}"></label>
        <label class="linha largo"><input type="checkbox" name="rascunho" ${i.rascunho ? 'checked' : ''}> Mandar como rascunho (o anúncio entra no sistema sem ser publicado)</label>
        <div class="acoes largo"><button class="b">Salvar</button><button type="button" class="b claro" id="testar-integ">Testar conexão</button>${i.tem_chave ? '<button type="button" class="b claro" id="apagar-chave">Apagar a chave</button>' : ''}</div>
      </form></div>
    <div class="bloco"><h2>Como funciona</h2><ul class="envios-feitos">
      <li>Dentro de cada anúncio aparece o botão <b>Enviar para o ${esc(i.nome)}</b>. Ele manda título, preço, descrição, as fotos na ordem (a 1 é a capa), as cores e os marketplaces da tarefa, com os arquivos das imagens junto.</li>
      <li>Se o anúncio já foi enviado antes, o mesmo botão <b>atualiza</b> o anúncio lá, em vez de criar outro.</li>
      <li>Os bots também podem enviar, com <code>menork.ps1 enviar-sistema</code>, mas só anúncios completos.</li>
      <li>A chave fica guardada só no seu PC. Ela não vai para o GitHub nem aparece na tela.</li>
      <li>O seu sistema precisa ter dois endereços para receber: <code>/menork/ping</code> (teste) e <code>/menork/anuncios</code> (receber o anúncio). O formato está no arquivo <b>INTEGRACAO.md</b>, na pasta do site.</li></ul></div>`;
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
      return `<div class="ref ${on ? 'escolhida' : ''}">${cartao(i)}${comEstilo ? `<label class="estilo-ref">Estilo${campoEstilo(i.id, i.estilo)}</label>` : ''}<div class="caminho"><code>${esc(CAMINHO(i))}</code><div class="acoes"><button class="b ${on ? '' : 'claro'}" data-usar-ref="${i.id}">${on ? 'No comando (' + (REFS_ESCOLHIDAS.indexOf(i.id) + 1) + '). Tirar' : 'Usar no comando'}</button><button class="b claro" data-copiar="${esc(CAMINHO(i))}">Copiar caminho</button></div></div></div>`; };
    const semEstilo = comEstilo ? l.filter(i => !i.estilo).length : 0;
    return `<div class="cabeca"><h1>Referências aprovadas <small>${refs.length} imagem(ns) que os bots devem copiar</small></h1></div>
    <div class="bloco comando"><h2>Comando para o gerar.ps1 <small>${REFS_ESCOLHIDAS.length} de 5 arquivos escolhidos</small></h2>
      ${REFS_ESCOLHIDAS.length ? `<textarea id="txt-cmd" rows="3" readonly>${esc(cmd)}</textarea><div class="acoes"><button class="b" data-copiar-de="txt-cmd">Copiar comando</button><button class="b claro" data-limpar-refs>Limpar escolha</button></div>` : '<p class="pequeno">Clique em "Usar no comando" nas referências abaixo (até 5). O site monta o trecho <code>-Referencias "caminho1","caminho2"</code> com o caminho de cada arquivo.</p>'}</div>
    <div class="abas-ref">${ABAS.map(([k, nome]) => elo(rota('/referencias', { tipo: k }), `${nome} <small>${qtd[k]}</small>`, k === aba ? 'ativo' : '')).join('')}</div>
    ${comEstilo && estilos.length ? `<div class="filtros">${elo(rota('/referencias', { tipo: aba }), 'Todos os estilos', 'ficha ' + (!q.estilo ? 'ativo' : ''))}${estilos.map(e => elo(rota('/referencias', { tipo: aba, estilo: e || '—' }), esc(e || 'Sem estilo'), 'ficha ' + (q.estilo === (e || '—') ? 'ativo' : ''))).join('')}</div>` : ''}
    ${aba === 'cena' ? '<p class="dica">São as cenas que o gerador usa para criar as fotos IA: ele junta o fundo branco do modelo com uma cena do estilo certo.</p>' : ''}
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
  }
  document.addEventListener('change', e => {
    if (!e.target.matches('.marca input')) return;
    e.target.closest('.cartao').classList.toggle('marcado', e.target.checked); atualizarBarra();
  });
  $('#barra-todas')?.addEventListener('click', () => { $$('.cartao[data-id]:not([hidden])').forEach(c => { c.classList.add('marcado'); $('input', c).checked = true; }); atualizarBarra(); });
  $('#barra-limpar')?.addEventListener('click', () => { $$('.cartao.marcado').forEach(c => { c.classList.remove('marcado'); $('input', c).checked = false; }); atualizarBarra(); });
  $$('[data-lote]').forEach(b => b.addEventListener('click', async () => {
    const ids = marcados(), acao = b.dataset.lote; if (!ids.length) return;
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
      const caixa = $('.marca input', c); caixa.checked = !caixa.checked;
      c.classList.toggle('marcado', caixa.checked); atualizarBarra(); return;
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
  const MODOS = { shopee: { nome: 'Shopee', fotos: 9 }, ml: { nome: 'Mercado Livre', fotos: 10, titulo: 60 } };
  let E = null, corAtiva = null, corPrevia = null;
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

  function espacos(lista, total, primeiro) {
    return Array.from({ length: total }, (_, n) => { const i = lista[n], rot = n === 0 ? primeiro : String(n + 1), cls = n === 0 ? 'capa' : '';
      return i ? `<div class="slot cheio ${cls}" data-pos="${n}" data-img="${i.id}" draggable="true" title="${esc(i.tipo_nome)}${i.cor ? ', ' + esc(i.cor) : ''}"><b>${rot}</b><img src="${IMG(i.id)}" data-ver="${i.id}" alt=""><button type="button" data-tirar-slot="${i.id}" title="Tirar" aria-label="Tirar">×</button></div>`
        : `<div class="slot vazio ${cls}" data-pos="${n}"><b>${rot}</b><span>${n === 0 ? 'Solte a ' + primeiro.toLowerCase() + ' aqui' : 'Vazio'}</span></div>`; }).join('');
  }

  function blocoTamanhos() {
    const cores = E.variacoes.length, t = E.tamanhos.length;
    return `<div class="bloco"><h2>Variação 2: Tamanho <small>${t ? t + ' tamanho(s)' : 'nenhum ainda'}</small></h2>
      <label class="campo-tam">Tamanhos<input id="c-tamanhos" data-campo="tamanhos" value="${esc(E.anuncio.tamanhos)}" placeholder="Ex.: 33/34, 35/36, 37/38 ou 34 a 39"></label>
      <div class="chips-tam">${E.tamanhos.map(x => `<span>${esc(x)}</span>`).join('')}</div>
      ${cores && t ? `<p class="pequeno">${cores} cor(es) × ${t} tamanho(s) = <b>${cores * t} variações</b>. ${ml() ? 'O Mercado Livre cria uma variação para cada cor com cada tamanho.' : 'A Shopee cruza a Variação 1 com a Variação 2 sozinha.'}</p>` : ''}</div>`;
  }

  function desenharEditor() {
    const a = E.anuncio, foco = document.activeElement?.id, M = MODOS[E.modo];
    if (ml() && !variacao(corAtiva)) corAtiva = E.variacoes[0]?.cor ?? null;
    const v = ml() ? variacao(corAtiva) : null;
    const lista = ml() ? (v ? v.fotos : []) : [E.capa, ...E.galeria];
    const cheias = lista.filter(Boolean).length;
    document.getElementById('resumo').textContent = ml()
      ? `Mercado Livre: ${E.variacoes.length} cor(es), cada uma com as suas fotos`
      : `Shopee: ${cheias} de ${M.fotos} fotos, ${E.variacoes.length} variação(ões) de cor`;
    document.querySelectorAll('.troca [data-modo]').forEach(b => b.classList.toggle('ativo', b.dataset.modo === E.modo));
    const dica = document.getElementById('dica-previa');
    if (dica) dica.textContent = ml() ? 'Prévia no jeito do Mercado Livre: toque numa cor e as fotos mudam para as daquela cor.' : 'Prévia no jeito da Shopee: deslize as fotos e toque numa cor para ver a capa daquela variação.';

    const fotosCol = ml()
      ? `<h2>Fotos da cor <small>${v ? v.fotos.length : 0} de 10</small></h2>
         ${E.variacoes.length ? `<div class="abas-cor">${E.variacoes.map(x => `<button type="button" data-cor-aba="${esc(x.cor)}" class="${x.cor === corAtiva ? 'ativo' : ''}"><img src="/mini/${(x.fotos[0] || x.capa).id}" alt="">${esc(x.cor)} <small>${x.fotos.length}</small></button>`).join('')}</div>
         <div class="slots" id="slots">${espacos(lista, M.fotos, 'Principal')}</div>
         <p class="pequeno">No Mercado Livre cada cor tem as suas fotos. A primeira é a principal da cor: use o fundo branco ou a capa daquela cor.</p>`
        : vaga('Nenhuma cor ainda. Clique em Nova cor numa foto de fundo branco.')}`
      : `<h2>Fotos do anúncio <small>${cheias} de ${M.fotos}</small></h2><div class="slots" id="slots">${espacos(lista, M.fotos, 'Capa')}</div>
         <p class="pequeno">A Shopee aceita 9 fotos. A primeira é a capa. Arraste para mudar a ordem ou para colocar uma imagem.</p>`;

    const limite = M.titulo ? ` maxlength="${M.titulo + 40}"` : '';
    const dados = `<div class="bloco dados">
        <label class="largo">Título do anúncio <small id="conta-titulo"></small><input id="c-titulo" data-campo="titulo" value="${esc(a.titulo)}"${limite} placeholder="Ex.: Chinelo feminino nuvem confortável"></label>
        <label>Preço<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>
        <label>Preço antigo, riscado<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>
        <label class="largo">Descrição<textarea id="c-descricao" data-campo="descricao" rows="4" placeholder="Texto da descrição do anúncio">${esc(a.descricao)}</textarea></label>
      </div>`;

    const cores = ml()
      ? `<div class="bloco"><h2>Variação 1: Cor <small>clique numa cor para montar as fotos dela</small></h2>
          <div class="trilho">${E.variacoes.map(x => `<div class="peca var-cor ${x.cor === corAtiva ? 'escolhida' : ''}" data-cor="${esc(x.cor)}" data-cor-alvo="${esc(x.cor)}">
            <div class="foto" data-cor-aba="${esc(x.cor)}"><img loading="lazy" src="/mini/${(x.fotos[0] || x.capa).id}" alt=""></div>
            <input class="nome-cor" value="${esc(x.cor)}" aria-label="Nome da cor"><span class="rotulo">${x.fotos.length} de 10 fotos</span>
            <div class="botoes">${botao('tirar_cor', 'Tirar a cor')}</div></div>`).join('') || vaga('Nenhuma cor ainda. Clique em Nova cor numa foto de fundo branco.')}</div></div>`
      : `<div class="bloco"><h2>Variação 1: Cor <small>cada cor tem a sua capa da variação</small></h2>
          <div class="trilho">${E.variacoes.map(x => `<div class="peca var-cor" data-cor="${esc(x.cor)}" data-cor-alvo="${esc(x.cor)}">
            <i class="etiqueta">Capa da variação</i><div class="foto" data-ver="${x.capa.id}"><img loading="lazy" src="${IMG(x.capa.id)}" alt=""></div>
            <input class="nome-cor" value="${esc(x.cor)}" aria-label="Nome da cor">
            <div class="botoes">${botao('tirar_cor', 'Tirar a cor')}</div></div>`).join('') || vaga('Nenhuma cor ainda. Clique em Cor numa foto (de preferência a capa daquela cor).')}</div>
          <p class="pequeno">Para trocar a capa de uma variação, arraste uma imagem aprovada para cima da cor, ou clique em Cor na imagem e escolha qual. Cor nova usa a cor escrita na própria foto.</p></div>`;

    const usadas = new Set(ml() ? (v ? v.fotos.map(i => i.id) : []) : [E.capa?.id, ...E.galeria.map(i => i.id), ...E.variacoes.map(x => x.capa.id)]);
    const fora = [...E.todas.filter(i => !usadas.has(i.id)), ...E.disponiveis.filter(i => i.status !== 'aprovada')];
    const colocar = ml()
      ? (v ? botao('foto_cor', 'Foto da cor', 'Coloca nas fotos da cor ' + v.cor) : '') + botao('cor', 'Nova cor', 'Cria uma cor nova com esta foto como principal')
      : botao('capa', 'Capa') + botao('foto', 'Foto') + botao('variacao', 'Cor', 'Usa como capa da variação de uma cor');
    editor.innerHTML = `<div class="com-slots">
      <div class="slots-col">${fotosCol}</div>
      <div class="resto">${dados}${cores}${blocoTamanhos()}
      <div class="bloco"><h2>Imagens deste anúncio fora ${ml() ? (v ? 'das fotos da cor ' + esc(v.cor) : 'das cores') : 'das fotos'} <small>${fora.length}</small></h2>
        <div class="trilho">${fora.map(i => peca(i, colocar + botao('desvincular', '×', 'Tirar deste anúncio'), { arrasta: i.status === 'aprovada' })).join('') || vaga('Tudo que está neste anúncio já foi colocado.')}</div></div>
      ${E.sugestoes.length ? `<div class="bloco"><h2>Outras aprovadas de ${esc(E.produto)} <small>ainda fora deste anúncio</small></h2>
        <div class="trilho">${E.sugestoes.map(i => peca(i, colocar, { arrasta: true })).join('')}</div></div>` : ''}
      </div></div>`;
    if (foco) document.getElementById(foco)?.focus();
    contarTitulo();
  }
  function contarTitulo() {
    const t = document.getElementById('c-titulo'), c = document.getElementById('conta-titulo'); if (!t || !c) return;
    const max = MODOS[E.modo].titulo, n = t.value.trim().length;
    c.textContent = max ? `${n} de ${max} caracteres` : n + ' caracteres';
    c.classList.toggle('passou', !!max && n > max);
  }

  function escolherCor(p, imagem) {  // mostra as cores como botoes na propria imagem
    if (!E.variacoes.length) return fazer({ acao: 'cor', imagem });
    const caixa = p.querySelector('.botoes'); caixa.classList.add('escolha');
    caixa.innerHTML = '<span class="pequeno">Capa da variação de:</span>' +
      E.variacoes.map(x => `<button type="button" data-acao="var_para" data-para="${esc(x.cor)}">${esc(x.cor)}</button>`).join('') +
      '<button type="button" data-acao="var_para" data-para="">Cor nova</button>';
  }

  editor.addEventListener('click', e => {
    const aba = e.target.closest('[data-cor-aba]'); if (aba) { corAtiva = corPrevia = aba.dataset.corAba; return desenhar(); }
    const ts = e.target.closest('[data-tirar-slot]');
    if (ts) return ml() ? fazer({ acao: 'tirar_foto_cor', cor: corAtiva, imagem: +ts.dataset.tirarSlot }) : fazer({ acao: 'tirar', imagem: +ts.dataset.tirarSlot });
    if (e.target.closest('.slot.vazio')) return aviso('Arraste uma imagem aprovada para cá, ou use os botões nas imagens ao lado.');
    const ver = e.target.closest('[data-ver]'); if (ver) return abrir(+ver.dataset.ver);
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const p = b.closest('.peca'), imagem = +p.dataset.img, acao = b.dataset.acao;
    if (acao === 'tirar_cor') return fazer({ acao, cor: p.dataset.cor });
    if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(() => document.dispatchEvent(new Event('menork:mudou')));
    if (acao === 'variacao') return escolherCor(p, imagem);
    if (acao === 'var_para') return fazer({ acao: 'cor', imagem, cor: b.dataset.para });
    if (acao === 'foto_cor') return fazer({ acao, cor: corAtiva, imagem });
    if (acao === 'foto' && E.galeria.length >= MODOS.shopee.fotos - 1) return aviso('As 9 fotos já estão preenchidas. Tire uma para colocar outra.');
    if (acao === 'cor' && ml()) { const img = [...E.todas, ...E.sugestoes].find(i => i.id === imagem); corAtiva = img?.cor || null; }
    fazer({ acao, imagem });
  });
  editor.addEventListener('input', e => {
    const campo = e.target.dataset.campo; if (!campo) return;
    E.anuncio[campo] = e.target.value; contarTitulo(); desenharPrevia();
  });
  editor.addEventListener('change', e => {
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
    let capa = E.capa ? E.capa.id : null, fotos = E.galeria.map(i => i.id);
    if (a.de === 0) capa = null; else if (a.de !== null) fotos.splice(a.de - 1, 1);
    if (para === 0) { if (capa) fotos.splice(a.de > 0 ? a.de - 1 : 0, 0, capa); capa = a.img; }
    else fotos.splice(Math.min(para - 1, fotos.length), 0, a.img);
    if (fotos.length > MODOS.shopee.fotos - 1) return aviso('As 9 fotos já estão preenchidas. Tire uma para colocar outra.');
    fazer({ acao: 'slots', ids: [capa, ...fotos] });
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
    const comprar = '<div class="comprar"><span>Adicionar ao carrinho</span><span class="forte">Comprar agora</span></div>';
    tela.className = 'tela ' + (ml() ? 'modelo-b mk-ml' : 'modelo-a mk-shopee');
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

RENDER().catch(e => window.menork.aviso(e.message));