'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

type CallbackType = 'email' | 'recovery' | 'invite' | 'magiclink' | 'signup' | 'email_change';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const handleCallback = async () => {
      const code = searchParams.get('code');
      const tokenHash = searchParams.get('token_hash');
      const next = searchParams.get('next');
      const queryType = searchParams.get('type');
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashType = hashParams.get('type');
      const type = (queryType || hashType) as CallbackType | null;
      const safeNext = next?.startsWith('/') ? next : null;

      const redirectAfterAuth = () => {
        if (type === 'recovery') {
          router.replace('/reset-password');
          return;
        }

        if (safeNext) {
          router.replace(safeNext);
          return;
        }

        router.replace('/');
      };

      try {
        // Le callback doit s'executer dans le navigateur pour les liens PKCE envoyes par Supabase.
        if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });

          if (error) {
            throw new Error('invalid_token');
          }

          redirectAfterAuth();
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);

          if (error) {
            throw new Error('invalid_code');
          }

          redirectAfterAuth();
          return;
        }

        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            throw new Error('invalid_session');
          }

          redirectAfterAuth();
          return;
        }

        throw new Error('missing_auth_params');
      } catch (err: unknown) {
        if (!isMounted) return;

        const reason =
          err instanceof Error && err.message ? err.message : 'callback_error';

        setError('Le lien est invalide ou a expire. Merci de recommencer la procedure.');
        router.replace(`/login?error=${encodeURIComponent(reason)}`);
      }
    };

    void handleCallback();

    return () => {
      isMounted = false;
    };
  }, [router, searchParams, supabase]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Loader2 className="w-7 h-7 text-blue-600 animate-spin" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Verification en cours
          </h1>

          <p className="text-gray-600 text-sm">
            Nous finalisons votre connexion securisee.
          </p>

          {error && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
              <Link
                href="/login"
                className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-700"
              >
                Retour a la connexion
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
