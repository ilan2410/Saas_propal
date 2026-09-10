// Parser docxtemplater optionnel : met en MAJUSCULES la valeur de chaque variable
// texte ({{ma_variable}}) au moment du rendu.
//
// Ne modifie PAS :
//   - le texte fixe du modèle (le parser n'est appelé que sur les balises) ;
//   - les sections / boucles {{#x}} {{^x}} (valeur non-string : tableau, booléen) ;
//   - les balises image `{{%x}}` (passe 1 sans module image : tag préfixé par `%`)
//     ni les valeurs qui sont des balises ré-émises `{{...}}` (plomberie interne
//     de word-image.ts pour les images) ;
//   - les adresses email présentes dans la valeur : elles gardent leur casse
//     d'origine, seul le texte autour est mis en MAJUSCULES.
//
// Réplique le parser par défaut de docxtemplater (`scope[tag]`, `.` -> scope) afin
// de ne rien changer d'autre au comportement (chaînage des scopes, clés absentes
// laissées au `nullGetter`, etc.).

const REEMITTED_TAG_RE = /^\{\{.*\}\}$/;

// Exclusion automatique des adresses email : elles ne sont jamais mises en
// MAJUSCULES (une casse forcée peut casser des adresses sensibles à la casse et
// nuit à la lisibilité). On isole chaque email dans la valeur et on ne met en
// majuscules que le texte autour.
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

function uppercaseExceptEmails(value: string, locale: string): string {
  let result = '';
  let lastIndex = 0;
  EMAIL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EMAIL_RE.exec(value)) !== null) {
    result += value.slice(lastIndex, match.index).toLocaleUpperCase(locale);
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += value.slice(lastIndex).toLocaleUpperCase(locale);
  return result;
}

export function makeUppercaseParser(locale = 'fr-FR') {
  return function parser(tag: string) {
    const isImagePlumbing = tag.startsWith('%');
    return {
      get(scope: unknown): unknown {
        let value: unknown;
        if (tag === '.') {
          value = scope;
        } else if (scope !== null && typeof scope === 'object') {
          value = (scope as Record<string, unknown>)[tag];
        }

        if (typeof value !== 'string' || isImagePlumbing) return value;
        if (REEMITTED_TAG_RE.test(value.trim())) return value;
        return uppercaseExceptEmails(value, locale);
      },
    };
  };
}
