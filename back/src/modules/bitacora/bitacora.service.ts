import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bitacora } from './entities/bitacora.entity';

export interface RegistrarBitacoraParams {
  idUsuario: number;
  tipo: string;
  titulo: string;
  detalle?: string | null;
}

@Injectable()
export class BitacoraService {
  private readonly logger = new Logger(BitacoraService.name);

  constructor(
    @InjectRepository(Bitacora)
    private readonly bitacoraRepo: Repository<Bitacora>,
  ) {}

  /**
   * Registra una acción. Nunca debe tumbar la acción real que la origina: un
   * fallo al escribir la bitácora se loguea y se traga, no se propaga.
   */
  async registrar(params: RegistrarBitacoraParams): Promise<void> {
    try {
      const fila = this.bitacoraRepo.create({
        usuario: { idUsuario: params.idUsuario } as any,
        tipo: params.tipo,
        titulo: params.titulo,
        detalle: params.detalle ?? null,
        fecha: new Date(),
      });
      await this.bitacoraRepo.save(fila);
    } catch (err) {
      this.logger.error(`No se pudo registrar en bitácora (${params.tipo}): ${err.message}`);
    }
  }

  /** Actividad reciente del usuario en sesión, más nueva primero. */
  async listarRecientes(idUsuario: number, limit = 20): Promise<Bitacora[]> {
    return this.bitacoraRepo.find({
      where: { usuario: { idUsuario } as any },
      order: { fecha: 'DESC' },
      take: limit,
    });
  }
}
