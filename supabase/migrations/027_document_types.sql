-- The trip-documents bucket takes only the file types the app accepts (PDF and images). A file stored as a web page
-- (text/html, image/svg+xml) and opened later would run inside the app. The app also opens a cached file only as one
-- of these types. (The column exists on Supabase only.) Depends on 008 and 016.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
    set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    where id = 'trip-documents';
  end if;
end $$;
