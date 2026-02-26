import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_TOUR_IDS = [
  'welcome',
  'template-word',
  'template-excel',
  'proposition',
  'catalogue',
] as const;

type TourId = (typeof VALID_TOUR_IDS)[number];

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const tour = body?.tour as string;

    if (!tour || !VALID_TOUR_IDS.includes(tour as TourId)) {
      return NextResponse.json(
        { error: 'Tour invalide', valid: VALID_TOUR_IDS },
        { status: 400 }
      );
    }

    // Fetch current state
    const { data: org, error: fetchError } = await supabase
      .from('organizations')
      .select('onboarding_completed, onboarding_tours_seen, onboarding_completed_at')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: 'Organisation introuvable' }, { status: 404 });
    }

    const currentTours: string[] = Array.isArray(org?.onboarding_tours_seen)
      ? org.onboarding_tours_seen
      : [];

    const updatedTours = currentTours.includes(tour)
      ? currentTours
      : [...currentTours, tour];

    const isFirstCompletion = !org?.onboarding_completed;

    const { error: updateError } = await supabase
      .from('organizations')
      .update({
        onboarding_tours_seen: updatedTours,
        onboarding_completed: true,
        onboarding_completed_at: isFirstCompletion
          ? new Date().toISOString()
          : org?.onboarding_completed_at,
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[onboarding/complete] Update error:', updateError);
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tour,
      tours_seen: updatedTours,
      first_completion: isFirstCompletion,
    });
  } catch (err) {
    console.error('[onboarding/complete] Unexpected error:', err);
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 });
  }
}
