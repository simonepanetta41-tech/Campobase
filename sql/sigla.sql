-- La sigla del film: "MSG" per Missione San Gennaro.
--
-- La produzione la scrive davanti al nome dei suoi file e nell'oggetto
-- delle mail ("MSG - ODG 26 del 17.11.2026"). Il server la trova nella
-- prima mail in cui c'e', la scrive qui e non la cerca piu'. Sta in testa
-- a ogni notifica, cosi' chi ha due film aperti sa di quale si parla.
-- Finche' non c'e', si usano le iniziali del titolo.
--
-- Si puo' rilanciare. Per cambiarla a mano:
--   update public.projects set sigla = 'MSG' where titolo ilike '%gennaro%';

alter table public.projects add column if not exists sigla text;
