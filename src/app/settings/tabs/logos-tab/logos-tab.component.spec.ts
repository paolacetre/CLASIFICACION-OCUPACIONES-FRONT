import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LogosTabComponent } from './logos-tab.component';
import { SettingsService } from '../../settings.service';

describe('LogosTabComponent', () => {
  let fixture: ComponentFixture<LogosTabComponent>;
  let component: LogosTabComponent;
  let settingsService: SettingsService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LogosTabComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(LogosTabComponent);
    component = fixture.componentInstance;
    settingsService = TestBed.inject(SettingsService);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should show a translated, human-readable error (not the raw service error code) when the upload is rejected', () => {
    // NOT_IMAGE se rechaza de forma síncrona en SettingsService.uploadLogo(),
    // antes de tocar el FileReader, así que no hace falta esperar un tick.
    const notAnImage = new File(['hola'], 'archivo.txt', { type: 'text/plain' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [notAnImage] });

    component.onLogoSelected({ target: input } as unknown as Event, 'favicon');
    expect(component.errorMessage()).toBe('El archivo debe ser una imagen.');

    settingsService.updateDraft({ language: 'en' });
    settingsService.save().subscribe();
    component.onLogoSelected({ target: input } as unknown as Event, 'favicon');
    expect(component.errorMessage()).toBe('The file must be an image.');
  });

  it('should show where each logo appears and the current file name and format', () => {
    const el = fixture.nativeElement as HTMLElement;
    const where = Array.from(el.querySelectorAll('.logo-where')).map((p) => p.textContent?.trim());
    expect(where).toEqual([
      'Dónde aparece: Menú lateral (todas las pantallas)',
      'Dónde aparece: Pantalla de inicio de sesión',
      'Dónde aparece: Pestaña del navegador'
    ]);
    const names = Array.from(el.querySelectorAll('.logo-file-name')).map((n) => n.textContent?.trim());
    expect(names).toEqual(['logo-simbolo.png', 'logo-login.png', 'favicon.png']);
    expect(el.querySelector('.logo-drop .logo-file-meta')?.textContent).toContain('PNG • Formato actual');
    expect(el.querySelector('.favicon-tile .logo-file-meta')?.textContent).toContain('PNG • Actual');
  });

  it('should keep the uploaded file name while it is the current logo, and read the format from the data URL', (done) => {
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>'], 'mi-logo.svg', { type: 'image/svg+xml' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [svg] });
    component.onLogoSelected({ target: input } as unknown as Event, 'principal');

    // FileReader lee el archivo de forma asíncrona y con el equipo cargado puede tardar más de 50 ms:
    // se espera a que el logo quede en el borrador (hasta 2 s) en vez de un tiempo fijo.
    const started = Date.now();
    const whenRead = (check: () => void) => {
      if (component.fileName('principal') === 'mi-logo.svg' || Date.now() - started > 2000) {
        check();
      } else {
        setTimeout(() => whenRead(check), 20);
      }
    };

    whenRead(() => {
      expect(component.fileName('principal')).toBe('mi-logo.svg');
      expect(component.fileFormat('principal')).toBe('SVG');

      // Si el borrador vuelve a otro logo (p. ej. se descarta), el nombre ya no aplica.
      settingsService.updateDraft({ logos: { ...settingsService.draft().logos, principal: 'data:image/png;base64,AAAA' } });
      expect(component.fileName('principal')).toBe('Logo personalizado');
      expect(component.fileFormat('principal')).toBe('PNG');
      done();
    });
  });
});
