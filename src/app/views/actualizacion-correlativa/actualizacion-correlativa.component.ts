import { CommonModule } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Observable, catchError, debounceTime, distinctUntilChanged, of, skip, switchMap, tap } from 'rxjs';
import { DialogDirective } from '../../shared/dialog/dialog.directive';
import { TranslatePipe } from '../../shared/i18n/translate.pipe';
import { TranslationService } from '../../shared/i18n/translation.service';
import { ToastService } from '../../shared/toast/toast.service';
import {
  CNO_LIMIT,
  CUOC_LIMIT,
  CatalogCriteria,
  CatalogPage,
  CorrelativeItem,
  CorrelativeRelation,
  VISIBLE_RELATIONS,
  matchesRelation,
  summarizeCodes
} from './actualizacion-correlativa.model';
import { ActualizacionCorrelativaService, CORRELATIVE_REJECTED, CorrelativeError } from './actualizacion-correlativa.service';
import { CargaCorrelativaComponent } from './carga-correlativa/carga-correlativa.component';
import { CatalogPanel, CatalogPanelComponent } from './catalog-panel/catalog-panel.component';

export * from './actualizacion-correlativa.model';

/**
 * Vista «Actualización > Correlativa» (copia de la pantalla «Correlación» del front original con
 * el estilo del proyecto): dos paneles para elegir UNA ocupación CNO y hasta 10 CUOC, la barra
 * de selección con «Relacionar seleccionados», las relaciones existentes (tarjetas con «Ver
 * detalle» y «Editar») y «Cargar Excel» por tipo (denominación, ocupación o conocimiento).
 */
