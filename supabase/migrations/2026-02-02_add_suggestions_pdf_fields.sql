
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pdf_header_logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pdf_footer_text TEXT;

ALTER TABLE propositions ADD COLUMN IF NOT EXISTS suggestions_generees JSONB;
