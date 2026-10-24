import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { SETTINGS_STORAGE_KEY, SettingsService } from './settings.service';
import { ToastService } from '../shared/toast/toast.service';

describe('SettingsComponent', () => {
  let fixture: ComponentFixture<SettingsComponent>;
  let component: SettingsComponent;
  let settingsService: SettingsService;
  let toastService: ToastService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    settingsService = TestBed.inject(SettingsService);
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
  });

  afterEach(() => localStorage.removeItem(SETTINGS_STORAGE_KEY));

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not save or reset without confirmation, and should require the same confirm/cancel flow as delete/status change in Usuarios', () => {
    settingsService.updateDraft({ accentColor: '#ff00aa' });
    fixture.detectChanges();

    expect(component.isDirty()).toBeTrue();

    component.requestSave();
    fixture.detectChanges();
    expect(component.pendingSave()).toBeTrue();
    expect(settingsService.saved().accentColor).not.toBe('#ff00aa');

    component.cancelSave();
    expect(component.pendingSave()).toBeFalse();
    expect(settingsService.saved().accentColor).not.toBe('#ff00aa');

    component.requestSave();
    component.confirmSave();
    expect(component.pendingSave()).toBeFalse();
    expect(settingsService.saved().accentColor).toBe('#ff00aa');
    expect(component.isDirty()).toBeFalse();
  });

  it('should ask for confirmation before restoring defaults', () => {
    settingsService.updateDraft({ accentColor: '#00ffaa' });
    fixture.detectChanges();

    component.requestReset();
    expect(component.pendingReset()).toBeTrue();
    expect(settingsService.draft().accentColor).toBe('#00ffaa');

    component.confirmReset();
    expect(component.pendingReset()).toBeFalse();
    expect(settingsService.draft().accentColor).not.toBe('#00ffaa');
  });

  it('"Restablecer" should always be enabled (even with no pending changes) and immediately save the factory defaults', () => {
    // Simula una configuración ya guardada y distinta de los valores de fábrica.
    settingsService.updateDraft({ accentColor: '#123456' });
    settingsService.save().subscribe();
    fixture.detectChanges();

    expect(component.isDirty()).toBeFalse();

    const resetButton = fixture.nativeElement.querySelector('.secondary-btn') as HTMLButtonElement;
    expect(resetButton.disabled).toBeFalse();

    resetButton.click();
    fixture.detectChanges();
    expect(component.pendingReset()).toBeTrue();

    component.confirmReset();
    fixture.detectChanges();

    // Vuelve a fábrica y queda guardado de inmediato, sin pulsar "Guardar cambios".
    expect(settingsService.draft().accentColor).toBe('#7DB728');
    expect(settingsService.saved().accentColor).toBe('#7DB728');
    expect(component.isDirty()).toBeFalse();
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!).accentColor).toBe('#7DB728');

    const saveButton = fixture.nativeElement.querySelector('.save-primary-btn') as HTMLButtonElement;
    expect(saveButton.disabled).toBeTrue();
  });

  it('should discard unsaved changes on reset, and leave everything untouched if the reset is cancelled', () => {
    settingsService.updateDraft({ accentColor: '#abcdef' });
    settingsService.save().subscribe();
    settingsService.updateDraft({ primaryColor: '#010203' });

    component.requestReset();
    component.cancelReset();
    expect(settingsService.draft().primaryColor).toBe('#010203');
    expect(settingsService.saved().accentColor).toBe('#abcdef');
    expect(component.isDirty()).toBeTrue();

    component.requestReset();
    component.confirmReset();
    expect(settingsService.draft().primaryColor).not.toBe('#010203');
    expect(settingsService.saved().accentColor).toBe('#7DB728');
    expect(component.isDirty()).toBeFalse();
  });

  it('should let the user make and save new changes normally after a reset', () => {
    component.requestReset();
    component.confirmReset();

    settingsService.updateDraft({ accentColor: '#112233' });
    expect(component.isDirty()).toBeTrue();
    component.requestSave();
    component.confirmSave();

    expect(settingsService.saved().accentColor).toBe('#112233');
    expect(component.isDirty()).toBeFalse();
  });

  it('should notify through ToastService instead of an @Output when saving and resetting', () => {
    spyOn(toastService, 'success');
    spyOn(toastService, 'error');

    settingsService.updateDraft({ accentColor: '#abcdef' });
    component.requestSave();
    component.confirmSave();
    expect(toastService.success).toHaveBeenCalledWith('Cambios guardados correctamente');

    component.requestReset();
    component.confirmReset();
    expect(toastService.success).toHaveBeenCalledWith('Configuración restablecida correctamente.');

    expect(toastService.error).not.toHaveBeenCalled();
  });

  it('should keep its own texts in the saved language while the new one is only a draft, and translate them once saved', () => {
    const el = fixture.nativeElement as HTMLElement;
    const tabText = () => Array.from(el.querySelectorAll('.settings-tabs button')).map((btn) => btn.textContent?.trim());

    expect(tabText().some((text) => text?.includes('Apariencia'))).toBeTrue();
    expect(el.querySelector('.status-text span:last-child')?.textContent).toContain('Sin cambios pendientes');

    settingsService.updateDraft({ language: 'en' });
    fixture.detectChanges();
    expect(tabText().some((text) => text?.includes('Apariencia'))).toBeTrue();
    expect(el.querySelector('.status-text span:last-child')?.textContent).toContain('Tienes cambios sin guardar');

    settingsService.save().subscribe();
    fixture.detectChanges();
    expect(tabText().some((text) => text?.includes('Appearance'))).toBeTrue();
    expect(el.querySelector('.status-text span:last-child')?.textContent).toContain('No pending changes');
  });
  it('should show the draft only in the preview card: colours, text size, density, theme and contrast', () => {
    const el = fixture.nativeElement as HTMLElement;
    const card = el.querySelector('.preview-sticky-card') as HTMLElement;
    const root = document.documentElement;
    const before = { accent: root.style.getPropertyValue('--accent-color'), scale: root.style.getPropertyValue('--type-scale'), theme: root.getAttribute('data-theme') };

    settingsService.updateDraft({ accentColor: '#ff00aa', primaryColor: '#00aaff', fontSize: 20, density: 'amplia', theme: 'oscuro', highContrast: true });
    fixture.detectChanges();

    // La tarjeta de vista previa toma el borrador…
    expect(card.style.getPropertyValue('--accent-color')).toBe('#ff00aa');
    expect(card.style.getPropertyValue('--primary-color')).toBe('#00aaff');
    expect(card.style.getPropertyValue('--type-scale')).toBe('1.25');
    expect(card.getAttribute('data-density')).toBe('amplia');
    expect(card.classList).toContain('preview-dark');
    // El oscuro de la vista previa pinta su propio fondo aunque el sistema siga en claro.
    expect(getComputedStyle(card.querySelector('.mini-card') as HTMLElement).backgroundColor).toBe('rgb(20, 41, 65)');
    expect(getComputedStyle(card).backgroundImage).toContain('rgb(20, 41, 65)');
    expect(card.classList).toContain('preview-contrast');
    // …y el resto de la interfaz sigue con lo guardado.
    expect(root.style.getPropertyValue('--accent-color')).toBe(before.accent);
    expect(root.style.getPropertyValue('--type-scale')).toBe(before.scale);
    expect(root.getAttribute('data-theme')).toBe(before.theme);

    // Al guardar, pasa a toda la interfaz.
    settingsService.save().subscribe();
    expect(root.style.getPropertyValue('--accent-color')).toBe('#ff00aa');
    expect(root.style.getPropertyValue('--type-scale')).toBe('1.25');
    expect(root.getAttribute('data-theme')).toBe('oscuro');
    expect(root.getAttribute('data-high-contrast')).toBe('true');
    settingsService.reset().subscribe();
  });

  it("should expose the tabs as a tablist and switch tabs with the arrow, Home and End keys", () => {
    const el = fixture.nativeElement as HTMLElement;
    const tablist = el.querySelector("[role=\"tablist\"]") as HTMLElement;
    const tabs = () => Array.from(el.querySelectorAll<HTMLElement>("[role=\"tab\"]"));
    const press = (key: string) => {
      tablist.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      fixture.detectChanges();
    };

    expect(tabs().length).toBe(4);
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs().filter((tab) => tab.tabIndex === 0).length).toBe(1);

    press("ArrowRight");
    expect(component.activeTab()).toBe("logos");
    press("ArrowLeft");
    press("ArrowLeft");
    expect(component.activeTab()).toBe("acerca");
    press("Home");
    expect(component.activeTab()).toBe("apariencia");
    press("End");
    expect(component.activeTab()).toBe("acerca");
    expect(el.querySelector("[role=\"tabpanel\"]")?.getAttribute("aria-labelledby")).toBe("settings-tab-acerca");
  });
});
