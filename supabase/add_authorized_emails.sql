CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS moddatetime;

CREATE TABLE IF NOT EXISTS public.authorized_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
  added_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.authorized_emails IS '儀表板授權 email 白名單';

DROP TRIGGER IF EXISTS handle_authorized_emails_updated_at ON public.authorized_emails;
CREATE TRIGGER handle_authorized_emails_updated_at
  BEFORE UPDATE ON public.authorized_emails
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.authorized_emails;
CREATE POLICY "Service role full access"
  ON public.authorized_emails FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  assigned_role text := 'student';
BEGIN
  SELECT ae.role INTO assigned_role
  FROM public.authorized_emails ae
  WHERE lower(ae.email) = lower(new.email)
  LIMIT 1;

  IF assigned_role IS NULL THEN
    assigned_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
    assigned_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email     = excluded.email,
    full_name = excluded.full_name,
    role      = CASE
                  WHEN excluded.role != 'student' THEN excluded.role
                  ELSE public.profiles.role
                END;
  RETURN new;
END;
$$;

INSERT INTO public.authorized_emails (email, role)
VALUES ('threeleekids777@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;

UPDATE public.profiles p
SET role = ae.role
FROM public.authorized_emails ae
WHERE lower(p.email) = lower(ae.email) AND p.role = 'student';
