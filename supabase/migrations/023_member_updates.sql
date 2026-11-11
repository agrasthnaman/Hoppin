-- An organizer may change only a member's edit rights directly. Everything else about a membership (role, status, who
-- and which trip, the email setting) changes through functions that keep the rules: a trip always has an organizer, an
-- organizer cannot be removed, nobody is put in a trip without asking to join, and only the person sets their own email
-- and phone settings. A direct update used to skip all of that. Depends on 001, 006, 007, 010 and 016.
revoke update on members from authenticated;
grant update (can_edit_all) on members to authenticated;
