export function ensureChampsActifsPlaceholder(prompt: string): string {
  if (!prompt) return 'CHAMPS À EXTRAIRE:\n{liste_champs_actifs}';
  if (prompt.includes('{liste_champs_actifs}')) return prompt;

  const lines = prompt.split(/\r?\n/);
  const indexChamps = lines.findIndex((l) => /^\s*CHAMPS\s*[ÀA]\s*EXTRAIRE\s*:\s*$/i.test(l));

  if (indexChamps >= 0) {
    const alreadyInserted =
      lines[indexChamps + 1] && lines[indexChamps + 1].includes('{liste_champs_actifs}');
    if (alreadyInserted) return prompt;

    const nextLine = lines[indexChamps + 1] ?? '';
    if (!nextLine.trim()) {
      lines.splice(indexChamps + 1, 1, '{liste_champs_actifs}');
    } else {
      lines.splice(indexChamps + 1, 0, '{liste_champs_actifs}');
    }

    return lines.join('\n');
  }

  const indexRegles = lines.findIndex((l) => /^\s*R[ÈE]GLES\s*:\s*$/i.test(l));
  if (indexRegles >= 0) {
    lines.splice(indexRegles, 0, 'CHAMPS À EXTRAIRE:', '{liste_champs_actifs}', '');
    return lines.join('\n');
  }

  return `${prompt.trim()}\n\nCHAMPS À EXTRAIRE:\n{liste_champs_actifs}`;
}

export function renderPromptTemplate(options: {
  prompt_template: string;
  champs_actifs: string[];
  documentsPlaceholder?: string;
  secteur?: string;
}): string {
  const { prompt_template, champs_actifs, documentsPlaceholder = '[Documents fournis ci-dessus]', secteur = 'télécom' } = options;

  const safeTemplate = ensureChampsActifsPlaceholder(prompt_template);
  const champs = (champs_actifs || []).map((f) => `- ${f}`).join('\n');

  return safeTemplate
    .replace('{liste_champs_actifs}', champs)
    .replace('{documents}', documentsPlaceholder)
    .replace('{secteur}', secteur);
}

