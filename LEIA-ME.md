# Site de imagens Menork

## Instalar (uma vez)
1. Copie esta pasta para o PC onde o Grok Bot roda, por exemplo `C:\SiteImagensMenork`.
2. Se o PC não tiver Python, instale em python.org marcando "Add python.exe to PATH".
3. Dê dois cliques em `instalar.bat`.
4. Dê dois cliques em `iniciar.bat`. Na primeira vez ele cria o `config.json`; feche, abra o `config.json`, preencha as duas pastas (veja a tabela abaixo) e ligue de novo.
5. O navegador abre em http://localhost:8765 e pede para criar a senha.
6. Rode `ligar_com_o_windows.bat` para o site subir sozinho, escondido, a cada login. `desligar.bat` desfaz.
7. Mande aos bots, uma vez só, a mensagem do fim deste arquivo.

## Atualização automática
O site busca a versão nova sozinho no GitHub (repositório `JVITIN777/site-imagens-menork`): ao ligar, a cada 6 horas e pelo botão **Buscar atualização agora**, no Painel.
- Só os arquivos do programa são trocados. `config.json`, a pasta `dados` e as imagens nunca são tocados.
- Antes de trocar, o site guarda a versão anterior em `dados\versoes`. O botão **Voltar à versão…**, no Painel, desfaz a última atualização e não a instala de novo sozinho.
- Para atualizar só pelo botão, coloque `"atualizar_sozinho": false` no `config.json`.
- Os bots pegam as regras novas pelo comando `menork.ps1 instrucoes`.

## Como as imagens chegam
- **Pasta de entrada**: tudo que o gerador salvar na pasta vigiada entra na fila em até 10 segundos.
- **Pelos bots**: `menork.ps1 enviar ...` manda a imagem já com produto, cor, tipo e anúncio.
- **Por você**: botão "Enviar imagens" na fila ou dentro do anúncio.
A mesma imagem nunca entra duas vezes, mesmo se chegar pelos dois caminhos.

## Telas
- **Fila de aprovação**: clique para ver grande ao lado do fundo branco. `A` aprova; `R` reprova e pergunta o motivo (teclas 1 a 9 e 0). Reprovar apaga o arquivo depois de 60 segundos (dá para desfazer); o motivo e uma miniatura ficam na Lista de erros.
- **Demandas**: tarefas do ClickUp que viraram cadastro, com o pedido lido do INFO JOAO (corrija os números se o site ler errado) e o código do produto.
- **Anúncios**: agrupados por tarefa, com abas Unitário / Kit 2 / Kit 3. Dentro de cada um: os 10 espaços de foto (o primeiro é a capa), título, preço, descrição, cores, o que falta e a prévia no celular. "Exportar" baixa um ZIP por marketplace.
  - **O que falta** usa uma conferência só, a mesma que libera o pacote: capa escolhida; fotos IA, informativos e tabela de cada cor colocados nas 10 fotos; pelo menos 1 foto em Cores; título, preço e descrição; nenhuma imagem do anúncio em conferência.
  - Ao aprovar uma foto IA, informativo ou tabela que já está ligada ao anúncio, ela entra sozinha nas fotos (até a meta daquela cor e enquanto houver espaço).
  - **Pedir ao bot o que falta** registra um pedido que os bots leem com `menork.ps1 pedidos` e copia o texto para você colar no Grok Bot se quiser que comece na hora.
  - Os bots só baixam pacote completo. Você pode baixar incompleto pelo botão "Baixar mesmo assim". Todo pacote fica registrado no anúncio, e o ZIP é guardado em `pasta_repositorio\pacotes`.
- **Catálogo**, **Histórico de capas**, **Referências** (monta o `-Referencias` do gerar.ps1, até 5 arquivos), **Lista de erros**, **Painel** (faltas, status dos bots, contas, endereço e chave dos bots) e **Medidas**.

## config.json
| Campo | O que faz |
|---|---|
| `pasta_entrada` | Pasta vigiada (a do gerador). Deixe `""` se os bots só mandarem pelo `menork.ps1`. |
| `pasta_repositorio` | Onde o site guarda as imagens e o backup diário do banco. É criada sozinha. |
| `modo_entrada` | `copiar` (deixa o original na pasta do gerador) ou `mover`. |
| `apagar_original_ao_reprovar` | `true`: reprovar também apaga o original na pasta do gerador. |
| `importar_a_partir_de` | Vazio: só o que chegar depois da primeira vez que o site ligar. `"2026-11-01"`: a partir dessa data. `"tudo"`: a pasta inteira. |
| `host` | `127.0.0.1`: só este PC (é o que os bots precisam). `0.0.0.0`: libera para celular e outros aparelhos da rede. |
| `porta` | Se mudar, troque também o 8765 dentro dos arquivos .bat. |
| `clickup_token` | Chave pessoal do ClickUp (Configurações > Apps > API Token). Com ela, o botão "Buscar tarefas no ClickUp" lê a lista DEMANDAS. O site só lê, nunca escreve. Sem ela, as demandas entram pelo bot (`menork.ps1 demanda`). |
| `clickup_lista` | Número da lista DEMANDAS (já preenchido). |
| `chave_bots` | Vazio: o site cria uma chave e guarda em `dados\chave_bots.txt`, que o `menork.ps1` lê sozinho. |
Use barras duplas nos caminhos (`\\\\Truenas\\pasta`). Depois de mudar, feche e abra o site.

## Onde ficam os dados
- Imagens: `pasta_repositorio\arquivos\ano-mês\`
- Banco: `dados\menork.db` nesta pasta, com cópia diária em `pasta_repositorio\backup_banco` (14 últimas).
- Esqueceu a senha: com o site desligado, rode
  `.venv\Scripts\python.exe -c "import sqlite3;c=sqlite3.connect('dados/menork.db');c.execute(\"delete from ajustes where chave='senha'\");c.commit()"` e crie outra ao abrir.
- Problemas: veja `dados\site.log`.

## Mensagem para mandar aos bots (uma vez só)
Troque o caminho pela pasta onde o site está instalado.

```
Existe um site de imagens rodando neste PC. Ele é o lugar único das imagens de anúncio.
Regra permanente: no começo de cada rodada de trabalho, rode o comando abaixo, leia a resposta inteira e siga as regras que vierem nela. Elas podem mudar quando o site for atualizado, então nunca use de memória.

powershell -ExecutionPolicy Bypass -File "C:\SiteImagensMenork\menork.ps1" instrucoes

Repasse esta regra aos outros bots de imagem e aos que sobem anúncio.
```

Depois disso, atualizar o site não exige mandar nada de novo: os bots pegam as regras novas sozinhos na rodada seguinte.
