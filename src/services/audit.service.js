/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const { getRepository } = require('../orm/repositories/repository-factory');
const AuditLog = require('../orm/entities/audit-log.entity');
const User = require('../orm/entities/user.entity');

/**
 * log() — Registra una entrada de auditoría
 */
async function log(audit) {
  try {
    const auditRepo = await getRepository(AuditLog);
    await auditRepo.insert({
      user_id: audit.user_id || null,
      action_type: audit.action_type || '',
      target_type: audit.target_type || '',
      target_id: audit.target_id || null,
      target_code: audit.target_code || null,
      description: audit.description || null,
      old_value: audit.old_value ? JSON.stringify(audit.old_value) : null,
      new_value: audit.new_value ? JSON.stringify(audit.new_value) : null,
      ip_address: audit.ip_address || null,
    });
  } catch (err) {
    console.error('Error al registrar auditoría:', err);
  }
}

async function logAsync(audit) {
  return log(audit);
}

/**
 * list() — Lista registros de auditoría con filtros
 */
async function list(options = {}) {
  try {
    const auditRepo = await getRepository(AuditLog);
    const userRepo = await getRepository(User);

    // Construir query con filtros
    let query = auditRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect(
        User,
        'u',
        'a.user_id = u.id',
        { alias: 'user' }
      )
      .orderBy('a.created_at', 'DESC');

    // Aplicar filtros
    if (options.user_id) {
      query = query.andWhere('a.user_id = :user_id', { user_id: options.user_id });
    }
    if (options.action_type) {
      query = query.andWhere('a.action_type = :action_type', { action_type: options.action_type });
    }
    if (options.target_type) {
      query = query.andWhere('a.target_type = :target_type', { target_type: options.target_type });
    }
    if (options.search) {
      query = query.andWhere('a.target_code LIKE :search OR a.description LIKE :search', {
        search: `%${options.search}%`,
      });
    }
    if (options.date_from) {
      query = query.andWhere('CAST(a.created_at AS DATE) >= :date_from', {
        date_from: options.date_from,
      });
    }
    if (options.date_to) {
      query = query.andWhere('CAST(a.created_at AS DATE) <= :date_to', {
        date_to: options.date_to,
      });
    }

    // Paginación
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 50));
    const skip = (page - 1) * limit;

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    // Mapear datos
    const result = data.map((record) => {
      let oldValue = record.old_value;
      let newValue = record.new_value;
      if (typeof oldValue === 'string' && oldValue) {
        try {
          oldValue = JSON.parse(oldValue);
        } catch (_) {}
      }
      if (typeof newValue === 'string' && newValue) {
        try {
          newValue = JSON.parse(newValue);
        } catch (_) {}
      }
      return {
        id: record.id,
        user_id: record.user_id,
        user_name: record.user ? record.user.full_name || record.user.username : null,
        action_type: record.action_type,
        target_type: record.target_type,
        target_id: record.target_id,
        target_code: record.target_code,
        description: record.description,
        old_value: oldValue,
        new_value: newValue,
        created_at: record.created_at,
      };
    });

    // Calcular métricas
    const mostFrequentAction = data.length > 0
      ? data.reduce((acc, curr) => {
          acc[curr.action_type] = (acc[curr.action_type] || 0) + 1;
          return acc;
        }, {})
      : {};
    const mostFrequentActionType = Object.entries(mostFrequentAction).sort((a, b) => b[1] - a[1])[0];

    return {
      data: result,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      mostFrequentAction: mostFrequentActionType ? mostFrequentActionType[0] : null,
      activeUserCount: [...new Set(data.map((d) => d.user_id))].length,
    };
  } catch (err) {
    console.error('Error al listar auditoría:', err);
    throw err;
  }
}

/**
 * getActionTypes() — Retorna tipos de acción únicos registrados
 */
async function getActionTypes() {
  try {
    const auditRepo = await getRepository(AuditLog);
    const results = await auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.action_type', 'action_type')
      .orderBy('a.action_type', 'ASC')
      .getRawMany();

    return results.map((r) => r.action_type);
  } catch (err) {
    console.error('Error al obtener tipos de acción:', err);
    return [];
  }
}

/**
 * getActiveUsers() — Retorna usuarios que tienen registros en auditoría
 */
async function getActiveUsers() {
  try {
    const auditRepo = await getRepository(AuditLog);
    const userRepo = await getRepository(User);

    // Obtener IDs únicos de usuarios en auditoría
    const results = await auditRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.user_id', 'user_id')
      .where('a.user_id IS NOT NULL')
      .getRawMany();

    const userIds = results.map((r) => r.user_id).filter(Boolean);

    if (userIds.length === 0) return [];

    // Obtener datos de usuarios
    const users = await userRepo.find({
      where: userIds.map((id) => ({ id })),
    });

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      full_name: u.full_name,
      email: u.email,
    }));
  } catch (err) {
    console.error('Error al obtener usuarios activos en auditoría:', err);
    return [];
  }
}

module.exports = { log, logAsync, list, getActionTypes, getActiveUsers };
