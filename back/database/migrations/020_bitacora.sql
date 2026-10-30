-- ============================================================================
-- 020 · Bitácora de trazabilidad
-- ============================================================================
--
-- El panel de Inicio mostraba una "Bitácora de Trazabilidad Reciente" con 6
-- filas de texto fijo en el frontend (home.component.ts): siempre las mismas,
-- para cualquier usuario, con horas que nunca cambiaban. No existía ninguna
-- tabla de auditoría de la que sacar esos datos, ni columnas de auditoría
-- (updated_at/updated_by) en cno_ocupacion/cuoc_ocupacion de las que se
-- pudiera reconstruir "quién hizo qué y cuándo".
--
-- Esta tabla registra, en el momento en que ocurre, la actividad real de cada
-- usuario (crear una ocupación CNO/CUOC, guardar una correlativa, cerrar una
-- validación experta). BitacoraService.registrar() escribe aquí; el registro
-- nunca debe poder tumbar la acción que lo origina, así que esa escritura va
-- envuelta en su propio try/catch en el servicio, no aquí.
--
-- Idempotente: se puede volver a ejecutar sin efecto.
-- ============================================================================

CREATE TABLE IF NOT EXISTS clasificacion.bitacora (
  id        SERIAL PRIMARY KEY,
  idusuario INTEGER NOT NULL REFERENCES clasificacion.usuario(idusuario),
  tipo      TEXT NOT NULL,
  titulo    TEXT NOT NULL,
  detalle   TEXT NULL,
  fecha     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clasificacion.bitacora IS
  'Actividad reciente por usuario, para la Bitácora de Trazabilidad del panel de Inicio.';
COMMENT ON COLUMN clasificacion.bitacora.tipo IS
  'Categoría de la acción: cno | cuoc | correlacion | validacion. Determina el color/etiqueta en el frontend.';
COMMENT ON COLUMN clasificacion.bitacora.titulo IS
  'Texto ya redactado en segunda persona, ej. "Creaste la ocupación CNO 1234".';

CREATE INDEX IF NOT EXISTS idx_bitacora_usuario_fecha
  ON clasificacion.bitacora (idusuario, fecha DESC);
