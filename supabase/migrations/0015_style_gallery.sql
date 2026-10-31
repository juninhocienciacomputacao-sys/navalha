-- Galeria de cortes e barbas: o cliente vê os modelos no app para decidir, e o dono troca as imagens no painel.
-- Toda barbearia já nasce com os modelos iniciais (desenhos em public/galeria). Pode rodar mais de uma vez.

create table if not exists style_looks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  kind text not null check (kind in ('cut', 'beard')),               -- corte ou barba
  name jsonb not null,                                               -- {"pt": "...", "en": "...", "es": "..."}
  description jsonb,
  art text check (art is null or art ~ '^[a-z0-9-]{1,60}$'),         -- desenho padrão: public/galeria/<art>.svg
  photo text check (photo is null or (length(photo) <= 400000 and photo ~ '^data:image/(jpeg|png|webp);base64,')), -- foto enviada pelo dono
  has_photo boolean generated always as (photo is not null) stored, -- a lista lê só isto; a foto vem à parte, com cache
  service_id uuid references services(id) on delete set null,       -- serviço para agendar este modelo
  sort int not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists style_looks_shop on style_looks (shop_id, kind, sort);

-- O app do cliente mostra a galeria até para quem ainda não entrou. Quem mexe é quem pode abrir Serviços.
alter table style_looks enable row level security;
drop policy if exists public_read on style_looks;
create policy public_read on style_looks for select using (true);
drop policy if exists staff_insert on style_looks;
create policy staff_insert on style_looks for insert with check (can_section(shop_id, 'servicos'));
drop policy if exists staff_update on style_looks;
create policy staff_update on style_looks for update using (can_section(shop_id, 'servicos')) with check (can_section(shop_id, 'servicos'));
drop policy if exists staff_delete on style_looks;
create policy staff_delete on style_looks for delete using (can_section(shop_id, 'servicos'));

