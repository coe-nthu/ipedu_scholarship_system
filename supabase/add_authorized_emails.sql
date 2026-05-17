-- ============================================================
-- 授權 Email 白名單（authorized_emails）
-- ============================================================
-- 在 Supabase Dashboard → SQL Editor 執行。
-- 用途：只有白名單中的 teacher/admin email 可存取 dashboard。

-- 建立表
CREATE TABLE IF NOT EXISTS public.authorized_emails (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL DEFAULT 'teacher'
               CHECK (role IN ('teacher', 'admin')),
  added_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.authorized_emails IS '儀表板授權 email 白名單';

-- 自動更新 updated_at
DROP TRIGGER IF EXISTS handle_authorized_emails_updated_at ON public.authorized_emails;
CREATE TRIGGER handle_authorized_emails_updated_at
  BEFORE UPDATE ON public.authorized_emails
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS
ALTER TABLE public.authorized_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.authorized_emails;
CREATE POLICY "Service role full access"
  ON public.authorized_emails FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- 修改 handle_new_user：新用戶若在白名單中，自動設定 role
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  assigned_role TEXT := 'student';
BEGIN
  SELECT ae.role INTO assigned_role
  FROM public.authorized_emails ae
  WHERE LOWER(ae.email) = LOWER(new.email)
  LIMIT 1;

  IF assigned_role IS NULL THEN
    assigned_role := 'student';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    new.id, new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''),
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

-- ============================================================
-- Seed：加入初始管理員
-- ============================================================

INSERT INTO public.authorized_emails (email, role)
VALUES ('threeleekids777@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;

-- 同步已存在的 profiles（將白名單中的 student 角色提升）
UPDATE public.profiles p
SET role = ae.role
FROM public.authorized_emails ae
WHERE LOWER(p.email) = LOWER(ae.email) AND p.role = 'student';
