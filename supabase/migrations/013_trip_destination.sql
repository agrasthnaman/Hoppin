-- A trip can have a destination ("Goa, India") with the coordinates the app looked up for it once. The day screens use
-- the coordinates to show the weather forecast. All three are optional; a trip without them simply shows no weather.
alter table trips
  add column destination text check (destination is null or length(trim(destination)) > 0),
  add column destination_lat double precision check (destination_lat is null or destination_lat between -90 and 90),
  add column destination_lon double precision check (destination_lon is null or destination_lon between -180 and 180),
  add constraint trips_destination_complete check (
    (destination is null and destination_lat is null and destination_lon is null)
    or (destination is not null and destination_lat is not null and destination_lon is not null)
  );

-- create_trip gains the destination. The old three-argument calls keep working (the new arguments have defaults).
drop function create_trip(text, date, date);
create function create_trip(
  p_name text,
  p_start date default null,
  p_end date default null,
  p_destination text default null,
  p_destination_lat double precision default null,
  p_destination_lon double precision default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into trips (name, start_date, end_date, destination, destination_lat, destination_lon, created_by)
    values (p_name, p_start, p_end, p_destination, p_destination_lat, p_destination_lon, auth.uid())
    returning id into v_trip;
  insert into members (trip_id, user_id, role, status)
    values (v_trip, auth.uid(), 'organizer', 'approved');
  return v_trip;
end
$$;
revoke execute on function create_trip(text, date, date, text, double precision, double precision) from public;
grant execute on function create_trip(text, date, date, text, double precision, double precision) to authenticated;
