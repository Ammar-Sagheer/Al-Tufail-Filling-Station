-- =============================================================================
-- AL TUFAIL FILLING STATION: the forecourt. Run once, after the new-database
-- file (every migration, then start-empty, which leaves no tanks or nozzles).
--
--   Petrol Tank   15,736 L   (the brim of his chart: 2,322 mm x 3,716 mm)
--   Diesel Tank   26,382 L   (the brim of his chart: 2,605 mm x 4,950 mm)
--   Unit 1 = Nozzle 1, Nozzle 2   Petrol (PMG)
--   Unit 2 = Nozzle 3, Nozzle 4   Diesel
--
-- Every meter starts at 0 and each tank at 0 L. Before the first day's
-- readings the owner types, under Settings, each nozzle's real meter reading
-- and each tank's opening stock (from that morning's dip): a meter is read off
-- the machine, never guessed. Names, sizes and labels can all be changed there
-- too until the pump has traded.
--
-- Refuses to run once a tank exists, so it can never add a second forecourt.
-- One transaction: all of it or none of it.
-- =============================================================================
begin;

do $$
declare
  v_petrol uuid;
  v_diesel uuid;
begin
  if exists (select 1 from public.tanks) or exists (select 1 from public.nozzles) then
    raise exception 'STOPPED: this database already has tanks or nozzles. Change the forecourt from Settings instead. Nothing was changed.';
  end if;

  -- As add_tank() does it (076), less its owner check: the SQL editor has no
  -- signed-in owner.
  insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
  values ('Petrol Tank', 'petrol', 15736, 0, public.pump_today())
  returning id into v_petrol;
  insert into public.tanks (name, fuel_type, capacity_litres, opening_stock_litres, opening_stock_date)
  values ('Diesel Tank', 'diesel', 26382, 0, public.pump_today())
  returning id into v_diesel;
  perform public.recalc_tank_stock(v_petrol);
  perform public.recalc_tank_stock(v_diesel);

  -- Before any trading a nozzle is part of the pump from the start
  -- (commissioned_on null), as add_nozzle() leaves it.
  insert into public.nozzles (tank_id, unit_number, nozzle_label, starting_reading, commissioned_on)
  values (v_petrol, 1, '1', 0, null),
         (v_petrol, 1, '2', 0, null),
         (v_diesel, 2, '3', 0, null),
         (v_diesel, 2, '4', 0, null);
end;
$$;

commit;

-- What it looks like now. Expect 2 tanks and 4 nozzles exactly as listed above.
select 'tank' as what, t.name as name, t.fuel_type::text as fuel, t.capacity_litres::text as detail
  from public.tanks t
union all
select 'nozzle', 'Unit ' || n.unit_number || ' · Nozzle ' || n.nozzle_label, t.fuel_type::text,
       'meter starts at ' || n.starting_reading
  from public.nozzles n join public.tanks t on t.id = n.tank_id
 order by 1 desc, 2;
