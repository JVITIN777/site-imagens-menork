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
  async function decidir(ids, acao) {
    try { await api('/api/acao', { ids, acao }); } catch (e) { return aviso(e.message); }
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
    if (acao === 'ref_sim' || acao === 'ref_nao') {
      const aprovadas = ids.filter(id => cartao(id)?.dataset.status === 'aprovada');
      if (!aprovadas.length) return aviso('Só imagem aprovada pode virar referência. Aprove primeiro.');
      try { await api('/api/acao', { ids: aprovadas, acao });
        const msg = `${aprovadas.length} imagem(ns) ${acao === 'ref_sim' ? 'agora são referência dos bots' : 'saíram das referências'}.` + (aprovadas.length < ids.length ? ` ${ids.length - aprovadas.length} não aprovada(s) ficaram de fora.` : '');
        aviso(msg); location.reload(); } catch (e) { aviso(e.message); }
      return;
    }
    if (acao !== 'classificar') return decidir(ids, acao);
    const d = { ids, acao, produto: $('#l-produto').value, cor: $('#l-cor').value, tipo: $('#l-tipo').value, anuncio: $('#l-anuncio').value };
    const estilo = ($('#l-estilo')?.value || '').trim();
    if (!d.produto && !d.cor && !d.tipo && !d.anuncio && !estilo) return aviso('Preencha produto, cor, tipo, anúncio ou estilo antes de aplicar.');
    try {
      if (d.produto || d.cor || d.tipo || d.anuncio) await api('/api/acao', d);
      if (estilo) await api('/api/acao', { ids, acao: 'estilo', estilo });
      location.reload();
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
    $('#v-img').src = '/img/' + id; $('#v-link').href = '/img/' + id;
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
    const mostrar = f => { $('#v-fb').src = '/img/' + f.id; $('#v-fb-cor').textContent = f.cor ? '· ' + f.cor : ''; $$('img', op).forEach(i => i.classList.toggle('ativo', +i.dataset.id === f.id)); };
    if (fbs.length > 1) fbs.forEach(f => { const i = document.createElement('img'); i.src = '/mini/' + f.id; i.dataset.id = f.id; i.title = f.cor; i.onclick = () => mostrar(f); op.append(i); });
    if (fbs.length) mostrar(fbs[0]);
    $('#v-aprovar').hidden = d.status === 'aprovada';
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
    await decidir([id], acao);
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
      if (window.ANUNCIO_ID) { document.dispatchEvent(new Event('menork:mudou')); return abrir(atual.id); }
      sessionStorage.setItem('reabrir', atual.id); location.reload();
    } catch (e) { aviso(e.message); }
  };
  document.addEventListener('keydown', e => {
    if (visor.hidden || e.target.matches('input,select,textarea')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') fechar(); else if (k === 'arrowright') passo(1); else if (k === 'arrowleft') passo(-1);
    else if (k === 'a' && !$('#v-aprovar').hidden) decidirNoVisor('aprovar'); else if (k === 'r') decidirNoVisor('reprovar');
  });
  try { const r = sessionStorage.getItem('reabrir'); if (r) { sessionStorage.removeItem('reabrir'); if (cartao(r)) abrir(+r); } } catch (e) {}

  window.menork = { api, aviso, abrir };

  // ---- enviar e procurar
  $('#enviar')?.addEventListener('change', async e => {
    const f = new FormData(); [...e.target.files].forEach(a => f.append('arquivos', a)); f.append('anuncio', e.target.dataset.anuncio || '');
    aviso('Enviando…', null, null, 120);
    try {
      const r = await api('/api/enviar', f, true);
      if (r.erros.length) alert('Não consegui ler: ' + r.erros.join(', '));
      sessionStorage.setItem('recado', `${r.novas} imagem(ns) nova(s)` + (r.repetidas ? `, ${r.repetidas} já existia(m) no catálogo` : '') + '.');
      location.reload();
    } catch (err) { aviso(err.message); }
  });
  $('#ler-agora')?.addEventListener('click', async () => {
    aviso('Procurando na pasta de entrada…', null, null, 120);
    try {
      const r = await api('/api/ler-agora', {});
      if (r.erro) return aviso(r.erro, null, null, 12);
      sessionStorage.setItem('recado', r.importadas ? `${r.importadas} imagem(ns) nova(s).` : 'Nenhuma imagem nova na pasta.'); location.reload();
    } catch (e) { aviso(e.message); }
  });
  try { const r = sessionStorage.getItem('recado'); if (r) { sessionStorage.removeItem('recado'); aviso(r); } } catch (e) {}
})();
