import re
import os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
R='../app/'
css=open(R+'static/estilo.css').read()
app=open(R+'static/app.js').read(); an=open(R+'static/anuncio.js').read()
def troca(s, a, b, n=1):
    assert s.count(a)>=n, a; return s.replace(a,b)
def img(s):
    for pasta, fn in (('img', 'GRANDE'), ('mini', 'IMG')):
        s = re.sub(r"/%s/\$\{([\w.]+)\}" % pasta, r"${%s(\1)}" % fn, s)
        s = re.sub(r"'/%s/' \+ ([\w.]+)" % pasta, r"%s(\1)" % fn, s)
    return s
app=img(app); an=img(an)
# api: marcador, trocado depois pela versao da demonstracao ou pela do site
i=app.index('  async function api('); f=app.index('  // ---- avisos')
API_REAL=app[i:f]
app=app[:i]+"/*API*/\n\n"+app[f:]
app=troca(app,"      if (estilo) await api('/api/acao', { ids, acao: 'estilo', estilo });\n      location.reload();","      if (estilo) await api('/api/acao', { ids, acao: 'estilo', estilo });\n      RENDER();")
app=troca(app,"        aviso(msg); location.reload(); } catch (e) { aviso(e.message); }","        await RENDER(); aviso(msg, null, null, 8); } catch (e) { aviso(e.message); }")
i=app.index("      if (window.ANUNCIO_ID)"); f=app.index("    } catch (e) { aviso(e.message); }\n  };\n  document.addEventListener('keydown'")
app=app[:i]+"      const id = atual.id; RENDER(); abrir(id);\n"+app[f:]
app=troca(app,"$('#enviar')?.addEventListener('change', async e => {","document.addEventListener('change', async e => {\n    if (e.target.id !== 'enviar') return;")
app=troca(app,"$('#ler-agora')?.addEventListener('click', async () => {","document.addEventListener('click', async e => {\n    if (!e.target.closest('#ler-agora')) return;")
app=troca(app,"if (r.erros.length) alert('Não consegui ler: ' + r.erros.join(', '));","")
app,k=re.subn(r"sessionStorage\.setItem\('recado', (.+?)\);\s*location\.reload\(\);", r"RENDER(); aviso(\1);", app); assert k==2,k
app=troca(app,"  try { const r = sessionStorage.getItem('reabrir'); if (r) { sessionStorage.removeItem('reabrir'); if (cartao(r)) abrir(+r); } } catch (e) {}\n","")
app=troca(app,"  try { const r = sessionStorage.getItem('recado'); if (r) { sessionStorage.removeItem('recado'); aviso(r); } } catch (e) {}\n","")
app=troca(app,"  async function decidir(ids, acao) {\n    try { await api('/api/acao', { ids, acao }); }","  async function decidir(ids, acao, motivo) {\n    if (acao === 'reprovar' && !motivo) { motivo = await window.PEDIR_MOTIVO(ids.length); if (!motivo) return false; }\n    try { await api('/api/acao', { ids, acao, motivo }); }")
app=troca(app,"    await decidir([id], acao);\n","    if (await decidir([id], acao) === false) return;\n")
app=troca(app,"if (visor.hidden || e.target.matches('input,select,textarea')) return;","if (visor.hidden || !document.getElementById('janela').hidden || e.target.matches('input,select,textarea')) return;")
app=troca(app,"    $('#v-aprovar').hidden = d.status === 'aprovada';","    $('#v-aprovar').hidden = d.status === 'aprovada'; $('#v-reprovar').hidden = d.status === 'reprovada'; window.AO_ABRIR?.(d);")
an=troca(an,"function desenhar() { desenharEditor(); desenharPrevia(); }","function desenhar() { desenharEditor(); desenharPrevia(); window.AO_DESENHAR?.(ID); }")
assert 'location.' not in app and 'sessionStorage' not in app and 'alert(' not in app, [l for l in app.split('\n') if 'location.' in l]
# anuncio.js -> funcao
an=troca(an,"(() => {\n  const { api, aviso, abrir } = window.menork;\n  const ID = window.ANUNCIO_ID, editor","window.ANUNCIO = (ID) => {\n  const { api, aviso, abrir } = window.menork;\n  const editor")
an=troca(an,"document.addEventListener('menork:mudou', carregar);","window.AO_MUDAR = carregar;")
an=troca(an,"if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(carregar);","if (acao === 'desvincular') return api('/api/acao', { ids: [imagem], acao, anuncio_id: ID }).then(() => document.dispatchEvent(new Event('menork:mudou')));")
assert an.rstrip().endswith('})();'); an=an.rstrip()[:-5]+'};\n'
base=open(R+'templates/base.html').read()
i=base.index('<div id="barra"'); f=base.index('<datalist')
sobras=base[i:f]
sobras=re.sub(r"\{% for k, v in tipos %\}.*?\{% endfor %\}", "__TIPOS__", sobras)
import json
tipos=''.join(f'<option value="{k}">{v}</option>' for k,v in [('fb','Fundo branco'),('kit2_fb','Kit 2 fundo branco'),('kit3_fb','Kit 3 fundo branco'),('kit4_fb','Kit 4 fundo branco'),('ia','Foto IA'),('informativo','Informativo'),('tabela','Tabela de medidas'),('capa','Capa'),('capa_kit2','Capa kit 2'),('capa_kit3','Capa kit 3'),('capa_kit4','Capa kit 4')])
sobras=sobras.replace('__TIPOS__',tipos); assert '{%' not in sobras and '{{' not in sobras
sobras=sobras.replace('<a id="v-link" target="_blank">','<a id="v-link">')
sobras=troca(sobras,'<p class="pequeno" id="v-arquivo"></p>','<p class="pequeno" id="v-arquivo"></p><div id="v-extra" class="v-extra"></div>')
sobras+='<div id="janela" class="visor janela" hidden><div class="janela-caixa"></div></div>\n'
app=app.replace(" $('#v-link').href = GRANDE(id);","")
ic={'demandas':'<rect x="4" y="3" width="12" height="14" rx="2"/><path d="M7 7h6M7 10h6M7 13h3"/>','referencias':'<path d="m10 3 2.2 4.5 4.8.7-3.5 3.4.8 4.9L10 14.2l-4.3 2.3.8-4.9L3 8.2l4.8-.7z"/>','erros':'<circle cx="10" cy="10" r="7"/><path d="m7.5 7.5 5 5m0-5-5 5"/>','painel':'<path d="M3 17V9m5 8V3m5 14v-6m4 6V6"/>','medidas':'<path d="M3 13 13 3l4 4L7 17z"/><path d="m6 10 2 2m1-5 2 2m1-5 2 2"/>','fila':'<path d="m4 10 4 4 8-9"/>','catalogo':'<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/>','capas':'<rect x="3" y="3" width="14" height="14" rx="2"/><path d="m3 13 4-4 4 4 2-2 4 4"/>','anuncios':'<path d="M3 6h14l-1 11H4z"/><path d="M7 6a3 3 0 0 1 6 0"/>'}
nav=''.join(f'<a href="#" data-rota="{r}" data-tela="{t}"><svg viewBox="0 0 20 20" aria-hidden="true">{ic[t]}</svg><span>{n}</span>{b}</a>' for t,r,n,b in [('fila','/','Fila de aprovação','<b class="bolha" id="bolha"></b>'),('demandas','/demandas','Demandas',''),('anuncios','/anuncios','Anúncios',''),('catalogo','/catalogo','Catálogo',''),('capas','/capas','Histórico de capas',''),('referencias','/referencias','Referências',''),('erros','/erros','Lista de erros',''),('painel','/painel','Painel',''),('medidas','/medidas','Medidas','')])
extra='''
.demo{background:#2a2410;color:#f3d48a;border-bottom:1px solid #5a4a14;padding:9px 34px;font-size:13px}
@media (max-width:1000px){.demo{padding:8px 14px}}
.legenda .alerta-mini,.legenda .motivo{color:var(--vermelho);font-weight:600}
.legenda .ref-mini{color:var(--luz)}
.ok-mini{color:var(--verde)!important;font-weight:600}.alerta-mini{color:var(--vermelho)!important;font-weight:600}
.abas{display:flex;gap:6px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
.abas a{padding:8px 18px;border:1px solid var(--borda);border-radius:9px;color:var(--fraco);font:600 16px var(--titulo)}
.abas a:hover{color:var(--texto);border-color:var(--borda-forte)}.abas a.ativo{background:var(--luz);color:var(--luz-tinta);border-color:var(--luz)}
.abas .pequeno{margin-left:8px}
.demanda{margin-bottom:14px}.demanda h2{align-items:center}
.mkts{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}.mkts i{font:500 12px var(--corpo);font-style:normal;border:1px solid var(--borda-forte);border-radius:12px;padding:2px 10px;color:var(--texto)}
.dem-grade{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:22px}
.dem-grade h3{font:600 13px var(--corpo);color:var(--fraco);margin:0 0 6px}.dem-grade h3:not(:first-child){margin-top:14px}.dem-grade h3 small{font-weight:400}
.dem-grade pre{margin:0;white-space:pre-wrap;font:14px/1.5 var(--corpo);background:var(--chao);border:1px solid var(--borda);border-radius:9px;padding:11px 13px}
.dem-grade code{font:12px/1.4 Consolas,monospace;color:var(--fraco);overflow-wrap:anywhere}
.entendeu{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.entendeu label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--fraco)}.entendeu input{color:var(--texto);width:100%}
.dem-ads{display:flex;gap:8px;flex-wrap:wrap}.dem-ads small{font-weight:400;margin-left:4px}
@media (max-width:900px){.dem-grade{grid-template-columns:1fr}}
.faixa-bots{margin:-6px 0 14px;padding:10px 14px;border:1px solid #6b2a25;background:#2a1716;border-radius:10px;color:#ffc9c3;font-size:14px}
.faixa-bots a{color:#fff;text-decoration:underline;margin-left:6px}
.v-extra{display:flex;flex-direction:column;gap:8px}.v-extra:empty{display:none}
.nota{border:1px solid var(--borda);border-left:3px solid var(--fraco);border-radius:8px;padding:9px 11px;display:flex;flex-direction:column;gap:2px;font-size:13px}
.nota b{font-size:14px}.nota span{color:var(--fraco)}
.nota.ruim{border-left-color:var(--vermelho);background:rgba(240,102,91,.08)}.nota.ruim b{color:var(--vermelho)}
.nota.boa{border-left-color:var(--verde)}.nota.boa b{color:var(--verde)}
.nota.par{flex-direction:row;gap:10px;align-items:center}.nota.par img{width:64px;height:64px;border-radius:6px;background:#fff;flex:none}.nota.par div{display:flex;flex-direction:column;gap:2px}
.medidas-mini{display:flex;flex-wrap:wrap;gap:4px 10px}.medidas-mini i{font-style:normal;color:var(--texto)}
.janela{z-index:60}
.janela-caixa{background:var(--painel);border:1px solid var(--borda-forte);border-radius:16px;padding:24px;width:min(760px,100%);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:14px;box-shadow:0 30px 90px rgba(0,0,0,.7)}
.janela-caixa h2{font:700 24px var(--titulo);margin:0}.janela-caixa h3{font:600 17px var(--titulo);margin:0 0 6px}.janela-caixa p{margin:0}
.janela-caixa>.b{align-self:flex-start}
.motivos{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:9px}
.motivo-livre{display:flex;flex-direction:column;gap:7px;border-top:1px solid var(--borda);padding-top:14px}.motivo-livre label{font-size:14px;color:var(--fraco)}.motivo-livre input{flex:1;min-width:220px;color:var(--texto);font-size:15px;padding:10px 12px}.motivo-livre .acoes{flex-wrap:nowrap}.motivo-livre .pequeno{margin:0}
.motivos .b{justify-content:flex-start;padding:12px 14px;font-size:16px;white-space:normal;text-align:left}
.pacotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}
.pacotes>div{border:1px solid var(--borda);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:10px}
.pacotes ol{margin:0;padding-left:22px;font-size:13px;display:flex;flex-direction:column;gap:3px;overflow-wrap:anywhere}.pacotes small{color:var(--fraco)}
.abas .aba{display:inline-flex;align-items:center}.abas .aba a{border-top-right-radius:0;border-bottom-right-radius:0}
.x-aba{align-self:stretch;border:1px solid var(--borda);border-left:0;background:none;color:var(--apagado);border-radius:0 9px 9px 0;padding:0 9px;font-size:16px;cursor:pointer}
.x-aba:hover{color:var(--vermelho);border-color:var(--vermelho)}.x-aba.confirmar{background:var(--vermelho);color:#230705;border-color:var(--vermelho);font-size:13px;font-weight:600}
.cartao.anuncio{position:relative}.excluir-card{position:absolute;top:14px;right:14px;z-index:3;border:1px solid var(--borda-forte);background:rgba(13,13,14,.85);color:var(--texto);border-radius:8px;padding:5px 10px;font-size:13px;cursor:pointer;opacity:0;transition:opacity .12s}
.cartao.anuncio:hover .excluir-card,.excluir-card:focus-visible,.excluir-card.confirmar{opacity:1}.excluir-card:hover{border-color:var(--vermelho);color:var(--vermelho)}.excluir-card.confirmar{background:var(--vermelho);border-color:var(--vermelho);color:#230705;font-weight:600}
@media (hover:none){.excluir-card{opacity:1}}
.form-copiar{display:flex;flex-direction:column;gap:12px}.form-copiar .linha{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.form-copiar input[type=number]{width:72px}.form-copiar h3{margin:6px 0 0}
.lista-destinos{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px;max-height:240px;overflow:auto;padding:8px;border:1px solid var(--borda);border-radius:10px}.lista-destinos label{display:flex;gap:7px;align-items:center;font-size:14px}.lista-destinos small{color:var(--apagado)}
.faltas{margin:0}.faltas h3{font:600 15px var(--titulo);margin:14px 0 6px}.faltas .pedir{margin-top:12px}.linha-capas{margin:10px 0 0}.pacotes-feitos{margin:0;padding-left:20px;font-size:14px;display:flex;flex-direction:column;gap:4px}.pacotes-feitos a{color:var(--luz);text-decoration:underline}.pacotes-feitos b{margin-right:6px}.janela-caixa .nota span{color:var(--texto)}.metas{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:12px;font-size:14px}.metas label{display:flex;gap:8px;align-items:center}.metas input{width:64px;padding:6px 8px}
.comando textarea{font:13px/1.5 Consolas,monospace;margin-bottom:10px}.comando code{font-family:Consolas,monospace;color:var(--texto)}.comando{margin-bottom:18px}
.abas-ref{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0 16px;border-bottom:1px solid var(--borda)}
.abas-ref a{padding:10px 16px;font:600 16px var(--titulo);color:var(--fraco);border-bottom:2px solid transparent;margin-bottom:-1px}
.abas-ref a:hover{color:var(--texto)}.abas-ref a.ativo{color:var(--texto);border-bottom-color:var(--luz)}
.abas-ref small{font:400 13px var(--corpo);color:var(--apagado);margin-left:4px}
.estilo-ref{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--fraco)}.estilo-ref input{color:var(--texto);width:100%}
.ref.escolhida .cartao{border-color:var(--luz);box-shadow:0 0 0 1px var(--luz)}.caminho .acoes .b{flex:1;padding:8px 10px;font-size:14px}.faltas ul,.demandas ul{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:3px}
.faltas li::marker,.demandas li::marker{color:var(--luz)}
.completo{margin:0;color:var(--verde);font-weight:600}
.dois-blocos{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:14px;margin:14px 0 20px}
.demandas{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
.demandas a b{font:600 17px var(--titulo)}.demandas a:hover b{color:var(--luz)}.demandas>div{display:flex;flex-direction:column;gap:6px;font-size:14px}
.tabela{width:100%;border-collapse:collapse;font-size:14px}
.tabela td,.tabela th{padding:8px 6px;border-bottom:1px solid var(--borda);text-align:left;vertical-align:middle}
.tabela th{color:var(--fraco);font-weight:500;font-size:13px}.tabela tr:last-child td{border-bottom:0}
.ponto{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:9px;background:var(--fraco)}
.ponto.boa{background:var(--verde)}.ponto.ruim{background:var(--vermelho)}.ponto.andando{background:var(--azul)}
.aviso-txt{color:var(--luz)}
.barras{display:flex;flex-direction:column;gap:6px}
.barras a{display:grid;grid-template-columns:minmax(150px,1.3fr) 1fr 28px;gap:10px;align-items:center;padding:5px 8px;border-radius:7px;font-size:14px}
.barras a:hover,.barras a.ativo{background:var(--relevo)}
.barras i{height:10px;border-radius:5px;background:var(--vermelho);min-width:4px}.barras b{text-align:right;font-family:var(--titulo)}
.ref{display:flex;flex-direction:column;gap:8px}
.caminho{display:flex;flex-direction:column;gap:6px}
.caminho code{font:12px/1.4 Consolas,monospace;color:var(--fraco);background:var(--painel);border:1px solid var(--borda);border-radius:8px;padding:8px;overflow-wrap:anywhere;user-select:all}
.medidas .bloco{display:flex;flex-direction:column;gap:10px}.medidas .b{align-self:flex-start}.medidas td .b{padding:4px 10px}
'''
API_DEMO="  const api = (url, corpo, formulario) => FAKE(url, corpo, formulario);"
MARCA = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="7"/><path d="M8 21c0-5 3-7 6-7 1 2 3 3 6 3 3 0 4 2 4 4z"/></svg>'
MARCA_SITE = '{% set lv = versao_logo() %}{% if lv %}<img class="logo" src="/logo?v={{ lv }}" alt="">{% else %}' + MARCA + '{% endif %}'
ICONE_SITE = '{% if versao_logo() %}<link rel="icon" href="/logo?v={{ versao_logo() }}">{% endif %}'
def pagina(estilos, banner, rodape, scripts, titulo, marca=MARCA):
    return f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo}</title>
{estilos}
</head>
<body data-desfazer="60">
<canvas id="agua" aria-hidden="true"></canvas>
<aside class="lateral">
  <a class="marca-site" href="#" data-rota="/">{marca}<span>Menork<small>imagens</small></span></a>
  <form class="busca" data-busca="1"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6"/><path d="m14 14 4 4"/></svg><input type="search" name="q" placeholder="Buscar" aria-label="Buscar produto, cor, tipo, anúncio ou arquivo"></form>
  <nav>{nav}</nav>
  <div class="rodape-lateral">{rodape}</div>
