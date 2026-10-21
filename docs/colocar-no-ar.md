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

- `https://SEU-LINK.vercel.app/b/dom-bigode` é o app do cliente. Abra no celular e faça um agendamento.
- `https://SEU-LINK.vercel.app/painel/dom-bigode` é o painel do dono.

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
4. Crie o banco colando os arquivos abaixo, nesta ordem. Para cada um:
   - Abra o arquivo no GitHub.
   - Clique no botão **Copy raw file** (ícone de copiar, no canto direito do arquivo).
   - No SQL Editor, clique em **+ New query**, cole e clique em **Run**. Tem que aparecer **Success**.

   Os arquivos, em ordem: **todos** os da pasta `supabase/migrations`, do `0001` ao último número, e depois `supabase/seed.sql` (opcional: cria a barbearia de exemplo Dom Bigode).
5. Para conferir, abra **Table Editor** no menu da esquerda. As tabelas `shops`, `barbers`, `services` e outras devem aparecer.
6. Em **Project Settings → API**, anote a **Project URL** e a chave **anon public**. Elas serão usadas no próximo passo.

## Parte 3: login pelo WhatsApp e banco ligado

O código de entrada vai pelo WhatsApp por meio da **Twilio**, empresa que o Supabase usa para enviar mensagens. A Twilio é paga por mensagem (centavos) e dá crédito de teste ao criar a conta.

1. Crie a conta em **twilio.com**. Anote o **Account SID** e o **Auth Token** da tela inicial.
2. Na Twilio, ative o WhatsApp em **Messaging → Try it out → Send a WhatsApp message** (para testes) e anote o número remetente.
3. No Supabase, abra **Authentication → Sign In / Providers → Phone**:
   - ative **Enable Phone provider**;
   - em **SMS provider** escolha **Twilio**;
   - cole o Account SID, o Auth Token e o número;
   - clique em **Save**.
4. Na Vercel, abra **Project → Settings → Environment Variables** e crie:
   - `NEXT_PUBLIC_SUPABASE_URL` com a Project URL;
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` com a chave anon public.
5. Em **Deployments**, clique nos três pontinhos do último e em **Redeploy**.
6. Abra `https://SEU-LINK.vercel.app/nova-barbearia`, entre com o seu WhatsApp e cadastre a sua barbearia. Você vira o dono dela e cai direto no painel.

Daqui em diante o painel só abre para a equipe da barbearia, e o cliente confirma o agendamento entrando com o WhatsApp.

## O que nunca compartilhar

- A senha do banco.
- A chave **service_role** do Supabase. Ela dá acesso total ao banco, então nunca coloque em mensagem, print ou no GitHub.
- A chave **anon public** pode ficar no site, porque as regras de segurança do banco é que protegem os dados.
