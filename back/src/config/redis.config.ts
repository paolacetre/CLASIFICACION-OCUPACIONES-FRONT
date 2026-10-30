import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => ({
  enabled: process.env.CACHE_ENABLED !== 'false',
  // 127.0.0.1 y no 'localhost': en Windows 'localhost' puede resolver primero a
  // ::1 (IPv6) y el contenedor solo publica Redis en la interfaz IPv4 local.
  host: process.env.REDIS_HOST || '127.0.0.1',
  // En Docker llega REDIS_PORT=6379 (red interna); en local, el puerto publicado en el host.
  port: parseInt(process.env.REDIS_PORT || process.env.REDIS_PORT_HOST, 10) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'clasificacion:',
  ttlSeconds: parseInt(process.env.CACHE_TTL_SECONDS, 10) || 600,
}));
