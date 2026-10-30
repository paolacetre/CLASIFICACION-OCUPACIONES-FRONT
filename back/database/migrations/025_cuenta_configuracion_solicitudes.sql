-- ============================================================================
-- 025 · Datos que vivían solo en el localStorage del navegador
-- ============================================================================
--
-- El frontend guardaba en localStorage información que es del sistema, no del
-- navegador: el perfil y las preferencias de cada usuario, el perfil del
-- analista que precarga Instrumento 3, los logos institucionales (que cada
-- administrador veía solo en su propio equipo) y las solicitudes públicas de
-- nueva ocupación, que NUNCA llegaban al backend: se quedaban en el navegador
-- de quien las diligenciaba y el radicado era un número aleatorio.
--
-- Idempotente: se puede volver a ejecutar sin efecto.
-- ============================================================================

-- ── Cuenta del usuario ──────────────────────────────────────────────────────
-- Una fila por usuario, creada la primera vez que guarda algo. Nombre,
-- apellido y teléfono siguen en `usuario`; aquí va lo que esa tabla no tiene.
CREATE TABLE IF NOT EXISTS clasificacion.usuario_cuenta (
  idusuario           INTEGER PRIMARY KEY REFERENCES clasificacion.usuario(idusuario) ON DELETE CASCADE,
  preferencias        JSONB NOT NULL DEFAULT '{}'::jsonb,
  descripcion         TEXT NULL,
  avatar              TEXT NULL,
  perfil_analista     JSONB NULL,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clasificacion.usuario_cuenta IS
  'Preferencias de interfaz, datos extra del perfil y perfil de analista de cada usuario.';
COMMENT ON COLUMN clasificacion.usuario_cuenta.preferencias IS
  'Tema, idioma, tamaño de letra, accesibilidad, etc. Objeto libre que define el frontend.';
COMMENT ON COLUMN clasificacion.usuario_cuenta.avatar IS
  'Imagen de perfil como data URL (image/*;base64).';
COMMENT ON COLUMN clasificacion.usuario_cuenta.perfil_analista IS
  'Datos del informante con que se precarga Instrumento 3 (departamento, entidad, cargo, ...).';

-- ── Configuración global del sistema ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clasificacion.configuracion_sistema (
  clave               VARCHAR(60) PRIMARY KEY,
  valor               JSONB NOT NULL,
  idusuario           INTEGER NULL REFERENCES clasificacion.usuario(idusuario) ON DELETE SET NULL,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clasificacion.configuracion_sistema IS
  'Configuración compartida por todos los usuarios (por ejemplo los logos: clave ''logos'').';

-- ── Solicitudes públicas de nueva ocupación ─────────────────────────────────
CREATE TABLE IF NOT EXISTS clasificacion.solicitud_ocupacion (
  id             SERIAL PRIMARY KEY,
  radicado       VARCHAR(30) NOT NULL UNIQUE,
  tipo           VARCHAR(20) NOT NULL CHECK (tipo IN ('wizard', 'alterno')),
  correo         VARCHAR(255) NULL,
  datos          JSONB NOT NULL,
  estado         VARCHAR(30) NOT NULL DEFAULT 'RADICADA',
  fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE clasificacion.solicitud_ocupacion IS
  'Solicitudes de inclusión de nueva ocupación enviadas desde los formularios públicos (/nueva-ocupacion).';
COMMENT ON COLUMN clasificacion.solicitud_ocupacion.tipo IS
  'Formulario de origen: wizard (por pasos) | alterno (hoja única).';

CREATE INDEX IF NOT EXISTS idx_solicitud_ocupacion_fecha
  ON clasificacion.solicitud_ocupacion (fecha_registro DESC);
