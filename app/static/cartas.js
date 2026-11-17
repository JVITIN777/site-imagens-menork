// Fundo da tela de senha: cartas de baralho em preto e branco caindo e girando devagar.
(() => {
  const tela = document.getElementById('cartas');
  if (!tela) return;
  const ctx = tela.getContext('2d');
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = 120, A = 168; // tamanho da carta desenhada
  const NAIPES = ['♠', '♣', '♥', '♦'];
  const VALORES = ['A', 'K', 'Q', 'J', '10', '9', '7'];

  function cantos(g, txt, naipe, tinta) {
    g.fillStyle = tinta; g.textAlign = 'center';
    for (const virado of [false, true]) {
      g.save();
      if (virado) { g.translate(L, A); g.rotate(Math.PI); }
      g.font = `700 ${txt.length > 1 ? 17 : 20}px Georgia, "Times New Roman", serif`; g.fillText(txt, 15, 25);
      g.font = '16px "Segoe UI Symbol", "DejaVu Sans", sans-serif'; g.fillText(naipe, 15, 42);
      g.restore();
    }
  }
  function moldura(g, escura) {
    g.beginPath(); g.roundRect(1, 1, L - 2, A - 2, 10);
    g.fillStyle = escura ? '#151515' : '#f4f4f1'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = escura ? '#4a4a4a' : '#9a9a96'; g.stroke();
  }
  function carta(valor, naipe) {
    const c = document.createElement('canvas'), esc = 2;
    c.width = L * esc; c.height = A * esc;
    const g = c.getContext('2d'); g.scale(esc, esc);
    const vermelho = naipe === '♥' || naipe === '♦';
    const tinta = vermelho ? '#6e6e6e' : '#141414'; // preto e branco: copas e ouros em cinza
    moldura(g, false);
    cantos(g, valor, naipe, tinta);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = tinta;
    if (['K', 'Q', 'J'].includes(valor)) {
      g.beginPath(); g.roundRect(26, 30, L - 52, A - 60, 4); g.lineWidth = 1.2; g.strokeStyle = tinta; g.stroke();
      g.font = '700 46px Georgia, serif'; g.fillText(valor, L / 2, A / 2 - 12);
      g.font = '30px "Segoe UI Symbol", "DejaVu Sans", sans-serif'; g.fillText(naipe, L / 2, A / 2 + 28);
    } else {
      g.font = `${valor === 'A' ? 64 : 44}px "Segoe UI Symbol", "DejaVu Sans", sans-serif`; g.fillText(naipe, L / 2, A / 2 + 2);
    }
    return c;
  }
  function curinga(escura) {
    const c = document.createElement('canvas'), esc = 2;
    c.width = L * esc; c.height = A * esc;
    const g = c.getContext('2d'); g.scale(esc, esc);
    const tinta = escura ? '#ededea' : '#141414';
    moldura(g, escura);
    g.fillStyle = tinta; g.textAlign = 'center';
    for (const virado of [false, true]) {
      g.save(); if (virado) { g.translate(L, A); g.rotate(Math.PI); }
      g.font = '700 12px Georgia, serif'; 'JOKER'.split('').forEach((l, i) => g.fillText(l, 14, 22 + i * 13));
      g.restore();
    }
    g.textBaseline = 'middle'; g.font = '54px "Segoe UI Symbol", "DejaVu Sans", sans-serif'; g.fillText('★', L / 2, A / 2 - 8);
    g.font = '700 15px Georgia, serif'; g.fillText('JOKER', L / 2, A / 2 + 36);
    return c;
  }
  const baralho = [];
  for (const n of NAIPES) for (const v of VALORES) baralho.push(carta(v, n));
  const curingas = [curinga(false), curinga(true)];
  const sortear = () => Math.random() < 0.2 ? curingas[Math.random() < 0.5 ? 0 : 1] : baralho[Math.floor(Math.random() * baralho.length)];

  let W = 0, H = 0, dpr = 1, cartas = [];
  function nova(inicio) {
    const z = 0.45 + Math.random() * 0.65; // profundidade: menor = mais longe, menor e mais apagada
    return { x: Math.random() * W, y: inicio ? Math.random() * (H + A) - A : -A, z,
      vy: (18 + Math.random() * 14) * z, giro: (Math.random() - 0.5) * 0.6, ang: (Math.random() - 0.5) * 1.2,
      balanco: Math.random() * Math.PI * 2, larg: 15 + Math.random() * 30, s: sortear() };
  }
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    tela.width = W * dpr; tela.height = H * dpr; tela.style.width = W + 'px'; tela.style.height = H + 'px';
    const qtd = Math.round(Math.min(18, Math.max(8, W * H / 90000)));
    cartas = Array.from({ length: qtd }, () => nova(true)).sort((a, b) => a.z - b.z);
  }
  let antes = performance.now(), parado = false;
  window.CARTAS_PARAR = () => { parado = true; };
  function quadro(agora) {
    const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    for (const c of cartas) {
      if (!calmo) { c.y += c.vy * dt; c.ang += c.giro * dt; c.balanco += dt * 0.5; }
      if (c.y > H + A) Object.assign(c, nova(false));
      ctx.save();
      ctx.translate(c.x + Math.sin(c.balanco) * c.larg, c.y);
      ctx.rotate(c.ang); ctx.scale(c.z, c.z);
      ctx.globalAlpha = 0.25 + c.z * 0.45;
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
      ctx.drawImage(c.s, -L / 2, -A / 2, L, A);
      ctx.restore();
    }
    if (!calmo && !parado) requestAnimationFrame(quadro);
  }
  addEventListener('resize', () => { medir(); if (calmo) quadro(performance.now()); });
  medir(); requestAnimationFrame(quadro);
})();
