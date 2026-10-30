-- ============================================================
--  017_analista_correo_convencion
--
--  Renombra la cuenta del ANALISTA de 'prueba.analista@sena.edu.co' a
--  'analista@sena.edu.co'.
--
--  Era la unica de las seis cuentas de prueba que no seguia la convencion que
--  el propio SeedService declara ("el correo coincide con el identificador de
--  login, para que el equipo de pruebas sepa de memoria con que cuenta esta
--  entrando"): admin@, experto@, ciudadano@, ape@ y tendencias@ van con el rol
--  a secas, y solo esta llevaba el prefijo 'prueba.'.
--
--  El efecto practico no era cosmetico: AuthService busca por coincidencia
--  EXACTA del campo `usuario`, asi que escribir el correo que la convencion
--  sugiere devolvia 401 Unauthorized, sin pista de que el identificador fuera
--  el problema.
--
--  Se renombra en vez de crear la cuenta nueva para no dejar dos analistas ni
--  perder lo que ya cuelgue de `idusuario` (roles asignados, instrumentos,
--  validaciones): las relaciones apuntan al id, no al correo, asi que el
--  renombrado las conserva todas.
--
--  Condicionada dos veces a proposito, para que sea segura de re-aplicar y en
--  cualquier despliegue: solo actua si la cuenta vieja existe Y la nueva no.
-- ============================================================

UPDATE clasificacion.usuario
   SET usuario = 'analista@sena.edu.co',
       correo  = 'analista@sena.edu.co'
 WHERE usuario = 'prueba.analista@sena.edu.co'
   AND NOT EXISTS (
     SELECT 1
       FROM clasificacion.usuario u2
      WHERE u2.usuario = 'analista@sena.edu.co'
   );