-- Modelos iniciais. Igual a DEFAULT_LOOKS em src/modules/gallery/defaults.ts (um teste confere).
-- Só coloca os que a barbearia ainda não tem (pelo desenho), então serve também para "restaurar".
create or replace function insert_default_style_looks(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('public.style_looks') is null then return; end if;
  insert into style_looks (shop_id, kind, art, sort, name, description)
  select p_shop, d.kind, d.art, d.sort, d.name, d.description
  from (values
    ('cut', 'corte-low-fade', 0, '{"pt":"Degradê baixo","en":"Low fade","es":"Degradado bajo"}'::jsonb,
     '{"pt":"Laterais esfumadas só perto da orelha. Discreto e fácil de manter.","en":"Sides fade out just above the ear. Subtle and easy to keep.","es":"Laterales difuminados solo cerca de la oreja. Discreto y fácil de mantener."}'::jsonb),
    ('cut', 'corte-mid-fade', 1, '{"pt":"Degradê médio","en":"Mid fade","es":"Degradado medio"}'::jsonb,
     '{"pt":"O degradê sobe até o meio da lateral. O mais pedido.","en":"The fade goes up to the middle of the sides. The most requested.","es":"El degradado sube hasta la mitad del lateral. El más pedido."}'::jsonb),
    ('cut', 'corte-skin-fade', 2, '{"pt":"Navalhado com risca","en":"Skin fade with hard part","es":"Degradado a navaja con raya"}'::jsonb,
     '{"pt":"Laterais zeradas na navalha e risca desenhada. Visual marcante.","en":"Sides taken down to the skin with a razor-drawn part. A bold look.","es":"Laterales a piel con navaja y raya marcada. Look llamativo."}'::jsonb),
    ('cut', 'corte-crew', 3, '{"pt":"Social","en":"Crew cut","es":"Corte clásico"}'::jsonb,
     '{"pt":"Curto e alinhado, do trabalho ao fim de semana.","en":"Short and neat, from the office to the weekend.","es":"Corto y prolijo, de la oficina al fin de semana."}'::jsonb),
    ('cut', 'corte-side-part', 4, '{"pt":"Social com risca","en":"Side part","es":"Raya al costado"}'::jsonb,
     '{"pt":"Risca lateral marcada e topo penteado. Clássico e elegante.","en":"Sharp side part with a combed top. Classic and elegant.","es":"Raya lateral marcada y parte superior peinada. Clásico y elegante."}'::jsonb),
    ('cut', 'corte-textured-crop', 5, '{"pt":"Crop texturizado","en":"Textured crop","es":"Crop texturizado"}'::jsonb,
     '{"pt":"Franja curta com textura e laterais baixas. Moderno e prático.","en":"Short textured fringe with low sides. Modern and low effort.","es":"Flequillo corto con textura y laterales bajos. Moderno y práctico."}'::jsonb),
    ('cut', 'corte-pompadour', 6, '{"pt":"Topete","en":"Pompadour","es":"Tupé"}'::jsonb,
     '{"pt":"Volume no alto da cabeça penteado para trás. Pede pomada.","en":"Volume on top combed back. Needs a little pomade.","es":"Volumen arriba peinado hacia atrás. Pide pomada."}'::jsonb),
    ('cut', 'corte-undercut', 7, '{"pt":"Undercut","en":"Undercut","es":"Undercut"}'::jsonb,
     '{"pt":"Topo comprido e laterais raspadas, com contraste forte.","en":"Long top with shaved sides for strong contrast.","es":"Parte superior larga y laterales rapados, con mucho contraste."}'::jsonb),
    ('cut', 'corte-buzz', 8, '{"pt":"Máquina (buzz cut)","en":"Buzz cut","es":"Rapado (buzz cut)"}'::jsonb,
     '{"pt":"Máquina por igual. Zero trabalho de manhã.","en":"Same clipper length all over. Zero effort in the morning.","es":"Máquina pareja. Cero trabajo por la mañana."}'::jsonb),
    ('cut', 'corte-curly-top', 9, '{"pt":"Cacheado com degradê","en":"Curly top fade","es":"Rizos con degradado"}'::jsonb,
     '{"pt":"Cachos definidos no topo e laterais baixas.","en":"Defined curls on top with low sides.","es":"Rizos definidos arriba y laterales bajos."}'::jsonb),
    ('cut', 'corte-afro', 10, '{"pt":"Black power","en":"Afro","es":"Afro"}'::jsonb,
     '{"pt":"Volume natural e arredondado, com contorno alinhado.","en":"Natural rounded volume with a clean outline.","es":"Volumen natural y redondeado, con contorno prolijo."}'::jsonb),
    ('cut', 'corte-mullet', 11, '{"pt":"Mullet moderno","en":"Modern mullet","es":"Mullet moderno"}'::jsonb,
     '{"pt":"Curto na frente e nas laterais, comprido atrás.","en":"Short at the front and sides, long at the back.","es":"Corto adelante y a los lados, largo atrás."}'::jsonb),
    ('beard', 'barba-stubble', 12, '{"pt":"Barba por fazer","en":"Stubble","es":"Barba de pocos días"}'::jsonb,
     '{"pt":"Barba bem curtinha e uniforme, com contorno limpo.","en":"Very short, even beard with a clean outline.","es":"Barba muy corta y pareja, con contorno limpio."}'::jsonb),
    ('beard', 'barba-short', 13, '{"pt":"Barba curta desenhada","en":"Short boxed beard","es":"Barba corta perfilada"}'::jsonb,
     '{"pt":"Curta, com linhas da bochecha e do pescoço bem marcadas.","en":"Short, with sharp cheek and neck lines.","es":"Corta, con líneas de mejilla y cuello bien marcadas."}'::jsonb),
    ('beard', 'barba-full', 14, '{"pt":"Barba cheia","en":"Full beard","es":"Barba completa"}'::jsonb,
     '{"pt":"Barba média e volumosa, aparada por igual.","en":"Medium, full beard trimmed evenly.","es":"Barba media y tupida, recortada pareja."}'::jsonb),
    ('beard', 'barba-fade-beard', 15, '{"pt":"Barba com degradê","en":"Faded beard","es":"Barba con degradado"}'::jsonb,
     '{"pt":"A barba vai sumindo até o cabelo, sem corte seco.","en":"The beard blends smoothly into the haircut.","es":"La barba se difumina hasta el pelo, sin corte seco."}'::jsonb),
    ('beard', 'barba-long', 16, '{"pt":"Barba lenhador","en":"Long beard","es":"Barba leñador"}'::jsonb,
     '{"pt":"Longa e volumosa. Pede óleo e escova toda semana.","en":"Long and full. Needs oil and brushing every week.","es":"Larga y tupida. Pide aceite y cepillo cada semana."}'::jsonb),
    ('beard', 'barba-goatee', 17, '{"pt":"Cavanhaque","en":"Goatee","es":"Perilla"}'::jsonb,
     '{"pt":"Bigode e queixo ligados, bochechas lisas.","en":"Moustache joined to the chin, clean cheeks.","es":"Bigote unido al mentón, mejillas lisas."}'::jsonb),
    ('beard', 'barba-van-dyke', 18, '{"pt":"Van Dyke","en":"Van Dyke","es":"Van Dyke"}'::jsonb,
     '{"pt":"Bigode separado do queixo em ponta.","en":"Moustache separate from a pointed chin beard.","es":"Bigote separado de la barba en punta del mentón."}'::jsonb),
    ('beard', 'barba-mustache', 19, '{"pt":"Bigode","en":"Moustache","es":"Bigote"}'::jsonb,
     '{"pt":"Bigode marcante com o resto do rosto liso.","en":"A bold moustache with the rest of the face clean.","es":"Bigote marcado con el resto de la cara lisa."}'::jsonb)

  ) as d(kind, art, sort, name, description)
  where not exists (select 1 from style_looks l where l.shop_id = p_shop and l.art = d.art);
end $$;
revoke all on function insert_default_style_looks(uuid) from public;

create or replace function shops_default_looks()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform insert_default_style_looks(new.id);
  return new;
end $$;

drop trigger if exists shops_default_looks on shops;
create trigger shops_default_looks after insert on shops
  for each row execute function shops_default_looks();

-- galeria inicial para as barbearias que já existem (só as que ainda não têm nenhum modelo)
do $$
declare s uuid;
begin
  for s in select id from shops where not exists (select 1 from style_looks l where l.shop_id = shops.id) loop
    perform insert_default_style_looks(s);
  end loop;
end $$;
