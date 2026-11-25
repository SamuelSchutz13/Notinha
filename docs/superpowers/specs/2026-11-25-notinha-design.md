# Notinha — design

Data: 2026-11-25 · Status: aguardando aprovação

## Intenção

Transformar as notas fiscais do mercado (NFC-e) em controle de gastos sem digitar nada.
O usuário lê o QR Code da nota com o celular e o app guarda cada item (nome, quantidade,
preço, loja, data). Com isso responde: quanto gastei no mês e quanto o preço de cada
produto subiu. Uso pessoal primeiro, e também peça do portfólio (Zyraxz).

## Objetivos (MVP)

1. Ler o QR Code de uma NFC-e de **Santa Catarina** e extrair os itens.
2. Guardar as notas no próprio celular.
3. Mostrar a lista de notas, o total por mês e o histórico de preço de um produto (gráfico).
4. Exportar e importar um backup em JSON. Os dados só existem no aparelho, então limpar
   o navegador apagaria tudo.

## Fora do MVP

- Outros estados (a arquitetura deixa espaço, mas só SC é implementado).
- Comparar o mesmo produto entre lojas diferentes (exige casar nomes abreviados).
- Lista de compras automática, categorias e orçamento.
- Contas, login e sincronização entre aparelhos.

## Anti-objetivos (fracasso, mesmo se funcionar)

- Guardar ou registrar no servidor o conteúdo das notas.
- Exigir cadastro, ou ter anúncios e rastreadores.
- Fazer o usuário digitar os itens.

## Restrições

- O navegador não consegue ler a página da SEFAZ direto por causa do CORS. Por isso o
  servidor existe.
- A câmera (`getUserMedia`) só funciona em HTTPS ou em `localhost`, então o celular
  precisa acessar o app por HTTPS.
- O layout da página da SEF/SC pode mudar sem aviso, então o leitor tem que ser fácil de
  ajustar e falhar com uma mensagem clara.
- Endereço do QR Code em SC: `https://sat.sef.sc.gov.br/nfce/consulta?p=...`. A versão de
  produção ainda **não foi confirmada**; o primeiro passo é testar com uma nota real.

## Abordagens consideradas

- **A. PWA + servidor Go sem estado (escolhida).** Funciona em Android e iPhone, dá para
  mostrar com um link, e o autor já usa Go (uJobs). Custo: hospedar o servidor, que vê a
  nota durante a consulta.
- **B. App Android nativo.** É a mais privada, sem servidor, mas não roda no iPhone e é
  ruim de mostrar no portfólio.
- **C. Só PWA.** Descartada: o CORS bloqueia a leitura da página da SEFAZ.

## Como funciona

```
celular (PWA)                         servidor Go                 SEF/SC
 ler QR ──> URL da nota ──POST /api/nota──> valida a URL ──GET──> página HTML
 IndexedDB <── JSON com os itens <──────── extrai os itens <─────┘
```

**Servidor Go (um binário só, como o uJobs):**
- Serve os arquivos da PWA e a rota `POST /api/nota` com `{ "url": "..." }`.
- Só aceita URLs do domínio da SEF/SC (lista fixa de hosts), para não virar um proxy aberto.
- Baixa a página, extrai os itens e devolve:
  `{ chave, loja: {nome, cnpj}, emitidaEm, total, itens: [{codigo, descricao, qtd, unidade, valorUnit, valorTotal}] }`.
- Não guarda nada e não registra no log o conteúdo da nota nem a URL. Tem tempo limite
  na chamada para a SEFAZ.
- Um leitor por estado atrás de uma interface pequena (`Parser` por host). No MVP só existe o de SC.
- Testado com páginas HTML reais salvas como fixtures.

**PWA (HTML, CSS e JS sem framework, igual ao portfólio):**
- Leitura do QR Code pela câmera ao vivo e também por foto (`<input type="file" capture>`),
  que serve de alternativa quando a câmera falha.
- Biblioteca de leitura de QR: `jsQR` (o iOS não tem `BarcodeDetector`).
- IndexedDB com a nota indexada pela **chave de acesso** (44 dígitos). Ler a mesma nota
  de novo não cria uma duplicata.
- Telas: **Ler nota**, **Notas** (lista e total do mês), **Produto** (histórico de preço).
- Histórico de preço do MVP: agrupa pela descrição normalizada (maiúsculas, sem acento,
  espaços colapsados) **dentro da mesma loja**.
- Botões de exportar e importar o backup JSON.

## Decisões do builder (propostas, podem ser corrigidas)

- Sem framework no front e sem build, como no Zyraxz.
- Gráfico de preço desenhado à mão em SVG, sem biblioteca.
- Hospedagem: um serviço com HTTPS grátis que rode Go (Fly.io ou Render), escolhido na
  hora do deploy. No desenvolvimento, `localhost` no PC e um teste com foto da nota.
- Pasta do projeto: `C:\Users\samue\Documents\Notinha`.

## Em aberto

- Confirmar o endereço de produção e o HTML da página da SEF/SC com uma nota real. Se a
  página tiver captcha, a abordagem A precisa ser revista.

## Revisão 2026-11-25: sem servidor

A consulta de produção da SEF/SC (`sat.sef.sc.gov.br/nfce/consulta`) redireciona para
`SecurityVerify.aspx` com captcha Cloudflare Turnstile. Um servidor não consegue ler a nota,
e burlar o captcha está fora de questão. Decisão do usuário: manter o app web, sem app nativo.

- O servidor Go sai. O app é só arquivos estáticos (pode ir para o GitHub Pages).
- Fluxo: ler o QR Code → o app mostra o botão "Abrir nota na SEFAZ" (só para hosts da SEF/SC)
  → o usuário passa pelo captcha, seleciona tudo e copia → volta e cola no Notinha.
- O leitor da nota roda no celular, a partir do **texto** copiado (`text/plain`).
- Chave de acesso: a do texto colado; se não houver, a do QR Code lido antes. Sem nenhuma
  das duas, a nota não é salva.
- Formato do texto copiado ainda **não confirmado** com uma nota real: a fixture é provisória.
