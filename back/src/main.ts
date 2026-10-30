import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { registrarApiKeysAlArrancar } from './modules/auth/api-key';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Orígenes del frontend que pueden llamar a la API con la cookie de sesión.
 * En producción el frontend y la API comparten origen (Nginx) y CORS no entra
 * en juego; esto cubre el desarrollo (ng serve en otro puerto) y cualquier
 * despliegue con dominios separados (CORS_ORIGINS=https://a,https://b).
 */
const ORIGENES_POR_DEFECTO = [
  'http://localhost:4200',
  'http://localhost:4201',
  'http://127.0.0.1:4200',
  'http://127.0.0.1:4201',
];

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const origenesPermitidos = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const origenes = origenesPermitidos.length > 0 ? origenesPermitidos : ORIGENES_POR_DEFECTO;

  // Con cookies, `origin: '*'` no sirve (el navegador lo rechaza) y además
  // dejaría a cualquier sitio leer respuestas autenticadas. La API pública sí
  // se abre a cualquier origen, pero sin credenciales: no depende de la sesión.
  app.enableCors((req: Request, callback: (err: Error | null, options: CorsOptions) => void) => {
    const publica = (req.url ?? '').startsWith('/api/public/');
    callback(null, publica ? { origin: '*', credentials: false } : { origin: origenes, credentials: true });
  });

  // El límite por defecto de Express (100 KB) no alcanza para el avatar y los
  // logos, que viajan como data URL dentro del JSON.
  app.useBodyParser('json', { limit: '5mb' });

  // Detrás de Nginx todas las peticiones llegan desde la IP del proxy: sin
  // esto, el límite por IP y el bloqueo por API keys inválidas tratarían a
  // todos los clientes como uno solo. Solo se activa con TRUST_PROXY=true
  // (docker-compose): sin proxy delante, un cliente podría falsear su IP con
  // la cabecera X-Forwarded-For.
  if (configService.get<string>('TRUST_PROXY') === 'true') {
    app.set('trust proxy', 1);
  }

  registrarApiKeysAlArrancar();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('API CLASIFICACIÓN')
    .setDescription('API para la gestión de clasificaciones ocupacionales CNO y CUOC')
    .setVersion('1.0')
    .addTag('Auth', 'Autenticación de usuarios (login y emisión de token)')
    .addTag('Usuario', 'Gestión de usuarios del sistema')
    .addTag('CNO - Ocupaciones', 'Gestión de ocupaciones de la Clasificación Nacional de Ocupaciones')
    .addTag('CNO - Denominaciones', 'Denominaciones asociadas a ocupaciones CNO')
    .addTag('CNO - Funciones', 'Funciones asociadas a ocupaciones CNO')
    .addTag('CNO - Catálogos', 'Catálogos de referencia CNO (funciones, áreas de desempeño, niveles de cualificación, conocimientos, habilidades)')
    .addTag('CNO - Carga Masiva', 'Carga masiva de ocupaciones CNO desde archivo Excel')
    .addTag('CUOC - Ocupaciones', 'Gestión de ocupaciones de la Clasificación Única de Ocupaciones para Colombia')
    .addTag('CUOC - Denominaciones', 'Denominaciones asociadas a ocupaciones CUOC')
    .addTag('CUOC - Funciones', 'Funciones asociadas a ocupaciones CUOC')
    .addTag('CUOC - Destrezas', 'Destrezas asociadas a ocupaciones CUOC')
    .addTag('CUOC - Conocimientos', 'Conocimientos asociados a ocupaciones CUOC')
    .addTag('CUOC - Áreas de Cualificación', 'Áreas de cualificación del sistema CUOC')
    .addTag('CUOC - Carga Masiva', 'Carga masiva de ocupaciones CUOC desde archivo Excel')
    .addTag('Correlativa', 'Correlativas entre ocupaciones CNO y CUOC')
    .addTag('Consulta - Búsqueda unificada CNO/CUOC', 'Búsqueda unificada de ocupaciones por código, detectando automáticamente CNO o CUOC')
    .addTag('Análisis', 'Comparación y análisis entre ocupaciones CNO y CUOC')
    .addTag('Mi cuenta', 'Perfil, preferencias y perfil de analista del usuario en sesión')
    .addTag('Configuración del sistema', 'Configuración global (logos institucionales)')
    .addTag('Solicitudes de ocupación', 'Solicitudes públicas de inclusión de nueva ocupación')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key', description: 'API key del sistema externo' }, 'api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = configService.get<number>('APP_PORT', 3000);
  await app.listen(port, '0.0.0.0');

  // Conexiones lentas (slowloris): quien no termina de enviar las cabeceras en
  // 20 s se desconecta (Node trae 60 s). El cuerpo sigue con el límite de Node
  // (300 s), que alcanza para subir un Excel de 50 MB.
  const servidor = app.getHttpServer();
  servidor.headersTimeout = 20_000;
  console.log(`Aplicación ejecutándose en: http://localhost:${port}`);
  console.log(`Swagger disponible en: http://localhost:${port}/api/docs`);
}
bootstrap();
