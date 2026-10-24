/// <reference types="jasmine" />

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiStatusService } from './api-status.service';

describe('ApiStatusService', () => {
  let service: ApiStatusService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ApiStatusService, useClass: ApiStatusService }, provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(ApiStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function check(respond: (request: ReturnType<HttpTestingController['expectOne']>) => void): boolean | undefined {
    let result: boolean | undefined;
    service.check().subscribe((online) => (result = online));
    respond(http.expectOne({ method: 'GET', url: '/auth/me' }));
    return result;
  }

  it('is online when the API answers', () => {
    expect(check((request) => request.flush({ id: 1 }))).toBeTrue();
  });

  it('is online when the API answers with an error of the client (it is up)', () => {
    expect(check((request) => request.flush(null, { status: 401, statusText: 'Unauthorized' }))).toBeTrue();
  });

  it('is offline without answer or with a server error (the proxy answers 5xx when the backend is down)', () => {
    expect(check((request) => request.error(new ProgressEvent('error'), { status: 0 }))).toBeFalse();
    expect(check((request) => request.flush(null, { status: 504, statusText: 'Gateway Timeout' }))).toBeFalse();
  });
});
