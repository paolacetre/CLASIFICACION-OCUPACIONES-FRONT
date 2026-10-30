import { CatalogoSimple } from '../../common/utils/catalogo-simple.util';
import { HabilidadDestreza } from './entities/habilidad-destreza.entity';

/** habilidad_destreza es compartida: CNO la llama habilidad y CUOC, destreza. */
export const HABILIDADES_DESTREZAS: CatalogoSimple<HabilidadDestreza> = {
  entidad: HabilidadDestreza,
  tabla: 'habilidad_destreza',
  colCodigo: 'cod_hab_dest',
  colNombre: 'nomb_hab_dest',
  colDescripcion: 'desc_hab_dest',
  codigo: 'entero',
  etiqueta: 'una habilidad/destreza',
  nombresCopiados: [
    { tabla: 'cno_reg_habilidad', colCodigo: 'codigo_habilidad', colNombre: 'nomb_hab_dest' },
    { tabla: 'cuoc_destreza', colCodigo: 'codigo_destreza', colNombre: 'nomb_hab_dest' },
  ],
  usos: [
    { tabla: 'cno_reg_habilidad', colCodigo: 'codigo_habilidad', descripcion: 'ocupación(es) CNO' },
    { tabla: 'cuoc_destreza', colCodigo: 'codigo_destreza', descripcion: 'ocupación(es) CUOC' },
  ],
};
