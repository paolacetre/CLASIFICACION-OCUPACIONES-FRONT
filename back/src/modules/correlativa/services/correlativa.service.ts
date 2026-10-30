import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { PaginationDto, PageResponse, buildPageResponse } from '../../../common/dto/pagination.dto';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { CorrelativaCargaService } from './correlativa-carga.service';

@Injectable()
export class CorrelativaService {
  private readonly logger = new Logger(CorrelativaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cache: RedisCacheService,
    private readonly cargaService: CorrelativaCargaService,
  ) { }

  async onModuleInit() {
    // Siembra automática SOLO si `correlativa_denominacion` está vacía.
    //
    // Antes la condición era `count === 0 || conocCount === 0`. Como el Excel no
    // produce filas de `correlativa_conocimiento` (la carga reporta siempre
    // "Conocimientos: 0"), esa segunda condición nunca dejaba de cumplirse y el
    // arranque reprocesaba las ~9.5k filas del Excel CADA vez (6-15 s por boot).
    // El estado de `correlativa_denominacion` es el que decide si hay que sembrar.
    try {
      const countRes = await this.dataSource.query('SELECT COUNT(*) as cnt FROM correlativa_denominacion');
      const count = parseInt(countRes[0]?.cnt ?? '0', 10);

      // Sin catálogo CNO y CUOC las ~9.5k filas fallan todas por llave foránea y
      // el arranque llenaba el log de errores sin cargar nada. Se pospone hasta
      // que existan ocupaciones de las dos clasificaciones.
      if (count === 0 && !(await this.hayCatalogosParaCorrelativas())) {
        this.logger.log(
          'Siembra de correlativas pospuesta: aún no hay ocupaciones CNO y CUOC cargadas. ' +
            'Se intentará en el próximo arranque, o cárguelas desde Actualización > Correlativa.',
        );
        return;
      }

      if (count === 0) {
        const fs = require('fs');
        const path = require('path');

        // Estrategias de búsqueda del archivo local
        const pathsToTry = [
          path.join(process.cwd(), 'database', 'correlativa.xlsx'),
          path.join(__dirname, '..', '..', '..', '..', 'database', 'correlativa.xlsx'),
          path.join(process.cwd(), '..', '..', 'Correlativa CNO 2024 CUOC 2024 (Publicable) 26Jun25.xlsx'),
          path.join(process.cwd(), '..', 'Correlativa CNO 2024 CUOC 2024 (Publicable) 26Jun25.xlsx'),
          path.join(__dirname, '..', '..', '..', '..', '..', '..', 'Correlativa CNO 2024 CUOC 2024 (Publicable) 26Jun25.xlsx'),
          path.join(__dirname, '..', '..', '..', '..', '..', 'Correlativa CNO 2024 CUOC 2024 (Publicable) 26Jun25.xlsx')
        ];

        let foundPath = '';
        for (const p of pathsToTry) {
          if (fs.existsSync(p)) {
            foundPath = p;
            break;
          }
        }

        if (foundPath) {
          this.logger.log(`Sembrando correlativas automáticamente desde: ${foundPath}`);
          const buffer = fs.readFileSync(foundPath);
          await this.processExcel(buffer);
        } else {
          this.logger.warn('No se encontró el archivo local de correlativa para la siembra automática.');
        }
      }
    } catch (err) {
      this.logger.error(`Error en siembra automática de correlativas: ${err.message}`);
    }
  }

  /** Las correlativas enlazan ocupaciones de las dos clasificaciones: sin ambas no hay a qué enlazar. */
  private async hayCatalogosParaCorrelativas(): Promise<boolean> {
    const [fila] = await this.dataSource.query(
      `SELECT EXISTS (SELECT 1 FROM cno_ocupacion) AS cno, EXISTS (SELECT 1 FROM cuoc_ocupacion) AS cuoc`,
    );
    return fila?.cno === true && fila?.cuoc === true;
  }

