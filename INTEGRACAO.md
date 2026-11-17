> **Atualização (versão 2026.11.16.24):** o site agora fala direto com a API pública do B2X (`/v1/clientes`, `/v1/anuncios`, `/v1/fotos`, `/v1/anuncios/editar`, `/v1/anuncios/criar*`), pelo código em `app/b2x.py`. As rotas `/menork/*` descritas abaixo não são mais usadas; ficam só como histórico.

# Integração: site de imagens → seu sistema (ex.: B2X)

O site de imagens envia anúncios prontos para o seu sistema. Para isso, o seu sistema precisa ter **dois endereços**, abaixo do "Endereço da API" cadastrado em **Integrações** no site.

Todas as chamadas levam o cabeçalho:

```
Authorization: Bearer <chave da API>
```

Recuse (401) quando a chave estiver errada.

## 1. GET `/menork/ping`

Usado pelo botão **Testar conexão**. Responda `200` com qualquer JSON, por exemplo `{"ok": true}`.

## 2. POST `/menork/anuncios`

Recebe um anúncio. Formato `multipart/form-data` com:

- campo **`dados`**: um JSON (formato abaixo);
- um ou mais campos **`arquivos`**: as imagens, cada uma com o nome de arquivo citado no JSON.

### O JSON `dados`

```json
{
  "versao": 1,
  "origem": "site-imagens-menork",
  "id_menork": 12,
  "id_externo": "",
  "rascunho": true,
  "nome": "TA01 unitário",
  "formato": "unitario",
  "produto": "TA01",
  "titulo": "Tênis Feminino Plataforma Leve",
  "preco": "89,90",
  "preco_antigo": "129,90",
  "descricao": "Texto da descrição…",
  "marketplaces": ["SHP", "ML"],
  "tarefa_clickup": "https://app.clickup.com/t/…",
  "completo": true,
  "fotos": [
    {"posicao": 1, "capa": true,  "arquivo": "01_capa.png", "tipo": "capa", "cor": "Cafe"},
    {"posicao": 2, "capa": false, "arquivo": "02.png",      "tipo": "ia",   "cor": "Cafe"}
  ],
  "cores": [
    {"nome": "Cafe", "arquivo": "cor_cafe.png"}
  ]
}
```

| Campo | O que é |
|---|---|
| `id_menork` | Número do anúncio no site de imagens. |
| `id_externo` | Vazio na primeira vez. Depois, é o código que **o seu sistema devolveu**: quando vier preenchido, **atualize** esse anúncio em vez de criar outro. |
| `rascunho` | `true`: guarde sem publicar. |
| `formato` | `unitario`, `kit2`, `kit3` ou `kit4`. |
| `preco`, `preco_antigo` | Texto no formato brasileiro (`89,90`). `preco_antigo` pode vir vazio. |
| `marketplaces` | Siglas da tarefa do ClickUp: ML, SHP, SHEIN, TIKTOK, AMAZON, MAGALU, NETSHOES, TEMU, KWAI. Pode vir vazio. |
| `completo` | `false` só quando o Menork mandou mesmo com pendências. |
| `fotos` | Na ordem de subida. A posição 1 é a capa. Até 10. |
| `cores` | Uma foto por variação de cor. |

### A resposta

Responda `200` ou `201` com um JSON que tenha o **código do anúncio no seu sistema**:

```json
{"id": "B2X-4821"}
```

O site guarda esse código e o manda de volta em `id_externo` nos próximos envios do mesmo anúncio.

Em caso de erro, responda `4xx` ou `5xx` com uma mensagem curta no corpo: ela aparece para o Menork na tela do anúncio.

## 3. GET `/menork/clientes`

Usado pela aba **Lojas** do site de imagens. Devolva os clientes e as lojas de cada um:

```json
{
  "clientes": [
    {
      "id": "12",
      "nome": "Nome do cliente",
      "lojas": [
        {"id": "55", "nome": "Nome da loja", "marketplace": "ML", "url": "https://link-da-loja-no-marketplace", "anuncios": 120}
      ]
    }
  ]
}
```

`marketplace` usa as mesmas siglas de cima (ML, SHP, SHEIN, TIKTOK…). `url` e `anuncios` (quantidade) são opcionais.

## 4. GET `/menork/lojas/{id da loja}/anuncios?pagina=1&por_pagina=48&busca=texto`

Devolva os anúncios daquela loja, de 48 em 48. `busca` vem vazio ou com um texto para filtrar pelo título.

```json
{
  "total": 120,
  "anuncios": [
    {"id": "MLB123456", "titulo": "Tênis Feminino…", "preco": "89,90", "status": "ativo",
     "foto": "https://link-publico-da-foto-principal", "link": "https://link-do-anuncio-no-marketplace",
     "vendas": 12, "estoque": 30}
  ]
}
```

`foto` e `link` precisam ser endereços completos (`https://…`). `vendas` e `estoque` são opcionais.
