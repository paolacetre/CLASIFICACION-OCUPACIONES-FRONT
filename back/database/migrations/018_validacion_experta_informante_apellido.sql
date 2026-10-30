-- ============================================================================
-- 018 · Separa nombre y apellido del informante en validacion_experta
-- ============================================================================
--
-- `validacion_experta` guardaba el informante en UNA sola columna de texto
-- (`informante_nombre`, "Ana María Ruiz López"), mientras que `usuario` -de
-- donde ahora se precargan esos datos- los tiene separados en `nombre` y
-- `apellido`. Juntarlos al guardar obliga a partirlos otra vez al leer, y no
-- hay forma fiable de hacerlo: "Ana María Ruiz López" admite varios cortes y
-- cualquiera de ellos es una suposicion.
--
-- Se agrega `informante_apellido` para que el dato viaje separado de punta a
-- punta: formulario → API → base de datos → reporte de Resumen.
--
-- Sin backfill a proposito: la tabla esta vacia en los entornos actuales y
-- partir un nombre completo por el primer espacio habria inventado datos. Si
-- alguna instancia trajera filas previas, conservan su valor en
-- `informante_nombre` y `informante_apellido` queda NULL, que es exactamente
-- lo que se sabe de ellas.
--
-- Idempotente: se puede volver a ejecutar sin efecto.
-- ============================================================================

ALTER TABLE clasificacion.validacion_experta
  ADD COLUMN IF NOT EXISTS informante_apellido TEXT NULL;

COMMENT ON COLUMN clasificacion.validacion_experta.informante_nombre
  IS 'Nombres del informante (sin apellidos). Se precarga del usuario en sesion y es editable.';

COMMENT ON COLUMN clasificacion.validacion_experta.informante_apellido
  IS 'Apellidos del informante. Separado de informante_nombre igual que en la tabla usuario.';
