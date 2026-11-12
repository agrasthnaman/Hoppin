-- An item's times must be dates every screen can show. Postgres accepts years up to 294276, but JavaScript dates stop
-- at 275760 and anything past year 9999 no longer formats as a plain ISO date, so one hand-made item could break the
-- day screens and the digest for its trip (like an unknown time zone, see 019). Depends on 001.
delete from items
where starts_at not between timestamptz '0001-01-01 00:00Z' and timestamptz '9999-12-31 23:59:59Z'
   or ends_at not between timestamptz '0001-01-01 00:00Z' and timestamptz '9999-12-31 23:59:59Z';

alter table items add constraint items_times_in_range check (
  starts_at between timestamptz '0001-01-01 00:00Z' and timestamptz '9999-12-31 23:59:59Z'
  and (ends_at is null or ends_at between timestamptz '0001-01-01 00:00Z' and timestamptz '9999-12-31 23:59:59Z')
);
