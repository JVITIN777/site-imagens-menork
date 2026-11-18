// Fundo animado: agua escura em movimento, desenhada pela placa de video (WebGL).
// Resolucao da tela (ate 1,5x em telas de alta densidade); se o PC nao der conta, baixa sozinha.
// 30 quadros por segundo, e para quando a aba nao esta visivel.
(() => {
  // qual fundo: 'naipes' (padrao), 'fumaca', 'feltro', 'coringa' (losangos), 'agua' (o antigo, animado) ou 'liso'
  let fundo = 'luz'; try { fundo = localStorage.getItem('fundo_v2') || 'luz'; } catch (_) {}
  document.documentElement.dataset.fundo = fundo;
  const tela = document.getElementById('agua'); if (!tela) return;
  if (fundo !== 'agua') { tela.style.display = 'none'; return; }
  const gl = tela.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) { tela.classList.add('sem-webgl'); return; }
  const quieto = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const alta = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT).precision > 0;
  const frag = `precision ${alta ? 'highp' : 'mediump'} float;
uniform vec2 r; uniform float t;
float h(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float n(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1.,0.)),u.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int k=0;k<4;k++){v+=a*n(p);p=m*p;a*=.5;}return v;}
float alt(vec2 p){
  vec2 q=vec2(fbm(p+vec2(0.,t*.06)),fbm(p+vec2(5.2,1.3)-t*.05));
  vec2 w=vec2(fbm(p+3.*q+vec2(1.7,9.2)+t*.04),fbm(p+3.*q+vec2(8.3,2.8)-t*.045));
  return fbm(p+2.6*w);}
void main(){
  vec2 uv=gl_FragCoord.xy/r.y*1.6; float e=.005;
  float a=alt(uv), ax=alt(uv+vec2(e,0.)), ay=alt(uv+vec2(0.,e));
  vec3 nr=normalize(vec3((a-ax)*1.6,(a-ay)*1.6,e));
  vec3 L=normalize(vec3(-.35,.55,.75)), H=normalize(L+vec3(0.,0.,1.));
  float dif=max(dot(nr,L),0.), spec=pow(max(dot(nr,H),0.),36.);
  float c=.012+.05*dif*a+.42*spec*smoothstep(.35,.75,a);
  vec2 v=gl_FragCoord.xy/r-.5; c*=1.-.9*dot(v,v);
  gl_FragColor=vec4(vec3(c)*vec3(.96,.97,1.),1.);}`;
  const sh = (tipo, src) => { const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, frag)); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { tela.classList.add('sem-webgl'); return; }
  gl.useProgram(pr);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
  const ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't');
  const inicio = performance.now() - 40000, LIMITE = 2.4e6;
  let esc = 1, ultimo = 0, pedido = 0, somas = 0, quadros = 0;
  function medir() {
    const d = Math.min(devicePixelRatio || 1, 1.5), area = innerWidth * innerHeight * d * d;
    const e = Math.min(d, Math.sqrt(LIMITE / area) * d) * esc;
    tela.width = Math.max(1, innerWidth * e | 0); tela.height = Math.max(1, innerHeight * e | 0);
    gl.viewport(0, 0, tela.width, tela.height); gl.uniform2f(ur, tela.width, tela.height);
  }
  function quadro(agora) {
    pedido = 0;
    if (agora - ultimo >= 33) {
      if (ultimo && !quieto) { somas += agora - ultimo; quadros++; }
      if (quadros === 40) {  // PC sofrendo (abaixo de ~22 quadros por segundo): desenha com menos pontos
        if (somas / quadros > 45 && esc > .45) { esc *= .8; medir(); }
        somas = quadros = 0;
      }
      ultimo = agora; gl.uniform1f(ut, (agora - inicio) / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    if (!quieto && !document.hidden) pedido = requestAnimationFrame(quadro);
  }
  addEventListener('resize', () => { medir(); if (quieto) quadro(performance.now()); });
  document.addEventListener('visibilitychange', () => { ultimo = 0; somas = quadros = 0; if (!document.hidden && !pedido && !quieto) pedido = requestAnimationFrame(quadro); });
  medir(); quadro(performance.now() + 1000);
})();
