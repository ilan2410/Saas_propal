import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SpQuestion } from '@/types';

interface RouteParams { params: Promise<{ id: string; qid: string }> }

function collectDescendantQuestionIds(questions: SpQuestion[], rootId: string, templateId: string): Set<string> {
  const idsToDelete = new Set<string>([rootId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const question of questions) {
      if (question.template_id !== templateId || idsToDelete.has(question.id)) continue;
      const dependsOnDeletedQuestion = (question.groupes_conditions ?? []).some((group) =>
        group.conditions.some(
          (condition) => condition.source === 'reponse_question'
            && !!condition.question_id
            && idsToDelete.has(condition.question_id),
        ),
      );
      if (dependsOnDeletedQuestion) {
        idsToDelete.add(question.id);
        changed = true;
      }
    }
  }

  return idsToDelete;
}

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
  const updatedQuestion: SpQuestion = { ...body, id: qid, template_id } as SpQuestion;
  const updated = all.map((q) =>
    q.id === qid && q.template_id === template_id ? updatedQuestion : q
  );
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ question: updatedQuestion });
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
  const idsToDelete = collectDescendantQuestionIds(all, qid, template_id);
  const updated = all.filter((q) => !(q.template_id === template_id && idsToDelete.has(q.id)));
  await supabase.from('organizations').update({ sp_questions: updated }).eq('id', user.id);
  return NextResponse.json({ success: true, deletedIds: Array.from(idsToDelete) });
}
