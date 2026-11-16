// ===== Dados de demonstracao e "servidor" de mentira (tudo na memoria do navegador) =====
const TIPOS = [['fb','Fundo branco'],['kit2_fb','Kit 2 fundo branco'],['kit3_fb','Kit 3 fundo branco'],['kit4_fb','Kit 4 fundo branco'],['ia','Foto IA'],['informativo','Informativo'],['tabela','Tabela de medidas'],['capa','Capa'],['capa_kit2','Capa kit 2'],['capa_kit3','Capa kit 3'],['capa_kit4','Capa kit 4'],['cena','Cena real']];
const TIPO_NOME = Object.fromEntries(TIPOS);
const STATUS_NOME = { gerada: 'Gerada (falta classificar)', conferencia: 'Em conferência', aprovada: 'Aprovada', reprovada: 'Reprovada / apagada' };
const TINTAS = { Caramelo: '#b5783c', Preto: '#26262a', Rosa: '#e79ab0', Branco: '#e9e6dd', Verde: '#5d8a6a', Azul: '#3d63c9' };
const CENAS = [['#d9e2d0', '#b9a88c'], ['#e6dccb', '#8f7a63'], ['#cfdbe3', '#a9b3ad'], ['#eadfd6', '#c8a98d'], ['#d5d3e0', '#9c96a8']];

function calcado(produto, cor, x, y, s) {
  const t = TINTAS[cor] || '#888', borda = cor === 'Branco' ? '#bdb8ab' : 'none';
  const sola = `<path d="M-150 30 q0 -26 40 -26 h200 q60 0 60 22 q0 18 -30 18 h-250 q-20 0 -20 -14z" fill="${t}" stroke="${borda}" stroke-width="3"/><path d="M-150 34 q0 12 20 12 h250 q30 0 30 -14" fill="none" stroke="rgba(0,0,0,.28)" stroke-width="5"/>`;
  const cima = produto === 'SD2'
    ? `<path d="M-40 6 q30 -70 90 -4" fill="none" stroke="${t}" stroke-width="20" stroke-linecap="round"/><path d="M-110 6 q20 -40 55 -2" fill="none" stroke="${t}" stroke-width="14" stroke-linecap="round"/>`
    : `<path d="M-60 6 q10 -78 100 -70 q60 6 70 70z" fill="${t}" stroke="${borda}" stroke-width="3"/><path d="M-30 -22 q40 -30 100 -8" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="6" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">${cima}${sola}</g>`;
}
function arte(i) {
  const W = 600, txt = (x, y, t, tam = 26, peso = 600, cor = '#2b2b2b') => `<text x="${x}" y="${y}" font-family="Segoe UI,Arial,sans-serif" font-size="${tam}" font-weight="${peso}" fill="${cor}">${t}</text>`;
  let corpo = '';
  if (i.tipo === 'fb') corpo = `<rect width="${W}" height="${W}" fill="#fff"/>${calcado(i.produto, i.cor, 300, 320, 1.5)}`;
  else if (i.tipo === 'ia') { const [parede, piso] = CENAS[i.v % CENAS.length]; corpo = `<rect width="${W}" height="${W}" fill="${parede}"/><rect y="390" width="${W}" height="210" fill="${piso}"/><ellipse cx="${290 + i.v * 14}" cy="452" rx="210" ry="20" fill="rgba(0,0,0,.2)"/>${calcado(i.produto, i.cor, 290 + i.v * 14, 392, 1.25 + (i.v % 2) * .15)}`; }
  else if (i.tipo === 'cena') { const [parede, piso] = CENAS[i.v % CENAS.length]; corpo = `<rect width="${W}" height="${W}" fill="${parede}"/><rect y="390" width="${W}" height="210" fill="${piso}"/><rect x="${60 + i.v * 40}" y="150" width="150" height="240" rx="6" fill="rgba(255,255,255,.45)"/><ellipse cx="430" cy="470" rx="110" ry="26" fill="rgba(0,0,0,.12)"/><path d="M380 300 q20 150 10 165 q40 14 90 0 q-12 -40 0 -165z" fill="#d9b08c"/>`; }
  else if (i.tipo === 'informativo') { const f = [['Solado antiderrapante', 'Leve e macio', 'Palmilha anatômica'], ['Não machuca', 'Seca rápido', 'Fácil de limpar'], ['Do 34 ao 39', 'Envio imediato', 'Troca grátis']][i.v % 3]; corpo = `<rect width="${W}" height="${W}" fill="#f2efe8"/><rect width="${W}" height="96" fill="#2b2b2b"/>${txt(36, 60, 'Por que você vai gostar', 30, 700, '#fff')}${calcado(i.produto, i.cor, 300, 270, 1.15)}${f.map((t, n) => `<circle cx="64" cy="${402 + n * 60}" r="14" fill="${TINTAS[i.cor] || '#888'}" stroke="#2b2b2b" stroke-width="2"/>${txt(96, 412 + n * 60, t, 30, 600)}`).join('')}`; }
  else if (i.tipo === 'tabela') corpo = `<rect width="${W}" height="${W}" fill="#fff"/>${txt(40, 78, 'Tabela de medidas', 38, 700)}${[34, 35, 36, 37, 38, 39].map((n, k) => `<rect x="40" y="${118 + k * 72}" width="520" height="62" rx="8" fill="${k % 2 ? '#f4f2ec' : '#e9e5db'}"/>${txt(70, 160 + k * 72, 'Nº ' + n, 30, 700)}${txt(380, 160 + k * 72, (22.5 + k * .7).toFixed(1).replace('.', ',') + ' cm', 30, 500)}`).join('')}`;
  else { const kit = i.tipo.startsWith('capa_kit'), cores = i.cores || [i.cor], fundo = ['#f6e7c8', '#dfe8f2', '#f3dfe4', '#e3eedd'][i.v % 4]; corpo = `<rect width="${W}" height="${W}" fill="${fundo}"/><rect x="0" y="0" width="${W}" height="110" fill="#2b2b2b"/>${txt(34, 70, kit ? 'KIT ' + i.tipo.slice(-1) + ' PARES' : (i.produto === 'SD2' ? 'SANDÁLIA CONFORT' : 'CHINELO NUVEM'), 40, 800, '#fff')}${kit ? cores.map((c, n) => calcado(i.produto, c, 230 + n * 150, 300 + n * 70, 1.05)).join('') : calcado(i.produto, i.cor, 300, 320, 1.55)}${txt(34, 520, 'Cores disponíveis', 24, 600)}${cores.map((c, n) => `<circle cx="${54 + n * 52}" cy="558" r="20" fill="${TINTAS[c] || '#888'}" stroke="#2b2b2b" stroke-width="2"/>`).join('')}`; }
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}">${corpo}</svg>`);
}

