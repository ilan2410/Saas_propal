'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Lock, Trash2, Eye, EyeOff, AlertTriangle } from 'lucide-react';

interface Props {
  clientId: string;
  clientName: string;
}

export function AdminClientActions({ clientId, clientName }: Props) {
  const router = useRouter();

  const [sending, setSending] = useState(false);
  const [settingPwd, setSettingPwd] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSendResetEmail = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/organizations/${clientId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'send_reset_email' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg('success', 'Email de réinitialisation envoyé au client.');
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Erreur lors de l\'envoi');
    } finally {
      setSending(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showMsg('error', 'Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    setSettingPwd(true);
    try {
      const res = await fetch(`/api/admin/organizations/${clientId}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_password', password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setNewPassword('');
      showMsg('success', 'Mot de passe mis à jour avec succès.');
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Erreur lors de la mise à jour');
    } finally {
      setSettingPwd(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/organizations/${clientId}/delete`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push('/admin/clients');
      router.refresh();
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Erreur lors de la suppression');
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <div
          className={`p-4 rounded-lg border text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-red-50 border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Reset par email */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Mail className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Envoyer un lien de réinitialisation</h3>
            <p className="text-sm text-gray-500">
              Le client recevra un email pour choisir un nouveau mot de passe.
            </p>
          </div>
        </div>
        <button
          onClick={handleSendResetEmail}
          disabled={sending}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 text-sm font-medium"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {sending ? 'Envoi...' : 'Envoyer le lien'}
        </button>
      </div>

      {/* Définir un nouveau mot de passe */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-purple-100 rounded-lg">
            <Lock className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Définir un nouveau mot de passe</h3>
            <p className="text-sm text-gray-500">
              Changez directement le mot de passe du client.
            </p>
          </div>
        </div>
        <form onSubmit={handleSetPassword} className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (min. 6 caractères)"
              minLength={6}
              required
              className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button
            type="submit"
            disabled={settingPwd}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 text-sm font-medium whitespace-nowrap"
          >
            {settingPwd ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {settingPwd ? 'Mise à jour...' : 'Enregistrer'}
          </button>
        </form>
      </div>

      {/* Supprimer le client */}
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-red-100 rounded-lg">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="font-semibold text-red-900">Supprimer le client</h3>
            <p className="text-sm text-red-600">
              Action irréversible. Toutes les données seront supprimées (templates, propositions, transactions).
            </p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors text-sm font-medium"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer le client
          </button>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                Confirmez-vous la suppression définitive de <strong>{clientName}</strong> ?
                Cette action ne peut pas être annulée.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 text-sm font-medium"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
