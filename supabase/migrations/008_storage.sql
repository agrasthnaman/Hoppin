-- Storage rules for trip documents. Depends on 001_core.sql (documents, is_approved_member).
--
-- Files live in the private bucket `trip-documents` at
--   <trip id>/<uploader id>/<document id>-<file name>
-- so the rules can be read straight from the path:
--   * you can add or delete files only in your own folder, and only in a trip you are an approved member of;
--   * you can open a file only if the matching `documents` row is visible to you (the documents rules
--     already hide personal documents from other members), or you uploaded it and are still a member.

insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

-- Malformed paths give NULL instead of an error.
create function try_uuid(p text) returns uuid
language plpgsql immutable
as $$
begin
  return p::uuid;
exception when others then
  return null;
end
$$;

create policy trip_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and is_approved_member(try_uuid((storage.foldername(name))[1]))
  );

-- The `owner` clause lets an uploader clean up a file whose document record was never saved.
create policy trip_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      exists (select 1 from public.documents d where d.storage_path = name)
      or (owner = auth.uid() and is_approved_member(try_uuid((storage.foldername(name))[1])))
    )
  );

create policy trip_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (storage.foldername(name))[2] = auth.uid()::text
    and is_approved_member(try_uuid((storage.foldername(name))[1]))
  );
