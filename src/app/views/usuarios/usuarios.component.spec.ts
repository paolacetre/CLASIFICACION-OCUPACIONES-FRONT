/// <reference types="jasmine" />

import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SettingsService } from '../../settings/settings.service';
import { MOCK_LATENCY_MS } from '../../shared/api/mock-api';
import { MockCredentialsStore } from '../../shared/api/mock-credentials';
import { clearTestSession, startTestSession } from '../../shared/auth/session.testing';
import { ToastService } from '../../shared/toast/toast.service';
import { comboChoices, comboPick } from '../../shared/ui/filter-combobox.testing';
import { UsuariosComponent } from './usuarios.component';
import { UserDraft, permissionsOf } from './usuarios.model';
import { UsuariosService } from './usuarios.service';
import { createTestUsers } from './usuarios.testing';

describe('UsuariosComponent', () => {
  let fixture: ComponentFixture<UsuariosComponent>;
  let comp: UsuariosComponent;
  let el: HTMLElement;
  let toastService: ToastService;

  /** Crea la vista con los usuarios de prueba; la sesión es la del administrador (id 1) salvo que se indique otra. */
  function create(session?: Parameters<typeof startTestSession>[0]): void {
    startTestSession(session);
    fixture = TestBed.createComponent(UsuariosComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('users', createTestUsers());
    toastService = TestBed.inject(ToastService);
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  }

  const newUser: UserDraft = { name: 'Usuario Prueba', email: 'prueba@sena.edu.co', document: '1234567890', phone: '3001234567', role: 'Experto' };
  const texts = (selector: string) => Array.from(el.querySelectorAll(selector)).map((item) => item.textContent?.trim());
  /** Bloque de la tabla de un rol, por su título. */
  const section = (title: string) => Array.from(el.querySelectorAll('.role-section')).find((item) => item.querySelector('.role-title')?.textContent?.trim() === title) as HTMLElement;

  function save(draft: UserDraft): void {
    comp.formUser = { ...draft };
    comp.saveUser();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [UsuariosComponent] }).compileComponents();
  });

  afterEach(() => {
    clearTestSession();
  });

  it('should group the users by role, with the counters of each group', () => {
    create();
    comp.users.push({ ...createTestUsers()[1], id: 3, name: 'Otra Analista', email: 'otra@sena.edu.co', username: 'otra', status: 'Inactivo', date: '' });
    fixture.detectChanges();

    // Solo los roles que tienen usuarios, en el orden de los roles.
    expect(texts('.role-title')).toEqual(['Administradores', 'Analistas']);
    expect(texts('.table-head')[0]).toBe('USUARIOREGISTROPERMISOSACCIONES');
    expect(Array.from(section('Analistas').querySelectorAll('.role-stats > *')).map((item) => item.textContent)).toEqual(['2 usuarios', '1 activo', '1 inactivo']);

    const admin = section('Administradores').querySelector('.user-row')!;
    expect(admin.querySelector('.user-name strong')?.textContent).toBe('SENA Admin');
    expect(admin.querySelector('.user-name small')?.textContent).toBe('admin@sena.edu.co');
    expect(admin.querySelector('.cell-registered')?.textContent).toBe('24/08/2026');
    expect(admin.querySelector('.cell-permissions')?.textContent).toBe('11 / 11');

    const rows = section('Analistas').querySelectorAll('.user-row');
    expect(rows[0].querySelector('.cell-permissions')?.textContent).toBe('6 / 11');
    expect(rows[1].querySelector('.cell-registered')?.textContent).toBe('—');
    expect(rows[1].classList.contains('is-inactive')).toBeTrue();
    // Ver, editar, rol y permisos, y el interruptor de estado.
    expect(rows[0].querySelectorAll('.row-actions button').length).toBe(3);
    expect(rows[0].querySelector('.status-switch')?.getAttribute('aria-checked')).toBe('true');
    expect(rows[1].querySelector('.status-switch')?.getAttribute('aria-checked')).toBe('false');
  });

  it('should offer the six roles of the backend in the filter and in the new user form', () => {
    create();
    // El filtro de rol es el desplegable común, con cuántos usuarios tiene cada rol.
    expect(comboChoices(fixture, 'filter-role')).toEqual([
      'Todos los roles',
      'Administrador (1)',
      'Analista (1)',
      'Experto (0)',
      'Ciudadano (0)',
      'APE (0)',
      'Tendencias ocupacionales (0)'
    ]);
    comboPick(fixture, 'filter-role', 'Analista');
    expect(comp.selectedRole).toBe('Analista');
    comboPick(fixture, 'filter-role', '');
    expect(comp.selectedRole).toBe('Todos');

    comp.startCreate();
    fixture.detectChanges();
    expect(comboChoices(fixture, 'form-role')).toEqual(['Administrador', 'Analista', 'Experto', 'Ciudadano', 'APE', 'Tendencias ocupacionales']);
    // Un usuario nuevo empieza con el rol de menos permisos.
    expect(comp.formUser.role).toBe('Ciudadano');
  });

  it('should filter by role, status and search term at the same time', () => {
    create();
    comp.searchTerm = 'analista';
    comp.setRole('Analista');
    fixture.detectChanges();
    expect(comp.filteredUsers.map((user) => user.name)).toEqual(['Analista TDO']);
    expect(texts('.role-title')).toEqual(['Analistas']);
    expect(comp.filtersCount).toBe(2);

    comp.setStatus('Inactivo');
    fixture.detectChanges();
    expect(el.querySelector('.role-section')).toBeNull();
    expect(el.querySelector('.empty-state strong')?.textContent).toBe('No hay usuarios que coincidan con los filtros.');

    spyOn(toastService, 'success');
    comp.clearFilters();
    expect(comp.filteredUsers.length).toBe(2);
    expect(toastService.success).toHaveBeenCalledWith('Filtros reiniciados.');
  });

  /** Elige un archivo en "Importar Excel". */
  function chooseFile(file: File): void {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    comp.onImportFile({ target: input } as unknown as Event);
  }

  it('should show how many users are registered and filter by origin', () => {
    create();
    comp.users.push({ ...createTestUsers()[1], id: 3, name: 'Importada Excel', email: 'importada@sena.edu.co', username: 'importada', origin: 'Excel', role: 'Ciudadano' });
    fixture.detectChanges();
    expect(el.querySelector('.users-count-pill')?.textContent?.trim()).toBe('3 registrados');
    // Indicadores: el número y lo que cuenta.
    expect(texts('.users-kpi-label')).toEqual(['Usuarios', 'Activos', 'Inactivos', 'Importados de Excel']);
    expect(texts('.users-kpi-count')).toEqual(['3', '3', '0', '1']);
    expect(comboChoices(fixture, 'filter-origin')).toEqual(['Todos los orígenes', 'Creados manualmente (2)', 'Importados de Excel (1)']);

    comboPick(fixture, 'filter-origin', 'Excel');
    expect(comp.filteredUsers.map((user) => user.name)).toEqual(['Importada Excel']);
    expect(texts('.role-title')).toEqual(['Ciudadanos']);
    expect(comp.filtersCount).toBe(1);
    expect(el.querySelector('.users-kpi-excel')?.classList).toContain('active');
    comp.clearFilters();
    expect(comp.selectedOrigin).toBe('Todos');

    // Un clic en un indicador filtra por lo que cuenta; «Usuarios» quita los filtros.
    (el.querySelector('.users-kpi-excel') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(comp.filteredUsers.map((user) => user.name)).toEqual(['Importada Excel']);
    (el.querySelector('.users-kpi-total') as HTMLButtonElement).click();
    expect(comp.hasActiveFilters).toBeFalse();
  });

  it('should import users from an Excel, show what happened and reload the list', fakeAsync(() => {
    create();
    const changed = spyOn(comp.usersChange, 'emit');
    chooseFile(new File(['x'], 'usuarios.xlsx'));
    expect(comp.isImporting).toBeTrue();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();
    tick();

    expect(comp.isImporting).toBeFalse();
    expect(el.querySelector('#import-dialog-description')?.textContent).toBe('Se importaron 1 de 2 usuarios del archivo.');
    expect(texts('.import-errors li')).toEqual(['Fila 2 · admin@sena.edu.co — El usuario, correo o cédula ya está registrado']);
    expect(el.querySelector('.modal-form-body')?.textContent).toContain('1 cuenta(s) quedaron con la cédula como contraseña temporal');
    expect(comp.users.map((user) => user.email)).toContain('importada@sena.edu.co');
    expect(comp.users.find((user) => user.email === 'importada@sena.edu.co')?.origin).toBe('Excel');
    expect(changed).toHaveBeenCalledWith(comp.users);

    // Un archivo sin usuarios (o que no es un Excel) lo responde el servidor como "0 de 0".
    comp.importResult = { total: 0, imported: 0, temporaryPasswords: 0, errors: [], warnings: [] };
    fixture.detectChanges();
    expect(el.querySelector('#import-dialog-description')?.textContent).toContain('no encontró usuarios en el archivo');

    comp.closeImportResult();
    fixture.detectChanges();
    expect(el.querySelector('#import-dialog-title')).toBeNull();
  }));

  it('should refuse a file that is not an Excel or is too large without calling the server', () => {
    create();
    const importCall = spyOn(TestBed.inject(UsuariosService), 'importExcel');
    spyOn(toastService, 'error');
    chooseFile(new File(['x'], 'usuarios.pdf'));
    expect(toastService.error).toHaveBeenCalledWith('Elige un archivo de Excel (.xlsx o .xls).');
    chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'usuarios.xlsx'));
    expect(toastService.error).toHaveBeenCalledWith('El archivo supera el límite de 5MB.');
    expect(importCall).not.toHaveBeenCalled();
  });

  it('should create a user with full name, email, ID number, phone and role; the ID number is the initial password', fakeAsync(() => {
    create();
    const changed = spyOn(comp.usersChange, 'emit');
    spyOn(toastService, 'success');
    comp.startCreate();
    fixture.detectChanges();
    expect(el.querySelector('#form-password')).toBeNull();
    expect(el.querySelector('#form-document')).toBeTruthy();
    expect((el.querySelector('#form-username') as HTMLInputElement).readOnly).toBeTrue();
    expect(el.querySelector('.form-note')?.textContent).toContain('la inicial es la cédula');
    save({ ...newUser, name: ' Usuario Prueba ', email: ' Prueba@SENA.edu.co ', document: '1.234.567.890' });

    const created = comp.users.find((user) => user.email === 'prueba@sena.edu.co')!;
    expect(created).toEqual(jasmine.objectContaining({ name: 'Usuario Prueba', username: 'prueba@sena.edu.co', document: '1234567890', phone: '3001234567', role: 'Experto', status: 'Activo', mustChangePassword: true, initials: 'UP' }));
    // La contraseña no vuelve en el usuario: la inicial es la cédula y solo queda su hash en el "servidor".
    expect('password' in created).toBeFalse();
    expect(TestBed.inject(MockCredentialsStore).verify(created.id, '1234567890')).toBeTrue();
    expect(changed).toHaveBeenCalledWith(comp.users);
    expect(toastService.success).toHaveBeenCalledWith('Usuario "Usuario Prueba" creado correctamente.');
    expect(comp.showForm).toBeFalse();
    expect(texts('.role-title')).toEqual(['Administradores', 'Analistas', 'Expertos']);

    // Con un correo que no es del SENA, el usuario de ingreso es la cédula.
    comp.startCreate();
    comp.formUser = { ...newUser, email: 'otra@correo.com', document: '7654321' };
    fixture.detectChanges();
    expect((el.querySelector('#form-username') as HTMLInputElement).value).toBe('7654321');
    save({ ...newUser, email: 'otra@correo.com', document: '7654321' });
    expect(comp.users.find((user) => user.email === 'otra@correo.com')?.username).toBe('7654321');
  }));

  it('should explain what is missing or wrong before calling the server', fakeAsync(() => {
    create();
    const createCall = spyOn(TestBed.inject(UsuariosService), 'create').and.callThrough();
    comp.startCreate();

    for (const missing of [{ name: '  ' }, { document: '' }, { phone: '' }]) {
      save({ ...newUser, ...missing });
      expect(comp.formError).toBe('Completa el nombre y apellido, el correo, la cédula y el teléfono para continuar.');
    }
    save({ ...newUser, email: 'sin-arroba' });
    expect(comp.formError).toBe('Escribe un correo válido.');
    save({ ...newUser, document: '12ab' });
    expect(comp.formError).toBe('La cédula debe tener entre 5 y 12 dígitos.');
    save({ ...newUser, phone: '123' });
    expect(comp.formError).toBe('El teléfono debe tener entre 7 y 15 dígitos.');
    save({ ...newUser, email: 'ADMIN@sena.edu.co' });
    expect(comp.formError).toBe('Ya existe un usuario registrado con ese correo.');
    save({ ...newUser, document: '1.000.000.001' });
    expect(comp.formError).toBe('Ya existe un usuario registrado con esa cédula.');

    expect(createCall).not.toHaveBeenCalled();
    expect(comp.users.length).toBe(2);
  }));

  it('should edit the data and the ID number, without the password nor the role', fakeAsync(() => {
    create();
    const update = spyOn(TestBed.inject(UsuariosService), 'update').and.callThrough();
    const analyst = comp.users[1];
    comp.startEdit(analyst);
    fixture.detectChanges();
    expect(el.querySelector('#form-password')).toBeNull();
    expect(el.querySelector('#form-role')).toBeNull();
    expect(el.querySelector('.form-note')?.textContent).toContain('cada persona la cambia desde su perfil');
    expect(comp.formUser).toEqual({ name: 'Analista TDO', email: 'analista@sena.edu.co', document: '', phone: '', role: 'Analista' });

    // Un correo que no es del SENA necesita la cédula: es el usuario de ingreso.
    save({ ...comp.formUser, email: 'analista@correo.com' });
    expect(comp.formError).toBe('Sin correo SENA la cédula es obligatoria: se usa como usuario de ingreso.');

    save({ ...comp.formUser, name: 'Analista Ocupacional', email: 'analista@sena.edu.co', document: '98765432', phone: '3009998877' });
    expect(update).toHaveBeenCalledWith(2, { name: 'Analista Ocupacional', email: 'analista@sena.edu.co', document: '98765432', phone: '3009998877', role: 'Analista' });
    // Se actualiza el mismo objeto de la lista (el shell comparte esas referencias).
    expect(analyst).toEqual(jasmine.objectContaining({ name: 'Analista Ocupacional', document: '98765432', phone: '3009998877', role: 'Analista', initials: 'AO', origin: 'Manual' }));
    // La contraseña sigue siendo la misma.
    expect(TestBed.inject(MockCredentialsStore).verify(2, 'Analista*Password2026')).toBeTrue();
  }));

  it('should show the server refusal inside the form and keep it open', fakeAsync(() => {
    create();
    comp.startCreate();
    // Otro administrador registró ese correo mientras tanto: la lista de esta pantalla no lo tiene.
    comp.users = comp.users.filter((user) => user.id !== 2);
    save({ ...newUser, email: 'analista@sena.edu.co' });
    expect(comp.formError).toBe('Ya existe un usuario registrado con ese correo.');
    expect(comp.showForm).toBeTrue();
    expect(comp.isFormPending).toBeFalse();
  }));

  it('should show the details of a user with the permissions of the role', () => {
    create();
    (section('Analistas').querySelector('.view-btn') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('#details-dialog-title')?.textContent).toBe('Analista TDO');
    expect(texts('.details-item dt')).toEqual(['ID de usuario', 'Registro', 'Usuario', 'Cédula', 'Teléfono', 'Contraseña', 'Permisos asignados', 'Origen', 'Estado de la cuenta']);
    expect(texts('.details-item dd')).toEqual(['2', '24/08/2026', 'analista@sena.edu.co', '—', '—', 'Definida por el usuario', '6 / 11', 'Creados manualmente', 'Habilitado']);
    expect(texts('.details-dialog .perm-chip')).toEqual(['Ver inicio', 'Ver ocupación', 'Ver análisis', 'Editar análisis', 'Ver correlación', 'Ver resumen']);

    // Desde el detalle se pasa a editar.
    (Array.from(el.querySelectorAll('.details-dialog .secondary-button'))[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(comp.detailsUser).toBeNull();
    expect(comp.editingUserId).toBe(2);
  });

  it('should change the role from "Rol y permisos", showing what each role allows', fakeAsync(() => {
    create();
    const setRole = spyOn(TestBed.inject(UsuariosService), 'setRole').and.callThrough();
    spyOn(toastService, 'success');
    const analyst = comp.users[1];
    (section('Analistas').querySelector('.role-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();

    expect(texts('.role-option strong')).toEqual(['Administrador', 'Analista', 'Experto', 'Ciudadano', 'APE', 'Tendencias ocupacionales']);
    expect(texts('.role-option-count')).toEqual(['11 / 11', '6 / 11', '8 / 11', '2 / 11', '3 / 11', '3 / 11']);
    expect(comp.roleDraft).toBe('Analista');

    comp.roleDraft = 'Experto';
    fixture.detectChanges();
    expect(el.querySelectorAll('.perm-chip').length).toBe(permissionsOf('Experto').length);
    comp.saveRole();
    tick(MOCK_LATENCY_MS);
    fixture.detectChanges();

    expect(setRole).toHaveBeenCalledWith(2, 'Experto');
    expect(analyst.role).toBe('Experto');
    expect(comp.roleUser).toBeNull();
    expect(toastService.success).toHaveBeenCalledWith('Rol de "Analista TDO" actualizado a Experto.');
    expect(texts('.role-title')).toEqual(['Administradores', 'Expertos']);

    // Sin cambio no se llama al servidor.
    comp.openRoleDialog(analyst);
    comp.saveRole();
    expect(setRole).toHaveBeenCalledTimes(1);
    expect(comp.roleUser).toBeNull();
  }));

  it('should deactivate and activate a user with the switch, after confirming', fakeAsync(() => {
    create();
    spyOn(toastService, 'success');
    const analyst = comp.users[1];
    (section('Analistas').querySelector('.status-switch') as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect(el.querySelector('#status-dialog-description')?.textContent).toContain('No podrá ingresar al sistema');
    comp.confirmStatusChange();
    tick(MOCK_LATENCY_MS);

    expect(analyst.status).toBe('Inactivo');
    expect(comp.statusConfirmation.user).toBeNull();
    expect(toastService.success).toHaveBeenCalledWith('Usuario "Analista TDO" desactivado correctamente.');

    comp.requestStatusChange(analyst);
    comp.confirmStatusChange();
    tick(MOCK_LATENCY_MS);
    expect(analyst.status).toBe('Activo');
  }));

  it('should not let the administrator deactivate or change the role of the own account', () => {
    create();
    const own = comp.users[0];
    const row = section('Administradores').querySelector('.user-row')!;
    const ownSwitch = row.querySelector('.status-switch') as HTMLButtonElement;
    const ownRole = row.querySelector('.role-btn') as HTMLButtonElement;
    expect(ownSwitch.disabled).toBeTrue();
    expect(ownSwitch.title).toBe('No puedes desactivar tu propia cuenta');
    expect(ownRole.disabled).toBeTrue();
    expect(ownRole.title).toBe('No puedes cambiar tu propio rol');
    comp.requestStatusChange(own);
    comp.openRoleDialog(own);
    expect(comp.statusConfirmation.user).toBeNull();
    expect(comp.roleUser).toBeNull();

    const other = section('Analistas').querySelector('.user-row')!;
    expect((other.querySelector('.status-switch') as HTMLButtonElement).disabled).toBeFalse();
    expect((other.querySelector('.role-btn') as HTMLButtonElement).disabled).toBeFalse();
    // Sus propios datos sí los puede editar.
    expect((row.querySelector('.edit-btn') as HTMLButtonElement).disabled).toBeFalse();
  });

  it('should move focus into the confirmation and give it back to the switch when cancelled (via appDialog)', fakeAsync(() => {
    create();
    document.body.appendChild(el);
    const trigger = section('Analistas').querySelector('.status-switch') as HTMLButtonElement;

    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    tick();
    expect(document.activeElement?.textContent?.trim()).toBe('Cancelar');

    (document.activeElement as HTMLButtonElement).click();
    fixture.detectChanges();
    tick();
    expect(comp.statusConfirmation.user).toBeNull();
    expect(document.activeElement).toBe(trigger);

    el.remove();
  }));

  it('should keep the confirmation open (and allow retry) if the operation fails', fakeAsync(() => {
    create();
    const analyst = comp.users[1];
    spyOn(toastService, 'error');
    // Otro administrador quitó la cuenta mientras tanto.
    analyst.id = 99;
    comp.requestStatusChange(analyst);
    comp.confirmStatusChange();
    tick(MOCK_LATENCY_MS);

    expect(toastService.error).toHaveBeenCalledWith('El usuario ya no está disponible.');
    expect(comp.statusConfirmation.user).toBe(analyst);
    expect(comp.statusConfirmation.busy).toBeFalse();
    expect(comp.isUserPending(analyst)).toBeFalse();
    expect(analyst.status).toBe('Activo');
  }));

  it('should translate the page when the language setting changes', () => {
    create();
    expect(el.querySelector('h1')?.textContent).toContain('Gestión de Usuarios');
    expect(texts('.role-title')).toEqual(['Administradores', 'Analistas']);

    const settingsService = TestBed.inject(SettingsService);
    settingsService.updateDraft({ language: 'en' });
    settingsService.save().subscribe();
    fixture.detectChanges();

    expect(el.querySelector('h1')?.textContent).toContain('User Management');
    expect(texts('.role-title')).toEqual(['Administrators', 'Analysts']);
    expect(el.querySelector('.table-head th')?.textContent).toContain('USER');
    expect(comp.statusLabel('Activo')).toBe('Active');
    expect(comp.roleFilterLabel('Todos')).toBe('All');
    settingsService.reset().subscribe();
  });

  it('should not show the controls the backend does not have (per-user read-only, reset access, delete, analyst lock)', () => {
    create();
    expect(el.querySelector('.readonly-action, .access, .danger, .global-readonly-card')).toBeNull();
  });
});