const DB = { imgs: [], anuncios: [], links: [], cores: [], seq: 0, seqA: 0 };
const agora = () => new Date().toLocaleString('pt-BR').replace(',', '');
function nova(o) { const i = Object.assign({ id: ++DB.seq, produto: '', cor: '', tipo: '', status: 'conferencia', v: DB.seq, largura: 1200, altura: 1200, criado_em: agora() }, o); if (!i.src) i.src = arte(i); if (!i.nome_original) i.nome_original = ((i.produto + i.tipo + '_' + i.cor + '_0' + (i.v % 9 + 1)).toLowerCase() + '_1111.png'); DB.imgs.push(i); return i; }
function novoAnuncio(nome, extra = {}) { const k = /kit\s*([234])/i.exec(nome); const a = Object.assign({ id: ++DB.seqA, nome, formato: k ? 'kit' + k[1] : 'unitario', titulo: '', preco: '', preco_antigo: '', descricao: '' }, extra); DB.anuncios.push(a); return a; }
const IMG = id => DB.imgs.find(i => i.id === +id)?.src || '';
const img = id => DB.imgs.find(i => i.id === +id);
const viva = i => i && i.status !== 'reprovada';
const ligar = (iid, aid, papel = '', pos = 0) => { if (!DB.links.some(l => l.img === iid && l.an === aid)) DB.links.push({ img: iid, an: aid, papel, pos }); };
const anunciosDe = iid => DB.links.filter(l => l.img === iid).map(l => DB.anuncios.find(a => a.id === l.an)).filter(Boolean);
function obterAnuncio(nome) { nome = nome.trim(); return DB.anuncios.find(a => a.nome.toLowerCase() === nome.toLowerCase()) || novoAnuncio(nome); }

