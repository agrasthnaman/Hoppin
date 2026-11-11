-- An item's time zones must be real zone names. Every screen and the digest email format times with them, and an
-- unknown name makes that formatting throw, so one hand-made item could break the Days screen for its whole trip and
-- stop the digest job. The app only ever offers names the browser knows, so nothing changes for it. Depends on 001, 011.

-- True for an IANA zone name the database knows ('Asia/Kolkata', 'UTC'). Abbreviations ('IST'), POSIX rules ('XYZ5')
-- and the posix/ and right/ copies some servers ship are refused even though Postgres may understand them, because
-- browsers do not. Postgres caches zone lookups, so this is cheap on every write (unlike scanning pg_timezone_names).
create function is_time_zone(p text) returns boolean
language plpgsql stable
as $$
begin
  if p is null or (p <> 'UTC' and (p !~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+)+$' or p ~ '^(posix|right)/')) then
    return false;
  end if;
  perform timestamptz '2000-01-01 00:00Z' at time zone p;
  return true;
exception when invalid_parameter_value then
  return false;
end
$$;

update items set tz = 'UTC' where not is_time_zone(tz);
update items set end_tz = null where end_tz is not null and not is_time_zone(end_tz);

alter table items add constraint items_time_zones_known
  check (is_time_zone(tz) and (end_tz is null or is_time_zone(end_tz)));
