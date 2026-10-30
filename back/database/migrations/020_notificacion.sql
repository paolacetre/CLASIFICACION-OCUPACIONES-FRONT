-- 020_notificacion.sql
-- Tabla para persistencia de notificaciones en BD en lugar de almacenamiento volátil en memoria

CREATE TABLE IF NOT EXISTS clasificacion.notificacion (
  id VARCHAR(64) PRIMARY KEY,
  id_usuario INT NULL,
  rol_destino VARCHAR(50) NULL,
  titulo VARCHAR(255) NOT NULL,
  mensaje TEXT NOT NULL,
  tipo_evento VARCHAR(100) NOT NULL,
  id_instrumento INT NULL,
  ruta VARCHAR(255) NULL,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT fk_notificacion_usuario FOREIGN KEY (id_usuario) REFERENCES clasificacion.usuario(idusuario) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_usuario ON clasificacion.notificacion(id_usuario);
CREATE INDEX IF NOT EXISTS idx_notif_rol ON clasificacion.notificacion(rol_destino);
CREATE INDEX IF NOT EXISTS idx_notif_fecha ON clasificacion.notificacion(fecha_creacion DESC);