  /**
   * INSERT multi-fila en lotes. A diferencia de la version anterior, un fallo NO se
   * traga en silencio: se propaga para que la transaccion completa se revierta. Antes
   * un lote fallido perdia hasta 300 filas sin dejar rastro mas que un log, y el
   * contador de insertados seguia sumando como si nada.
   */
  private async batchInsert(
    manager: any,
    tableName: string,
    columns: string[],
    rows: any[][],
  ): Promise<number> {
    if (rows.length === 0) return 0;

    let totalInserted = 0;
    const batchSize = 300;

    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const valuesPlaceholder = chunk
        .map((_, rIdx) => `(${columns.map((_, cIdx) => `$${rIdx * columns.length + cIdx + 1}`).join(', ')})`)
        .join(', ');

      await manager.query(
        `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES ${valuesPlaceholder}`,
        chunk.flat(),
      );
      totalInserted += chunk.length;
    }

    return totalInserted;
  }

  /** Texto de una celda, o null si viene vacia. Nunca inventa un valor de relleno. */
  private celda(fila: any[], indice: number): string | null {
    const valor = fila[indice];
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    return texto === '' ? null : texto;
  }

  private entero(fila: any[], indice: number): number | null {
    const texto = this.celda(fila, indice);
    if (texto === null) return null;
    const n = parseInt(texto, 10);
    return isNaN(n) ? null : n;
  }

  /**
   * Carga las correlaciones CNO <-> CUOC desde el Excel.
   *
   * Este cargue escribe UNICAMENTE en `correlativa_denominacion` y `correlativa_conocimiento`.
   * No crea ocupaciones, denominaciones, niveles ni conocimientos: si una fila
   * referencia un codigo que no existe en el catalogo, se reporta y se omite.
   *
   * La version anterior hacia lo contrario —inventaba las entradas de catalogo que
   * le faltaban, con valores de relleno ('0000', 'N/A', 'Sin Denominacion', y un
   * area/nivel "Finanzas y Administracion" identico para toda ocupacion que creaba—
   * y para poder insertarlas apagaba las llaves foraneas de la sesion con
   * `SET session_replication_role = 'replica'`. Eso dejaba en CNO y CUOC filas que
   * ningun Excel oficial respalda. Ya no: las FK quedan activas y la base rechaza
   * cualquier referencia rota que se escape de las validaciones de aqui.
   */
  async processExcel(buffer: Buffer): Promise<{
    message: string;
    totalInserted: number;
    totalSkipped: number;
    totalErrors: number;
    elapsedMs: number;
    sheets: Array<{
      sheet: string;
      tableName: string;
      message: string;
      inserted: number;
      updated: number;
      skipped: number;
      errors: string[];
      skippedDetails: string[];
      warnings: string[];
    }>;
  }> {
    const startedAt = Date.now();
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    const normalizar = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const sheetName = workbook.SheetNames.find((n) => normalizar(n).includes('denominacion'));
    if (!sheetName) {
      throw new Error('No se encontro la pestana "Por denominacion" en el archivo Excel.');
    }
    const conocSheetName = workbook.SheetNames.find((n) => normalizar(n).includes('conocimiento'));

    const hojaDenom = {
      sheet: sheetName,
      tableName: 'correlativa_denominacion',
      message: '',
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      skippedDetails: [] as string[],
      warnings: [] as string[],
    };
    const hojaConoc = {
      sheet: conocSheetName ?? 'Conocimientos',
      tableName: 'correlativa_conocimiento',
      message: '',
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: [] as string[],
      skippedDetails: [] as string[],
      warnings: [] as string[],
    };

    // Catalogos existentes: se consultan una sola vez y se validan en memoria.
    const [denomCno, denomCuoc, ocupCno, ocupCuoc, conocCno, conocCuoc] = await Promise.all([
      this.dataSource.query('SELECT cod_denominacion_cno AS c FROM clasificacion.cno_denominacion'),
      this.dataSource.query('SELECT cod_denominacion AS c FROM clasificacion.cuoc_denominacion'),
      this.dataSource.query('SELECT cod_ocupacion_cno AS c FROM clasificacion.cno_ocupacion'),
      this.dataSource.query('SELECT cod_ocupacion_cuoc AS c FROM clasificacion.cuoc_ocupacion'),
      this.dataSource.query('SELECT cod_conocimiento AS c FROM clasificacion.cno_conocimiento'),
      this.dataSource.query('SELECT cod_conocimiento AS c FROM clasificacion.cuoc_conocimiento'),
    ]);
    const setDenomCno = new Set<string>(denomCno.map((r: any) => String(r.c)));
    const setDenomCuoc = new Set<string>(denomCuoc.map((r: any) => String(r.c)));
    const setOcupCno = new Set<string>(ocupCno.map((r: any) => String(r.c)));
    const setOcupCuoc = new Set<string>(ocupCuoc.map((r: any) => String(r.c)));
    const setConocCno = new Set<number>(conocCno.map((r: any) => Number(r.c)));
    const setConocCuoc = new Set<number>(conocCuoc.map((r: any) => Number(r.c)));

    // ---- Hoja "Por denominacion": los datos empiezan en la fila 8 de Excel ----
    const filasDenom = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[sheetName], { header: 1 }).slice(7);
    const relaciones: any[][] = [];
    const paresVistos = new Set<string>();

    filasDenom.forEach((fila, i) => {
      const excelRow = i + 8;
      if (!Array.isArray(fila) || fila.length < 6) return;

      const cnoOcup = this.celda(fila, 0);
      const cnoDenom = this.celda(fila, 2);
      const cuocDenom = this.celda(fila, 4);
      const cuocOcup = this.celda(fila, 6);

      // Sin relleno: una fila incompleta se omite y se reporta. Las 4 columnas son
      // NOT NULL en `correlativa_denominacion`, asi que no hay forma honesta de completarla.
      const faltantes: string[] = [];
      if (!cnoOcup) faltantes.push('codigo de ocupacion CNO');
      if (!cnoDenom) faltantes.push('codigo de denominacion CNO');
      if (!cuocDenom) faltantes.push('codigo de denominacion CUOC');
      if (!cuocOcup) faltantes.push('codigo de ocupacion CUOC');
      if (faltantes.length) {
        hojaDenom.skipped++;
        hojaDenom.skippedDetails.push(`[fila ${excelRow}] Fila incompleta, falta: ${faltantes.join(', ')}.`);
        return;
      }

      // Las denominaciones tienen FK: si no existen, la fila no puede entrar.
      if (!setDenomCno.has(cnoDenom!)) {
        hojaDenom.skipped++;
        hojaDenom.errors.push(
          `[fila ${excelRow}] La denominacion CNO '${cnoDenom}' no existe en cno_denominacion; ` +
            'cargue primero el Excel de CNO. La fila se omitio.',
        );
        return;
      }
      if (!setDenomCuoc.has(cuocDenom!)) {
        hojaDenom.skipped++;
        hojaDenom.errors.push(
          `[fila ${excelRow}] La denominacion CUOC '${cuocDenom}' no existe en cuoc_denominacion; ` +
            'cargue primero el Excel de CUOC. La fila se omitio.',
        );
        return;
      }

      // Las ocupaciones no tienen FK en `correlativa_denominacion`, asi que la fila entra igual,
      // pero se avisa: un codigo que no esta en el catalogo apunta a la nada.
      if (!setOcupCno.has(cnoOcup!)) {
        hojaDenom.warnings.push(`[fila ${excelRow}] La ocupacion CNO '${cnoOcup}' no existe en cno_ocupacion.`);
      }
      if (!setOcupCuoc.has(cuocOcup!)) {
        hojaDenom.warnings.push(`[fila ${excelRow}] La ocupacion CUOC '${cuocOcup}' no existe en cuoc_ocupacion.`);
      }

      const par = `${cnoDenom}||${cuocDenom}`;
      if (paresVistos.has(par)) {
        hojaDenom.skipped++;
        hojaDenom.skippedDetails.push(`[fila ${excelRow}] Par '${cnoDenom}' - '${cuocDenom}' repetido en la hoja, no se duplico.`);
        return;
      }
      paresVistos.add(par);

      relaciones.push([
        cnoOcup,
        cnoDenom,
        this.celda(fila, 3),
        cuocDenom,
        this.celda(fila, 5),
        cuocOcup,
      ]);
    });
    hojaDenom.inserted = relaciones.length;

    // ---- Hoja de conocimientos ----
    const relConocimientos: any[][] = [];
    if (conocSheetName) {
      const filasConoc = XLSX.utils.sheet_to_json<any[]>(workbook.Sheets[conocSheetName], { header: 1 }).slice(1);
      const paresConoc = new Set<string>();

      filasConoc.forEach((fila, i) => {
        const excelRow = i + 2;
        if (!Array.isArray(fila) || fila.length < 2) return;

        const codCno = this.entero(fila, 0);
        const codCuoc = this.entero(fila, 2);
        if (codCno === null || codCuoc === null) {
          hojaConoc.skipped++;
          hojaConoc.skippedDetails.push(`[fila ${excelRow}] Fila sin codigo de conocimiento CNO y/o CUOC.`);
          return;
        }
        // Ambos codigos tienen FK: se validan contra su catalogo, no se crean.
        if (!setConocCno.has(codCno)) {
          hojaConoc.skipped++;
          hojaConoc.errors.push(
            `[fila ${excelRow}] El conocimiento CNO '${codCno}' no existe en cno_conocimiento; la fila se omitio.`,
          );
          return;
        }
        if (!setConocCuoc.has(codCuoc)) {
          hojaConoc.skipped++;
          hojaConoc.errors.push(
            `[fila ${excelRow}] El conocimiento CUOC '${codCuoc}' no existe en cuoc_conocimiento; la fila se omitio.`,
          );
          return;
        }

        const par = `${codCno}||${codCuoc}`;
        if (paresConoc.has(par)) {
          hojaConoc.skipped++;
          hojaConoc.skippedDetails.push(`[fila ${excelRow}] Par de conocimientos ${codCno} - ${codCuoc} repetido, no se duplico.`);
          return;
        }
        paresConoc.add(par);

        relConocimientos.push([codCno, this.celda(fila, 1), codCuoc, this.celda(fila, 3), this.entero(fila, 4) ?? 0]);
      });
      hojaConoc.inserted = relConocimientos.length;
    } else {
      hojaConoc.warnings.push('No se encontro la hoja de conocimientos en el archivo; no se cargo correlativa_conocimiento.');
    }

    // ---- Escritura: solo las dos tablas propias, con las FK activas ----
    await this.dataSource.transaction(async (manager) => {
      await manager.query('TRUNCATE TABLE clasificacion.correlativa_denominacion RESTART IDENTITY CASCADE');
      await this.batchInsert(
        manager,
        'clasificacion.correlativa_denominacion',
        // `estado` no se escribe: la plantilla no trae esa columna, asi que la fila
        // se inserta sin ella y queda en el DEFAULT NULL de la tabla. Antes se le
        // ponia `true` a todo, que era inventar un dato que nadie envio (y que
        // ademas ninguna consulta lee).
        [
          'cod_ocupacion_cno',
          'cod_denominacion_cno',
          'desc_denominacion_cno',
          'cod_denominacion_cuoc',
          'desc_denominacion_cuoc',
          'cod_ocupacion_cuoc',
        ],
        relaciones,
      );

      if (conocSheetName) {
        await manager.query('TRUNCATE TABLE clasificacion.correlativa_conocimiento RESTART IDENTITY CASCADE');
        await this.batchInsert(
          manager,
          'clasificacion.correlativa_conocimiento',
          // `aplica_correl_conocimientos` (migración 019); antes se llamaba `aplica`.
          ['cod_conocimiento_cno', 'nomb_conocimiento_cno', 'cod_conocimiento_cuoc', 'nomb_conocimiento_cuoc', 'aplica_correl_conocimientos'],
          relConocimientos,
        );
      }
    });

    const resumen = (h: typeof hojaDenom) =>
      `'${h.sheet}' (${h.tableName}): ${h.inserted} insertados, ${h.skipped} omitidos, ${h.errors.length} errores, ${h.warnings.length} avisos.`;
    hojaDenom.message = resumen(hojaDenom);
    hojaConoc.message = resumen(hojaConoc);

    // ---- Hoja "Por ocupacion" -> correlativa_ocupacion ----
    // Antes se ignoraba y la tabla quedaba vacia, con lo que la ficha publica
    // (Pagina, Tendencias, APE) devolvia `correlativa: []`. Se delega en la
    // carga por tipo, que ya sabe leer el encabezado de tres filas de la hoja
    // oficial; si falla, la correlativa por denominacion ya quedo guardada.
    const ocupSheetName = workbook.SheetNames.find(
      (n) => normalizar(n).includes('ocupacion') && !normalizar(n).includes('denominacion'),
    );
    let hojaOcup: typeof hojaDenom | null = null;
    if (ocupSheetName) {
      try {
        hojaOcup = (await this.cargaService.cargar(buffer, 'ocupacion')).sheets[0];
      } catch (err) {
        hojaOcup = {
          sheet: ocupSheetName,
          tableName: 'correlativa_ocupacion',
          message: '',
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: [`No se cargo la correlativa por ocupacion: ${err.message}`],
          skippedDetails: [],
          warnings: [],
        };
        hojaOcup.message = resumen(hojaOcup);
      }
    }

    // Una hoja que ningun procesador reclama se ignoraba en silencio.
    const reconocidas = new Set([sheetName, conocSheetName, ocupSheetName].filter(Boolean) as string[]);
    for (const nombre of workbook.SheetNames.filter((n) => !reconocidas.has(n))) {
      hojaDenom.warnings.push(`La hoja "${nombre}" no se proceso: este cargue no reconoce esa hoja.`);
    }

    const sheets = [hojaDenom, hojaConoc, ...(hojaOcup ? [hojaOcup] : [])];
    const totalInserted = sheets.reduce((s, h) => s + h.inserted, 0);
    const totalSkipped = sheets.reduce((s, h) => s + h.skipped, 0);
    const totalErrors = sheets.reduce((s, h) => s + h.errors.length, 0);
    const elapsedMs = Date.now() - startedAt;

    const message =
      totalErrors === 0
        ? `Carga de correlativas completada. Insertadas: ${totalInserted}, omitidas: ${totalSkipped}.`
        : `Carga de correlativas finalizada con ${totalErrors} errores. Insertadas: ${totalInserted}, omitidas: ${totalSkipped}.`;
    this.logger.log(message);

    return { message, totalInserted, totalSkipped, totalErrors, elapsedMs, sheets };
  }


  async getCorrelaciones(
    pagination: PaginationDto,
  ): Promise<
    PageResponse<{
      codigo: number;
      codOcupacionCno: string;
      codDenominacionCno: string;
      descDenominacionCno: string;
      codOcupacionCuoc: string;
      codDenominacionCuoc: string;
      descDenominacionCuoc: string;
      estado: boolean | null;
      observacion: string | null;
    }>
  > {
    const [countRes, data] = await Promise.all([
      this.dataSource.query(`SELECT COUNT(*) as cnt FROM correlativa_denominacion`),
      this.dataSource.query(
        `SELECT
           codigo as "codigo",
           cod_ocupacion_cno as "codOcupacionCno",
           cod_denominacion_cno as "codDenominacionCno",
           desc_denominacion_cno as "descDenominacionCno",
           cod_ocupacion_cuoc as "codOcupacionCuoc",
           cod_denominacion_cuoc as "codDenominacionCuoc",
           desc_denominacion_cuoc as "descDenominacionCuoc",
           estado as "estado",
           observacion as "observacion"
         FROM correlativa_denominacion
         ORDER BY codigo ASC
         LIMIT $1 OFFSET $2`,
        [pagination.limit, pagination.skip],
      ),
    ]);
    const total = parseInt(countRes[0]?.cnt ?? '0', 10);
    return buildPageResponse(data, total, pagination);
  }

  async getCorrelacionesConocimientos(): Promise<any[]> {
    const res = await this.dataSource.query(
      // Columnas según la migración 019 (`codigo`, `aplica_correl_conocimientos`);
      // los alias de salida se mantienen para no tocar el contrato con el front.
      `SELECT
         codigo as "codConocimiento",
         cod_conocimiento_cno as "codConocimientoCno",
         nomb_conocimiento_cno as "nombConocimientoCno",
         cod_conocimiento_cuoc as "codConocimientoCuoc",
         nomb_conocimiento_cuoc as "nombConocimientoCuoc",
         aplica_correl_conocimientos as "aplica"
       FROM clasificacion.correlativa_conocimiento
       ORDER BY codigo ASC`
    );
    return res;
  }

  /**
   * Genera el archivo Excel completo con todas las hojas:
   * 1. OCUPACIONES (CNO y CUOC)
   * 2. DENOMINACIONES (CNO y CUOC)
   * 3. FUNCIONES (Unificadas CNO y CUOC)
   * 4. FUNCIONES_CNO
   * 5. FUNCIONES_CUOC
   * Si se especifica filtroOcupacion, exporta solo los registros de esa ocupación.
   */
  generarExcelCompleto(filtroOcupacion?: string, conCampoOcupacional = false): Promise<Buffer> {
    const filtro = filtroOcupacion?.trim() || null;
    // La variante va en la clave: si no, el Excel que armó un usuario APE (con
    // la columna) se le serviría desde Redis a cualquier otro rol.
    const variante = conCampoOcupacional ? 'con-campo' : 'sin-campo';
    return this.cache.envolverBufferCatalogo(`export:correlativa:${filtro ?? 'todo'}:${variante}`, () =>
      this.construirExcelCompleto(filtro, conCampoOcupacional),
    );
  }

  private async construirExcelCompleto(filtro: string | null, conCampoOcupacional: boolean): Promise<Buffer> {

    // 1. Ocupaciones CNO ↔ CUOC
    const ocupQuery = `
      SELECT 
        co.codigo as "idRelacion",
        co.cno_ocupacion_cno as "codOcupacionCno",
        co.nomb_ocupacion_cno as "nombOcupacionCno",
        cno_oc.descripcion as "descOcupacionCno",
        cno_oc.campo_ocup_cno as "campoOcupCno",
        cno_oc.desc_campo_ocup_cno as "descCampoOcupCno",
        co.cuoc_ocupacion_cuoc as "codOcupacionCuoc",
        co.nomb_ocupacion_cuoc as "nombOcupacionCuoc",
        cuoc_oc.desc_ocupacion_cuoc as "descOcupacionCuoc",
        co.observacion as "observacion"
      FROM clasificacion.correlativa_ocupacion co
      LEFT JOIN clasificacion.cno_ocupacion cno_oc ON cno_oc.cod_ocupacion_cno = co.cno_ocupacion_cno
      LEFT JOIN clasificacion.cuoc_ocupacion cuoc_oc ON cuoc_oc.cod_ocupacion_cuoc = co.cuoc_ocupacion_cuoc
      WHERE ($1::text IS NULL OR co.cno_ocupacion_cno = $1 OR co.cuoc_ocupacion_cuoc = $1)
      ORDER BY co.cno_ocupacion_cno ASC, co.cuoc_ocupacion_cuoc ASC
    `;
    const ocupRes = await this.dataSource.query(ocupQuery, [filtro]);

    // Códigos relacionados para filtrar denominaciones y funciones
    const relatedCno: string[] = filtro ? [filtro] : [];
    const relatedCuoc: string[] = filtro ? [filtro] : [];
    if (filtro) {
      for (const r of ocupRes) {
        if (r.codOcupacionCno && !relatedCno.includes(r.codOcupacionCno)) relatedCno.push(r.codOcupacionCno);
        if (r.codOcupacionCuoc && !relatedCuoc.includes(r.codOcupacionCuoc)) relatedCuoc.push(r.codOcupacionCuoc);
      }
    }

    // 2. Denominaciones CNO ↔ CUOC
    const denomQuery = `
      SELECT 
        c.codigo as "idRelacion",
        c.cod_ocupacion_cno as "codOcupacionCno",
        c.cod_denominacion_cno as "codDenominacionCno",
        c.desc_denominacion_cno as "descDenominacionCno",
        c.cod_ocupacion_cuoc as "codOcupacionCuoc",
        c.cod_denominacion_cuoc as "codDenominacionCuoc",
        c.desc_denominacion_cuoc as "descDenominacionCuoc",
        CASE WHEN c.estado = true THEN 'Activo' ELSE 'Inactivo' END as "estado",
        c.observacion as "observacion"
      FROM clasificacion.correlativa_denominacion c
      WHERE ($1::text IS NULL OR c.cod_ocupacion_cno = ANY($2::text[]) OR c.cod_ocupacion_cuoc = ANY($3::text[]))
      ORDER BY c.cod_ocupacion_cno ASC, c.codigo ASC
    `;
    const denomRes = await this.dataSource.query(denomQuery, [filtro, relatedCno, relatedCuoc]);

    // 3. Funciones CNO
    const funcCnoQuery = `
      SELECT 
        f.cno_ocupacion as "codOcupacionCno",
        o.nomb_ocupacion_cno as "nombOcupacionCno",
        f.codigo as "codigoFuncionCno",
        f.cod_funcion as "numFuncionCno",
        f.desc_funcion_cno as "descFuncionCno",
        CASE WHEN f.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as "estado"
      FROM clasificacion.cno_reg_funciones f
      LEFT JOIN clasificacion.cno_ocupacion o ON o.cod_ocupacion_cno = f.cno_ocupacion
      WHERE ($1::text IS NULL OR f.cno_ocupacion = ANY($2::text[]))
      ORDER BY f.cno_ocupacion ASC, f.codigo ASC
    `;
    const funcCnoRes = await this.dataSource.query(funcCnoQuery, [filtro, relatedCno]);

    // 4. Funciones CUOC
    const funcCuocQuery = `
      SELECT 
        f.cod_ocupacion_cuoc as "codOcupacionCuoc",
        o.nom_ocupacion_cuoc as "nombOcupacionCuoc",
        f.cod_funcion_cuoc as "codigoFuncionCuoc",
        f.nom_funcion_cuoc as "descFuncionCuoc",
        CASE WHEN f.estado = 1 THEN 'Activo' ELSE 'Inactivo' END as "estado"
      FROM clasificacion.cuoc_funciones f
      LEFT JOIN clasificacion.cuoc_ocupacion o ON o.cod_ocupacion_cuoc = f.cod_ocupacion_cuoc
      WHERE ($1::text IS NULL OR f.cod_ocupacion_cuoc = ANY($2::text[]))
      ORDER BY f.cod_ocupacion_cuoc ASC, f.codigo ASC
    `;
    const funcCuocRes = await this.dataSource.query(funcCuocQuery, [filtro, relatedCuoc]);

    // 5. Construcción del libro Excel
    const wb = XLSX.utils.book_new();

    // Hoja 1: OCUPACIONES
    const wsOcup = XLSX.utils.json_to_sheet(
      ocupRes.map((r: any) => ({
        'ID Relación': r.idRelacion,
        'Identificador CNO': r.codOcupacionCno,
        'Nombre Ocupación CNO': r.nombOcupacionCno || '',
        'Descripción CNO': r.descOcupacionCno || '',
        ...(conCampoOcupacional
          ? {
              'Campo Ocupacional CNO': r.campoOcupCno || '',
              'Descripción Campo Ocupacional CNO': r.descCampoOcupCno || '',
            }
          : {}),
        'Identificador CUOC': r.codOcupacionCuoc,
        'Nombre Ocupación CUOC': r.nombOcupacionCuoc || '',
        'Descripción CUOC': r.descOcupacionCuoc || '',
        'Observación': r.observacion || '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, wsOcup, 'OCUPACIONES');

    // Hoja 2: DENOMINACIONES
    const wsDenom = XLSX.utils.json_to_sheet(
      denomRes.map((r: any) => ({
        'ID Relación': r.idRelacion,
        'Identificador CNO': r.codOcupacionCno,
        'Código Denominación CNO': r.codDenominacionCno,
        'Nombre / Denominación CNO': r.descDenominacionCno,
        'Identificador CUOC': r.codOcupacionCuoc,
        'Código Denominación CUOC': r.codDenominacionCuoc,
        'Nombre / Denominación CUOC': r.descDenominacionCuoc,
        'Estado': r.estado,
        'Observación': r.observacion || '',
      })),
    );
    XLSX.utils.book_append_sheet(wb, wsDenom, 'DENOMINACIONES');

    // Hoja 3: FUNCIONES (Unificadas CNO y CUOC)
    const funcionesUnificadas: any[] = [];
    for (const f of funcCnoRes) {
      funcionesUnificadas.push({
        'Clasificación': 'CNO',
        'Identificador Ocupación': f.codOcupacionCno,
        'Nombre Ocupación': f.nombOcupacionCno || '',
        'Código Función': f.codigoFuncionCno,
        'Descripción Función': f.descFuncionCno,
        'Estado': f.estado,
      });
    }
    for (const f of funcCuocRes) {
      funcionesUnificadas.push({
        'Clasificación': 'CUOC',
        'Identificador Ocupación': f.codOcupacionCuoc,
        'Nombre Ocupación': f.nombOcupacionCuoc || '',
        'Código Función': f.codigoFuncionCuoc,
        'Descripción Función': f.descFuncionCuoc,
        'Estado': f.estado,
      });
    }
    const wsFunciones = XLSX.utils.json_to_sheet(funcionesUnificadas);
    XLSX.utils.book_append_sheet(wb, wsFunciones, 'FUNCIONES');

    // Hoja 4: FUNCIONES_CNO
    const wsFuncCno = XLSX.utils.json_to_sheet(
      funcCnoRes.map((r: any) => ({
        'Identificador CNO': r.codOcupacionCno,
        'Nombre Ocupación CNO': r.nombOcupacionCno || '',
        'Código Función CNO': r.codigoFuncionCno,
        'Descripción Función CNO': r.descFuncionCno,
        'Estado': r.estado,
      })),
    );
    XLSX.utils.book_append_sheet(wb, wsFuncCno, 'FUNCIONES_CNO');

    // Hoja 5: FUNCIONES_CUOC
    const wsFuncCuoc = XLSX.utils.json_to_sheet(
      funcCuocRes.map((r: any) => ({
        'Identificador CUOC': r.codOcupacionCuoc,
        'Nombre Ocupación CUOC': r.nombOcupacionCuoc || '',
        'Código Función CUOC': r.codigoFuncionCuoc,
        'Descripción Función CUOC': r.descFuncionCuoc,
        'Estado': r.estado,
      })),
    );
    XLSX.utils.book_append_sheet(wb, wsFuncCuoc, 'FUNCIONES_CUOC');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}
