import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './shared/auth/auth.interceptor';

/** Configuración de arranque de la aplicación: detección de cambios y HttpClient con el interceptor de autenticación. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Las peticiones al backend (/api, /auth salvo el ingreso, /usuario) llevan el token de la sesión; un 401 la cierra.
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
