import { describe, expect, it } from 'vitest';
import { getNestedValue, setNestedValue } from './data-utils';

describe('document mapping boundary', () => {
  it.each(['__proto__.manage_templates', 'constructor.prototype.manage_templates', 'client.__proto__.name'])('rejects unsafe mapping %s before writing', (key) => {
    const record = {};
    expect(() => setNestedValue(record, key, 'demo')).toThrow('Chemin de mapping interdit');
    expect(record).toEqual({});
    expect(Object.prototype).not.toHaveProperty('manage_templates');
  });
  it('does not traverse inherited objects when writing a normal field', () => {
    const inherited = { client: { name: 'original' } };
    const record = Object.create(inherited);
    setNestedValue(record, 'client.name', 'new');
    expect(inherited.client.name).toBe('original');
    expect(getNestedValue(record, 'client.name')).toBe('new');
  });
  it('does not read inherited data', () => {
    expect(getNestedValue(Object.create({ secret: 'inherited' }), 'secret')).toBeUndefined();
  });
});
