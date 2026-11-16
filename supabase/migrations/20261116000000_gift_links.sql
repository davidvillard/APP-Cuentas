-- Enlace opcional de un gasto (sobre todo regalos: dónde comprarlo). Solo http(s), para que nadie
-- pueda guardar un «javascript:» que se ejecute al pulsarlo.
alter table public.expenses add column link text
  constraint expenses_link_http check (link is null or (link ~* '^https?://' and length(link) <= 2000));
