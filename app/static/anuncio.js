(() => {
  const { api, aviso, abrir } = window.menork;
  const ID = window.ANUNCIO_ID, editor = document.getElementById('editor'), tela = document.getElementById('tela');
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
      <div class="foto" data-ver="${i.id}"><img loading="lazy" src="/mini/${i.id}" alt=""></div>
      <span class="rotulo">${esc(i.tipo_nome)}${i.cor ? ' <em>' + esc(i.cor) + '</em>' : ''}</span>
      <div class="botoes">${pendente ? '<button type="button" data-ver="' + i.id + '">Aprovar primeiro</button>' : botoes}</div></div>`;
  }
  const vaga = texto => `<div class="vaga">${texto}</div>`;

  function espacos(lista, total, primeiro) {
    return Array.from({ length: total }, (_, n) => { const i = lista[n], rot = n === 0 ? primeiro : String(n + 1), cls = n === 0 ? 'capa' : '';
      return i ? `<div class="slot cheio ${cls}" data-pos="${n}" data-img="${i.id}" draggable="true" title="${esc(i.tipo_nome)}${i.cor ? ', ' + esc(i.cor) : ''}"><b>${rot}</b><img src="/mini/${i.id}" data-ver="${i.id}" alt=""><button type="button" data-tirar-slot="${i.id}" title="Tirar" aria-label="Tirar">×</button></div>`
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
        ${ml() ? `<label>Preço cheio (riscado)<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>
        <label>Preço promocional (o cliente paga)<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>
        <p class="pequeno largo">No Mercado Livre o anúncio sobe com o preço cheio e o promocional entra como promoção (desconto direto), com o riscado e o % OFF. A promoção renova sozinha a cada 30 dias. Sem preço cheio maior, sobe só com o preço promocional, sem promoção.</p>`
        : `<label>Preço<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>
        <label>Preço antigo, riscado<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>`}
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
            <i class="etiqueta">Capa da variação</i><div class="foto" data-ver="${x.capa.id}"><img loading="lazy" src="/mini/${x.capa.id}" alt=""></div>
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
    if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(carregar);
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
        <div class="carrossel" id="carrossel">${fotos.map(f => `<img src="/img/${f.id}" alt="">`).join('') || `<div class="sem">${ml() ? 'Sem fotos nesta cor' : 'Sem capa'}</div>`}</div>
        ${sobre ? `<img class="sobre" src="/img/${sobre.capa.id}" alt="">` : ''}
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

  function desenhar() { desenharEditor(); desenharPrevia(); }
  document.addEventListener('menork:mudou', carregar);
  carregar().catch(e => aviso(e.message));
})();
