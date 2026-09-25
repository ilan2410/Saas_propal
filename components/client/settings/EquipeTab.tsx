'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { maskPhoneInput, normalizePhoneNumber } from '@/lib/utils/formatting';
import { TeleprosManager } from '@/components/settings/TeleprosManager';
import {
  Users,
  Plus,
  Pencil,
  KeyRound,
  Ban,
  RotateCcw,
  Trash2,
  ShieldCheck,
  Loader2,
  X,
} from 'lucide-react';

export type PermissionKey =
  | 'view_all_propositions'
  | 'manage_catalogue'
  | 'manage_templates'
  | 'view_credits_billing'
  | 'download_proposition'
  | 'download_comparatif_sa_sp';

export const PERMISSION_KEYS: PermissionKey[] = [
  'view_all_propositions',
  'manage_catalogue',
  'manage_templates',
  'view_credits_billing',
  'download_proposition',
  'download_comparatif_sa_sp',
];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_all_propositions: 'Voir toutes les propositions',
  manage_catalogue: 'Gérer le catalogue',
  manage_templates: 'Gérer les templates',
  view_credits_billing: 'Voir crédits & facturation',
  download_proposition: 'Télécharger la proposition',
  download_comparatif_sa_sp: 'Télécharger les comparatifs SA/SP',
};

export type PermissionsRecord = Record<PermissionKey, boolean>;
export type PermissionsOverride = Partial<Record<PermissionKey, boolean>>;

export interface TeamMember {
  id: string;
  organization_id: string;
  user_id: string;
  email: string | null;
  prenom: string | null;
  nom: string | null;
  telephone_fixe: string | null;
  telephone_mobile: string | null;
  actif: boolean;
  permissions_override: PermissionsOverride | null;
  created_at: string;
}

interface EquipeTabProps {
  initialDefaultPermissions: PermissionsRecord;
}

const EMPTY_DEFAULTS: PermissionsRecord = {
  view_all_propositions: false,
  manage_catalogue: false,
  manage_templates: false,
  view_credits_billing: false,
  download_proposition: true,
  download_comparatif_sa_sp: true,
};

