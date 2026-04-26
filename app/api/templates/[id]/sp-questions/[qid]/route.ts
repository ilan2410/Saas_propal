import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string; qid: string }> }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id: template_id, qid } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const updated = all.map((q) =>
    q.id === qid && q.template_id === template_id
      ? { ...q, ...body, id: qid, template_id }
      : q
  );
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id: template_id, qid } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const updated = all.filter((q) => !(q.id === qid && q.template_id === template_id));
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ success: true });
}
