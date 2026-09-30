import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import {
  groupOrphansByBucket,
  summarizeOrphans,
  type OrphanFileRow,
} from '@/lib/admin/orphan-files';

/**
 * Fichiers orphelins : inventaire (GET) et suppression (DELETE).
 *
 * La liste est TOUJOURS recalculée côté serveur par `admin_orphan_files()` :
 * aucune clé de fichier envoyée par le navigateur n'est acceptée. Sans cela,
 * un appel forgé pourrait faire supprimer des fichiers encore utilisés.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.app_metadata?.role !== 'admin') return null;
  return user;
}

function readOrganizationId(request: NextRequest): string | null | 'invalide' {
  const raw = request.nextUrl.searchParams.get('organizationId');
  if (!raw) return null;
  return UUID_RE.test(raw) ? raw : 'invalide';
}

async function listOrphans(organizationId: string | null): Promise<OrphanFileRow[]> {
  const service = createServiceClient();
  const { data, error } = await service.rpc('admin_orphan_files', {
    p_organization_id: organizationId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as OrphanFileRow[];
}

/** Inventaire : ce qui serait supprimé, sans rien supprimer. */
export async function GET(request: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const organizationId = readOrganizationId(request);
  if (organizationId === 'invalide') {
    return NextResponse.json({ error: 'Organisation invalide' }, { status: 400 });
  }

  try {
    const files = await listOrphans(organizationId);
    return NextResponse.json({
      ...summarizeOrphans(files),
      // De quoi vérifier à l'œil avant de confirmer, sans déverser 192 lignes.
      apercu: files.slice(0, 10).map((file) => ({ bucket: file.bucket_id, nom: file.name, bytes: file.bytes })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Inventaire impossible', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}

/** Suppression définitive. Exige `?confirm=true`, jamais implicite. */
export async function DELETE(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const organizationId = readOrganizationId(request);
  if (organizationId === 'invalide') {
    return NextResponse.json({ error: 'Organisation invalide' }, { status: 400 });
  }
  if (request.nextUrl.searchParams.get('confirm') !== 'true') {
    return NextResponse.json({ error: 'Confirmation requise' }, { status: 400 });
  }

  try {
    const files = await listOrphans(organizationId);
    if (files.length === 0) {
      return NextResponse.json({ supprimes: 0, bytes: 0, echecs: [] });
    }

    const service = createServiceClient();
    const echecs: { bucket: string; details: string }[] = [];
    let supprimes = 0;

    for (const batch of groupOrphansByBucket(files)) {
      const { error } = await service.storage.from(batch.bucket).remove(batch.keys);
      if (error) {
        // Contrairement aux nettoyages best-effort du reste du projet, un échec
        // est remonté : c'est précisément leur silence qui a laissé ces
        // fichiers s'accumuler.
        console.error(`Suppression orphelins impossible (${batch.bucket}):`, error);
        echecs.push({ bucket: batch.bucket, details: error.message });
        continue;
      }
      supprimes += batch.keys.length;
    }

    const total = summarizeOrphans(files);
    console.log(
      `[orphelins] ${supprimes}/${total.files} fichier(s) supprime(s) par ${user.id}`
      + ` (organisation: ${organizationId ?? 'toutes'})`,
    );

    return NextResponse.json({
      supprimes,
      bytes: supprimes === total.files ? total.bytes : null,
      echecs,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Suppression impossible', details: error instanceof Error ? error.message : 'Erreur inconnue' },
      { status: 500 },
    );
  }
}