(function semear() {
  const A = novoAnuncio('CI9 unitário', { titulo: 'Chinelo Feminino Nuvem Confortável Antiderrapante Macio', preco: '49,90', preco_antigo: '79,90', descricao: 'Chinelo nuvem leve e macio para o dia a dia.\n\n- Solado antiderrapante\n- Numeração do 34 ao 39\n- Envio imediato' });
  const B = novoAnuncio('SD2 unitário'), K = novoAnuncio('CI9 kit 2');
  const ci = ['Caramelo', 'Preto', 'Rosa'], fb = {};
  ci.forEach(c => fb[c] = nova({ produto: 'CI9', cor: c, tipo: 'fb', status: 'aprovada' }));
  const capa = nova({ produto: 'CI9', cor: 'Caramelo', tipo: 'capa', status: 'aprovada', cores: ci });
  const ia = [1, 2, 3].map(v => nova({ produto: 'CI9', cor: 'Caramelo', tipo: 'ia', status: 'aprovada', v }));
  const info = nova({ produto: 'CI9', cor: 'Caramelo', tipo: 'informativo', status: 'aprovada', v: 0 });
  const tab = nova({ produto: 'CI9', cor: 'Caramelo', tipo: 'tabela', status: 'aprovada' });
  ligar(capa.id, A.id, 'capa'); [...ia, info, tab].forEach((x, n) => ligar(x.id, A.id, 'galeria', n + 1));
  ci.forEach((c, n) => { ligar(fb[c].id, A.id); DB.cores.push({ an: A.id, cor: c, img: fb[c].id, pos: n }); });
  nova({ produto: 'CI9', cor: 'Preto', tipo: 'ia', status: 'aprovada', v: 4 });
  [5, 6].forEach(v => nova({ produto: 'CI9', cor: 'Preto', tipo: 'ia', v }));
  [7, 8, 9].forEach(v => nova({ produto: 'CI9', cor: 'Rosa', tipo: 'ia', v }));
  nova({ produto: 'CI9', cor: 'Preto', tipo: 'informativo', v: 1 }); nova({ produto: 'CI9', cor: 'Rosa', tipo: 'informativo', v: 2 });
  ligar(nova({ produto: 'CI9', cor: 'Preto', tipo: 'capa', cores: ci, v: 1 }).id, A.id);
  ligar(nova({ produto: 'CI9', cor: 'Preto', tipo: 'capa_kit2', status: 'aprovada', cores: ['Preto', 'Caramelo'], v: 2 }).id, K.id, 'capa');
  const sd = ['Branco', 'Verde']; sd.forEach(c => nova({ produto: 'SD2', cor: c, tipo: 'fb', status: 'aprovada' }));
  ligar(nova({ produto: 'SD2', cor: 'Verde', tipo: 'capa', status: 'aprovada', cores: sd, v: 3 }).id, B.id, 'capa');
  sd.forEach((c, n) => [1, 2].forEach(v => nova({ produto: 'SD2', cor: c, tipo: 'ia', v: v + n * 2 })));
  nova({ status: 'gerada', nome_original: 'IMG_2231.jpg', src: arte({ produto: 'CI9', cor: 'Azul', tipo: 'fb' }) });
  nova({ status: 'gerada', cor: 'Azul', tipo: 'ia', nome_original: 'AZUL_2.png', src: arte({ produto: 'CI9', cor: 'Azul', tipo: 'ia', v: 3 }) });
})();
// ---- dados das ideias novas (na demonstracao sao exemplos; no site viriam dos bots)
const MOTIVOS = ['Produto diferente do fundo branco', 'Sola errada', 'Sem logo ou logo errada', 'Pose ou pé diferente da cena', 'Cara de IA', 'Produto pequeno ou longe', 'Layout inventado', 'Cor errada', 'Medida errada', 'Capa repetida'];
const MEDIDAS = { CI9: [34, 35, 36, 37, 38, 39].map((n, k) => [String(n), (22.5 + k * .7).toFixed(1).replace('.', ',')]), SD2: [35, 36, 37, 38].map((n, k) => [String(n), (23 + k * .6).toFixed(1).replace('.', ',')]) };
const META = { informativo: 3, tabela: 1 };  // fixos por cor; fotos IA e capas sao definidos em cada anuncio
const BOTS = [['FUNDO BRANCO', 'ok', 'Sem pedidos na fila'], ['GERADOR DE IMAGEM', 'trabalhando', 'Gerando SD2 Verde, foto 3 de 3'], ['INFORMATIVO', 'ok', 'Último lote: CI9 Rosa'], ['TABELA', 'ok', 'Sem pedidos na fila'], ['CAPA', 'parado', 'Conta 2 bateu o limite. Esperando.'], ['CONFERENTE', 'trabalhando', 'Conferindo 4 imagens']];
const CONTAS = [['Conta 1', 46, 7, 'Disponível'], ['Conta 2', 80, 19, 'Limite volta às 15:40'], ['Conta 3', 12, 1, 'Disponível']];
const CAMINHO = i => '\\\\SERVIDOR\\imagens\\SITE DE IMAGENS\\arquivos\\2026-11\\' + i.nome_original;
const MKT = { ML: 'Mercado Livre', SHP: 'Shopee', SHEIN: 'Shein', TIKTOK: 'TikTok', AMAZON: 'Amazon', MAGALU: 'Magalu', NETSHOES: 'Netshoes', TEMU: 'Temu', KWAI: 'Kwai' };
const FORMATO = { unitario: 'Unitário', kit2: 'Kit 2', kit3: 'Kit 3', kit4: 'Kit 4' };
DB.demandas = []; DB.seqD = 0;
// Le o texto livre do campo INFO JOAO e tira dele as metas e as medidas
function lerPedido(texto) {
  const t = texto.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase(), n = (re, padrao = 0) => { const m = re.exec(t); return m ? +m[1] : padrao; };
  const formatos = ['unitario']; [2, 3, 4].forEach(k => { if (new RegExp('kit\\s*' + k).test(t)) formatos.push('kit' + k); });
  const capas = {}; formatos.forEach(f => capas[f] = 0);
  for (const m of t.matchAll(/(\d+)\s*capas?\s*(unitario|kit\s*\d)?/g)) { const f = (m[2] || 'unitario').replace(/\s+/g, ''); if (f in capas) capas[f] = +m[1]; }
  const medidas = [...texto.matchAll(/^\s*(\d{2}(?:\/\d{2})?)\s*[-–:]\s*(\d{2}(?:[.,]\d)?)\s*$/gm)].map(m => [m[1], m[2].replace('.', ',')]);
  return { formatos, ia: n(/(\d+)\s*ia\b/), informativo: n(/(\d+)\s*informativ/), tabela: /tabela/.test(t) ? 1 : 0, capas, medidas };
}
function novaDemanda(o) {
  const d = Object.assign({ id: ++DB.seqD, status: 'em progresso', marketplaces: ['SHP', 'ML'] }, o); d.metas = lerPedido(d.info); DB.demandas.push(d);
  if (d.metas.medidas.length) MEDIDAS[d.produto] = d.metas.medidas.map(x => x.slice());
  d.metas.formatos.forEach(f => { const a = obterAnuncio(d.produto + ' ' + FORMATO[f].toLowerCase()); a.demanda = d.id; a.formato = f; });
  return d;
}
(function semearExtras() {
  novaDemanda({ tarefa: 'CI9 CHINELO NUVEM', produto: 'CI9', pasta: '\\\\SERVIDOR\\imagens\\PRODUTOS\\CI9', marketplaces: ['SHP', 'ML', 'TIKTOK'], info: 'Fundo branco unitario, kit 2 e kit 3\n4 IA cada cor\n3 informativos cada cor\n5 capas unitario\n3 capas kit 2\n3 capas kit 3\ntabela de medidas cada cor' });
  novaDemanda({ tarefa: 'SD2 SANDÁLIA CONFORT', produto: 'SD2', pasta: '\\\\SERVIDOR\\imagens\\PRODUTOS\\SD2', marketplaces: ['SHP', 'SHEIN'], info: 'fundo branco\n3 ia cada\n1 tabela de tamanho pra cada modelo\n35/36- 23,0\n37/38- 24,2\n39/40- 25,5' });
  const acha = (f) => DB.imgs.find(f);
  const a1 = acha(i => i.cor === 'Preto' && i.tipo === 'ia' && i.status === 'conferencia'); if (a1) a1.alertas = ['Sola diferente do fundo branco'];
  const a2 = acha(i => i.cor === 'Rosa' && i.tipo === 'ia' && i.status === 'conferencia'); if (a2) a2.alertas = ['Cor mais clara que a do fundo branco', 'Logo não encontrada'];
  DB.imgs.filter(i => i.status === 'conferencia' && i.tipo === 'ia' && !i.alertas).slice(0, 4).forEach(i => i.alertas = []);
  const usada = acha(i => i.tipo === 'capa' && i.status === 'aprovada' && i.produto === 'CI9');
  const nv = nova({ produto: 'CI9', cor: 'Caramelo', tipo: 'capa', cores: ['Caramelo', 'Preto', 'Rosa'], v: 4 }); nv.parecida = { id: usada.id, pct: 92 };
  [['CI9', 'Preto', 'ia', 'Sola errada', 'bot conferente', 2], ['CI9', 'Rosa', 'ia', 'Cara de IA', 'bot conferente', 3], ['SD2', 'Verde', 'ia', 'Sem logo ou logo errada', 'bot conferente', 1], ['CI9', 'Rosa', 'informativo', 'Layout inventado', 'você', 1], ['SD2', 'Branco', 'ia', 'Produto pequeno ou longe', 'você', 4], ['CI9', 'Preto', 'ia', 'Produto diferente do fundo branco', 'bot conferente', 6]]
    .forEach(([produto, cor, tipo, motivo, origem, v]) => Object.assign(nova({ produto, cor, tipo, v, status: 'reprovada' }), { motivo, origem }));
  DB.imgs.filter(i => i.status === 'aprovada' && ['informativo', 'tabela', 'capa'].includes(i.tipo) && i.produto === 'CI9').forEach(i => i.ref = true);
  [0, 1, 3].forEach((v, k) => nova({ tipo: 'cena', v, status: 'aprovada', ref: true, estilo: ['Academia', 'Street', 'Academia'][k], nome_original: 'cena_moca_0' + (v + 1) + '.png' }));
  DB.imgs.filter(i => i.ref && i.tipo === 'informativo').forEach((i, k) => i.estilo = ['Academia', 'Street'][k % 2]);
  DB.imgs.filter(i => i.status === 'aprovada' && i.tipo === 'ia').slice(0, 3).forEach((i, k) => { i.ref = true; i.estilo = ['Street', 'Sandália', ''][k]; });
})();
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
  if (pend.length) r.push(`${pend.length} imagem(ns) do anúncio ainda em conferência: aprove ou reprove`);
  return { produto: p, itens: r, metaIA: mt.ia, metaCapa: mt.capa, kit, tarefa: mt.d?.tarefa || '', info: mt.informativo, tab: mt.tabela,
    capas: { meta: mt.capa, aprovadas: capas.filter(i => i.status === 'aprovada').length, esperando_aprovacao: capas.filter(pendente).length } };
}
const GRANDE = IMG;
// Na demonstracao as mudancas ficam so na memoria. No site de verdade, este mesmo objeto fala com o servidor.
const PACOTES = () => [];
const PEDIDO = aid => (DB.pedidos ||= {})[aid];
const SRV = {
  carregar: async () => {},
  pedir: async aid => { const a = DB.anuncios.find(x => x.id === aid), f = faltas(aid), n = Object.keys(DB.pedidos ||= {}).length + 1;
    const texto = [`PEDIDO DO MENORK nº ${n}: completar o anúncio "${a.nome}"${f.produto ? ' (produto ' + f.produto + ')' : ''}`, 'O que falta:', ...f.itens.map(t => '- ' + t), '', 'Mande cada imagem com menork.ps1 enviar, dizendo -Produto, -Cor, -Tipo e -Anuncio.'].join('\n');
    DB.pedidos[aid] = { id: n, status: 'aberto', bot: '', quando: agora(), atualizado: agora(), texto }; return texto; },
  excluirAnuncio: async id => { DB.anuncios = DB.anuncios.filter(a => a.id !== id); DB.links = DB.links.filter(l => l.an !== id); DB.cores = DB.cores.filter(c => c.an !== id); },
  novoAnuncio: async (nome, formato) => { const a = obterAnuncio(nome); a.formato = formato; return a.id; },
  meta: async ({ an, dem, chave, valor }) => {
    if (dem) { const d = DB.demandas.find(x => x.id === dem); if (chave.startsWith('capa:')) d.metas.capas[chave.slice(5)] = valor; else d.metas[chave] = valor; return; }
    const a = DB.anuncios.find(x => x.id === an), d = demandaDe(a);
    if (chave === 'capa') { if (d) d.metas.capas[a.formato] = valor; else a.meta_capa = valor; } else if (d) d.metas[chave] = valor; else a['meta_' + chave] = valor;
  },
  produtoDemanda: async (id, produto) => { DB.demandas.find(d => d.id === id).produto = produto; },
  medidas: async () => {},
  buscarClickup: async () => { const t = TAREFAS_NOVAS.shift(); if (!t) return 'Nenhuma tarefa nova com Link Pasta e INFO JOAO preenchidos.'; const d = novaDemanda(t); return `Tarefa ${t.tarefa} cadastrada: ${d.metas.formatos.length} anúncio(s) criados.`; },
  pacote: async () => window.menork.aviso('Na demonstração o arquivo não é baixado. No site instalado sai um ZIP com esses nomes e o pacote fica registrado no anúncio.', null, null, 8),
};
let TAREFAS_NOVAS = [{ tarefa: 'TN7 TÊNIS CASUAL', produto: 'TN7', pasta: '\\\\SERVIDOR\\imagens\\PRODUTOS\\TN7', marketplaces: ['ML', 'NETSHOES'], status: 'pendente', info: 'Fundo branco unitario e kit 2\n7 IA cada cor\n3 informativos cada cor\n20 capas unitario\n15 capas kit 2\ntabela de medidas cada cor\n37- 25,0\n38- 25,7\n39- 26,4\n40- 27,1' }];
let RESERVA = [{ produto: 'SD2', cor: 'Verde', tipo: 'ia', v: 0 }, { produto: 'SD2', cor: 'Branco', tipo: 'informativo', v: 1 }, { produto: 'SD2', cor: 'Verde', tipo: 'tabela' }];

