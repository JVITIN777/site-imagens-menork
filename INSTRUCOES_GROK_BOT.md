# Instruções para o Grok Bot — site de imagens Menork

Você não precisa colar este texto a cada atualização. Mande aos bots, uma vez só, a mensagem que está no fim do `LEIA-ME.md`: ela manda o bot rodar `menork.ps1 instrucoes` no começo de cada rodada, e esse comando mostra sempre a versão atual deste arquivo, já com a pasta certa.

---

Existe um site de imagens rodando neste PC. A partir de agora ele é o lugar único das imagens de anúncio. Você fala com ele rodando este comando no PowerShell:

```
powershell -ExecutionPolicy Bypass -File "C:\SiteImagensMenork\menork.ps1" <comando> [opções]
```

A resposta vem em JSON. Se começar com `ERRO:`, pare e avise o Menork com a mensagem.

## Regras
1. Toda imagem gerada vai para o site com `enviar`. Não crie mais pastas de estrutura por anúncio.
2. Nada é final antes de o Menork aprovar no site. Não suba anúncio com imagem que não veio de `pacote`.
3. Antes de gerar, consulte `faltas` (o que precisa), `referencias` (o que copiar) e `erros` (o que não repetir).
4. Sempre diga produto, cor e tipo ao enviar. Tipos aceitos: `fb`, `kit2_fb`, `kit3_fb`, `kit4_fb`, `ia`, `informativo`, `tabela`, `capa`, `capa_kit2`, `capa_kit3`, `capa_kit4`, `cena`.
5. Nunca apague nada no site nem na TrueNAS. Reprovar e apagar é decisão do Menork, na tela.
6. Avise o que está fazendo com `status` ao começar, ao terminar e ao parar por limite.
7. No começo de cada rodada, rode `instrucoes` (as regras podem ter mudado) e depois `pedidos`: é ali que chega o que o Menork pediu pelo botão "Pedir ao bot o que falta".

## Comandos

**Ver os anúncios e o que falta em cada um**
```
menork.ps1 anuncios
menork.ps1 faltas -Anuncio "CI9 unitário"
```
A resposta traz `completo` (verdadeiro ou falso) e a lista `faltas`. É a mesma conferência que libera ou barra o pacote. Ela olha: capa escolhida; fotos IA, informativos e tabela de cada cor **colocados nas fotos do anúncio**; pelo menos 1 foto em Cores; título, preço e descrição; nenhuma imagem do anúncio ainda em conferência.
Em cada item, `esperando_aprovacao` diz quantas já estão na fila do Menork e `aprovadas_fora_do_anuncio` quantas já existem aprovadas mas ainda não foram colocadas: nesses dois casos não gere de novo.

**Ver e atender os pedidos do Menork**
```
menork.ps1 pedidos
menork.ps1 pedido -Id 3 -Status pego -Bot "GERADOR DE IMAGEM"
menork.ps1 pedido -Id 3 -Status feito -Bot "GERADOR DE IMAGEM"
```
`pedidos` mostra cada pedido aberto com o que falta **agora** naquele anúncio. Marque `pego` ao começar e `feito` ao terminar. Título, preço, descrição e aprovação são do Menork: não invente.

**Pegar as referências para o gerar.ps1**
```
menork.ps1 referencias -Tipo informativo -Estilo Academia -Produto CI9
```
Vem o campo `comando`, já no formato `-Referencias "caminho1","caminho2"` (no máximo 5 arquivos, caminho de cada arquivo, nunca de pasta). Use exatamente esse trecho no `gerar.ps1`.
Tipos de referência: `informativo`, `cena`, `capa`, `tabela`.
Para gerar **foto IA**, a referência é a **cena** (`-Tipo cena`): junte o fundo branco do modelo com uma cena do estilo certo.
Informativos e cenas são separados por **estilo** (por exemplo Academia, Street, Sandália). Use o `-Estilo` que combina com o produto que você vai gerar; a resposta traz em `estilos_existentes` a lista de estilos cadastrados. Se não houver referência do estilo certo, rode sem `-Estilo` e avise o Menork.

