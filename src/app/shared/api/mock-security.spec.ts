/// <reference types="jasmine" />

import { hashPassword, sha256Hex, verifyPassword } from './mock-security';
import { MockCredentialsStore } from './mock-credentials';

describe('Seguridad simulada (hash y JWT)', () => {
  it('should compute standard SHA-256', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should store a salted hash, never the password, and verify it', () => {
    const stored = hashPassword('Clave*Segura1');
    expect(stored).not.toContain('Clave*Segura1');
    expect(stored).toMatch(/^sha256\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(hashPassword('Clave*Segura1')).not.toBe(stored); // sal distinta cada vez
    expect(verifyPassword('Clave*Segura1', stored)).toBeTrue();
    expect(verifyPassword('clave*segura1', stored)).toBeFalse();
  });

  it('should verify the demo users against their stored hashes', () => {
    const store = new MockCredentialsStore();
    expect(store.verify(1, 'Admin*Password2026')).toBeTrue();
    expect(store.verify(2, 'Analista*Password2026')).toBeTrue();
    expect(store.verify(2, 'Admin*Password2026')).toBeFalse();
    store.remove(2);
    expect(store.verify(2, 'Analista*Password2026')).toBeFalse();
  });

});
