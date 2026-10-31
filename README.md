# Navalha

Gestão e agendamento para barbearias. É multi-barbearia (vários donos no mesmo sistema), multi-idioma (português, inglês, espanhol) e multi-moeda.

Protótipo navegável com todas as ideias: https://claude.ai/artifact/EgaCHKSeXPAFtcCbBG3Tj3

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # regras de negócio (agenda, planos, comissões, mensagens, fusos)
npm run db:check   # valida o banco num Postgres em memória e testa segurança e agenda
npm run build && npm start   # e, em outro terminal:
npm run test:e2e   # abre todas as telas num navegador (celular e computador) e procura erros
```

Tudo isso roda sozinho no GitHub a cada envio (`.github/workflows/ci.yml`).

Sem configurar nada, o app abre com a barbearia de demonstração **Dom Bigode**:

- `/b/dom-bigode` é o app do cliente para agendar.
- `/painel/dom-bigode` é o painel do dono, com faturamento, planos vencendo, agenda do dia e desempenho por barbeiro.

Com o Supabase ligado, `/entrar` faz o login pelo WhatsApp (código), `/nova-barbearia` cadastra a barbearia do dono e o painel só abre para a equipe. Passo a passo em [docs/colocar-no-ar.md](docs/colocar-no-ar.md).

Para usar o banco de verdade, crie um projeto no [Supabase](https://supabase.com), aplique `supabase/migrations` (e `supabase/seed.sql`, se quiser dados de exemplo) e copie `.env.example` para `.env.local` com a URL e a chave pública do projeto.

## Como está organizado

| Pasta | O que tem |
|---|---|
| `src/core` | Regras de negócio puras, sem banco e sem tela, todas testadas: horários livres, encaixes de pico, planos (vencimento e reativação ao pagar), comissões configuráveis, sugestão de reagendamento, mensagens automáticas, fusos e moedas. |
| `src/data` | Acesso a dados. Uma interface (`Repo`) com duas versões: demonstração em memória e Supabase. |
| `src/app` | Telas (Next.js). |
| `src/i18n` | Textos em PT/EN/ES. |
| `supabase/migrations` | Banco: tabelas, regras de segurança por barbearia e funções de agendamento. |

### Segurança

- Cada linha do banco pertence a uma barbearia (`shop_id`).
- A equipe só enxerga a própria barbearia.
- O cliente entra pelo WhatsApp (código de verificação) e só enxerga os próprios dados.
- O cliente não grava direto nas tabelas. Ele agenda pela função `book_appointment`, que confere serviço, profissional, horário e plano.
- Níveis da equipe (dono, gerente, recepção, barbeiro) escolhidos pelo dono em Acessos. O banco também confere: o barbeiro só lê e mexe nos próprios atendimentos (dos colegas, só vê livre/ocupado) e cada tela só aceita alterações de quem tem ela liberada. Regras em `src/core/access.ts` e na migração `0012_team_access.sql`.
- O banco recusa dois atendimentos do mesmo barbeiro no mesmo horário, mesmo que dois clientes confirmem ao mesmo tempo.
- Teste automático de segurança do banco (`scripts/db-security-check.mjs`): toda tabela com RLS, toda função protegida, visitante sem login sem acesso a dados. Vale também para tabelas e funções novas.
- A vitrine da equipe (app e TV) vem da função `public_team`: comissão, aluguel de cadeira e metas ficam só para a equipe.
- Cabeçalhos de segurança em todas as páginas (CSP, HSTS, anti-clickjacking) em `next.config.ts`.

### Privacidade (LGPD e GDPR)

- Política de privacidade e Termos de uso em PT/EN/ES: `/privacidade` e `/termos` (texto em `src/legal/content.ts`, dados da empresa nas variáveis `NEXT_PUBLIC_COMPANY_*`). Revisar com advogado antes de vender.
- O cliente baixa e apaga os próprios dados no app (Início → Meus dados). O dono apaga o cadastro de um cliente na ficha dele.
- Ao apagar, atendimentos e pagamentos passados ficam sem nome (contabilidade); ficha, plano, fotos e projetos somem. Migração `0015_privacy.sql`.
- Cadastro da barbearia exige aceitar os termos (a barbearia é controladora dos dados dos clientes, o Navalha é operador).
- Só cookies essenciais (login), sem rastreamento: não precisa de banner de cookies.

### App instalável

- Cada barbearia tem o próprio app instalável, com o nome dela (`/b/[slug]/manifest.webmanifest`); o painel é o app "Navalha".
- Cartão "Instale o app" no app do cliente (Android abre o pedido de instalação; iPhone mostra os toques do Safari).
- Service worker só com a tela "sem internet" (não guarda dados pessoais no celular).
- Para a Google Play (TWA): `/.well-known/assetlinks.json` usa `ANDROID_PACKAGE` e `ANDROID_SHA256`.

### Comissões

Tudo é escolhido pelo dono. A parte difícil é o atendimento de plano, e o dono escolhe uma de quatro regras:

- **rateio pelo uso** (recomendado): valor do plano ÷ usos reais do cliente no mês × %.
- **cota**: valor do plano ÷ cota de usos × %.
- **preço de tabela**: preço do serviço avulso × %.
- **valor fixo** por atendimento.

Também dá para configurar: aluguel de cadeira, exceções por serviço, produtos, bônus por venda de plano, taxa de cartão, insumos, metas por degrau e garantia mínima. O código está em `src/core/commission.ts`.

### Planos sob medida e anti-abuso na agenda

- Cada plano pode ter regras de uso: intervalo mínimo entre usos (ex.: 1 a cada 7 dias), dias da semana, faixa de horário e barbeiros. Fora da regra, o dono escolhe entre cobrar avulso ou não deixar marcar.
- Plano exclusivo: não aparece no app, só a equipe oferece, com número de vagas.
- "Um horário por vez" (Recursos): o cliente não marca dois horários ao mesmo tempo nem guarda vários em aberto.
- Regras em `src/core/plan-rules.ts` e no banco em `0014_plan_rules.sql` (a função `book_appointment` confere tudo).

## Telas

Painel (`/painel/[slug]`): Painel, Agenda (com fila de encaixe), Clientes, Planos, Financeiro, Comissões, Equipe, Serviços, Mensagens, Shopping, Recursos e Acessos (só o dono). Também a TV da recepção (`/tv/[slug]`, com QR code) e o app do cliente (`/b/[slug]`: início, agendar, shopping, meu plano, corte ideal e projeto de visual).

## Próximos passos

1. Lembretes pela API oficial do WhatsApp Business (1 dia e 2 horas antes). Precisa da conta Meta Business.
2. Pagamento online (Pix e cartão) com reativação automática do plano e Pix dividido com o barbeiro. O código de reativação e o webhook do Asaas já estão em `src/modules/client-app/payments.ts`; falta a rota do webhook e a conta no provedor.
3. Recursos ligados/desligados respeitados também no app do cliente.
4. IA de verdade para o corte ideal (hoje a análise é simulada).
5. Publicar nas lojas (Google Play via TWA; App Store precisa de app nativo com recursos próprios) e "compartilhar foto do Instagram" direto para o Navalha.
