import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

// Replaces all questions for a template in a single write
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { questions } = await req.json() as { questions: SpQuestion[] };

  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const existing: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];

  // Keep questions from other templates, replace those of this template
  const otherTemplates = existing.filter((q) => q.template_id !== template_id);

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const newQuestions: SpQuestion[] = questions
    .filter((q): q is SpQuestion => q != null)
    .map((q, i) => ({
      ...q,
      id: UUID_RE.test(q.id ?? '') ? q.id : crypto.randomUUID(),
      template_id,
      ordre: i + 1,
      actif: q.actif ?? true,
    }));

  await supabase
    .from('organizations')
    .update({ sp_questions: [...otherTemplates, ...newQuestions] })
    .eq('id', user.id);

  return NextResponse.json({ questions: newQuestions });
}
