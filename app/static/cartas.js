// Fundo da tela de senha: cartas de curinga em preto e branco passando devagar.
(() => {
  const tela = document.getElementById('cartas');
  if (!tela) return;
  const ctx = tela.getContext('2d');
  const calmo = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const L = 150, A = 210; // tamanho da carta desenhada (depois escala)

  // chapeu de bobo da corte com tres pontas e guizos
  function chapeu(g, x, y, s, tinta) {
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = tinta; g.strokeStyle = tinta; g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-34, 18);
    g.quadraticCurveTo(-46, -8, -58, -30);
    g.quadraticCurveTo(-30, -22, -14, -6);
    g.quadraticCurveTo(-6, -38, 0, -52);
    g.quadraticCurveTo(6, -38, 14, -6);
    g.quadraticCurveTo(30, -22, 58, -30);
    g.quadraticCurveTo(46, -8, 34, 18);
    g.closePath(); g.fill();
    g.fillRect(-38, 16, 76, 10);
    [[-58, -30], [0, -52], [58, -30]].forEach(([bx, by]) => { g.beginPath(); g.arc(bx, by, 7, 0, Math.PI * 2); g.fill(); });
    for (let i = -30; i <= 30; i += 15) { g.beginPath(); g.arc(i, 34, 4.5, 0, Math.PI * 2); g.fill(); }
    g.restore();
  }
  function arredondado(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function carta(escura) {
    const c = document.createElement('canvas'), esc = 2;
    c.width = L * esc; c.height = A * esc;
    const g = c.getContext('2d'); g.scale(esc, esc);
    const papel = escura ? '#111' : '#efefec', tinta = escura ? '#e8e8e6' : '#121212';
    arredondado(g, 1, 1, L - 2, A - 2, 12); g.fillStyle = papel; g.fill();
    g.lineWidth = 2; g.strokeStyle = escura ? '#444' : '#2a2a2a'; g.stroke();
    arredondado(g, 9, 9, L - 18, A - 18, 8); g.lineWidth = 1; g.strokeStyle = escura ? '#333' : '#bdbdb8'; g.stroke();
    g.fillStyle = tinta; g.font = '700 13px Georgia, serif'; g.textAlign = 'center';
    'JOKER'.split('').forEach((l, i) => { g.fillText(l, 18, 26 + i * 14); });
    g.save(); g.translate(L, A); g.rotate(Math.PI);
    'JOKER'.split('').forEach((l, i) => { g.fillText(l, 18, 26 + i * 14); });
    g.restore();
    chapeu(g, L / 2, A / 2 - 4, 0.95, tinta);
    g.font = 'italic 600 15px Georgia, serif'; g.fillText('Curinga', L / 2, A / 2 + 58);
    return c;
  }
  const sprites = [carta(false), carta(true)];

  let W = 0, H = 0, dpr = 1, cartas = [];
  function nova(inicio) {
    const z = 0.35 + Math.random() * 0.85; // profundidade: menor = mais longe
    return {
      x: Math.random() * W, y: inicio ? Math.random() * H : -A * z - 20,
      z, vy: (14 + Math.random() * 16) * z, giro: (Math.random() - 0.5) * 0.5, ang: Math.random() * Math.PI * 2,
      balanco: Math.random() * Math.PI * 2, larg: 20 + Math.random() * 40, vira: Math.random() * Math.PI * 2,
      s: sprites[Math.random() < 0.3 ? 1 : 0],
    };
  }
  function medir() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    tela.width = W * dpr; tela.height = H * dpr; tela.style.width = W + 'px'; tela.style.height = H + 'px';
    const qtd = Math.round(Math.min(26, Math.max(10, W * H / 60000)));
    cartas = Array.from({ length: qtd }, () => nova(true)).sort((a, b) => a.z - b.z);
  }
  let antes = performance.now();
  function quadro(agora) {
    const dt = Math.min(0.05, (agora - antes) / 1000); antes = agora;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    for (const c of cartas) {
      if (!calmo) { c.y += c.vy * dt; c.ang += c.giro * dt; c.balanco += dt * 0.6; c.vira += dt * 0.7 * c.z; }
      if (c.y > H + A) Object.assign(c, nova(false));
      const largura = Math.cos(c.vira); // a carta vira devagar, como girando no ar
      ctx.save();
      ctx.translate(c.x + Math.sin(c.balanco) * c.larg, c.y);
      ctx.rotate(c.ang);
      ctx.scale(c.z * Math.max(0.08, Math.abs(largura)), c.z);
      ctx.globalAlpha = 0.18 + c.z * 0.5;
      ctx.filter = c.z < 0.6 ? `blur(${(0.6 - c.z) * 5}px)` : 'none';
      ctx.drawImage(c.s, -L / 2, -A / 2, L, A);
      ctx.restore();
    }
    ctx.filter = 'none';
    if (!calmo) requestAnimationFrame(quadro);
  }
  addEventListener('resize', () => { medir(); if (calmo) quadro(performance.now()); });
  medir(); requestAnimationFrame(quadro);
})();
