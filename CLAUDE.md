# Site de imagens Menork

Site local (Python/FastAPI + SQLite) do Menork para receber, aprovar e organizar imagens de anúncio de calçados. Roda no PC Windows dele e fala com os bots do Grok Bot pelo `menork.ps1`. Tudo em português do Brasil; o usuário não é programador.

## Como publicar uma mudança
1. Telas: edite `fonte/*.js` e rode `python fonte/montar.py` (não edite `app/static/site.js`, `app/static/extra.css` nem `app/templates/app.html` à mão).
2. Servidor: `app/main.py` (rotas e regras), `app/nucleo.py` (banco, leitor da pasta, ClickUp), `app/atualizar.py` (atualização automática).
3. Teste localmente antes de publicar.
4. Aumente o número em `versao.txt` (formato `AAAA.MM.DD.N`) e faça push para `main`. Os sites instalados conferem a cada 2 min (`atualizar_a_cada_minutos`), ao ligar ou pelo botão no Painel, e a página aberta recarrega sozinha.

## Cuidados
- O repositório é público: nunca coloque caminhos da TrueNAS, nomes de clientes, chaves nem o `config.json`.
- Integração com o sistema do usuário (B2X): formato em `INTEGRACAO.md`; endereço e chave ficam no banco local (tabela `ajustes`), nunca no repositório nem em `/api/estado`.
- Gasto das IAs (`app/gastos.py`): chaves de gerenciamento da xAI e Admin da OpenAI ficam em `ajustes` (gastos_contas); só leitura, de 30 em 30 min; nunca devolver as chaves nas rotas.
- A logo do usuário fica só no PC dele, em `dados/logo.png` (ou .jpg/.webp/.svg), servida em `/logo`. Nunca a coloque no repositório.
- O banco ajusta as colunas sozinho ao ligar (`iniciar_banco` em `app/nucleo.py`): ao criar coluna ou tabela, só acrescente, nunca apague.
- `faltas` e o pacote usam a mesma função `checagem` em `app/main.py`; mantenha assim.
- Se mudar comandos do `menork.ps1`, atualize `INSTRUCOES_GROK_BOT.md`: os bots leem esse arquivo pelo comando `instrucoes`.
- `menork.ps1` e os `.bat` precisam ficar em ASCII com fim de linha CRLF.