function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        id={id}
      />
      <label
        htmlFor={id}
        className={`absolute inset-0 rounded-full transition-colors ${
          disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
        } ${checked ? 'bg-blue-600' : 'bg-gray-200'}`}
      />
      <span
        className={`absolute left-1 h-4 w-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </div>
  );
}

function permissionsSummary(member: TeamMember, defaults: PermissionsRecord): string {
  const override = member.permissions_override ?? {};
  const active = PERMISSION_KEYS.filter((key) => override[key] ?? defaults[key] ?? false);
  if (active.length === 0) return 'Aucune permission';
  if (active.length === PERMISSION_KEYS.length) return 'Toutes les permissions';
  return `${active.length} permission${active.length > 1 ? 's' : ''} active${active.length > 1 ? 's' : ''}`;
}

export function EquipeTab({ initialDefaultPermissions }: EquipeTabProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);

  const [defaults, setDefaults] = useState<PermissionsRecord>(initialDefaultPermissions ?? EMPTY_DEFAULTS);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [permissionsMember, setPermissionsMember] = useState<TeamMember | null>(null);
  const [resetPasswordMember, setResetPasswordMember] = useState<TeamMember | null>(null);
  const [deleteMember, setDeleteMember] = useState<TeamMember | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    setIsLoadingMembers(true);
    try {
      const res = await fetch('/api/settings/team/members');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur de chargement');
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de chargement des membres');
    } finally {
      setIsLoadingMembers(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleSaveDefaults = async () => {
    setIsSavingDefaults(true);
    try {
      const res = await fetch('/api/settings/team/defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(defaults),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur de sauvegarde');
      toast.success('Permissions par défaut mises à jour');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde des permissions par défaut');
    } finally {
      setIsSavingDefaults(false);
    }
  };

  const handleToggleActive = async (member: TeamMember) => {
    const nextActif = !member.actif;
    const confirmMessage = nextActif
      ? `Réactiver le compte de ${member.prenom || member.email} ?`
      : `Désactiver le compte de ${member.prenom || member.email} ? La connexion sera immédiatement bloquée.`;
    if (!window.confirm(confirmMessage)) return;

    setTogglingId(member.id);
    try {
      const res = await fetch(`/api/settings/team/members/${member.id}/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actif: nextActif }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur');
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, actif: nextActif } : m)));
      toast.success(nextActif ? 'Compte réactivé' : 'Compte désactivé');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors du changement de statut');
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteMember) return;
    try {
      const res = await fetch(`/api/settings/team/members/${deleteMember.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur');
      setMembers((prev) => prev.filter((m) => m.id !== deleteMember.id));
      toast.success('Commercial supprimé');
      setDeleteMember(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la suppression');
    }
  };

  return (
    <div className="p-6 space-y-8">
      <div className="border-b border-gray-100 pb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-500" />
            Équipe
          </h2>
          <p className="text-sm text-gray-500">
            Gérez les comptes commerciaux de votre organisation et leurs permissions.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="w-4 h-4" />
          Ajouter un commercial
        </Button>
      </div>

      {/* Permissions par défaut */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-900">Permissions par défaut</h3>
          <p className="text-sm text-gray-500">
            Appliquées à tous les commerciaux, sauf override individuel (voir permissions par membre).
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-200">
          {PERMISSION_KEYS.map((key) => (
            <div key={key} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-700">{PERMISSION_LABELS[key]}</span>
              <ToggleSwitch
                id={`default-${key}`}
                checked={defaults[key]}
                onChange={(value) => setDefaults((prev) => ({ ...prev, [key]: value }))}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button onClick={handleSaveDefaults} disabled={isSavingDefaults} size="sm">
            {isSavingDefaults ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Enregistrer les permissions par défaut
          </Button>
        </div>
      </div>

      {/* Tableau des membres */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Membres de l&apos;équipe</h3>

        {isLoadingMembers ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : members.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-gray-200 rounded-lg">
            <p className="text-sm text-gray-500">Aucun commercial pour le moment.</p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Nom</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Email</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Statut</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">Permissions</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3 text-gray-900">
                      {(member.prenom || member.nom) ? `${member.prenom ?? ''} ${member.nom ?? ''}`.trim() : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{member.email ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          member.actif ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {member.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{permissionsSummary(member, defaults)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          title="Modifier les informations"
                          onClick={() => setEditMember(member)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Permissions"
                          onClick={() => setPermissionsMember(member)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title="Réinitialiser le mot de passe"
                          onClick={() => setResetPasswordMember(member)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-md"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          title={member.actif ? 'Désactiver' : 'Réactiver'}
                          onClick={() => handleToggleActive(member)}
                          disabled={togglingId === member.id}
                          className="p-1.5 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-md disabled:opacity-50"
                        >
                          {togglingId === member.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : member.actif ? (
                            <Ban className="w-4 h-4" />
                          ) : (
                            <RotateCcw className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          title="Supprimer"
                          onClick={() => setDeleteMember(member)}
                          className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <TeleprosManager />

      {showCreateModal && (
        <CreateMemberModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(member) => {
            setMembers((prev) => [...prev, member]);
            setShowCreateModal(false);
          }}
        />
      )}

      {editMember && (
        <EditMemberModal
          member={editMember}
          onClose={() => setEditMember(null)}
          onSaved={(updated) => {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            setEditMember(null);
          }}
        />
      )}

      {permissionsMember && (
        <PermissionsModal
          member={permissionsMember}
          defaults={defaults}
          onClose={() => setPermissionsMember(null)}
          onSaved={(updated) => {
            setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            setPermissionsMember(null);
          }}
        />
      )}

      {resetPasswordMember && (
        <ResetPasswordModal member={resetPasswordMember} onClose={() => setResetPasswordMember(null)} />
      )}

      {deleteMember && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Supprimer ce commercial ?</h3>
            <p className="text-gray-600">
              Le compte de{' '}
              <span className="font-medium">
                {deleteMember.prenom || deleteMember.nom
                  ? `${deleteMember.prenom ?? ''} ${deleteMember.nom ?? ''}`.trim()
                  : deleteMember.email}
              </span>{' '}
              sera supprimé définitivement. Cette action est irréversible.
            </p>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDeleteMember(null)}>
                Annuler
              </Button>
              <Button variant="destructive" onClick={handleDeleteConfirmed}>
                Confirmer la suppression
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Modals ---

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateMemberModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (member: TeamMember) => void;
}) {
  const [form, setForm] = useState({
    email: '',
    password: '',
    prenom: '',
    nom: '',
    telephone_fixe: '',
    telephone_mobile: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!form.email || !form.password) {
      toast.error('Email et mot de passe requis');
      return;
    }
    if (form.password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/settings/team/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur de création');
      toast.success('Commercial créé');
      onCreated(data.member);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de création du commercial');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Ajouter un commercial" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
            <input
              type="text"
              value={form.prenom}
              onChange={(e) => setForm((prev) => ({ ...prev, prenom: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => setForm((prev) => ({ ...prev, nom: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone fixe</label>
            <input
              type="tel"
              value={form.telephone_fixe}
              onChange={(e) => setForm((prev) => ({ ...prev, telephone_fixe: maskPhoneInput(e.target.value) }))}
              onBlur={(e) => setForm((prev) => ({ ...prev, telephone_fixe: normalizePhoneNumber(e.target.value) }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone mobile</label>
            <input
              type="tel"
              value={form.telephone_mobile}
              onChange={(e) => setForm((prev) => ({ ...prev, telephone_mobile: maskPhoneInput(e.target.value) }))}
              onBlur={(e) => setForm((prev) => ({ ...prev, telephone_mobile: normalizePhoneNumber(e.target.value) }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Créer
        </Button>
      </div>
    </ModalShell>
  );
}

function EditMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: (member: TeamMember) => void;
}) {
  const [form, setForm] = useState({
    prenom: member.prenom ?? '',
    nom: member.nom ?? '',
    telephone_fixe: member.telephone_fixe ?? '',
    telephone_mobile: member.telephone_mobile ?? '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/settings/team/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur de sauvegarde');
      toast.success('Informations mises à jour');
      onSaved({ ...member, ...data.member, email: member.email });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Modifier le commercial" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
            <input
              type="text"
              value={form.prenom}
              onChange={(e) => setForm((prev) => ({ ...prev, prenom: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
            <input
              type="text"
              value={form.nom}
              onChange={(e) => setForm((prev) => ({ ...prev, nom: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone fixe</label>
            <input
              type="tel"
              value={form.telephone_fixe}
              onChange={(e) => setForm((prev) => ({ ...prev, telephone_fixe: maskPhoneInput(e.target.value) }))}
              onBlur={(e) => setForm((prev) => ({ ...prev, telephone_fixe: normalizePhoneNumber(e.target.value) }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone mobile</label>
            <input
              type="tel"
              value={form.telephone_mobile}
              onChange={(e) => setForm((prev) => ({ ...prev, telephone_mobile: maskPhoneInput(e.target.value) }))}
              onBlur={(e) => setForm((prev) => ({ ...prev, telephone_mobile: normalizePhoneNumber(e.target.value) }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>
    </ModalShell>
  );
}

// 3 états : hérite du défaut (undefined) / activé (true) / désactivé (false)
type TriState = 'inherit' | 'on' | 'off';

function overrideToTriState(value: boolean | undefined): TriState {
  if (value === true) return 'on';
  if (value === false) return 'off';
  return 'inherit';
}

function triStateToOverride(value: TriState): boolean | undefined {
  if (value === 'on') return true;
  if (value === 'off') return false;
  return undefined;
}

function PermissionsModal({
  member,
  defaults,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  defaults: PermissionsRecord;
  onClose: () => void;
  onSaved: (member: TeamMember) => void;
}) {
  const [values, setValues] = useState<Record<PermissionKey, TriState>>(() => {
    const override = member.permissions_override ?? {};
    return PERMISSION_KEYS.reduce((acc, key) => {
      acc[key] = overrideToTriState(override[key]);
      return acc;
    }, {} as Record<PermissionKey, TriState>);
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const permissions_override: PermissionsOverride = {};
      for (const key of PERMISSION_KEYS) {
        const override = triStateToOverride(values[key]);
        if (override !== undefined) {
          permissions_override[key] = override;
        }
      }
      const res = await fetch(`/api/settings/team/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions_override }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur de sauvegarde');
      toast.success('Permissions mises à jour');
      onSaved({ ...member, ...data.member, email: member.email });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur de sauvegarde des permissions');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Permissions du commercial" onClose={onClose}>
      <div className="space-y-4">
        {PERMISSION_KEYS.map((key) => (
          <div key={key} className="space-y-1.5">
            <p className="text-sm font-medium text-gray-700">{PERMISSION_LABELS[key]}</p>
            <p className="text-xs text-gray-400">
              Défaut de l&apos;organisation : {defaults[key] ? 'activé' : 'désactivé'}
            </p>
            <div className="flex gap-2">
              {(
                [
                  ['inherit', 'Hérite du défaut'],
                  ['on', 'Activé'],
                  ['off', 'Désactivé'],
                ] as [TriState, string][]
              ).map(([state, label]) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setValues((prev) => ({ ...prev, [key]: state }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    values[key] === state
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Enregistrer
        </Button>
      </div>
    </ModalShell>
  );
}

function ResetPasswordModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (password.length < 6) {
      toast.error('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/settings/team/members/${member.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Erreur');
      toast.success('Mot de passe mis à jour');
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erreur lors de la réinitialisation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalShell title="Réinitialiser le mot de passe" onClose={onClose}>
      <p className="text-sm text-gray-500">
        Nouveau mot de passe pour {member.prenom || member.email}.
      </p>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onClose}>
          Annuler
        </Button>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Réinitialiser
        </Button>
      </div>
    </ModalShell>
  );
}
