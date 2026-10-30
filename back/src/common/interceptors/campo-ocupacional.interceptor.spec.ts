import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { Role } from '../enums/role.enum';
import { CampoOcupacionalInterceptor } from './campo-ocupacional.interceptor';

function contexto(rol: Role | undefined): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user: rol ? { rol } : undefined }) }),
  } as unknown as ExecutionContext;
}

const respuesta = {
  data: [{ codigo: '0011', campoOcupCno: '001', descCampoOcupCno: 'Dirección pública y privada', nombre: 'X' }],
};

describe('CampoOcupacionalInterceptor', () => {
  const interceptor = new CampoOcupacionalInterceptor();

  it('quita el código y la descripción del campo ocupacional a quien no es APE', async () => {
    const out = await lastValueFrom(interceptor.intercept(contexto(Role.ANALISTA), { handle: () => of(respuesta) }));
    expect(out).toEqual({ data: [{ codigo: '0011', nombre: 'X' }] });
    // No muta el original (puede estar en la caché).
    expect(respuesta.data[0].descCampoOcupCno).toBe('Dirección pública y privada');
  });

  it('deja ambos datos para usuarios APE', async () => {
    const out = await lastValueFrom(interceptor.intercept(contexto(Role.APE), { handle: () => of(respuesta) }));
    expect(out).toBe(respuesta);
  });
});
