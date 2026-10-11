-- =============================================================================
-- 900: money a customer pays in is part of the day's cash to collect.
--
-- AL TUFAIL ONLY, which is why the number is in the 900s and not the master's
-- next one (a number must never mean two things in two copies).
--
-- His daily sheet (1 Oct 2026) adds "Receiving" - what credit customers paid
-- over the counter - into the day's total sale, then takes off the credit slips
-- and the expenses to reach TOTAL CASH:
--
--   petrol + diesel + oil + RECEIVING = total sale
--   less credit, less expenses        = total cash   (what the staff hand in)
--
-- The Dashboard's "To collect from the staff" (082, 083) had everything but the
-- receiving, so it read short by exactly what customers had paid in. This adds
-- it, and says so as its own figure.
--
-- A PAYMENT HAS TO BE RECOGNISED, and nothing on a ledger row said so: a credit
-- entry is a payment, a reversal of a deleted slip, or an owner's adjustment, and
-- only the note tells them apart. So a new nullable flag, is_payment, is set by
-- "Record a payment" and "Money received" (the two ways a customer's payment is
-- entered) and by nothing else. Nullable (051: a column on a backed-up table
-- is), null on every row before this, so payments recorded earlier are not
-- counted: they were taken in on days that are over.
--
-- READ-ONLY apart from the new column. No row changes.
-- =============================================================================

alter table public.ledger_entries
  add column if not exists is_payment boolean;

comment on column public.ledger_entries.is_payment is
  'True on a customer payment entered through Record a payment or Money received (900). Null on everything else, including payments before 900.';

create or replace function public.get_day_collection(p_date date default public.pump_today())
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_sales      numeric;
  v_credit     numeric;
  v_cash       numeric;
  v_exp        numeric;
  v_handed     numeric;
  v_oil_sales  numeric;
  v_oil_credit numeric;
  v_oil_cash   numeric;
  v_received   numeric;
  v_n          integer;
  v_total      numeric;
  v_total_cr   numeric;
begin
  if not public.is_super_admin() then
    raise exception 'Only the owner may see what is to be collected' using errcode = '42501';
  end if;

  select coalesce(sum(nr.sale_amount), 0), coalesce(sum(nr.credit_amount), 0),
         coalesce(sum(nr.cash_amount), 0), count(*)
    into v_sales, v_credit, v_cash, v_n
    from public.nozzle_readings nr
   where nr.reading_date = p_date;

  select coalesce(sum(ls.amount), 0), coalesce(sum(ls.credit_amount), 0), coalesce(sum(ls.cash_amount), 0)
    into v_oil_sales, v_oil_credit, v_oil_cash
    from public.lubricant_sales ls
   where ls.sale_date = p_date;

  select coalesce(sum(e.amount), 0) into v_exp
    from public.expenses e
   where e.expense_date = p_date;

  select coalesce(sum(t.amount), 0) into v_handed
    from public.treasury_entries t
   where t.entry_date = p_date
     and t.direction = 'in'
     and t.category in ('shift_closing', 'entry');

  select coalesce(sum(le.amount), 0) into v_received
    from public.ledger_entries le
   where le.entry_date = p_date
     and le.entry_type = 'credit'
     and le.is_payment is true;

  v_total    := v_sales + v_oil_sales;
  v_total_cr := v_credit + v_oil_credit;

  return jsonb_build_object(
    'date', p_date,
    'readings', v_n,
    'fuel_sales', v_sales,
    'fuel_credit', v_credit,
    'fuel_cash', v_cash,
    'oil_sales', v_oil_sales,
    'oil_credit', v_oil_credit,
    'oil_cash_sales', v_oil_cash,
    'total_sales', v_total,
    'total_credit', v_total_cr,
    'received', v_received,
    'expenses', v_exp,
    'to_collect', v_total + v_received - v_total_cr - v_exp,
    'handed_in', v_handed,
    'still_to_collect', v_total + v_received - v_total_cr - v_exp - v_handed
  );
end;
$$;

revoke all on function public.get_day_collection(date) from public, anon;
grant execute on function public.get_day_collection(date) to authenticated;
