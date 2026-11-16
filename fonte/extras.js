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
  c.innerHTML = `<h2>O que falta ${f.produto ? 'para ' + esc(f.produto) : ''} <small>${f.tarefa ? 'metas lidas da tarefa ' + esc(f.tarefa) + ' no ClickUp' : 'anúncio sem tarefa: você define as metas'}</small></h2>
    <div class="metas">${f.kit ? '' : `<label>Fotos IA por cor <input type="number" min="0" max="30" data-meta="ia" data-an="${aid}" value="${f.metaIA}"></label>`}<label>Capas a produzir <input type="number" min="0" max="40" data-meta="capa" data-an="${aid}" value="${f.metaCapa}"></label>${f.kit ? '' : `<span class="pequeno">Por cor: ${f.info} informativos e ${f.tab} tabela. Só contam as imagens colocadas nas fotos do anúncio.</span>`}</div>` +
    (f.itens.length ? `<ul>${f.itens.map(t => `<li>${esc(t)}</li>`).join('')}</ul><div class="acoes pedir"><button class="b" id="pedir-bot" data-an="${aid}">Pedir ao bot o que falta</button><span class="pequeno">${pedido}</span></div>` : `<p class="completo">Nada faltando. O pacote deste anúncio pode ser montado.</p>${pedido ? `<p class="pequeno">${pedido}</p>` : ''}`) +
    `<p class="pequeno linha-capas">Capas deste anúncio: ${f.capas.aprovadas} aprovada(s) de ${f.capas.meta} pedida(s)${f.capas.esperando_aprovacao ? `, ${f.capas.esperando_aprovacao} esperando aprovação` : ''}.</p>` +
    (ENVIOS(aid).length ? `<h3>Envios para o ${esc(INTEG().nome)}</h3><ul class="envios-feitos">${ENVIOS(aid).map(v => `<li><b class="${v.ok ? 'ok-mini' : 'alerta-mini'}">${v.ok ? 'Enviado' : 'Falhou'}</b> em ${hora(v.quando)} por ${esc(v.por)}${v.id ? ` · código no ${esc(INTEG().nome)}: ${esc(v.id)}` : ''}${v.resposta ? ` · ${esc(v.resposta)}` : ''}</li>`).join('')}</ul>` : '') +
    (pk.length ? `<h3>Pacotes montados</h3><ul class="pacotes-feitos">${pk.map(p => `<li><b class="${p.status === 'completo' ? 'ok-mini' : 'alerta-mini'}">${p.status === 'completo' ? 'Completo' : 'Incompleto'}</b> Montado em ${hora(p.quando)} por ${esc(p.por)}${p.mk ? ' para ' + esc(MKT[p.mk] || p.mk) : ''}, ${p.arquivos} arquivo(s).${p.tem_zip ? ` <a href="/pacotes/${p.id}/zip">Abrir o ZIP guardado</a>` : ''}</li>`).join('')}</ul>` : '');
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
