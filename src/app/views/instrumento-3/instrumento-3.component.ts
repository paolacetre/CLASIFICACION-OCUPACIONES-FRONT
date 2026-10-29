import { CommonModule } from '@angular/common';
import { Component, Injector, OnInit, afterNextRender, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import { ConfirmDialogComponent } from '../../shared/ui/confirm-dialog.component';
import { FilterComboboxComponent } from '../../shared/ui/filter-combobox.component';
import { REFERENCE_LINKS, SECTORS } from './instrumento-3.catalogs';
import { Informant, Instrument3Catalogs, Proposal, ProposalDraft, RequiredField, SelectOption, applyInformant, createEmptyDraft, missingFields } from './instrumento-3.model';
import { INVALID_PROPOSAL, Instrumento3Service, PROPOSAL_LOCKED, SAVED_NOT_SENT, SavedNotSentError } from './instrumento-3.service';

export * from './instrumento-3.model';

/** Listas del formulario con una casilla por ítem. */
export type ItemList = 'functions' | 'denominations' | 'relatedOccupations';

/** Listas de opciones que se marcan. */
export type ChoiceList = 'skills' | 'knowledge';

/** Habilidades y conocimientos que no están en el catálogo: un campo por cada «+ Agregar». */
export type OtherList = 'otherSkills' | 'otherKnowledge';

/**
 * Vista "Instrumento 3" del proyecto (Diligenciamiento): el formulario de
 * propuesta de un perfil ocupacional nuevo, igual al del front original.
 * "Guardar" deja la propuesta como borrador en el servidor (y los siguientes
 * "Guardar" actualizan esa misma) y "Enviar al experto" la deja en manos del
 * experto y limpia el formulario.
 */
@Component({
  selector: 'app-instrumento-3',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, ConfirmDialogComponent, FilterComboboxComponent],
  templateUrl: './instrumento-3.component.html',
  styleUrl: './instrumento-3.component.css'
})
export class Instrumento3Component implements OnInit {
  private readonly instrumento3Service = inject(Instrumento3Service);
  private readonly toastService = inject(ToastService);
  private readonly translationService = inject(TranslationService);
  private readonly injector = inject(Injector);

  readonly sectors = SECTORS;
  readonly referenceLinks = REFERENCE_LINKS;

  /** Área, nivel, habilidades y conocimientos del catálogo CNO del servidor (se piden al abrir la vista). */
  catalogs: Instrument3Catalogs = { areas: [], levels: [], skills: [], knowledge: [] };
  catalogsLoading = true;
  catalogsError = false;

  /** Departamentos y sus municipios: el catálogo es grande y se carga aparte al abrir la vista. */
  departments: SelectOption[] = [];
  private municipalitiesByDepartment: Record<string, SelectOption[]> = {};

  /** Empieza con la fecha de hoy y lo demás vacío; los datos generales se llenan con lo que el servidor recuerde de quien tiene la sesión. */
  draft: ProposalDraft = createEmptyDraft();
  /** Datos generales que el servidor recuerda (`null` si no hay). */
  private informant: Informant | null = null;
  /** Propuesta ya guardada como borrador en esta visita: el siguiente "Guardar" la actualiza. `null` si aún no se guardó. */
  savedId: number | null = null;
  /** Tras intentar enviar se marcan los campos obligatorios que faltan. */
  showErrors = false;
  saving = false;
  /** Confirmación pendiente de "Enviar al experto". */
  confirmSend = false;

  /**
   * Llena los datos generales con el perfil del analista que recuerda el servidor, pide el catálogo de áreas, niveles,
   * habilidades y conocimientos, y carga aparte el de departamentos y municipios.
   */
  ngOnInit(): void {
    this.instrumento3Service.informant().subscribe((informant) => {
      this.informant = informant;
      this.draft = applyInformant(this.draft, informant);
    });
    this.instrumento3Service.catalogs().subscribe({
      next: (catalogs) => {
        this.catalogs = catalogs;
        this.catalogsLoading = false;
      },
      error: () => {
        this.catalogsLoading = false;
        this.catalogsError = true;
      }
    });
    void import('./geografia').then(({ DEPARTAMENTOS, MUNICIPIOS_POR_DEPARTAMENTO }) => {
      this.departments = DEPARTAMENTOS;
      this.municipalitiesByDepartment = MUNICIPIOS_POR_DEPARTAMENTO;
    });
  }

  get municipalities(): SelectOption[] {
    return this.municipalitiesByDepartment[this.draft.department] ?? [];
  }

  /** Al cambiar de departamento, el municipio elegido deja de valer (volver a elegir el mismo lo conserva). */
  chooseDepartment(department: string): void {
    if (department !== this.draft.department) {
      this.draft.department = department;
      this.draft.municipality = '';
    }
  }

