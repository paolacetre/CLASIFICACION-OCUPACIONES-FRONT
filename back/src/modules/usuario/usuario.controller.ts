import { Controller, Post, Body, Get, Patch, Delete, Param, Query, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, UseGuards, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsuarioService } from './usuario.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/interfaces/jwt-payload.interface';
import { Role } from '../../common/enums/role.enum';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { notificacionesStore } from '../shared/notificaciones.store';
import { OPCIONES_MULTER_EXCEL, exigirArchivoExcel } from '../../common/utils/excel-archivo.util';
import { enviarPlantilla } from '../../common/utils/plantilla-excel.util';
import { PLANTILLA_USUARIOS } from './usuario-plantilla.config';

@ApiTags('Usuario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuario')
export class UsuarioController {
  constructor(private readonly usuarioService: UsuarioService) {}

  @Post()
  @Roles(Role.ADMINISTRADOR, Role.ANALISTA)
  @ApiOperation({
    summary: 'Crear un nuevo usuario',
    description: 'La cédula es obligatoria y es la contraseña inicial: el usuario debe cambiarla en su primer ingreso.',
  })
  @ApiBody({ type: CreateUsuarioDto })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos, rol inválido, o correo o cédula ya registrados' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador' })
  async create(@Body() createUsuarioDto: CreateUsuarioDto) {
    return this.usuarioService.create(createUsuarioDto);
  }

  @Get('plantilla')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Descarga la plantilla Excel para importar usuarios (solo Administrador)' })
  descargarPlantilla(@Res() res: Response): void {
    enviarPlantilla(res, [PLANTILLA_USUARIOS], 'Plantilla_Usuarios.xlsx');
  }

  @Post('upload-excel')
  @Roles(Role.ADMINISTRADOR)
  @UseInterceptors(FileInterceptor('file', OPCIONES_MULTER_EXCEL))
  @ApiOperation({ summary: 'Importar usuarios desde Excel (solo Administrador)' })
  @ApiResponse({ status: 201, description: 'Usuarios procesados' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador' })
  async uploadExcel(@UploadedFile() file: Express.Multer.File) {
    exigirArchivoExcel(file);
    return this.usuarioService.uploadExcel(file.buffer);
  }

  @Post('import-batch')
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({
    summary: 'Importar lote de usuarios con roles asignados (solo Administrador)',
    description:
      'Cada fila necesita un correo válido y su cédula (`documento`). La contraseña no se envía: ' +
      'la inicial es la cédula y el usuario debe cambiarla en su primer ingreso.',
  })
  @ApiResponse({ status: 201, description: 'Usuarios importados exitosamente' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador' })
  async importBatch(@Body() body: { usuarios: any[] }) {
    if (!body || !Array.isArray(body.usuarios)) {
      throw new BadRequestException('Se requiere un arreglo de usuarios en la propiedad "usuarios"');
    }
    return this.usuarioService.importBatch(body.usuarios);
  }

  @Get()
  @Roles(Role.ADMINISTRADOR)
  @ApiOperation({ summary: 'Listar todos los usuarios (solo Administrador)' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador' })
  async findAll(@Query('origen') origen?: string) {
    return this.usuarioService.findAll(origen);
  }

  @Get('notificaciones')
  @ApiOperation({ summary: 'Listar notificaciones del usuario en sesión' })
  async getNotificaciones(@CurrentUser() user: AuthenticatedUser) {
    const list = await notificacionesStore.obtenerParaUsuario(user?.idUsuario, user?.rol);
    const unreadCount = await notificacionesStore.conteoNoLeidas(user?.idUsuario, user?.rol);
    return {
      total: list.length,
      unreadCount,
      notificaciones: list,
    };
  }

  @Patch('notificaciones/:id/leida')
  @ApiOperation({ summary: 'Marcar una notificación como leída' })
  async marcarNotificacionLeida(@Param('id') id: string) {
    const ok = await notificacionesStore.marcarLeida(id);
    return { success: ok };
  }

  @Patch('notificaciones/marcar-todas')
  @ApiOperation({ summary: 'Marcar todas las notificaciones del usuario como leídas' })
  async marcarTodasNotificacionesLeidas(@CurrentUser() user: AuthenticatedUser) {
    const count = await notificacionesStore.marcarTodasLeidas(user?.idUsuario, user?.rol);
    return { success: true, count };
  }

  @Get(':id')
  @Roles(Role.ADMINISTRADOR, Role.ANALISTA)
  @ApiOperation({ summary: 'Obtener un usuario por ID' })
  @ApiParam({ name: 'id', example: 1, description: 'ID numérico del usuario' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id') id: string) {
    return this.usuarioService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar un usuario (Administrador, Analista o el propio usuario para sus datos)' })
  @ApiParam({ name: 'id', example: 1, description: 'ID numérico del usuario' })
  @ApiBody({ type: UpdateUsuarioDto })
  @ApiResponse({ status: 200, description: 'Usuario actualizado' })
  @ApiResponse({ status: 403, description: 'No tienes permisos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async update(
    @Param('id') id: string,
    @Body() updateUsuarioDto: UpdateUsuarioDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const targetId = +id;
    const canManage = user?.rol === Role.ADMINISTRADOR || user?.rol === Role.ANALISTA;
    const isSelf = user?.idUsuario === targetId;

    if (!canManage && !isSelf) {
      throw new ForbiddenException('No tienes permisos para modificar otros usuarios');
    }

    if (!canManage) {
      if (updateUsuarioDto.rol !== undefined) {
        throw new ForbiddenException('Solo el administrador o analista puede cambiar roles');
      }
      if (updateUsuarioDto.estado !== undefined) {
        throw new ForbiddenException('Solo el administrador o analista puede cambiar el estado de la cuenta');
      }
    }

    return this.usuarioService.update(targetId, updateUsuarioDto);
  }

  @Delete(':id')
  @Roles(Role.ADMINISTRADOR, Role.ANALISTA)
  @ApiOperation({ summary: 'Eliminación lógica de un usuario' })
  @ApiParam({ name: 'id', example: 1, description: 'ID numérico del usuario a desactivar' })
  @ApiResponse({ status: 200, description: 'Usuario desactivado (no se borra físicamente)' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(@Param('id') id: string) {
    return this.usuarioService.remove(+id);
  }
}