@Component({
  selector: 'app-actualizacion-correlativa',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, DialogDirective, CatalogPanelComponent, CargaCorrelativaComponent],
  templateUrl: './actualizacion-correlativa.component.html',
  styleUrl: './actualizacion-correlativa.component.css'
})
export class ActualizacionCorrelativaComponent {
  private readonly service = inject(ActualizacionCorrelativaService);
  private readonly translation = inject(TranslationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly cno = new CatalogPanel(CNO_LIMIT);
  readonly cuoc = new CatalogPanel(CUOC_LIMIT);

  /** En pantallas angostas los dos paneles se vuelven pestañas. */
  readonly mobileTab = signal<'cno' | 'cuoc'>('cno');

  readonly relations = signal<CorrelativeRelation[]>([]);
  readonly relationsLoading = signal(true);
  readonly relationsError = signal(false);
  readonly relationSearch = signal('');
  readonly showAll = signal(false);

  readonly uploadOpen = signal(false);
  readonly confirmOpen = signal(false);
  readonly detail = signal<CorrelativeRelation | null>(null);
  readonly saving = signal(false);
  /** Código CNO de la relación que se está reemplazando; null al crear una nueva. */
  readonly editingCno = signal<string | null>(null);

  readonly hasSelection = computed(() => this.cno.selectedCount() > 0 || this.cuoc.selectedCount() > 0);
  /** Sin al menos un código de cada lado no hay relación que crear. */
  readonly canRelate = computed(() => this.cno.selectedCount() > 0 && this.cuoc.selectedCount() > 0);

  readonly searching = computed(() => this.relationSearch().trim().length > 0);
  readonly filteredRelations = computed(() => this.relations().filter((relation) => matchesRelation(relation, this.relationSearch())));
  /** Mientras se busca no aplica el tope de cuatro tarjetas: se ven todas las coincidencias. */
  readonly visibleRelations = computed(() =>
    this.searching() || this.showAll() ? this.filteredRelations() : this.filteredRelations().slice(0, VISIBLE_RELATIONS)
  );
  readonly visibleLimit = VISIBLE_RELATIONS;

  constructor() {
    this.connect(this.cno, (criteria) => this.service.searchCno(criteria));
    this.connect(this.cuoc, (criteria) => this.service.searchCuoc(criteria));
    this.service.cnoAreas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (areas) => this.cno.areas.set(areas), error: () => undefined });
    this.service.cuocAreas().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (areas) => this.cuoc.areas.set(areas), error: () => undefined });
    this.loadRelations();
  }

  /**
   * Deja un panel listo: lo escrito en el buscador pasa a la consulta tras una pausa y vuelve a la
   * página 1, y cada cambio de criterios pide una página nueva cancelando la anterior.
   */
  private connect(panel: CatalogPanel, search: (criteria: CatalogCriteria) => Observable<CatalogPage>): void {
    toObservable(panel.searchText)
      .pipe(skip(1), debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        panel.query.set(value.trim());
        panel.page.set(1);
      });

    toObservable(panel.criteria)
      .pipe(
        tap(() => panel.loading.set(true)),
        switchMap((criteria) => search(criteria).pipe(catchError(() => of(null)))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((page) => (page ? panel.applyResult(page) : panel.failLoad()));
  }

  /** Pide las correlativas guardadas y las agrupa por CNO para "Relaciones existentes". */
  loadRelations(): void {
    this.relationsLoading.set(true);
    this.relationsError.set(false);
    this.service
      .relations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (relations) => {
          this.relations.set(relations);
          this.relationsLoading.set(false);
        },
        error: () => {
          this.relationsLoading.set(false);
          this.relationsError.set(true);
        }
      });
  }

  /* ---------- Selección y relación ---------- */

  /** Pide confirmación para relacionar lo seleccionado. Una CNO que ya tiene correlativa solo se cambia desde "Editar". */
  openConfirm(): void {
    if (!this.canRelate() || this.saving()) {
      return;
    }
    const cno = this.cno.items()[0];
    // Guardar reemplaza las CUOC de esa CNO: reutilizar una CNO ya relacionada sin venir de su
    // «Editar» (también si al editar otra se cambió la CNO por esta) borraría su correlativa sin avisar.
    if (cno.code !== this.editingCno() && this.relations().some((relation) => relation.cno.code === cno.code)) {
      this.toast.warning(this.t('actualizacionCorrelativa.alreadyRelated', { code: cno.code }), 6000);
      return;
    }
    this.confirmOpen.set(true);
  }

  closeConfirm(): void {
    if (!this.saving()) {
      this.confirmOpen.set(false);
    }
  }

  /**
   * Guarda la correlativa: el backend reemplaza todas las filas de esa CNO por las elegidas, así que
   * se reenvía la observación que ya tenía para no borrarla.
   */
  confirmRelation(): void {
    const cno = this.cno.items()[0];
    const cuoc = this.cuoc.items();
    if (!cno || cuoc.length === 0 || this.saving()) {
      return;
    }
    const editing = this.editingCno();
    const observation = this.relations().find((relation) => relation.cno.code === cno.code)?.observation ?? '';
    this.saving.set(true);
    this.service
      .save(cno, cuoc, observation)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.confirmOpen.set(false);
          this.toast.success(this.t(editing ? 'actualizacionCorrelativa.toastUpdated' : 'actualizacionCorrelativa.toastCreated', { code: cno.code }));
          this.cancelSelection();
          this.loadRelations();
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.confirmOpen.set(false);
          this.toast.error(
            error instanceof CorrelativeError && error.message === CORRELATIVE_REJECTED && error.serverMessage
              ? error.serverMessage
              : this.t('actualizacionCorrelativa.saveFailed')
          );
        }
      });
  }

  cancelSelection(): void {
    this.cno.clearSelection();
    this.cuoc.clearSelection();
    this.editingCno.set(null);
  }

  /* ---------- Relaciones existentes ---------- */

  /** "Editar": marca la CNO y sus CUOC en los paneles para cambiarlas. */
  edit(relation: CorrelativeRelation): void {
    this.cno.select([relation.cno]);
    this.cuoc.select(relation.cuoc);
    this.editingCno.set(relation.cno.code);
    this.detail.set(null);
    this.mobileTab.set('cuoc');
  }

  openDetail(relation: CorrelativeRelation): void {
    this.detail.set(relation);
  }

  closeDetail(): void {
    this.detail.set(null);
  }

  clearRelationSearch(): void {
    this.relationSearch.set('');
  }

  /* ---------- Cargar Excel ---------- */

  onUploaded(): void {
    this.loadRelations();
  }

  /* ---------- Presentación ---------- */

  trackRelation(_index: number, relation: CorrelativeRelation): string {
    return relation.cno.code;
  }

  summary(codes: string[]): string {
    return summarizeCodes(codes);
  }

  names(items: CorrelativeItem[]): string {
    return items.map((item) => item.name).join(', ');
  }

  format(value: number): string {
    return value.toLocaleString('es-CO');
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translation.translate(key, params);
  }
}
