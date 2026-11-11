-- Deleting an account removes every file whose document record goes with it. The app removes the files first (stored
-- bytes can only be deleted through the Storage API) and used to find them with an ordinary query, which cannot see
-- the personal documents of a trip the person was removed from, nor the shared documents of a trip deleted with the
-- account, so those files stayed behind. Depends on 008, 010 and 018.

-- Files of the document records delete_my_account() deletes: the person's personal documents in every trip, whatever
-- their membership now, and every document of the trips that go with the account (nobody else approved in them).
create function my_account_files() returns setof text
language sql stable security definer set search_path = public
as $$
  select d.storage_path from documents d
  where d.owner_id = auth.uid() and d.scope = 'personal'
  union
  select d.storage_path from documents d
  join trips t on t.id = d.trip_id
  where (t.created_by = auth.uid() or exists (select 1 from members m where m.trip_id = t.id and m.user_id = auth.uid()))
    and not exists (select 1 from members x where x.trip_id = t.id and x.status = 'approved' and x.user_id <> auth.uid())
$$;

-- Does the signed-in person own the personal document stored at this path?
create function owns_personal_document(p_path text) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from documents where storage_path = p_path and owner_id = auth.uid() and scope = 'personal')
$$;

revoke execute on function my_account_files(), owns_personal_document(text) from public, anon;
grant execute on function my_account_files(), owns_personal_document(text) to authenticated;

-- As before, and also your own personal documents in a trip you were removed from: they are yours. Deleting a file
-- needs it to be readable too (Storage deletes by name), so both rules gain the same clause.
drop policy trip_documents_select on storage.objects;
create policy trip_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      exists (select 1 from public.documents d where d.storage_path = name)
      or (owner = auth.uid() and is_approved_member(try_uuid((storage.foldername(name))[1])))
      or owns_personal_document(name)
    )
  );

drop policy trip_documents_delete on storage.objects;
create policy trip_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'trip-documents'
    and (
      (
        (storage.foldername(name))[2] = auth.uid()::text
        and (is_approved_member(try_uuid((storage.foldername(name))[1])) or owns_personal_document(name))
      )
      or is_organizer(try_uuid((storage.foldername(name))[1]))
    )
  );
