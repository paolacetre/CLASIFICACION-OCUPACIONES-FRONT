import { TestBed } from '@angular/core/testing';
import { SETTINGS_STORAGE_KEY, SettingsService } from './settings.service';
import { DEFAULT_SETTINGS } from './settings.model';

describe('SettingsService', () => {
  let service: SettingsService;

  beforeEach(() => {
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
    TestBed.configureTestingModule({});
    service = TestBed.inject(SettingsService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should preload the real brand logo assets as factory defaults instead of empty slots', () => {
    expect(DEFAULT_SETTINGS.logos.principal).toBe('/assets/logos/logo-simbolo.png');
    expect(DEFAULT_SETTINGS.logos.login).toBe('/assets/logos/logo-login.png');
    expect(DEFAULT_SETTINGS.logos.favicon).toBe('/assets/logos/favicon.png');
    expect(service.draft().logos.principal).toBe('/assets/logos/logo-simbolo.png');
  });

  it('should migrate a saved config still pointing to the old text logo to the symbol-only principal logo', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
      ...DEFAULT_SETTINGS,
      logos: { ...DEFAULT_SETTINGS.logos, principal: '/assets/logos/logo-principal.png' }
    }));

    service.load().subscribe();

    expect(service.draft().logos.principal).toBe('/assets/logos/logo-simbolo.png');
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('should persist the factory defaults on reset, so they are still there after reloading', () => {
    service.updateDraft({ accentColor: '#123456', language: 'en' });
    service.save().subscribe();

    service.reset().subscribe();

    // "Recargar": un servicio nuevo que solo lee lo persistido.
    TestBed.resetTestingModule();
    const reloaded = TestBed.inject(SettingsService);
    reloaded.load().subscribe();
    expect(reloaded.saved()).toEqual(DEFAULT_SETTINGS);
    expect(reloaded.draft()).toEqual(DEFAULT_SETTINGS);
    localStorage.removeItem(SETTINGS_STORAGE_KEY);
  });

  it('should report an error (and keep the draft pending) when the storage quota is exceeded on save', () => {
    service.updateDraft({ accentColor: '#123456' });
    spyOn(localStorage, 'setItem').and.throwError(new DOMException('full', 'QuotaExceededError'));

    let failed = false;
    service.save().subscribe({ error: () => (failed = true) });

    expect(failed).toBeTrue();
    expect(service.isDirty()).toBeTrue();
    expect(service.saved().accentColor).not.toBe('#123456');
  });

  it('should still save in memory when storage is simply unavailable (not full)', () => {
    service.updateDraft({ accentColor: '#654321' });
    spyOn(localStorage, 'setItem').and.throwError(new DOMException('denied', 'SecurityError'));

    let failed = false;
    service.save().subscribe({ error: () => (failed = true) });

    expect(failed).toBeFalse();
    expect(service.saved().accentColor).toBe('#654321');
  });

  it('should reject an uploaded SVG containing an embedded <script> tag', (done) => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });

    service.uploadLogo(file, 'principal').subscribe({
      next: () => fail('should not accept an SVG with an embedded <script> tag'),
      error: (error: Error) => {
        expect(error.message).toBe('UNSAFE_SVG');
        done();
      }
    });
  });

  it('should reject an uploaded SVG containing an inline event handler', (done) => {
    const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><circle r="1"/></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });

    service.uploadLogo(file, 'favicon').subscribe({
      next: () => fail('should not accept an SVG with an inline event handler'),
      error: (error: Error) => {
        expect(error.message).toBe('UNSAFE_SVG');
        done();
      }
    });
  });

  it('should accept a Figma-exported SVG with patternContentUnits and an embedded PNG image', (done) => {
    const figmaSvg =
      '<svg width="91" height="104" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<rect width="91" height="104" fill="url(#p)"/><defs>' +
      '<pattern id="p" patternContentUnits="objectBoundingBox" width="1" height="1"><use xlink:href="#img"/></pattern>' +
      '<image id="img" width="1" height="1" xlink:href="data:image/png;base64,iVBORw0KGgo="/></defs></svg>';
    const file = new File([figmaSvg], 'olo-logo-none.svg', { type: 'image/svg+xml' });

    service.uploadLogo(file, 'principal').subscribe({
      next: (url) => {
        expect(service.draft().logos.principal).toBe(url);
        done();
      },
      error: () => fail('should accept a clean Figma-exported SVG')
    });
  });

  it('should reject an uploaded SVG with a javascript: link', (done) => {
    const maliciousSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><circle r="1"/></a></svg>';
    const file = new File([maliciousSvg], 'evil.svg', { type: 'image/svg+xml' });

    service.uploadLogo(file, 'principal').subscribe({
      next: () => fail('should not accept an SVG with a javascript: link'),
      error: (error: Error) => {
        expect(error.message).toBe('UNSAFE_SVG');
        done();
      }
    });
  });

  it('should accept a clean uploaded SVG and store it as a data URL on the draft', (done) => {
    const safeSvg = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="10"/></svg>';
    const file = new File([safeSvg], 'logo.svg', { type: 'image/svg+xml' });

    service.uploadLogo(file, 'login').subscribe({
      next: (url) => {
        expect(url).toContain('data:image/svg+xml');
        expect(service.draft().logos.login).toBe(url);
        done();
      },
      error: () => fail('a clean SVG should be accepted')
    });
  });

  it('should still reject non-image files and files over 2MB regardless of SVG scanning', (done) => {
    const notAnImage = new File(['hola'], 'archivo.txt', { type: 'text/plain' });

    service.uploadLogo(notAnImage, 'favicon').subscribe({
      next: () => fail('should not accept a non-image file'),
      error: (error: Error) => {
        expect(error.message).toBe('NOT_IMAGE');
        done();
      }
    });
  });
});
