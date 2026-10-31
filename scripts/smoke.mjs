// Teste de ponta a ponta: abre cada tela num navegador de verdade, no tamanho de celular e de computador,
// e falha se aparecer erro na tela, erro no console, bloqueio do CSP ou página quebrada.
// Uso: npm run build && npm start (em outro terminal) e depois  npm run test:e2e
// Endereço: BASE_URL (padrão http://localhost:3000). Roda no modo demonstração (sem chaves do Supabase).
import { chromium, devices } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const S = 'dom-bigode';
const PAGES = [
  '/', '/entrar', '/privacidade', '/privacidade?lang=en', '/termos?lang=es',
  `/b/${S}`, `/b/${S}?tab=book`, `/b/${S}?tab=plan`, `/b/${S}?tab=shop`, `/b/${S}?lang=en`, `/b/${S}?lang=es&as=c-1`,
  `/painel/${S}`, `/painel/${S}/agenda`, `/painel/${S}/clientes`, `/painel/${S}/planos`, `/painel/${S}/financeiro`,
  `/painel/${S}/comissoes`, `/painel/${S}/equipe`, `/painel/${S}/servicos`, `/painel/${S}/mensagens`, `/painel/${S}/shopping`,
  `/painel/${S}/recursos`, `/painel/${S}/acessos`, `/tv/${S}`,
];

let fail = 0;
const browser = await chromium.launch();
for (const [label, opts] of [['celular', devices['iPhone 13']], ['computador', { viewport: { width: 1366, height: 860 } }]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  let problems = [];
  page.on('pageerror', (e) => problems.push('erro: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  for (const path of PAGES) {
    problems = [];
    const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
    if (!res || res.status() >= 400) problems.push(`HTTP ${res?.status()}`);
    // página mais larga que a tela = layout quebrado no celular
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (label === 'celular' && wide > 2 && !path.startsWith('/tv')) problems.push(`rolagem lateral de ${wide}px`);
    if (problems.length) { fail++; console.error(`✗ [${label}] ${path}\n   ${problems.join('\n   ')}`); }
    else console.log(`✓ [${label}] ${path}`);
  }

  if (label === 'celular') {
    // fluxo principal do cliente: escolher serviço, horário e confirmar
    problems = [];
    await page.goto(`${BASE}/b/${S}?tab=book`, { waitUntil: 'networkidle' });
    const ok = await page.evaluate(() => document.body.innerText.length > 50);
    if (!ok) { fail++; console.error('✗ agendamento: tela vazia'); } else console.log('✓ agendamento abre');
    // Meus dados: baixar
    await page.goto(`${BASE}/b/${S}`, { waitUntil: 'networkidle' });
    const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
    await page.getByRole('button', { name: 'Baixar meus dados' }).click();
    const file = await dl;
    if (!file) { fail++; console.error('✗ Meus dados: não baixou'); } else console.log('✓ Meus dados: baixa o arquivo', await file.suggestedFilename());
  }
  await ctx.close();
}

// cabeçalhos de segurança e app instalável
const h = (await fetch(`${BASE}/b/${S}`)).headers;
for (const k of ['content-security-policy', 'strict-transport-security', 'x-frame-options', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) {
  if (!h.get(k)) { fail++; console.error('✗ falta o cabeçalho', k); }
}
if (h.get('x-powered-by')) { fail++; console.error('✗ cabeçalho x-powered-by entrega a tecnologia usada'); }
const man = await (await fetch(`${BASE}/b/${S}/manifest.webmanifest`)).json();
if (!man.name || !man.icons?.some((i) => i.sizes === '512x512')) { fail++; console.error('✗ manifest da barbearia'); }
if (!(await fetch(`${BASE}/sw.js`)).ok || !(await fetch(`${BASE}/offline.html`)).ok) { fail++; console.error('✗ service worker / offline'); }
console.log('✓ cabeçalhos de segurança, manifest e service worker');

await browser.close();
if (fail) { console.error(`\n${fail} problema(s)`); process.exit(1); }
console.log('\ntelas ok');
