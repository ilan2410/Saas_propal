ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS note_title_template TEXT NOT NULL DEFAULT '';

ALTER TABLE public.organizations
DROP CONSTRAINT IF EXISTS organizations_note_title_template_length_check;

ALTER TABLE public.organizations
ADD CONSTRAINT organizations_note_title_template_length_check
CHECK (CHAR_LENGTH(note_title_template) <= 255);