**Ver os erros que o Menork já reprovou**
```
menork.ps1 erros -Produto CI9
```
Leia o `resumo` (motivos mais comuns) antes de gerar e confira a imagem contra esses motivos.

**Ver as capas já aprovadas (para não repetir)**
```
menork.ps1 capas -Produto CI9
```

**Mandar uma imagem para a fila de aprovação**
```
menork.ps1 enviar -Arquivo "C:\caminho\ci9ia_PRETO_01.png" -Produto CI9 -Cor Preto -Tipo ia -Anuncio "CI9 unitário" -Conta "Conta 1"
```
Se a imagem já existe no site (por exemplo, entrou pela pasta vigiada sem produto, cor e tipo), o mesmo comando **atualiza** esses dados e liga a imagem ao anúncio; a resposta vem com `nova: false` e `atualizada: true`.
Se você conferiu a imagem contra o fundo branco, acrescente `-Conferida`. Se achou diferença, mas quer que o Menork decida, acrescente `-Alertas "Sola diferente do fundo branco","Logo não encontrada"`.

**Registrar uma imagem que você mesmo reprovou**
```
menork.ps1 reprovada -Arquivo "C:\caminho\x.png" -Motivo "Sola errada" -Bot CONFERENTE -Produto CI9 -Cor Preto -Tipo ia -Conta "Conta 1"
```
Motivos (use um destes): Produto diferente do fundo branco; Sola errada; Sem logo ou logo errada; Pose ou pé diferente da cena; Cara de IA; Produto pequeno ou longe; Layout inventado; Cor errada; Medida errada; Capa repetida.

**Avisar o que está fazendo e o limite da conta**
```
menork.ps1 status -Bot "GERADOR DE IMAGEM" -Status trabalhando -Detalhe "Gerando CI9 Preto, foto 2 de 3"
menork.ps1 status -Bot "GERADOR DE IMAGEM" -Status parado -Detalhe "Conta 2 bateu o limite"
menork.ps1 conta -Conta "Conta 2" -Limite "Limite volta às 15:40"
menork.ps1 conta -Conta "Conta 2" -Limite ""
```
Status aceitos: `ok` (livre), `trabalhando`, `parado`.

**Cadastrar um anúncio a partir da tarefa do ClickUp (bot CLICKUP PASTA)**
```
menork.ps1 demanda -Tarefa "NOME DA TAREFA" -Produto CI9 -Pasta "\\SERVIDOR\pasta\do\produto" -Marketplaces SHP,ML -Info "Fundo branco unitario, kit 2 e kit 3
10 IA cada cor
3 informativos cada cor
20 capas unitario"
```
`-Info` é o texto do campo INFO JOAO, copiado como está. `-Produto` é o código que aparece no nome das imagens. O site cria sozinho os anúncios (unitário e kits) e as metas. Não crie pastas.
Siglas dos marketplaces: ML, SHP, SHEIN, TIKTOK, AMAZON, MAGALU, NETSHOES, TEMU, KWAI.

**Mandar o anúncio pronto para o sistema do Menork (B2X)**
```
menork.ps1 enviar-sistema -Anuncio "CI9 unitário" -Bot "SEU NOME"
```
Só funciona com o anúncio completo e com a integração configurada pelo Menork em Integrações. Se faltar algo, vem `ERRO:` com a lista e nada é enviado. Se o anúncio já foi enviado antes, o comando atualiza o anúncio lá em vez de criar outro.

**Baixar o pacote aprovado para subir o anúncio**
```
menork.ps1 pacote -Anuncio "CI9 unitário" -Marketplace SHP -Destino "C:\Temp\ci9-shopee" -Bot "SEU NOME"
```
Se faltar qualquer coisa, a resposta é `ERRO:` com a lista do que falta e **nenhum arquivo é baixado**. Nesse caso não suba o anúncio: avise o Menork. Quando o pacote sai, ele fica registrado na tela do anúncio ("Montado em ... por ...") e o ZIP fica guardado na pasta do site.
A pasta recebe as fotos já na ordem (`..._01_capa`, `..._02`, …), a pasta `cores` com uma foto por variação e o `anuncio.txt` com título, preço e descrição. Suba nessa ordem.
