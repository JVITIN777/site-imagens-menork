(() => {
  const { api, aviso, abrir } = window.menork;
  const ID = window.ANUNCIO_ID, editor = document.getElementById('editor'), tela = document.getElementById('tela');
  let E = null, modelo = 'a', corAtiva = null;
  try { modelo = localStorage.getItem('modelo-previa') || 'a'; } catch (e) {}
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function carregar() { E = await api('/api/anuncios/' + ID); desenhar(); }
  async function fazer(corpo) {
    try { E = await api('/api/anuncios/' + ID, corpo); desenhar(); } catch (e) { aviso(e.message); }
  }

  // ------------------------------------------------------------ editor
  const botao = (acao, texto, titulo, extra = '') => `<button type="button" data-acao="${acao}" title="${titulo || texto}" ${extra}>${texto}</button>`;
  function peca(i, botoes, opcoes = {}) {
    const pendente = i.status !== 'aprovada';
    return `<div class="peca ${pendente ? 'pendente' : ''}" data-img="${i.id}" ${opcoes.arrasta ? 'draggable="true"' : ''} ${opcoes.cor ? `data-cor="${esc(opcoes.cor)}"` : ''}>
      ${opcoes.numero ? `<i class="numero">${opcoes.numero}</i>` : ''}
      <div class="foto" data-ver="${i.id}"><img loading="lazy" src="/mini/${i.id}" alt=""></div>
      ${opcoes.cor !== undefined ? `<input class="nome-cor" value="${esc(opcoes.cor)}" aria-label="Nome da cor">` : `<span class="rotulo">${esc(i.tipo_nome)}${i.cor ? ' <em>' + esc(i.cor) + '</em>' : ''}</span>`}
      <div class="botoes">${pendente ? '<button type="button" data-ver="' + i.id + '">Aprovar primeiro</button>' : botoes}</div></div>`;
  }
  const vaga = texto => `<div class="vaga">${texto}</div>`;
  const colocar = botao('capa', 'Capa') + botao('foto', 'Foto') + botao('cor', 'Cor');

  function desenharEditor() {
    const a = E.anuncio, foco = document.activeElement?.id;
    const total = (E.capa ? 1 : 0) + E.galeria.length;
    document.getElementById('resumo').textContent = `${total} de 10 fotos, ${E.cores.length} cor(es)`;
    const slots = [E.capa, ...E.galeria];
    const slotHtml = Array.from({ length: 10 }, (_, n) => { const i = slots[n], rot = n === 0 ? 'Capa' : String(n + 1), cls = n === 0 ? 'capa' : '';
      return i ? `<div class="slot cheio ${cls}" data-pos="${n}" data-img="${i.id}" draggable="true" title="${esc(i.tipo_nome)}${i.cor ? ', ' + esc(i.cor) : ''}"><b>${rot}</b><img src="/mini/${i.id}" data-ver="${i.id}" alt=""><button type="button" data-tirar-slot="${i.id}" title="Tirar do anúncio" aria-label="Tirar do anúncio">×</button></div>`
        : `<div class="slot vazio ${cls}" data-pos="${n}"><b>${rot}</b><span>${n === 0 ? 'Solte a capa aqui' : 'Vazio'}</span></div>`; }).join('');
    editor.innerHTML = `<div class="com-slots">
      <div class="slots-col"><h2>Fotos do anúncio <small>${total} de 10</small></h2><div class="slots" id="slots">${slotHtml}</div><p class="pequeno">A primeira é a capa. Arraste para mudar a ordem ou para colocar uma imagem.</p></div>
      <div class="resto">
      <div class="bloco dados">
        <label class="largo">Título do anúncio <small id="conta-titulo"></small><input id="c-titulo" data-campo="titulo" value="${esc(a.titulo)}" placeholder="Ex.: Chinelo feminino nuvem confortável"></label>
        <label>Preço<input id="c-preco" data-campo="preco" value="${esc(a.preco)}" placeholder="49,90" inputmode="decimal"></label>
        <label>Preço antigo, riscado<input id="c-preco_antigo" data-campo="preco_antigo" value="${esc(a.preco_antigo)}" placeholder="79,90" inputmode="decimal"></label>
        <label class="largo">Descrição<textarea id="c-descricao" data-campo="descricao" rows="4" placeholder="Texto da descrição do anúncio">${esc(a.descricao)}</textarea></label>
      </div>
      <div class="bloco"><h2>Cores <small>uma foto por variação; o nome pode ser editado</small></h2>
        <div class="trilho">${E.cores.map(i => peca(i, botao('tirar_cor', 'Tirar'), { cor: i.nome_cor })).join('') || vaga('Nenhuma cor ainda. Clique em Cor numa foto de fundo branco.')}</div></div>
      <div class="bloco"><h2>Imagens deste anúncio fora das 10 fotos <small>${E.disponiveis.length}</small></h2>
        <div class="trilho">${E.disponiveis.map(i => peca(i, colocar + botao('desvincular', '×', 'Tirar deste anúncio'), { arrasta: i.status === 'aprovada' })).join('') || vaga('Tudo que está neste anúncio já foi colocado.')}</div></div>
      ${E.sugestoes.length ? `<div class="bloco"><h2>Outras aprovadas de ${esc(E.produto)} <small>ainda fora deste anúncio</small></h2>
        <div class="trilho">${E.sugestoes.map(i => peca(i, colocar, { arrasta: true })).join('')}</div></div>` : ''}
      </div></div>`;
    if (foco) document.getElementById(foco)?.focus();
    contarTitulo();
  }
  function contarTitulo() { const t = document.getElementById('c-titulo'); if (t) document.getElementById('conta-titulo').textContent = t.value.length + ' caracteres'; }

  editor.addEventListener('click', e => {
    const ts = e.target.closest('[data-tirar-slot]'); if (ts) return fazer({ acao: 'tirar', imagem: +ts.dataset.tirarSlot });
    if (e.target.closest('.slot.vazio')) return aviso('Arraste uma imagem aprovada para cá, ou clique em Capa ou Foto nas imagens ao lado.');
    const ver = e.target.closest('[data-ver]'); if (ver) return abrir(+ver.dataset.ver);
    const b = e.target.closest('[data-acao]'); if (!b) return;
    const p = b.closest('.peca'), imagem = +p.dataset.img, acao = b.dataset.acao;
    if (acao === 'esq' || acao === 'dir') {
      const ids = E.galeria.map(i => i.id), de = ids.indexOf(imagem), para = de + (acao === 'esq' ? -1 : 1);
      if (para < 0 || para >= ids.length) return;
      ids.splice(para, 0, ids.splice(de, 1)[0]); return fazer({ acao: 'ordenar', ids });
    }
    if (acao === 'foto' && E.galeria.length >= 9) return aviso('As 10 fotos já estão preenchidas. Tire uma para colocar outra.');
    if (acao === 'tirar_cor') return fazer({ acao, cor: p.dataset.cor });
    if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(carregar);
    fazer({ acao, imagem });
  });
  editor.addEventListener('input', e => {
    const campo = e.target.dataset.campo; if (!campo) return;
    E.anuncio[campo] = e.target.value; contarTitulo(); desenharPrevia();
  });
  editor.addEventListener('change', e => {
    if (e.target.dataset.campo) return api('/api/anuncios/' + ID, { acao: 'dados', [e.target.dataset.campo]: e.target.value }).then(() => window.AO_DESENHAR?.(ID)).catch(err => aviso(err.message));
    if (e.target.classList.contains('nome-cor')) fazer({ acao: 'renomear_cor', cor: e.target.closest('.peca').dataset.cor, novo: e.target.value });
  });
  // arrastar: entre os 10 espacos, ou de uma imagem aprovada para um espaco
  let arr = null;
  const limpar = () => editor.querySelectorAll('.arrastando,.alvo').forEach(x => x.classList.remove('arrastando', 'alvo'));
  editor.addEventListener('dragstart', e => {
    const s = e.target.closest('.slot.cheio, .peca[draggable="true"]'); if (!s) return;
    arr = { img: +s.dataset.img, de: s.classList.contains('slot') ? +s.dataset.pos : null }; s.classList.add('arrastando');
    e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(arr.img)); } catch (_) {}
  });
  editor.addEventListener('dragover', e => {
    const s = e.target.closest('.slot'); if (!arr || !s) return; e.preventDefault();
    editor.querySelectorAll('.alvo').forEach(x => x.classList.remove('alvo')); s.classList.add('alvo');
  });
  editor.addEventListener('drop', e => {
    const s = e.target.closest('.slot'); if (!arr || !s) return; e.preventDefault();
    const para = +s.dataset.pos, a = arr; arr = null; limpar();
    let capa = E.capa ? E.capa.id : null, fotos = E.galeria.map(i => i.id);
    if (a.de === 0) capa = null; else if (a.de !== null) fotos.splice(a.de - 1, 1);
    if (para === 0) { if (capa) fotos.splice(a.de > 0 ? a.de - 1 : 0, 0, capa); capa = a.img; }
    else fotos.splice(Math.min(para - 1, fotos.length), 0, a.img);
    if (fotos.length > 9) return aviso('As 10 fotos já estão preenchidas. Tire uma para colocar outra.');
    fazer({ acao: 'slots', ids: [capa, ...fotos] });
  });
  editor.addEventListener('dragend', () => { arr = null; limpar(); });
  document.getElementById('montar-auto').onclick = async () => {
    const antes = JSON.stringify([E.capa, E.galeria, E.cores]);
    await fazer({ acao: 'auto' });
    aviso(antes === JSON.stringify([E.capa, E.galeria, E.cores]) ? 'Nada para preencher: aprove e coloque imagens neste anúncio primeiro.' : 'Estrutura preenchida com as imagens aprovadas.');
  };

  // ------------------------------------------------------------ previa
  const numero = t => { const v = parseFloat(String(t).replace(/[^\d.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return isFinite(v) ? v : null; };
  const reais = t => { const v = numero(t); return v === null ? esc(t) : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  function desenharPrevia() {
    const a = E.anuncio, fotos = [E.capa, ...E.galeria].filter(Boolean);
    if (corAtiva && !E.cores.some(c => c.nome_cor === corAtiva)) corAtiva = null;
    const cor = E.cores.find(c => c.nome_cor === corAtiva);
    const p = numero(a.preco), pa = numero(a.preco_antigo);
    const desconto = p && pa && pa > p ? Math.round((1 - p / pa) * 100) : 0;
    const rolagem = tela.querySelector('.rolo')?.scrollTop || 0;
    const fotosHtml = `<div class="vitrine">
        <div class="carrossel" id="carrossel">${fotos.map(f => `<img src="/img/${f.id}" alt="">`).join('') || '<div class="sem">Sem capa</div>'}</div>
        ${cor ? `<img class="sobre" src="/img/${cor.id}" alt="">` : ''}
        ${fotos.length ? `<span class="conta" id="conta">${cor ? esc(cor.nome_cor) : '1/' + fotos.length}</span>` : ''}
        <span class="voltar" aria-hidden="true">‹</span></div>`;
    const precoHtml = `<div class="preco">${pa && desconto ? `<s>${reais(a.preco_antigo)}</s>` : ''}<strong>${a.preco ? reais(a.preco) : 'R$ 0,00'}</strong>${desconto ? `<b class="off">${desconto}% OFF</b>` : ''}</div>`;
    const tituloHtml = `<p class="titulo ${a.titulo ? '' : 'falta'}">${esc(a.titulo) || 'Título do anúncio'}</p>`;
    const coresHtml = E.cores.length ? `<div class="cores"><span>Cor${cor ? ': <b>' + esc(cor.nome_cor) + '</b>' : ` <em>${E.cores.length} opções</em>`}</span><div>${E.cores.map(c => `<button type="button" data-cor="${esc(c.nome_cor)}" class="${c.nome_cor === corAtiva ? 'ativa' : ''}" title="${esc(c.nome_cor)}"><img src="/mini/${c.id}" alt="${esc(c.nome_cor)}"></button>`).join('')}</div></div>` : '';
    const descHtml = `<div class="descricao"><h4>Descrição</h4><p class="${a.descricao ? '' : 'falta'}">${esc(a.descricao) || 'A descrição aparece aqui.'}</p></div>`;
    const comprar = '<div class="comprar"><span>Adicionar ao carrinho</span><span class="forte">Comprar agora</span></div>';
    tela.className = 'tela modelo-' + modelo;
    tela.innerHTML = modelo === 'a'
      ? `<div class="rolo">${fotosHtml}<div class="miolo">${precoHtml}${tituloHtml}</div>${coresHtml}${descHtml}</div>${comprar}`
      : `<div class="rolo"><div class="miolo"><span class="novo">Novo</span>${tituloHtml}</div>${fotosHtml}<div class="miolo">${precoHtml}</div>${coresHtml}<div class="miolo empilha"><span class="forte">Comprar agora</span><span>Adicionar ao carrinho</span></div>${descHtml}</div>`;
    tela.querySelector('.rolo').scrollTop = rolagem;
    const car = document.getElementById('carrossel'), conta = document.getElementById('conta');
    car?.addEventListener('scroll', () => {
      if (corAtiva) { corAtiva = null; return desenharPrevia(); }
      if (conta) conta.textContent = (Math.round(car.scrollLeft / car.clientWidth) + 1) + '/' + fotos.length;
    }, { passive: true });
  }
  tela.addEventListener('click', e => {
    const c = e.target.closest('[data-cor]');
    if (c) { corAtiva = corAtiva === c.dataset.cor ? null : c.dataset.cor; return desenharPrevia(); }
    if (e.target.closest('.sobre')) { corAtiva = null; desenharPrevia(); }
  });
  document.querySelectorAll('.troca button').forEach(b => {
    b.classList.toggle('ativo', b.dataset.modelo === modelo);
    b.onclick = () => { modelo = b.dataset.modelo; try { localStorage.setItem('modelo-previa', modelo); } catch (e) {}
      document.querySelectorAll('.troca button').forEach(x => x.classList.toggle('ativo', x === b)); desenharPrevia(); };
  });

  function desenhar() { desenharEditor(); desenharPrevia(); }
  document.addEventListener('menork:mudou', carregar);
  carregar().catch(e => aviso(e.message));
})();
