# Fonte das telas

As telas do site (`app/static/site.js`, `app/static/extra.css` e `app/templates/app.html`) são geradas a partir destes arquivos. Não edite esses três à mão: edite aqui e rode

```
python fonte/montar.py
```

- `telas.js`, `extras.js`: as telas.
- `dados_site.js`: ligação das telas com o servidor.
- `dados.js`: dados de exemplo, usados só na demonstração (`fonte/demonstracao.html`, que não vai para o repositório).
- `montar.py`: junta tudo; também usa `app/static/app.js`, `app/static/anuncio.js` e `app/static/estilo.css`.

Para publicar uma versão nova: altere, rode o `montar.py`, aumente o número em `versao.txt` e envie para o GitHub. Os sites instalados se atualizam sozinhos.
