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
      <button class="b verde" id="baixar-zip" data-id="${a.id}">Exportar</button><button class="b claro" id="excluir-anuncio" data-id="${a.id}">Excluir</button></div></div>
    <div class="montagem"><div class="editor"><div class="bloco faltas" id="faltas"></div><section id="editor" class="editor"></section></div><aside class="previa">
      <div class="troca" role="group" aria-label="Modelo da prévia"><button data-modelo="a" class="ativo">Preço primeiro</button><button data-modelo="b">Título primeiro</button></div>
      <div class="celular"><div class="tela" id="tela"></div></div><p class="pequeno">Prévia de como o anúncio aparece no celular. Deslize as fotos e toque nas cores.</p></aside></div>`;
  },
};

async function RENDER() {
  await SRV.carregar();
  const [caminho, busca = ''] = ROTA.split('?'), q = Object.fromEntries(new URLSearchParams(busca)), m = /^\/anuncios\/(\d+)$/.exec(caminho);
  const nome = m ? 'anuncio' : ({ '/': 'fila', '/catalogo': 'catalogo', '/capas': 'capas', '/anuncios': 'anuncios', '/referencias': 'referencias', '/erros': 'erros', '/painel': 'painel', '/medidas': 'medidas', '/demandas': 'demandas' }[caminho] || 'fila');
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
