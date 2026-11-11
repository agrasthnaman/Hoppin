-- An expense must be one the app can settle exactly. Settle-up works in JavaScript numbers, which are exact only up to
-- 2^53 - 1, and it refuses (for the whole trip) a bill whose amount, or whose amount converted into the trip's currency,
-- is not a whole number in that range. A hand-made save_expense call with a huge amount or rate (numeric even accepts
-- Infinity and NaN) used to break settle-up for every member of the trip. Depends on 005.
--
-- Converting multiplies by the rate and by up to 10^4 (from a currency with no minor digits into one with four), so
-- that is the bound for a bill in another currency. Bills that cannot be settled are removed: the app could not have
-- written them, and nobody else in the trip can delete them.
delete from expenses
where not (amount <= 9007199254740991 and (currency = base_currency or amount * rate * 10000 <= 9007199254740991));

alter table expenses add constraint expenses_amount_settleable
  check (amount <= 9007199254740991 and (currency = base_currency or amount * rate * 10000 <= 9007199254740991));
