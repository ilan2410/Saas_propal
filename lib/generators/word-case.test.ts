import { describe, expect, it } from 'vitest';
import { makeUppercaseParser } from './word-case';

// Le parser optionnel `makeUppercaseParser` reproduit le parser par défaut de
// docxtemplater (`scope[tag]`, `.` -> scope) mais met en MAJUSCULES toute valeur
// de type string. Il ne doit rien changer d'autre : boucles (valeur = tableau),
// conditions (valeur = booléen), balises image `%xxx` / balises ré-émises `{{...}}`
// et clés absentes (laissées au `nullGetter`) passent inchangées.

describe('makeUppercaseParser', () => {
  const parser = makeUppercaseParser();

  it('met une valeur string en majuscules', () => {
    expect(parser('nom').get({ nom: 'dupont' })).toBe('DUPONT');
  });

  it('gère les accents français (é -> É)', () => {
    expect(parser('v').get({ v: 'société éléphant' })).toBe('SOCIÉTÉ ÉLÉPHANT');
  });

  it('laisse les tableaux intacts (boucles {{#x}})', () => {
    const arr = [{ a: 1 }];
    expect(parser('items').get({ items: arr })).toBe(arr);
  });

  it('laisse les booléens intacts (conditions {{^x}})', () => {
    expect(parser('ok').get({ ok: false })).toBe(false);
  });

  it('ne touche pas les balises image %xxx (plomberie interne passe 1)', () => {
    expect(parser('%photo_image_url').get({ '%photo_image_url': '{{%__wimg_0}}' })).toBe(
      '{{%__wimg_0}}',
    );
  });

  it('ne touche pas une valeur qui est une balise ré-émise {{...}}', () => {
    expect(parser('x').get({ x: '{{%__wimg_3}}' })).toBe('{{%__wimg_3}}');
  });

  it('renvoie undefined pour une clé absente (laisse agir le nullGetter)', () => {
    expect(parser('missing').get({})).toBeUndefined();
  });

  it('{{.}} renvoie le scope courant, en majuscules si string', () => {
    expect(parser('.').get('dupont')).toBe('DUPONT');
  });

  it('{{.}} renvoie le scope courant tel quel si ce n\'est pas une string', () => {
    const scope = { a: 1 };
    expect(parser('.').get(scope)).toBe(scope);
  });
});
