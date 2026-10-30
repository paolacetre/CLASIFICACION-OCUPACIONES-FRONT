-- ============================================================
--  016_usuario_telefono
--
--  Añade `usuario.telefono`, que la entidad ya declara pero la tabla no tenía.
--
--  Es exactamente el mismo fallo que documenta 003b_usuario_columnas_faltantes,
--  reaparecido: la rama daniel-f agregó la columna a `usuario.entity.ts` (para
--  el formulario de edición y la importación de usuarios desde Excel) sin la
--  migración correspondiente.
--
--  Por qué tumba TODO y no solo el teléfono: DB_SYNCHRONIZE=false, así que
--  TypeORM no crea nada solo; pide la columna en cada SELECT de Usuario y
--  Postgres rechaza la consulta al parsearla, antes de mirar una sola fila.
--  El síntoma no es "no se ve el teléfono" sino un 500 en /auth/login con
--  "column Usuario.telefono does not exist" — con ningún rol se podía entrar,
--  aunque la tabla estuviera llena de cuentas válidas.
--
--  Nullable a propósito: las cuentas que ya existen no tienen teléfono y el
--  campo no es obligatorio en el formulario.
-- ============================================================

ALTER TABLE clasificacion.usuario
  ADD COLUMN IF NOT EXISTS telefono VARCHAR(50) NULL;
