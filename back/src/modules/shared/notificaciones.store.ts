import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface NotificacionItem {
  id: string;
  idUsuario?: number | null;
  rolDestino?: 'EXPERTO' | 'ANALISTA' | 'ADMINISTRADOR' | 'ALL';
  titulo: string;
  mensaje: string;
  tipoEvento: 'INSTRUMENTO2_ENVIADO' | 'VALIDACION_EXPERTA_COMPLETADA' | 'INSTRUMENTO3_ENVIADO';
  idInstrumento?: number | string | null;
  ruta?: string;
  leida: boolean;
  fechaCreacion: string;
}

class NotificacionesStore {
  private readonly logger = new Logger(NotificacionesStore.name);
  private notificaciones: NotificacionItem[] = [];
  private dataSource: DataSource | null = null;
  private tableInitialized = false;

  setDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource;
  }

  async ensureTable(): Promise<void> {
    if (this.tableInitialized || !this.dataSource || !this.dataSource.isInitialized) {
      return;
    }
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS clasificacion.notificacion (
          id VARCHAR(64) PRIMARY KEY,
          id_usuario INT NULL,
          rol_destino VARCHAR(50) NULL,
          titulo VARCHAR(255) NOT NULL,
          mensaje TEXT NOT NULL,
          tipo_evento VARCHAR(100) NOT NULL,
          id_instrumento INT NULL,
          ruta VARCHAR(255) NULL,
          leida BOOLEAN NOT NULL DEFAULT FALSE,
          fecha_creacion TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          -- Igual que la migración 020: si el backend arranca antes de migrar,
          -- esta tabla ya existe y la 020 (IF NOT EXISTS) no le agregaba la FK.
          CONSTRAINT fk_notificacion_usuario FOREIGN KEY (id_usuario)
            REFERENCES clasificacion.usuario(idusuario) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_notif_usuario ON clasificacion.notificacion(id_usuario);
        CREATE INDEX IF NOT EXISTS idx_notif_rol ON clasificacion.notificacion(rol_destino);
        CREATE INDEX IF NOT EXISTS idx_notif_fecha ON clasificacion.notificacion(fecha_creacion DESC);
      `);
      this.tableInitialized = true;
      this.logger.log('Tabla clasificacion.notificacion verificada/inicializada en PostgreSQL');
    } catch (err: any) {
      this.logger.error('Error al asegurar tabla de notificaciones:', err.message);
    }
  }

  agregar(
    data: Omit<NotificacionItem, 'id' | 'leida' | 'fechaCreacion'>,
  ): NotificacionItem {
    const item: NotificacionItem = {
      ...data,
      id: `notif_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      leida: false,
      fechaCreacion: new Date().toISOString(),
    };

    // Almacenar en caché local en memoria para respuesta instantánea
    this.notificaciones.unshift(item);
    if (this.notificaciones.length > 150) {
      this.notificaciones = this.notificaciones.slice(0, 150);
    }

    // Persistir directamente en base de datos PostgreSQL
    if (this.dataSource && this.dataSource.isInitialized) {
      this.dataSource.query(
        `INSERT INTO clasificacion.notificacion (
          id, id_usuario, rol_destino, titulo, mensaje, tipo_evento, id_instrumento, ruta, leida, fecha_creacion
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO NOTHING`,
        [
          item.id,
          item.idUsuario !== undefined && item.idUsuario !== null ? Number(item.idUsuario) : null,
          item.rolDestino ?? null,
          item.titulo,
          item.mensaje,
          item.tipoEvento,
          item.idInstrumento !== undefined && item.idInstrumento !== null ? Number(item.idInstrumento) : null,
          item.ruta ?? null,
          item.leida,
          new Date(item.fechaCreacion),
        ]
      ).catch((err: any) => {
        this.logger.error(`Error al persistir notificación ${item.id} en BD: ${err.message}`);
      });
    }

    return item;
  }

  async obtenerParaUsuario(idUsuario?: number, rol?: string): Promise<NotificacionItem[]> {
    const rolNorm = (rol || '').toUpperCase();

    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        let sql = `
          SELECT 
            id, 
            id_usuario as "idUsuario", 
            rol_destino as "rolDestino", 
            titulo, 
            mensaje, 
            tipo_evento as "tipoEvento", 
            id_instrumento as "idInstrumento", 
            ruta, 
            leida, 
            fecha_creacion as "fechaCreacion"
          FROM clasificacion.notificacion
          WHERE titulo != 'Nueva propuesta Instrumento 3'
        `;
        const params: any[] = [];

        if (rolNorm !== 'ADMINISTRADOR') {
          params.push(rolNorm);
          if (idUsuario) {
            params.push(Number(idUsuario));
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL' OR id_usuario = $2)`;
          } else {
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL')`;
          }
        }

        sql += ` ORDER BY fecha_creacion DESC LIMIT 150`;
        const rows = await this.dataSource.query(sql, params);

        return rows.map((r: any) => ({
          ...r,
          fechaCreacion: r.fechaCreacion instanceof Date ? r.fechaCreacion.toISOString() : String(r.fechaCreacion),
        }));
      } catch (err: any) {
        this.logger.error(`Error leyendo notificaciones de BD: ${err.message}`);
      }
    }

    // Fallback memoria
    const activas = this.notificaciones.filter((n) => n.titulo !== 'Nueva propuesta Instrumento 3');
    if (rolNorm === 'ADMINISTRADOR') {
      return activas;
    }

    return activas.filter((n) => {
      if (n.idUsuario !== undefined && n.idUsuario !== null) {
        return (
          idUsuario !== undefined &&
          idUsuario !== null &&
          Number(n.idUsuario) === Number(idUsuario)
        );
      }
      if (n.rolDestino) {
        return n.rolDestino === rolNorm || n.rolDestino === 'ALL';
      }
      return false;
    });
  }

  async marcarLeida(id: string): Promise<boolean> {
    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        await this.dataSource.query(
          `UPDATE clasificacion.notificacion SET leida = TRUE WHERE id = $1`,
          [id]
        );
      } catch (err: any) {
        this.logger.error(`Error marcando leída en BD: ${err.message}`);
      }
    }

    const item = this.notificaciones.find((n) => n.id === id);
    if (item) {
      item.leida = true;
      return true;
    }
    return true;
  }

  async marcarTodasLeidas(idUsuario?: number, rol?: string): Promise<number> {
    const rolNorm = (rol || '').toUpperCase();

    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        let sql = `UPDATE clasificacion.notificacion SET leida = TRUE WHERE leida = FALSE`;
        const params: any[] = [];

        if (rolNorm !== 'ADMINISTRADOR') {
          params.push(rolNorm);
          if (idUsuario) {
            params.push(Number(idUsuario));
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL' OR id_usuario = $2)`;
          } else {
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL')`;
          }
        }

        const res = await this.dataSource.query(sql, params);
        return res?.[1] || 0;
      } catch (err: any) {
        this.logger.error(`Error marcando todas leídas en BD: ${err.message}`);
      }
    }

    const items = await this.obtenerParaUsuario(idUsuario, rol);
    let count = 0;
    for (const item of items) {
      if (!item.leida) {
        item.leida = true;
        count++;
      }
    }
    return count;
  }

  async conteoNoLeidas(idUsuario?: number, rol?: string): Promise<number> {
    const rolNorm = (rol || '').toUpperCase();

    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        let sql = `
          SELECT COUNT(*)::int as count 
          FROM clasificacion.notificacion 
          WHERE leida = FALSE AND titulo != 'Nueva propuesta Instrumento 3'
        `;
        const params: any[] = [];

        if (rolNorm !== 'ADMINISTRADOR') {
          params.push(rolNorm);
          if (idUsuario) {
            params.push(Number(idUsuario));
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL' OR id_usuario = $2)`;
          } else {
            sql += ` AND (rol_destino = $1 OR rol_destino = 'ALL')`;
          }
        }

        const res = await this.dataSource.query(sql, params);
        return res[0]?.count || 0;
      } catch (err: any) {
        this.logger.error(`Error contando no leídas en BD: ${err.message}`);
      }
    }

    const items = await this.obtenerParaUsuario(idUsuario, rol);
    return items.filter((n) => !n.leida).length;
  }
}

export const notificacionesStore = new NotificacionesStore();
