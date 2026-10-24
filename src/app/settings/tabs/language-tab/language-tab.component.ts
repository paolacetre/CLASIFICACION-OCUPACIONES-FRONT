import { CommonModule } from '@angular/common';
import { Component, effect, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { SettingsService } from '../../settings.service';
import { LANGUAGE_OPTIONS, LanguageCode } from '../../settings.model';
import { TranslatePipe } from '../../../shared/i18n/translate.pipe';

/** Pestaña "Idioma" de Configuración: español o inglés (en el borrador, hasta guardar). */
@Component({
  selector: 'app-language-tab',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './language-tab.component.html',
  styleUrl: './language-tab.component.scss'
})
export class LanguageTabComponent {
  private readonly settings = inject(SettingsService);
  private readonly fb = inject(FormBuilder);

  readonly languageOptions = LANGUAGE_OPTIONS;
  readonly draft = this.settings.draft;

  readonly form = this.fb.nonNullable.group({
    language: this.settings.draft().language
  });

  constructor() {
    effect(() => this.form.patchValue({ language: this.settings.draft().language }, { emitEvent: false }));
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => this.settings.updateDraft(value));
  }

  selectLanguage(language: LanguageCode): void {
    this.form.controls.language.setValue(language);
  }

  /** Patrón de radiogroup: las flechas cambian la opción seleccionada y mueven el foco. */
  onLanguageKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }

    event.preventDefault();
    const options = this.languageOptions;
    const current = options.findIndex((lang) => lang.id === this.form.controls.language.value);
    const next = options[(current + step + options.length) % options.length];
    this.selectLanguage(next.id);
    setTimeout(() => document.getElementById(`language-option-${next.id}`)?.focus());
  }

  selectedLanguageName(): string {
    return this.languageOptions.find((lang) => lang.id === this.form.controls.language.value)?.name ?? '';
  }
}