</aside>
<div class="palco">
{banner}<main></main>
</div>
{sobras}<datalist id="dl-produtos"></datalist><datalist id="dl-cores"></datalist><datalist id="dl-anuncios"></datalist>
{scripts}
</body>
</html>
"""
dados=open('dados.js').read(); telas=open('telas.js').read(); extras=open('extras.js').read()
# ---- demonstracao (um arquivo so)
html=pagina(f"<style>\n{css}{extra}</style>", '<div class="demo">Demonstração com imagens de exemplo. Tudo funciona, mas nada é salvo: ao recarregar a página, volta ao início.</div>\n',
            '<div class="pulso"><i></i><span>Demonstração</span></div>',
            f"<script>\n{open(R+'static/agua.js').read()}\n{dados}\n{telas}\n{extras}\n{app.replace('/*API*/', API_DEMO)}\n{an}\nRENDER();\n</script>", "Imagens Menork (demonstração)")
open('demonstracao.html','w').write(html); print('demo', len(html))
# ---- site de verdade: as mesmas telas, falando com o servidor
def pedaco(ini, fim):
    a=dados.index(ini); return dados[a:dados.index(fim, a)]
linha=lambda ini: next(l for l in dados.split('\n') if l.startswith(ini))
comuns='\n'.join([pedaco('const TIPOS = ', 'const TINTAS'), linha('const MOTIVOS = '), linha('const META = '), linha('const MKT = '), linha('const FORMATO = '),
                  pedaco('const resumo = i =>', 'function montar(aid, d) {'), pedaco('const demandaDe = a =>', 'const GRANDE = IMG;')])
site_js='\n'.join(["'use strict';", comuns, open('dados_site.js').read(), telas, extras, app.replace('/*API*/', API_REAL), an, "RENDER().catch(e => window.menork.aviso(e.message));"])
assert 'FAKE' not in site_js and 'arte(' not in site_js and 'TAREFAS_NOVAS' not in site_js
open(R+'static/site.js','w').write(site_js)
open(R+'static/extra.css','w').write(extra.split('\n',3)[3])
open(R+'templates/app.html','w').write(pagina(ICONE_SITE + '\n<link rel="stylesheet" href="/static/estilo.css?v={{ versao }}">\n<link rel="stylesheet" href="/static/extra.css?v={{ versao }}">', '',
            '<div class="pulso"><i></i><span>Lendo a pasta de entrada</span></div><a class="sair" href="/sair">Sair</a>',
            '<script src="/static/agua.js?v={{ versao }}"></script>\n<script src="/static/site.js?v={{ versao }}"></script>', "Imagens Menork", MARCA_SITE))
print('site', len(site_js))
