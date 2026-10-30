-- -----------------------------------------------------
-- Datos iniciales (clasificacion)
-- -----------------------------------------------------
-- Los roles y las cuentas de prueba YA NO se siembran aquí.
--
-- Motivo: los scripts de /docker-entrypoint-initdb.d solo se ejecutan cuando el
-- volumen de Postgres está vacío. Cualquier entorno que ya tenga datos nunca
-- vuelve a pasar por este archivo, así que no servía para garantizar que las
-- cuentas existieran, y mantener la lista aquí y en la aplicación llevaba a que
-- las dos copias se separaran.
--
-- Fuente única de verdad: back/src/modules/seed/seed.service.ts
-- Se ejecuta en cada arranque del backend, crea solo lo que falte y nunca pisa
-- lo que ya existe, así que funciona igual en una BD nueva y en una desplegada.
--
-- Para las BD que ya estaban creadas con el seed antiguo, la normalización de
-- esas cuentas está en database/migrations/004_usuarios_prueba.sql.

SET search_path TO clasificacion;
