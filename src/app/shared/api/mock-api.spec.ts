/// <reference types="jasmine" />

/*
 * Contrato del servicio (hoy una API simulada). Cuando se conecte el backend,
 * estas pruebas describen lo que el servicio debe seguir cumpliendo.
 */
import { fakeAsync, tick } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { MOCK_LATENCY_MS, mockResponse } from './mock-api';

describe('mockResponse', () => {
  it('should answer immediately without latency, and turn exceptions into errors', async () => {
    expect(await firstValueFrom(mockResponse(() => 42))).toBe(42);
    await expectAsync(firstValueFrom(mockResponse(() => { throw new Error('X'); }))).toBeRejectedWithError('X');
  });

  it('should answer after the given latency', fakeAsync(() => {
    let value = 0;
    mockResponse(() => 7, MOCK_LATENCY_MS).subscribe((v) => (value = v));
    tick(MOCK_LATENCY_MS - 1);
    expect(value).toBe(0);
    tick(1);
    expect(value).toBe(7);
  }));
});
