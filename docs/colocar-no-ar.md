# Colocar o Navalha no ar (grátis)

São duas partes. A **Parte 1** já deixa o app online com a barbearia de demonstração. A **Parte 2** prepara o banco de dados de verdade.

## Parte 1: app online na Vercel (5 minutos)

1. Entre em **vercel.com** e clique em **Sign Up**.
2. Escolha **Hobby** (grátis), digite seu nome e clique em **Continue with GitHub**. Autorize com a sua conta do GitHub.
3. Na tela inicial, clique em **Add New… → Project**.
4. Na lista "Import Git Repository", encontre **navalha** e clique em **Import**.
   - Se ele não aparecer, clique em **Adjust GitHub App Permissions**, libere o repositório `navalha` e volte.
5. Não mude nada (a Vercel reconhece que é Next.js). Clique em **Deploy**.
6. Espere 1 ou 2 minutos até aparecer **Congratulations!** e clique em **Continue to Dashboard**.
7. Em **Domains** aparece o seu link, algo como `navalha-xxxx.vercel.app`.

Pronto, já dá para testar:

- `https://navalha-coral.vercel.app/b/dom-bigode` é o app do cliente. Abra no celular e faça um agendamento.
- `https://navalha-coral.vercel.app/painel/dom-bigode` é o painel do dono.

Observações:

- São dados de demonstração. Os agendamentos de teste somem quando a Vercel reinicia o servidor.
- Toda vez que eu enviar código novo para o GitHub, a Vercel atualiza o site sozinha.
- Para abrir como app no celular, abra o link no Chrome (Android) ou Safari (iPhone) e toque em **Adicionar à tela inicial**.

## Parte 2: banco de dados no Supabase (10 minutos)

1. Entre em **supabase.com**, clique em **Start your project** e entre com o GitHub.
2. Clique em **New project**:
   - **Name:** navalha
   - **Database Password:** clique em **Generate a password** e **guarde essa senha** num lugar seguro.
   - **Region:** **South America (São Paulo)**
   - Clique em **Create new project** e espere uns 2 minutos.
3. No menu da esquerda, abra **SQL Editor**.
4. Crie o banco colando **um arquivo só**:
   - No GitHub, abra o arquivo `supabase/tudo-em-um.sql` e clique em **Copy raw file**. É o ícone de copiar, no canto direito do arquivo.
   - No SQL Editor, clique em **+ New query**, cole e clique em **Run**. Tem que aparecer **Success. No rows returned**.
   - Esse arquivo é só para projeto novo e roda uma vez. Se aparecer o erro "already exists", é porque ele já foi aplicado.
   - **Banco que já está no ar** (atualização de versão): use `supabase/atualizar-banco.sql` do mesmo jeito. Ele traz as novidades sem apagar nada e pode rodar mais de uma vez.
5. Para conferir, abra **Table Editor** no menu da esquerda. As tabelas `shops`, `barbers`, `services` e outras devem aparecer.
6. Em **Project Settings → API**, anote a **Project URL** e a chave **anon public**. Elas serão usadas no próximo passo.

## Parte 3: login pelo celular e banco ligado

O código de entrada é enviado pela **Twilio**, empresa que o Supabase usa para mandar mensagens. O app tenta mandar pelo WhatsApp e, se o WhatsApp ainda não estiver liberado, manda por SMS. Para testar, a conta grátis da Twilio basta: ela vem com crédito e manda SMS para o número que você confirmou no cadastro. O envio pelo WhatsApp para qualquer cliente entra na etapa da conta Meta Business.

1. Crie a conta em **twilio.com** (Sign up). Confirme o e-mail e o seu celular.
2. No painel da Twilio, clique em **Get a phone number** para ganhar um número de teste.
3. Ainda na tela inicial, anote o **Account SID** e o **Auth Token** (clique em "Show" para ver).
4. Vá em **Messaging → Services → Create Messaging Service**:
   - dê o nome `navalha` e avance;
   - em **Add Senders**, adicione o número de teste;
   - termine e anote o **Messaging Service SID** (começa com `MG`).
5. No Supabase, abra **Authentication → Sign In / Providers → Phone**:
   - ative **Enable Phone provider**;
   - em **SMS provider** escolha **Twilio**;
   - cole o **Account SID**, o **Auth Token** e o **Message Service SID**;
   - clique em **Save**.
6. Na Vercel, abra **Project → Settings → Environment Variables** e crie:
   - `NEXT_PUBLIC_SUPABASE_URL` com a Project URL;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` com a chave anon public.
7. Em **Deployments**, clique nos três pontinhos do último e em **Redeploy**.
8. Abra `https://navalha-coral.vercel.app/nova-barbearia`, entre com o seu WhatsApp e cadastre a sua barbearia. Você vira o dono dela e cai direto no painel.

Daqui em diante o painel só abre para a equipe da barbearia, e o cliente confirma o agendamento entrando com o WhatsApp.

## Parte 4: níveis de acesso da equipe

Para o banco que já está no ar, rode a atualização uma vez (não apaga nada):

1. No Supabase, abra **SQL Editor → New query**.
2. Copie todo o conteúdo de `supabase/migrations/0012_team_access.sql` (no GitHub, botão "Copy raw file"), cole e clique em **Run**. Pode rodar de novo sem problema.

Depois, no painel, entre como dono e abra **Acessos**:

- **Dar acesso a alguém**: digite o WhatsApp da pessoa, escolha o nível (Dono, Gerente, Recepção ou Barbeiro) e, se ela corta cabelo, qual barbeiro ela é. Quando a pessoa entrar em `/painel` com esse WhatsApp e o código, já cai no painel com o nível escolhido.
- **O que cada nível vê**: escolha a agenda (de todos, só a sua + horários livres, ou só a sua) e ligue as telas de cada nível. Vale na hora.
- **Testar como**: mostra o painel do jeito que o gerente, a recepção ou cada barbeiro vê, sem precisar de outro celular.

Enquanto o login pelo WhatsApp estiver no plano grátis, dá para testar com números de teste do Supabase: em **Authentication → Sign In / Providers → Phone → Test Phone Numbers and OTPs**, cadastre por exemplo `5562900000001=123456`. Esse número entra com o código `123456` sem mandar mensagem nenhuma. Use o mesmo número (com DDD) ao dar acesso em **Acessos**.

## O que nunca compartilhar

- A senha do banco.
- A chave **service_role** do Supabase. Ela dá acesso total ao banco, então nunca coloque em mensagem, print ou no GitHub.
- A chave **anon public** pode ficar no site, porque as regras de segurança do banco é que protegem os dados.
