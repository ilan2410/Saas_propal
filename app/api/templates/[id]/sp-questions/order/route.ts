import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const { id: template_id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { orderedIds }: { orderedIds: string[] } = await req.json();
  const { data: org } = await supabase
    .from('organizations')
    .select('sp_questions')
    .eq('id', user.id)
    .single();

  const all: SpQuestion[] = (org?.sp_questions ?? []) as SpQuestion[];
  const reordered = all.map((q) => {
    if (q.template_id !== template_id) return q;
    const newOrdre = orderedIds.indexOf(q.id);
    return newOrdre >= 0 ? { ...q, ordre: newOrdre + 1 } : q;
  });

  await supabase.from('organizations').update({ sp_questions: reordered }).eq('id', user.id);
  return NextResponse.json({ success: true });
}
