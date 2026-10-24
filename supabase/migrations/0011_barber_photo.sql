-- Foto do barbeiro (enviada pelo dono em Equipe). Guardada pequena (256 px, JPEG) direto na linha,
-- para aparecer no painel, na TV e no app do cliente sem precisar de outro serviço.
alter table barbers add column if not exists photo text
  check (photo is null or (photo like 'data:image/%' and length(photo) <= 300000));
