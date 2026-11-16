import { describe, expect, it } from 'vitest';
import { linkHost, parseLink, safeLink } from './format';

describe('enlaces de regalos', () => {
  it('acepta direcciones http(s) y completa las que vienen sin esquema', () => {
    expect(parseLink('  ')).toBeNull();
    expect(parseLink('https://www.amazon.es/dp/123?ref=x')).toBe('https://www.amazon.es/dp/123?ref=x');
    expect(parseLink('amazon.es/libro')).toBe('https://amazon.es/libro');
    expect(linkHost('https://www.amazon.es/dp/123')).toBe('amazon.es');
  });
  it('rechaza lo que no es una web', () => {
    expect(parseLink('javascript:alert(1)')).toBeUndefined();
    expect(parseLink('ftp://ejemplo.es/a')).toBeUndefined();
    expect(parseLink('auriculares rojos')).toBeUndefined();
    expect(safeLink('javascript:alert(1)')).toBeNull();
  });
});
