-- A document record can only name a file in its own trip's folder, and a new record only a file in its uploader's
-- folder. The storage rules trust documents.storage_path: a file can be opened when a visible record names it, and
-- deleting a trip or a document removes the files its records name. Before this, anyone could add a record in a trip of
-- their own naming another trip's file, and so open it (or make an organizer delete it). Depends on 001, 008 and 016.

-- The app always writes <trip id>/<uploader id>/<document id>-<file name>. Records it could not have written are
-- removed, and so is every later record naming a file an earlier record already names.
delete from documents where split_part(storage_path, '/', 1) <> trip_id::text;
delete from documents d using documents earlier
  where d.storage_path = earlier.storage_path and (earlier.created_at, earlier.id) < (d.created_at, d.id);

-- Holds for every record, including documents handed to another organizer when an account is deleted (the file stays
-- in the uploader's folder, so only the trip folder is checked here). The unique index also serves the storage rule's
-- lookup by path.
alter table documents add constraint documents_path_in_trip check (split_part(storage_path, '/', 1) = trip_id::text);
create unique index documents_storage_path_idx on documents (storage_path);

drop policy documents_insert on documents;
create policy documents_insert on documents for insert to authenticated
  with check (
    is_approved_member(trip_id) and owner_id = auth.uid()
    and split_part(storage_path, '/', 2) = auth.uid()::text
  );

-- The app never changes a document record (it deletes and adds), so nobody may: the trip, file and owner of a record
-- stay what they were when it was checked on insert. Database functions (account deletion) still can.
drop policy documents_update on documents;
revoke update on documents from authenticated;
