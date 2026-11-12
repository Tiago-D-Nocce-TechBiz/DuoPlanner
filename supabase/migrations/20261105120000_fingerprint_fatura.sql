-- =====================================================================
-- DuoFinance — transaction_fingerprint (importação de fatura sem duplicar)
-- =====================================================================
-- Execute no SQL Editor do Supabase DEPOIS de
-- 20261104120100_sincronizacao_casal.sql. Idempotente: pode rodar mais de uma
-- vez sem erro, e rodar de novo a migration anterior não desfaz esta (a
-- imutabilidade fica num gatilho próprio).
--
-- Cada compra importada da fatura grava a impressão digital calculada no
-- navegador (src/lib/finance/fingerprint.ts):
--   "v1:" + SHA-256("v1|data|DESCRIÇÃO ORIGINAL|centavos|MOEDA|parcela|#ocorrência")
-- A tela já marca as compras reimportadas; o índice único é a barreira
-- definitiva (duas abas ou dois aparelhos importando a mesma fatura ao mesmo
-- tempo: a segunda gravação é recusada com 23505 e o app a descarta).
--
-- Unicidade por PESSOA (user_id), não por espaço: o casal que racha a conta
-- do restaurante em dois cartões tem duas compras iguais, uma em cada fatura.
-- Gastos antigos ficam com fingerprint nulo (índice parcial); a tela os
-- compara pela data e pelo valor.
--
-- Deploy: aplique ANTES de publicar o app que grava a coluna. Sem ela, o app
-- detecta a coluna ausente e fica em "modo local" (nada se perde: a fila
-- espera no aparelho até a migration ser aplicada).

alter table public.despesas_viagem add column if not exists transaction_fingerprint text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'despesas_viagem_fingerprint_check') then
    alter table public.despesas_viagem add constraint despesas_viagem_fingerprint_check check (
      transaction_fingerprint is null
      or (transaction_fingerprint ~ '^v1:[0-9a-f]{64}$' and origem = 'importacao' and tipo = 'gasto')
    );
  end if;
end $$;

create unique index if not exists despesas_viagem_fingerprint_uidx
  on public.despesas_viagem (user_id, transaction_fingerprint)
  where transaction_fingerprint is not null;

-- Imutável depois de gravada: identifica a compra como veio na fatura.
-- Corrigir o valor ou a data depois não a muda; senão, reimportar a mesma
-- fatura duplicaria a compra corrigida.
create or replace function public.fingerprint_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.transaction_fingerprint := old.transaction_fingerprint;
  return new;
end $$;

drop trigger if exists trg_despesas_viagem_fingerprint on public.despesas_viagem;
create trigger trg_despesas_viagem_fingerprint
  before update on public.despesas_viagem
  for each row execute function public.fingerprint_imutavel();
