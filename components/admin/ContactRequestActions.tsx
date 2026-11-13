'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, RotateCcw, Trash2 } from 'lucide-react';

export function ContactRequestActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = async (init: RequestInit) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contact-requests/${id}`, init);
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError('Action impossible, réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () =>
    call({
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: status === 'traite' ? 'nouveau' : 'traite' }),
    });

  const remove = () => {
    if (!window.confirm('Supprimer définitivement cette demande ?')) return;
    void call({ method: 'DELETE' });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === 'traite' ? (
            <RotateCcw className="h-4 w-4" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {status === 'traite' ? 'Rouvrir' : 'Marquer comme traité'}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={loading}
          aria-label="Supprimer la demande"
          className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