  /** Campos obligatorios que faltan para enviar. */
  get missing(): RequiredField[] {
    return missingFields(this.draft);
  }

  hasError(field: RequiredField): boolean {
    return this.showErrors && this.missing.includes(field);
  }

  addItem(list: ItemList): void {
    this.draft[list] = [...this.draft[list], ''];
  }

  /** Siempre queda al menos una casilla. */
  removeItem(list: ItemList, index: number): void {
    if (this.draft[list].length > 1) {
      this.draft[list] = this.draft[list].filter((_, position) => position !== index);
    }
  }

  /** `ngFor` sobre textos: sin esto, cada tecla recrearía la casilla y se perdería el foco. */
  trackByIndex(index: number): number {
    return index;
  }

  choices(list: ChoiceList): string[] {
    return this.catalogs[list];
  }

  /** «+ Agregar»: abre un campo nuevo para una habilidad o un conocimiento que no está en el catálogo y lo deja listo para escribir. */
  addOther(list: OtherList): void {
    this.draft[list] = [...this.draft[list], ''];
    const index = this.draft[list].length - 1;
    // Con eventos agrupados, Angular pinta después de un `setTimeout`: hay que esperar a que el campo exista.
    afterNextRender(() => document.getElementById(`i3-${list}-${index}`)?.focus(), { injector: this.injector });
  }

  removeOther(list: OtherList, index: number): void {
    this.draft[list] = this.draft[list].filter((_, position) => position !== index);
  }

  isChosen(list: ChoiceList, option: string): boolean {
    return this.draft[list].includes(option);
  }

  toggleChoice(list: ChoiceList, option: string): void {
    this.draft[list] = this.isChosen(list, option) ? this.draft[list].filter((item) => item !== option) : [...this.draft[list], option];
  }

  /** "Guardar": queda como borrador, aunque esté incompleto; solo necesita el nombre de la ocupación. */
  save(): void {
    if (this.saving) {
      return;
    }
    if (!this.draft.occupationName.trim()) {
      this.toastService.warning(this.translationService.translate('instrumento3.toastNameRequired'));
      return;
    }
    this.run(this.instrumento3Service.save(this.draft, this.savedId), (saved) => {
      this.savedId = saved.id;
      this.rememberInformant(saved);
      this.toastService.success(this.translationService.translate('instrumento3.toastSaved'));
    });
  }

  /** "Enviar al experto": exige los campos obligatorios y pide confirmación, porque después ya no se puede cambiar. */
  requestSend(): void {
    if (this.saving) {
      return;
    }
    this.showErrors = true;
    if (this.missing.length) {
      this.toastService.warning(this.translationService.translate('instrumento3.toastMissing'));
      return;
    }
    this.confirmSend = true;
  }

  cancelSend(): void {
    if (!this.saving) {
      this.confirmSend = false;
    }
  }

  /** Guarda y envía la propuesta al experto; al terminar limpia el formulario. */
  send(): void {
    if (this.saving) {
      return;
    }
    this.run(
      this.instrumento3Service.saveAndSend(this.draft, this.savedId),
      (sent) => {
        this.confirmSend = false;
        this.toastService.success(this.translationService.translate('instrumento3.toastSent'));
        this.rememberInformant(sent);
        this.reset();
      },
      () => (this.confirmSend = false)
    );
  }

  /** Formulario en blanco para la siguiente propuesta. */
  private reset(): void {
    this.draft = applyInformant(createEmptyDraft(), this.informant);
    this.savedId = null;
    this.showErrors = false;
  }

  /** Los datos generales recién guardados son los que el servidor recordará para la siguiente propuesta. */
  private rememberInformant(saved: Proposal): void {
    const { fullName, email, phone, department, municipality, organization, position, sector } = saved;
    this.informant = { fullName, email, phone, department, municipality, organization, position, sector };
  }

  /** Bloquea los botones mientras el servidor responde y explica el error. */
  private run(request: Observable<Proposal>, onSuccess: (saved: Proposal) => void, onError: () => void = () => undefined): void {
    this.saving = true;
    request.subscribe({
      next: (saved) => {
        this.saving = false;
        onSuccess(saved);
      },
      error: (error: unknown) => {
        this.saving = false;
        onError();
        if (error instanceof SavedNotSentError) {
          // El borrador ya existe: el siguiente intento lo actualiza en vez de crear otro.
          this.savedId = error.proposalId;
        }
        const code = error instanceof Error ? error.message : '';
        const key = code === SAVED_NOT_SENT
            ? 'instrumento3.toastSavedNotSent'
            : code === PROPOSAL_LOCKED
              ? 'instrumento3.toastLocked'
              : code === INVALID_PROPOSAL
                ? 'instrumento3.toastInvalid'
                : 'instrumento3.toastSaveError';
        this.toastService.error(this.translationService.translate(key));
      }
    });
  }
}