function classificarNome(nome) {
  const r = { produto: '', cor: '', tipo: '', anuncio: '' }, base = nome.replace(/\.[^.]+$/, '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const cor = s => s.replace(/[_\-\s]+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase()); let m;
  const kit = /kit[\s_-]?([234])/.exec(base);
  if ((m = /^capa[_-](.+)$/.exec(base))) { const p = m[1].split('_').filter(x => x && x !== '1111'); r.tipo = kit ? 'capa_kit' + kit[1] : 'capa'; if (p.length >= 2) { r.anuncio = p.slice(0, -1).join(' ').toUpperCase(); r.cor = cor(p[p.length - 1]); } else if (p.length) r.anuncio = p[0].toUpperCase(); return r; }
  if ((m = /^([a-z0-9]+?)ia[_-]([^_]+)[_-]\d+(?:[_-]r\d+)?(?:[_-]1111)?$/.exec(base))) return Object.assign(r, { produto: m[1].toUpperCase(), cor: cor(m[2]), tipo: 'ia' });
  const f = base.split(/[_\-\s]+/).filter(Boolean);
  const tipo = base.includes('informativo') || f.includes('info') ? 'informativo' : base.includes('tabela') ? 'tabela' : f.includes('fb') || base.includes('fundo') ? (kit ? 'kit' + kit[1] + '_fb' : 'fb') : '';
  if (tipo) { r.tipo = tipo; const resto = f.filter(t => !['1111', 'ia', 'fb', 'info', 'informativo', 'tabela', 'medidas', 'de', 'fundo', 'branco'].includes(t) && !/^(r?\d+|kit\d)$/.test(t)); if (resto.length > 1 && /\d/.test(resto[0])) r.produto = resto.shift().toUpperCase(); if (resto.length) r.cor = cor(resto.join(' ')); return r; }
  if ((m = /^([a-z][^_]*?)[_-](\d{1,2})$/.exec(base)) && !/^(img|dsc|image|imagem|foto|screenshot|whatsapp|captura)/.test(base)) { r.cor = cor(m[1]); r.tipo = 'ia'; }
  return r;
}

// ---- API de mentira: mesmas regras do site de verdade
async function FAKE(url, d, formulario) {
  let m;
  if ((m = /^\/api\/imagens\/(\d+)$/.exec(url))) {
    const l = img(m[1]); if (!l) throw new Error('Imagem não encontrada.');
    return Object.assign({}, l, { anuncios: anunciosDe(l.id).map(a => ({ id: a.id, nome: a.nome })), tipo_nome: TIPO_NOME[l.tipo] || '', status_nome: STATUS_NOME[l.status],
      fundo_branco: l.produto ? DB.imgs.filter(f => f.tipo === 'fb' && f.produto === l.produto && viva(f) && f.id !== l.id).sort((a, b) => (b.cor === l.cor) - (a.cor === l.cor) || (b.status === 'aprovada') - (a.status === 'aprovada')).map(f => ({ id: f.id, cor: f.cor, status: f.status })) : [] });
  }
  if (url === '/api/acao') return acao(d);
  if ((m = /^\/api\/anuncios\/(\d+)$/.exec(url))) { if (d) montar(+m[1], d); return montagem(+m[1]); }
  if (url === '/api/enviar') {
    let novas = 0; const erros = [], an = formulario && d.get('anuncio');
    for (const a of d.getAll('arquivos')) { if (!/^image\//.test(a.type)) { erros.push(a.name); continue; } const c = classificarNome(a.name); const i = nova({ produto: c.produto, cor: c.cor, tipo: c.tipo, status: c.produto && c.tipo ? 'conferencia' : 'gerada', nome_original: a.name, src: URL.createObjectURL(a) }); const alvo = an || c.anuncio; if (alvo) ligar(i.id, obterAnuncio(alvo).id); novas++; }
    return { novas, repetidas: 0, erros };
  }
  if (url === '/api/ler-agora') { const lote = RESERVA.splice(0, 2); lote.forEach(o => nova(o)); return { importadas: lote.length, erro: '' }; }
  throw new Error('Função indisponível na demonstração.');
}
function acao(d) {
  const ids = (d.ids || []).map(Number), L = ids.map(img).filter(Boolean);
  if (d.acao === 'aprovar') L.forEach(i => { i.status = 'aprovada'; if (['ia', 'informativo', 'tabela'].includes(i.tipo)) DB.links.filter(l => l.img === i.id && !l.papel).forEach(l => { const a = DB.anuncios.find(x => x.id === l.an), g = DB.links.filter(x => x.an === l.an && x.papel === 'galeria' && img(x.img)?.status === 'aprovada'); if (a.formato === 'unitario' && g.length < 9 && g.filter(x => img(x.img).tipo === i.tipo && img(x.img).cor === i.cor).length < metasDe(a)[i.tipo]) Object.assign(l, { papel: 'galeria', pos: Math.max(0, ...g.map(x => x.pos)) + 1 }); }); if (i.tipo.startsWith('capa')) DB.links.filter(l => l.img === i.id).forEach(l => { if (!DB.links.some(x => x.an === l.an && x.papel === 'capa')) l.papel = 'capa'; }); });
  else if (d.acao === 'reprovar') L.forEach(i => { i.antes = i.status; i.status = 'reprovada'; i.motivo = d.motivo || 'Sem motivo'; i.origem = 'você'; });
  else if (d.acao === 'desfazer') L.forEach(i => { i.status = i.produto && i.tipo ? 'conferencia' : 'gerada'; delete i.motivo; });
  else if (d.acao === 'referencia') L.forEach(i => { i.ref = !i.ref; });
  else if (d.acao === 'estilo') L.forEach(i => { const e = String(d.estilo || '').trim().replace(/\s+/g, ' '); i.estilo = e ? e[0].toUpperCase() + e.slice(1) : ''; });
  else if (d.acao === 'classificar') {
    L.forEach(i => { for (const c of ['produto', 'cor', 'tipo']) if (c in d && (d[c] || d.limpar)) i[c] = c === 'produto' ? d[c].trim().toUpperCase() : d[c].trim(); if (i.status !== 'aprovada' && i.status !== 'reprovada') i.status = i.produto && i.tipo ? 'conferencia' : 'gerada'; });
    if ((d.anuncio || '').trim()) { const a = obterAnuncio(d.anuncio); ids.forEach(i => ligar(i, a.id)); }
  } else if (d.acao === 'desvincular') { DB.links = DB.links.filter(l => !(l.an === +d.anuncio_id && ids.includes(l.img))); DB.cores = DB.cores.filter(c => !(c.an === +d.anuncio_id && ids.includes(c.img))); }
  return { ok: true, feitas: ids.length };
}
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
    sugestoes: produto ? DB.imgs.filter(i => i.produto === produto && i.status === 'aprovada' && !dentro.has(i.id)).map(resumo) : [] };
}
function montar(aid, d) {
  const a = DB.anuncios.find(x => x.id === aid), link = iid => DB.links.find(l => l.an === aid && l.img === iid);
  const aprovada = iid => { const i = img(iid); if (!i || i.status !== 'aprovada') throw new Error('Só imagem aprovada entra na estrutura do anúncio.'); ligar(iid, aid); return i; };
  const proxima = () => Math.max(0, ...DB.links.filter(l => l.an === aid && l.papel === 'galeria').map(l => l.pos)) + 1;
  const porCor = (i, nome) => { nome = (nome || i.cor || '').trim() || 'Cor ' + (DB.cores.filter(c => c.an === aid).length + 1); const ja = DB.cores.find(c => c.an === aid && c.cor.toLowerCase() === nome.toLowerCase()); if (ja) ja.img = i.id; else DB.cores.push({ an: aid, cor: nome, img: i.id, pos: Math.max(0, ...DB.cores.filter(c => c.an === aid).map(c => c.pos)) + 1 }); };
  const id = +d.imagem;
  if (d.acao === 'dados') ['titulo', 'preco', 'preco_antigo', 'descricao'].forEach(c => { if (c in d) a[c] = String(d[c]).trim(); });
  else if (d.acao === 'capa') { aprovada(id); DB.links.forEach(l => { if (l.an === aid && l.papel === 'capa') l.papel = ''; }); link(id).papel = 'capa'; }
  else if (d.acao === 'foto') { if (DB.links.filter(l => l.an === aid && l.papel === 'galeria' && img(l.img)?.status === 'aprovada').length >= 9) throw new Error('As 10 fotos já estão preenchidas. Tire uma para colocar outra.'); aprovada(id); Object.assign(link(id), { papel: 'galeria', pos: proxima() }); }
  else if (d.acao === 'tirar') { const l = link(id); if (l) l.papel = ''; }
  else if (d.acao === 'ordenar') d.ids.forEach((i, n) => { const l = link(+i); if (l && l.papel === 'galeria') l.pos = n + 1; });
  else if (d.acao === 'slots') { const ids = d.ids.slice(0, 10).map(i => i ? +i : null); ids.forEach(i => { if (i) aprovada(i); });
    DB.links.forEach(l => { if (l.an === aid && (l.papel === 'capa' || l.papel === 'galeria')) { l.papel = ''; l.pos = 0; } });
    ids.forEach((i, n) => { if (i) Object.assign(link(i), n === 0 ? { papel: 'capa', pos: 0 } : { papel: 'galeria', pos: n }); }); }
  else if (d.acao === 'cor') porCor(aprovada(id), d.cor);
  else if (d.acao === 'tirar_cor') DB.cores = DB.cores.filter(c => !(c.an === aid && c.cor === d.cor));
  else if (d.acao === 'renomear_cor') { const novo = String(d.novo || '').trim(); if (novo && novo.toLowerCase() !== d.cor.toLowerCase() && DB.cores.some(c => c.an === aid && c.cor.toLowerCase() === novo.toLowerCase())) throw new Error('Já existe uma cor com esse nome neste anúncio.'); if (novo) DB.cores.find(c => c.an === aid && c.cor === d.cor).cor = novo; }
  else if (d.acao === 'auto') {
    const m = montagem(aid), livres = [...m.disponiveis.filter(i => i.status === 'aprovada'), ...m.sugestoes], ordem = { ia: 0, informativo: 1, tabela: 2 }, unit = a.formato === 'unitario';
    const usar = (i, papel, pos = 0) => { ligar(i.id, aid); Object.assign(link(i.id), { papel, pos }); };
    if (!m.capa) { const c = livres.find(i => i.tipo === (unit ? 'capa' : 'capa_' + a.formato)); if (c) usar(c, 'capa'); }
    if (!m.galeria.length && unit) livres.filter(i => i.tipo in ordem).sort((x, y) => ordem[x.tipo] - ordem[y.tipo] || x.cor.localeCompare(y.cor) || x.id - y.id).slice(0, 9).forEach((i, n) => usar(i, 'galeria', n + 1));
    if (!m.cores.length && unit) { const vistas = new Set(); livres.forEach(i => { if (i.tipo === 'fb' && i.cor && !vistas.has(i.cor.toLowerCase())) { vistas.add(i.cor.toLowerCase()); ligar(i.id, aid); porCor(img(i.id)); } }); }
  }
}
