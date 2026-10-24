import { TestBed } from '@angular/core/testing';
import { TranslationService } from './translation.service';
import { SettingsService } from '../../settings/settings.service';

describe('TranslationService', () => {
  let service: TranslationService;
  let settingsService: SettingsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TranslationService);
    settingsService = TestBed.inject(SettingsService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should translate to Spanish by default', () => {
    expect(service.translate('nav.usuarios')).toBe('Usuarios');
  });

  it('should follow the SAVED language: a draft change translates nothing until it is saved', () => {
    settingsService.updateDraft({ language: 'en' });
    expect(service.translate('nav.usuarios')).toBe('Usuarios');

    settingsService.save().subscribe();
    expect(service.translate('nav.usuarios')).toBe('Users');
    expect(service.translate('nav.perfil')).toBe('Profile');

    settingsService.updateDraft({ language: 'es' });
    settingsService.save().subscribe();
    expect(service.translate('nav.usuarios')).toBe('Usuarios');
  });

  it('should keep the saved language when a draft is discarded without saving', () => {
    settingsService.updateDraft({ language: 'en' });
    settingsService.discardDraft();
    expect(service.translate('nav.perfil')).toBe('Perfil');
    expect(settingsService.draft().language).toBe('es');
  });

  it('should fall back to the key itself for an unknown translation key', () => {
    expect(service.translate('this.key.does.not.exist')).toBe('this.key.does.not.exist');
  });
});
