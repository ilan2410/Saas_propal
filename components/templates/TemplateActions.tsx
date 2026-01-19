'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Edit, 
  Trash2, 
  Play, 
  Download, 
  CheckCircle, 
  Clock, 
  Loader2,
  ChevronDown
} from 'lucide-react';

interface Props {
  templateId: string;
  templateName: string;
  fileUrl: string | null;
  currentStatus: string;
}

export function TemplateActions({ templateId, templateName, fileUrl, currentStatus }: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Êtes-vous sûr de vouloir supprimer le template "${templateName}" ?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Erreur suppression');

      router.push('/templates');
      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la suppression');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdatingStatus(true);
    setShowStatusMenu(false);
    
    try {
      const response = await fetch(`/api/templates/${templateId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: newStatus }),
      });

      if (!response.ok) throw new Error('Erreur mise à jour statut');

      router.refresh();
    } catch (error) {
      console.error('Erreur:', error);
      alert('Erreur lors de la mise à jour du statut');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'actif': return 'Actif';
      case 'teste': return 'Testé';
      default: return 'Brouillon';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'actif':
      case 'teste':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const statuses = ['brouillon', 'teste', 'actif'];

  return (
    <div className="flex gap-3 flex-wrap">
      <Link
        href={`/propositions/new?template=${templateId}`}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
      >
        <Play className="w-4 h-4" />
        Créer une proposition
      </Link>
      
      {fileUrl && (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-4 h-4" />
          Télécharger le template
        </a>
      )}
      
      <Link
        href={`/templates/${templateId}/edit`}
        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Edit className="w-4 h-4" />
        Modifier
      </Link>

      {/* Menu de changement de statut */}
      <div className="relative">
        <button
          onClick={() => setShowStatusMenu(!showStatusMenu)}
          disabled={isUpdatingStatus}
          className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {isUpdatingStatus ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            getStatusIcon(currentStatus)
          )}
          {getStatusLabel(currentStatus)}
          <ChevronDown className="w-4 h-4" />
        </button>
        
        {showStatusMenu && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-40">
            {statuses.map((status) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                className={`w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 first:rounded-t-lg last:rounded-b-lg ${
                  status === currentStatus ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                }`}
              >
                {getStatusIcon(status)}
                {getStatusLabel(status)}
                {status === currentStatus && (
                  <span className="ml-auto text-xs text-blue-600">✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="inline-flex items-center gap-2 px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {isDeleting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Trash2 className="w-4 h-4" />
        )}
        Supprimer
      </button>
    </div>
  );
}
