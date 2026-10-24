import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';
import { DEFAULT_SETTINGS, cloneSettings } from './settings.model';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);

    // Deja el <head> como lo tendría index.html antes de cualquier prueba.
    document.querySelectorAll('link[rel="icon"]').forEach((el) => el.remove());
    const initialIcon = document.createElement('link');
    initialIcon.rel = 'icon';
    initialIcon.href = 'favicon.ico';
    document.head.appendChild(initialIcon);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should update the real <link rel="icon"> href when applying a config with a custom favicon', () => {
    const config = cloneSettings(DEFAULT_SETTINGS);
    config.logos.favicon = 'data:image/svg+xml;base64,AAAA';

    service.apply(config);

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link?.getAttribute('href')).toBe('data:image/svg+xml;base64,AAAA');
    expect(link?.type).toBe('image/svg+xml');
  });

  it('should apply the brand favicon asset on a default apply() call', () => {
    service.apply(cloneSettings(DEFAULT_SETTINGS));

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link?.getAttribute('href')).toBe('/assets/logos/favicon.png');
    expect(link?.type).toBe('image/png');
  });

  it('should not touch the favicon link when logos.favicon is null', () => {
    const config = cloneSettings(DEFAULT_SETTINGS);
    config.logos.favicon = null;

    service.apply(config);

    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    expect(link?.getAttribute('href')).toBe('favicon.ico');
  });
});