function getExampleValueForKey(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('email')) return 'email@exemple.com';
  if (k.includes('mobile')) return '06 XX XX XX XX';
  if (k.includes('fixe') || k.includes('telephone') || k.includes('téléphone')) return '01 XX XX XX XX';
  if (k.includes('date')) return 'JJ/MM/AAAA';
  if (k.includes('tarif') || k.includes('prix') || k.includes('montant')) return 'XX.XX';
  if (k.includes('quantite') || k.includes('quantité') || k.includes('qty')) return '1';
  if (k.includes('numero') || k.includes('numéro')) return '0XXXXXXXXX';
  return '...';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function applyFieldPathToStructure(root: unknown, fieldPath: string): void {
  if (!isPlainObject(root)) return;
  if (!fieldPath || typeof fieldPath !== 'string') return;

  const segments = fieldPath.split('.').filter(Boolean);
  if (segments.length === 0) return;

  let cursor: Record<string, unknown> = root;

  for (let i = 0; i < segments.length; i += 1) {
    const rawSeg = segments[i];
    const isArray = rawSeg.endsWith('[]');
    const key = isArray ? rawSeg.slice(0, -2) : rawSeg;
    const isLeaf = i === segments.length - 1;

    if (isLeaf) {
      if (!isArray) {
        if (cursor[key] === undefined) {
          cursor[key] = getExampleValueForKey(key);
        }
      } else {
        if (!Array.isArray(cursor[key])) {
          cursor[key] = [{}];
        }
      }
      return;
    }

    if (isArray) {
      if (!Array.isArray(cursor[key])) {
        cursor[key] = [{}];
      }
      const arr = cursor[key] as unknown[];
      if (arr.length === 0 || !isPlainObject(arr[0])) {
        cursor[key] = [{}];
      }
      cursor = (cursor[key] as unknown[])[0] as Record<string, unknown>;
    } else {
      if (!isPlainObject(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }
  }
}

type AllowedNode = {
  leaf?: boolean;
  isArray?: boolean;
  children?: Record<string, AllowedNode>;
  item?: AllowedNode;
};

function buildAllowedTree(fields: string[]): AllowedNode {
  const root: AllowedNode = { children: {} };

  for (const fieldPath of fields || []) {
    if (!fieldPath || typeof fieldPath !== 'string') continue;

    const segments = fieldPath.split('.').filter(Boolean);
    if (segments.length === 0) continue;

    let cursor = root;

    for (let i = 0; i < segments.length; i += 1) {
      const rawSeg = segments[i];
      const isArray = rawSeg.endsWith('[]');
      const key = isArray ? rawSeg.slice(0, -2) : rawSeg;
      if (!key) continue;

      if (!cursor.children) cursor.children = {};

      if (!cursor.children[key]) {
        cursor.children[key] = isArray ? { isArray: true, item: { children: {} } } : { children: {} };
      }

      const next = cursor.children[key];
      const isLeaf = i === segments.length - 1;

      if (isLeaf) {
        next.leaf = true;
      }

      if (isArray) {
        if (!next.item) next.item = { children: {} };
        cursor = next.item;
      } else {
        cursor = next;
      }
    }
  }

  return root;
}

function pruneStructureByAllowedTree(obj: unknown, allowed: AllowedNode): void {
  if (!isPlainObject(obj)) return;

  const allowedChildren = allowed.children || {};

  for (const key of Object.keys(obj)) {
    const rule = allowedChildren[key];
    if (!rule) {
      delete obj[key];
      continue;
    }

    const value = obj[key];

    if (Array.isArray(value)) {
      const itemRule = rule.isArray ? rule.item : rule.item || rule;

      const arr = value as unknown[];
      if (arr.length > 0 && isPlainObject(arr[0])) {
        pruneStructureByAllowedTree(arr[0], itemRule || { children: {} });
        arr.splice(1);
      }

      const first = arr[0];
      const firstIsEmptyObject =
        isPlainObject(first) && Object.keys(first).length === 0;

      if (!rule.leaf && (!itemRule || arr.length === 0 || firstIsEmptyObject)) {
        delete obj[key];
      }
      continue;
    }

    if (isPlainObject(value)) {
      const nextAllowed = rule.isArray ? rule.item || { children: {} } : rule;
      pruneStructureByAllowedTree(value, nextAllowed);

      if (!rule.leaf && Object.keys(value).length === 0) {
        delete obj[key];
      }
      continue;
    }

    if (!rule.leaf) {
      delete obj[key];
    }
  }
}

export function updateExpectedJsonStructureFromFields(
  prompt: string,
  fields: string[],
  options?: { prune?: boolean }
): string {
  if (!prompt) return prompt;
  if (!fields || fields.length === 0) return prompt;

  const structureIndex = prompt.search(/\bSTRUCTURE\s+JSON\s+ATTENDUE\s*:/i);
  if (structureIndex < 0) return prompt;

  const champsIndex = prompt.search(/^\s*CHAMPS\s*[ÀA]\s*EXTRAIRE\s*:\s*$/im);
  if (champsIndex < 0) return prompt;

  const jsonStart = prompt.indexOf('{', structureIndex);
  if (jsonStart < 0 || jsonStart > champsIndex) return prompt;

  const jsonEnd = prompt.lastIndexOf('}', champsIndex);
  if (jsonEnd < 0 || jsonEnd <= jsonStart) return prompt;

  const jsonText = prompt.slice(jsonStart, jsonEnd + 1);
  let parsed: unknown;

  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return prompt;
  }

  if (!isPlainObject(parsed)) return prompt;

  for (const f of fields) {
    applyFieldPathToStructure(parsed, f);
  }

  if (options?.prune) {
    const allowed = buildAllowedTree(fields);
    pruneStructureByAllowedTree(parsed, allowed);
  }

  const updatedJson = JSON.stringify(parsed, null, 2);
  return `${prompt.slice(0, jsonStart)}${updatedJson}${prompt.slice(jsonEnd + 1)}`;
}
