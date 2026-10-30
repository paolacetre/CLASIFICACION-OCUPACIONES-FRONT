import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot() {
    return { message: 'API Clasificación CUOC está funcionando correctamente.' };
  }
}
