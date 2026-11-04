-- A flight (or any item) can end in a different time zone from where it starts. `end_tz` is the zone the end time is
-- local to; null means the same zone as `tz`, so every existing row keeps showing exactly what it showed before.
alter table items add column end_tz text;
