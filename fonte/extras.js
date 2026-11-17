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

// ---- B2X: trocar as fotos de um anuncio que ja existe ou criar um anuncio novo (Shopee e Mercado Livre)
const B2 = { passo: '' };
const b2get = url => window.menork.api(url), b2post = (url, corpo) => window.menork.api(url, corpo);
const B2CANAL = { shopee: 'Shopee', mercadolivre: 'Mercado Livre' };
const semAc = t => String(t || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
function b2Tela(html) { abrirJanela(`<div class="b2x">${html}</div>`); }
function b2Carregando(txt) { b2Tela(`<h2>${esc(INTEG().nome)}</h2><p class="dica">${esc(txt)}</p>`); }
function b2Erro(err, voltar) { b2Tela(`<h2>Não deu certo</h2><div class="nota ruim"><span>${esc(err.message || err)}</span></div><div class="acoes">${voltar ? `<button class="b" data-b2="${voltar}">Voltar</button>` : ''}<button class="b claro" data-fechar>Fechar</button></div>`); }
const b2Lista = (t, xs) => xs && xs.length ? `<h3>${t}</h3><ul class="envios-feitos">${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '';

async function b2Inicio(aid) {
  const a = DB.anuncios.find(x => x.id === aid); B2.aid = aid; B2.canal = a.modo === 'ml' ? 'mercadolivre' : 'shopee';
  b2Carregando(`Buscando as lojas de ${B2CANAL[B2.canal]} no ${INTEG().nome}…`);
  try { const r = await b2get('/api/b2x/lojas?canal=' + B2.canal); B2.lojas = r.lojas; b2Lojas(); } catch (err) { b2Erro(err); }
}
function b2Lojas() {
  const nomeAn = DB.anuncios.find(x => x.id === B2.aid).nome;
  b2Tela(`<h2>${esc(INTEG().nome)}: ${esc(nomeAn)} <small>modo ${B2CANAL[B2.canal]}</small></h2>
    ${B2.lojas.length ? `<label class="campo-b2">Loja<select id="b2-loja">${B2.lojas.map(l => `<option value="${esc(l.id)}" ${l.id === B2.loja ? 'selected' : ''}>${esc(l.cliente)} · ${esc(l.nome)}${l.pj ? ' (' + esc(l.pj) + ')' : ''}${l.status && l.status !== 'active' ? ' · ' + esc(l.status) : ''}</option>`).join('')}</select></label>
    <p class="pequeno" id="b2-aviso-loja"></p>
    <div class="b2-escolha"><button class="b" data-b2="trocar">Trocar fotos de um anúncio que já existe</button><button class="b claro" data-b2="criar">Criar anúncio novo</button></div>
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
async function b2Categorias(busca) {
  const a = DB.anuncios.find(x => x.id === B2.aid), det = await b2get('/api/anuncios/' + B2.aid).catch(() => null);
  B2.titulo = det?.anuncio?.titulo || a.titulo || '';
  if (!B2.titulo.trim()) return b2Erro(new Error('Preencha o título do anúncio no site antes de criar.'), 'lojas');
  b2Carregando('Procurando a categoria certa…');
  try { const r = await b2post('/api/b2x/categorias', { loja: B2.loja, titulo: B2.titulo, busca: busca || '' });
    b2Tela(`<h2>Categoria <small>${esc(B2.lojaNome)}</small></h2><p class="pequeno">Sugestões para "${esc(B2.titulo)}". Se nenhuma servir, busque com outras palavras.</p>
      <div class="b2-anuncios">${r.categorias.map(c => `<button class="b2-anuncio" data-b2-cat="${esc(c.id)}" data-b2-cam="${esc(c.caminho)}"><span><b>${esc(c.caminho)}</b><small>${esc(c.id)}${c.motivo ? ' · ' + esc(c.motivo) : ''}</small></span></button>`).join('') || '<p class="dica">Nenhuma sugestão.</p>'}</div>
      <form id="b2-busca-cat" class="b2-linha"><input name="busca" value="${esc(busca || '')}" placeholder="Ex.: chinelo feminino"><button class="b claro">Buscar</button></form>
      <div class="acoes"><button class="b claro" data-b2="lojas">Voltar</button></div>`);
  } catch (err) { b2Erro(err, 'lojas'); }
}
async function b2Ficha(cat, caminho) {
  B2.categoria = cat; B2.caminho = caminho; b2Carregando('Lendo o que essa categoria pede…');
  try { const f = await b2get(`/api/b2x/ficha?loja=${encodeURIComponent(B2.loja)}&categoria=${encodeURIComponent(cat)}`); B2.ficha = f;
    const m = await b2get('/api/anuncios/' + B2.aid), temTabela = [...m.galeria, ...m.todas].some(i => i.tipo === 'tabela');
    const val = B2.form || { peso_g: 600, comprimento_cm: 30, largura_cm: 20, altura_cm: 12, estoque: 10, sku: '', tipo_anuncio: 'gold_special' };
    const campo = o => o.opcoes.length ? `<label>${esc(o.nome)}<select data-b2-attr="${esc(o.id)}"><option value="">escolha</option>${o.opcoes.map(x => `<option value="${esc(x.id)}" ${(val.attr || {})[o.id] === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>`
      : `<label>${esc(o.nome)}<input data-b2-attr="${esc(o.id)}" data-texto="1" value="${esc((val.attr || {})[o.id] || '')}"></label>`;
    b2Tela(`<h2>Ficha do anúncio <small>${esc(caminho)}</small></h2>
      <p class="pequeno">${esc(B2.lojaNome)} · ${m.variacoes.length} cor(es) × ${m.tamanhos.length} tamanho(s) = ${m.variacoes.length * m.tamanhos.length} variações · preço R$ ${esc(m.anuncio.preco)}</p>
      <form id="b2-ficha" class="b2-ficha">
        ${f.obrigatorios.length ? `<h3>A categoria pede</h3><div class="b2-grade">${f.obrigatorios.map(campo).join('')}</div>` : ''}
        ${B2.canal === 'shopee' ? `<h3>Marca</h3><div class="b2-grade"><label>Marca<select name="marca">${f.sem_marca ? '<option value="0">Sem marca</option>' : ''}${f.marcas.map(x => `<option value="${esc(x.id)}" ${val.marca === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>` : ''}
        ${B2.canal === 'mercadolivre' && f.tipos_anuncio.length ? `<h3>Tipo de anúncio</h3><div class="b2-grade"><label>Tipo<select name="tipo_anuncio">${f.tipos_anuncio.map(x => `<option value="${esc(x.id)}" ${val.tipo_anuncio === x.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>` : ''}
        <h3>Embalagem e estoque</h3><div class="b2-grade">
          <label>Peso (g)<input name="peso_g" inputmode="decimal" value="${esc(val.peso_g)}"></label><label>Comprimento (cm)<input name="comprimento_cm" inputmode="decimal" value="${esc(val.comprimento_cm)}"></label>
          <label>Largura (cm)<input name="largura_cm" inputmode="decimal" value="${esc(val.largura_cm)}"></label><label>Altura (cm)<input name="altura_cm" inputmode="decimal" value="${esc(val.altura_cm)}"></label>
          <label>Estoque de cada variação<input name="estoque" inputmode="numeric" value="${esc(val.estoque)}"></label><label>Começo do SKU (opcional)<input name="sku" value="${esc(val.sku)}" placeholder="Ex.: TA01"></label></div>
        ${B2.canal === 'shopee' ? `<label class="linha"><input type="checkbox" name="tabela" ${temTabela ? 'checked' : 'disabled'}> Mandar a tabela de medidas do anúncio ${temTabela ? '' : '(este anúncio não tem tabela aprovada)'}${f.tabela_exige ? ' · esta categoria exige' : ''}</label>` : (f.tabela_exige ? '<p class="pequeno">Esta categoria do Mercado Livre exige tabela de medidas: se a validação reclamar, ela precisa ser criada no B2X.</p>' : '')}
        ${f.dica ? `<p class="pequeno">${esc(f.dica)}</p>` : ''}
        <div class="acoes"><button class="b">Validar (nada é publicado)</button><button type="button" class="b claro" data-b2="categorias">Voltar</button></div></form>`);
  } catch (err) { b2Erro(err, 'categorias'); }
}
function b2LerFicha(f) {
  const attr = {}, atributos = [];
  f.querySelectorAll('[data-b2-attr]').forEach(x => { if (!x.value.trim()) return; attr[x.dataset.b2Attr] = x.value.trim(); atributos.push(x.dataset.texto ? { id: x.dataset.b2Attr, texto: x.value.trim() } : { id: x.dataset.b2Attr, opcao: x.value }); });
  const v = k => f.elements[k]?.value ?? '';
  const marcaSel = f.elements.marca, marca = marcaSel ? { id: marcaSel.value, nome: marcaSel.selectedOptions[0]?.textContent || '' } : null;
  B2.form = { attr, peso_g: v('peso_g'), comprimento_cm: v('comprimento_cm'), largura_cm: v('largura_cm'), altura_cm: v('altura_cm'), estoque: v('estoque'), sku: v('sku'), tipo_anuncio: v('tipo_anuncio') || 'gold_special', marca: marca?.id, tabela: !!f.elements.tabela?.checked };
  return { aid: B2.aid, loja: B2.loja, canal: B2.canal, categoria: B2.categoria, atributos, marca, peso_g: B2.form.peso_g, comprimento_cm: B2.form.comprimento_cm, largura_cm: B2.form.largura_cm, altura_cm: B2.form.altura_cm, estoque: B2.form.estoque, sku: B2.form.sku, tipo_anuncio: B2.form.tipo_anuncio, tabela: B2.form.tabela };
}
async function b2Validar(corpo) {
  B2.corpo = corpo; b2Carregando('Subindo as fotos e validando com o marketplace. Pode levar um minuto…');
  try { const r = await b2post('/api/b2x/criar', corpo); B2.pedido = r.pedido_id;
    b2Tela(`<h2>${r.validado ? 'Validado: pode criar' : 'O marketplace pediu correções'} <small>nada foi publicado ainda</small></h2>
      <p class="pequeno">${esc(B2.lojaNome)} · ${esc(B2.caminho)} · ${r.variacoes} variações · ${r.fotos} foto(s) enviadas</p>
      ${r.problemas.length ? `<div class="nota ruim"><b>Corrigir</b>${r.problemas.map(p => `<span>${esc(p)}</span>`).join('')}</div>` : ''}${b2Lista('Avisos', r.avisos)}
      <p class="pequeno">${B2.canal === 'shopee' ? 'Na Shopee o anúncio nasce OCULTO' : 'No Mercado Livre o anúncio nasce PAUSADO'}: revise lá e ative quando estiver tudo certo.</p>
      <div class="acoes">${r.validado ? '<button class="b verde" data-b2="publicar">Criar o anúncio</button>' : ''}<button class="b claro" data-b2="ficha">Voltar e corrigir</button></div>`);
  } catch (err) { b2Erro(err, 'ficha'); }
}
async function b2Publicar() {
  b2Carregando('Criando o anúncio no marketplace. Não feche esta janela…');
  try { const r = await b2post('/api/b2x/criar', { ...B2.corpo, confirmar: true, pedido_id: B2.pedido });
    b2Tela(r.criado ? `<h2>Anúncio criado</h2><div class="nota"><b>${esc(B2CANAL[B2.canal])}: ${r.anuncio_ids.map(esc).join(', ')}</b><span>Situação: ${esc(({ UNLIST: 'oculto', unlist: 'oculto', paused: 'pausado', PAUSED: 'pausado', active: 'ativo', NORMAL: 'ativo' })[r.status] || r.status || (B2.canal === 'shopee' ? 'oculto' : 'pausado'))}. Revise no marketplace e ative.</span>${r.divergencias.map(x => `<span>Ficou diferente: ${esc(x)}</span>`).join('')}</div>${b2Lista('Avisos', r.avisos)}<div class="acoes"><button class="b" data-fechar>Fechar</button></div>`
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
  ({ lojas: b2Lojas, trocar: () => b2Anuncios(''), anuncios: () => b2Anuncios(B2.busca || ''), mapear: () => b2Mapear(B2.anuncio), simular: b2Simular, confirmar: b2Confirmar,
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
        ${st?.diag && !st.carregando ? `<p class="pequeno">${st.diag.com_capa} com foto, ${st.diag.sem_capa} sem foto${st.diag.fotos_ao_vivo ? ' (fotos lidas agora no marketplace)' : ''}.${st.diag.sem_capa ? ' Clique em <b>Atualizar</b> para buscar as fotos de novo.' : ''}</p>` : ''}
        ${st?.carregando && st.aoVivo ? '<p class="dica">Lendo as fotos agora no marketplace; pode levar até 1 minuto…</p>' : ''}
        ${itens.length ? `<div class="grade anuncios-loja">${itens.map(a => `<div class="cartao">${a.foto ? `<div class="foto"><img loading="lazy" src="${esc(a.foto)}" alt="" referrerpolicy="no-referrer" data-foto-mk="${esc(a.foto)}"></div>` : '<div class="foto sem-foto">Sem foto</div>'}
          <div class="legenda"><b title="${esc(a.titulo)}">${esc(a.titulo)}</b>${a.preco ? `<span class="preco-loja">R$ ${esc(a.preco)}</span>` : ''}
          <span>${[a.status, a.vendas != null ? a.vendas + ' venda(s)' : '', a.estoque != null ? a.estoque + ' em estoque' : ''].filter(Boolean).map(esc).join(' · ')}</span>
          <span class="pequeno">${esc(a.id)}</span><button class="b claro" data-abrir-mk="${esc(a.id)}" data-loja="${esc(loja.id)}">Abrir e modificar</button>${a.link ? `<a class="abrir" href="${esc(a.link)}" target="_blank" rel="noopener">Abrir no marketplace</a>` : ''}</div></div>`).join('')}</div>` : (st && !st.carregando && !st.erro ? `<div class="vazio"><h2>Nenhum anúncio${busca ? ' com esse título' : ''}</h2></div>` : '')}
        ${st?.carregando ? `<p class="dica">Buscando anúncios no ${nome}…</p>` : ''}
        ${st && !st.carregando && itens.length < st.total ? `<div class="acoes"><button class="b claro" data-mais-loja="${esc(loja.id)}" data-busca="${esc(busca)}" data-pagina="${st.pagina}">Carregar mais (${st.total - itens.length} restantes)</button></div>` : ''}`;
    }
    return `<div class="cabeca"><h1>Lojas dos clientes <small>${todas.length} loja(s) de ${LOJAS.clientes.length} cliente(s), lidas do ${nome}</small></h1><div class="acoes"><button class="b claro" id="recarregar-lojas">Atualizar</button></div></div>
      <div class="lojas-tela">${lista}<section>${direita}</section></div>`;
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
      <li>A chave fica guardada só no seu PC. Ela não vai para o GitHub nem aparece na tela.</ul></div>`;
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
