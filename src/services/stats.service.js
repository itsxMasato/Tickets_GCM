/* Documentado por Miguel Flores. Marca de agua: sistema desarrollado por Miguel Flores. */
'use strict';
const { getRepository } = require('../orm/repositories/repository-factory');
const Ticket = require('../orm/entities/ticket.entity');
const Category = require('../orm/entities/category.entity');
const User = require('../orm/entities/user.entity');

/**
 * dashboard() — Estadísticas globales (solo SAC)
 * Retorna totales, distribución por estatus/prioridad/área, últimos 30 días, top categorías
 */
async function dashboard() {
  try {
    const ticketRepo = await getRepository(Ticket);
    const categoryRepo = await getRepository(Category);

    // Obtener todos los tickets
    const tickets = await ticketRepo.find();

    // Totales
    const totals = {
      total: tickets.length,
      open: tickets.filter((t) => t.status !== 'cerrado').length,
      closed: tickets.filter((t) => t.status === 'cerrado').length,
      recibido: tickets.filter((t) => t.status === 'recibido').length,
      asignado: tickets.filter((t) => t.status === 'asignado').length,
      en_proceso: tickets.filter((t) => t.status === 'en_proceso').length,
      solucionado: tickets.filter((t) => t.status === 'solucionado').length,
      reabierto: tickets.filter((t) => t.status === 'reabierto').length,
      urgent: tickets.filter((t) => t.priority === 'urgente').length,
    };

    // Por estado
    const byStatus = Object.entries(
      tickets.reduce((acc, t) => {
        acc[t.status] = (acc[t.status] || 0) + 1;
        return acc;
      }, {})
    ).map(([status, c]) => ({ status, c }));

    // Por prioridad
    const byPriority = Object.entries(
      tickets.reduce((acc, t) => {
        acc[t.priority] = (acc[t.priority] || 0) + 1;
        return acc;
      }, {})
    ).map(([priority, c]) => ({ priority, c }));

    // Por área
    const byArea = Object.entries(
      tickets.reduce((acc, t) => {
        const area = t.area || 'sin_area';
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      }, {})
    ).map(([area, c]) => ({ area, c }));

    // Promedio de resolución
    const closedTickets = tickets.filter((t) => t.closed_at);
    const avgHours = closedTickets.length
      ? closedTickets.reduce((sum, t) => {
          const created = new Date(t.created_at);
          const closed = new Date(t.closed_at);
          return sum + (closed - created) / 36e5;
        }, 0) / closedTickets.length
      : 0;

    // Últimos 30 días
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const last30 = {};
    tickets
      .filter((t) => new Date(t.created_at) >= thirtyDaysAgo)
      .forEach((t) => {
        const day = t.created_at.toISOString().split('T')[0];
        last30[day] = (last30[day] || 0) + 1;
      });
    const last30Days = Object.entries(last30)
      .map(([day, c]) => ({ day, c }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Top categorías
    const topCategoriesList = Object.entries(
      tickets.reduce((acc, t) => {
        const catId = String(t.category_id || '');
        if (catId) acc[catId] = (acc[catId] || 0) + 1;
        return acc;
      }, {})
    )
      .map(([catId, c]) => ({ categoryId: catId, c }))
      .sort((a, b) => b.c - a.c)
      .slice(0, 5);

    // Mapear IDs a nombres de categorías
    const allCategories = await categoryRepo.find();
    const categoryMap = Object.fromEntries(
      allCategories.map((cat) => [String(cat.id), cat.name])
    );
    const topCategoryRows = topCategoriesList.map((item) => ({
      id: parseInt(item.categoryId, 10) || null,
      name: categoryMap[item.categoryId] || null,
      c: item.c,
    }));

    // Cerrados hoy
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const closedToday = tickets.filter(
      (t) => t.closed_at && new Date(t.closed_at) >= today && new Date(t.closed_at) < tomorrow
    ).length;

    totals.closed_today = closedToday;

    return {
      totals,
      avg_resolution_hours: Math.round(avgHours * 10) / 10,
      by_status: byStatus,
      by_priority: byPriority,
      by_area: byArea,
      last_30_days: last30Days,
      top_categories: topCategoryRows,
    };
  } catch (err) {
    console.error('Error en stats.dashboard():', err);
    throw err;
  }
}

/**
 * forUser() — Estadísticas para usuario (admin_area, supervisor, jefe_inmediato)
 */
async function forUser(userId, user) {
  try {
    const ticketRepo = await getRepository(Ticket);
    let filtered = [];

    if (user.role === 'admin_area') {
      // Tickets asignados a este usuario o creados por él
      filtered = await ticketRepo.find({
        where: [
          { assigned_to: userId },
          { created_by: userId },
        ],
      });

      const totals = {
        total: filtered.length,
        en_proceso: filtered.filter((t) => t.status === 'en_proceso').length,
        solucionado: filtered.filter((t) => t.status === 'solucionado').length,
        asignado: filtered.filter((t) => t.status === 'asignado').length,
        cerrado: filtered.filter((t) => t.status === 'cerrado').length,
        reabierto: filtered.filter((t) => t.status === 'reabierto').length,
      };

      const closedTickets = filtered.filter((t) => t.closed_at);
      const avgHours = closedTickets.length
        ? closedTickets.reduce((sum, t) => {
            const created = new Date(t.created_at);
            const closed = new Date(t.closed_at);
            return sum + (closed - created) / 36e5;
          }, 0) / closedTickets.length
        : 0;

      const byPriority = Object.entries(
        filtered.reduce((acc, t) => {
          acc[t.priority] = (acc[t.priority] || 0) + 1;
          return acc;
        }, {})
      ).map(([priority, c]) => ({ priority, c }));

      return { totals, avg_resolution_hours: Math.round(avgHours * 10) / 10, by_priority: byPriority };
    }

    if (user.role === 'supervisor_campo') {
      // Tickets creados por este usuario
      filtered = await ticketRepo.find({ where: { created_by: userId } });

      const totals = {
        total: filtered.length,
        open: filtered.filter((t) => t.status !== 'cerrado').length,
        closed: filtered.filter((t) => t.status === 'cerrado').length,
      };

      return { totals };
    }

    if (user.role === 'jefe_inmediato') {
      // Tickets del área del jefe
      filtered = await ticketRepo.find({ where: { area: user.area } });

      const totals = {
        total: filtered.length,
        open: filtered.filter((t) => t.status !== 'cerrado').length,
        closed: filtered.filter((t) => t.status === 'cerrado').length,
        solucionado: filtered.filter((t) => t.status === 'solucionado').length,
        reabierto: filtered.filter((t) => t.status === 'reabierto').length,
        por_cerrar: filtered.filter((t) => ['solucionado', 'reabierto'].includes(t.status)).length,
      };

      // Ranking por asignado
      const byAssignee = Object.entries(
        filtered.reduce((acc, t) => {
          if (t.assigned_to) {
            acc[t.assigned_to] = (acc[t.assigned_to] || 0) + 1;
          }
          return acc;
        }, {})
      )
        .map(([userId, c]) => ({ id: parseInt(userId, 10), c }))
        .sort((a, b) => b.c - a.c);

      // Obtener nombres de usuarios
      if (byAssignee.length > 0) {
        const userRepo = await getRepository(User);
        const userIds = byAssignee.map((item) => item.id);
        const users = await userRepo.findByIds(userIds);
        const userMap = Object.fromEntries(users.map((u) => [u.id, u.full_name || u.username]));
        return {
          totals,
          by_assignee: byAssignee.map((item) => ({
            ...item,
            full_name: userMap[item.id] || null,
          })),
        };
      }

      return { totals, by_assignee: [] };
    }

    return {};
  } catch (err) {
    console.error('Error en stats.forUser():', err);
    throw err;
  }
}

async function forSupervisor(userId) {
  return forUser(userId, { id: userId, role: 'supervisor_campo' });
}

async function forJefe(area) {
  return forUser(null, { role: 'jefe_inmediato', area });
}

module.exports = { dashboard, forUser, forSupervisor, forJefe };
