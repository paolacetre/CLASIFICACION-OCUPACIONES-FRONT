import { registerAs } from '@nestjs/config';


export default registerAs('database', () => ({
  type: 'postgres' as const,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_DATABASE || 'clasificacion',
  autoLoadEntities: true,
  synchronize: process.env.DB_SYNCHRONIZE === 'true',
  // SSL solo para Postgres gestionado/remoto; en local y en Docker se deshabilita
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  extra: {
    // Las tablas viven en el schema "clasificacion", no en "public"
    options: '-c search_path=clasificacion,public',
    // Default de `pg` es 10; la carga masiva de CNO/CUOC dispara hasta 50 operaciones
    // concurrentes por lote (ver processInChunks) y con el default esas 40 de mas quedaban
    // en cola esperando conexion, alargando la carga y la ventana de condiciones de carrera.
    max: parseInt(process.env.DB_POOL_MAX, 10) || 20,
  },
  // Logging de SQL desactivado (o solo errores) para evitar saturar la consola con cada consulta
  logging: ['error'],
}));
