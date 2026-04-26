import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const questions = all.filter((q) => q.template_id === template_id);
  return NextResponse.json({ questions });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const existing: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const forTemplate = existing.filter((q) => q.template_id === template_id);
  const newQuestion: SpQuestion = {
    ...body,
    id: crypto.randomUUID(),
    template_id,
    ordre: forTemplate.length + 1,
  };

  const updated = [...existing, newQuestion];
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ question: newQuestion });
}
