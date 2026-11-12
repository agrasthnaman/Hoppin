-- Change emails are off unless a member turns them on (Updates page, "Email me updates"). Emails are limited, and
-- people are not asked before they start receiving them. Phone updates and the in-app Updates list are unchanged.
-- The switch is also turned off for everyone who is already in a trip, so no one is emailed until they opt in.
-- Depends on 006.
alter table members alter column email_digest set default false;
update members set email_digest = false where email_digest;
