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
- O banco recusa dois atendimentos do mesmo barbeiro no mesmo horário, mesmo que dois clientes confirmem ao mesmo tempo.

### Comissões

Tudo é escolhido pelo dono. A parte difícil é o atendimento de plano, e o dono escolhe uma de quatro regras:

- **rateio pelo uso** (recomendado): valor do plano ÷ usos reais do cliente no mês × %.
- **cota**: valor do plano ÷ cota de usos × %.
- **preço de tabela**: preço do serviço avulso × %.
- **valor fixo** por atendimento.

Também dá para configurar: aluguel de cadeira, exceções por serviço, produtos, bônus por venda de plano, taxa de cartão, insumos, metas por degrau e garantia mínima. O código está em `src/core/commission.ts`.

## Próximos passos

1. Login pelo WhatsApp (código) e tela de entrada da equipe.
2. Telas de gestão: clientes, planos, comissões, despesas e mensagens automáticas (criar, editar, excluir).
3. Painel de TV da recepção e fila de encaixe.
4. Lembretes pela API oficial do WhatsApp Business (1 dia e 2 horas antes). Precisa da conta Meta Business.
5. Pagamento online (Pix e cartão) com reativação automática do plano e Pix dividido com o barbeiro.
6. App instalável, com "compartilhar foto do Instagram" direto para o Navalha.
