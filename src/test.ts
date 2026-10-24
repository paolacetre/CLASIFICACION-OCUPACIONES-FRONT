// Punto de entrada de las pruebas (Karma): prepara el entorno de Angular y
// reemplaza en TODAS las pruebas los servicios que llaman al backend por sus
// dobles en memoria (ver src/app/testing/fake-api.ts).
import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { FAKE_API_PROVIDERS } from './app/testing/fake-api';

getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());

beforeEach(() => TestBed.configureTestingModule({ providers: FAKE_API_PROVIDERS }));
