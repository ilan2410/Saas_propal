'use client';

import { updateExpectedJsonStructureFromFields } from '@/lib/utils/prompt';

type Props = {
  promptTemplate: string;
  fields: string[];
  onUpdate: (nextPrompt: string) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
  prune?: boolean;
  postProcess?: (nextPrompt: string) => string;
};

export function UpdateExpectedJsonStructureButton({
  promptTemplate,
  fields,
  onUpdate,
  className,
  disabled,
  label = 'Mettre à jour la structure JSON attendue depuis les champs sélectionnés',
  prune = false,
  postProcess,
}: Props) {
  const isDisabled = disabled || !promptTemplate;

  return (
    <button
      type="button"
      onClick={() => {
        let nextPrompt = updateExpectedJsonStructureFromFields(promptTemplate, fields || [], { prune });
        if (postProcess) {
          nextPrompt = postProcess(nextPrompt);
        }
        onUpdate(nextPrompt);
      }}
      disabled={isDisabled}
      className={
        className ||
        'inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
      }
    >
      {label}
    </button>
  );
}
