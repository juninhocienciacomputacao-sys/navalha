# Navalha

Gestão e agendamento para barbearias. É multi-barbearia (vários donos no mesmo sistema), multi-idioma (português, inglês, espanhol) e multi-moeda.

Protótipo navegável com todas as ideias: https://claude.ai/artifact/EgaCHKSeXPAFtcCbBG3Tj3

## Rodar

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # regras de negócio (agenda, planos, comissões, mensagens, fusos)
npm run db:check   # valida o banco num Postgres em memória e testa segurança e agenda
```

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

### Galeria de cortes e barbas

- O cliente vê modelos de corte e de barba no app (Início e Agendar), abre um, toca em "Quero este visual" e já agenda com o serviço ligado ao modelo.
- Toda barbearia nasce com 20 modelos (12 cortes e 8 barbas) desenhados por nós, em `public/galeria` (gerados por `scripts/galeria-art.mjs`, sem foto de terceiros).
- No painel (Galeria, mesmo acesso de Serviços) o dono troca qualquer desenho por uma foto, cria, remove, reordena e traz de volta os iniciais.
- Banco em `0015_style_gallery.sql` (tabela `style_looks`); a foto fica no banco e é servida em `/b/[slug]/galeria/[id]` com cache.

## Telas

Painel (`/painel/[slug]`): Painel, Agenda (com fila de encaixe), Clientes, Planos, Financeiro, Comissões, Equipe, Serviços, Galeria, Mensagens, Shopping, Recursos e Acessos (só o dono). Também a TV da recepção (`/tv/[slug]`, com QR code) e o app do cliente (`/b/[slug]`: início, agendar, shopping, meu plano, galeria de cortes e barbas, corte ideal e projeto de visual).

## Próximos passos

1. Lembretes pela API oficial do WhatsApp Business (1 dia e 2 horas antes). Precisa da conta Meta Business.
2. Pagamento online (Pix e cartão) com reativação automática do plano e Pix dividido com o barbeiro. O código de reativação e o webhook do Asaas já estão em `src/modules/client-app/payments.ts`; falta a rota do webhook e a conta no provedor.
3. Recursos ligados/desligados respeitados também no app do cliente.
4. IA de verdade para o corte ideal (hoje a análise é simulada).
5. App instalável, com "compartilhar foto do Instagram" direto para o Navalha.
