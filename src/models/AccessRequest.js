const database = require('../database/connection');

class AccessRequest {
  // Создание запроса на доступ
  static async create(userId) {
    try {
      const result = await database.insert('access_requests', {
        user_id: userId,
        status: 'pending',
        created_at: new Date()
      });
      
      return result.insertId;
    } catch (error) {
      console.error('Ошибка при создании запроса на доступ:', error);
      throw error;
    }
  }

  // Поиск запроса по ID
  static async findById(id) {
    try {
      return await database.get(`
        SELECT ar.*, u.telegram_id, u.first_name, u.last_name, u.username
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        WHERE ar.id = ?
      `, [id]);
    } catch (error) {
      console.error('Ошибка при поиске запроса по ID:', error);
      throw error;
    }
  }

  // Поиск запроса по ID пользователя
  static async findByUserId(userId) {
    try {
      return await database.get(
        'SELECT * FROM access_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1',
        [userId]
      );
    } catch (error) {
      console.error('Ошибка при поиске запроса по ID пользователя:', error);
      throw error;
    }
  }

  // Получение всех ожидающих запросов
  static async findPending(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT ar.*, u.telegram_id, u.first_name, u.last_name, u.username
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        WHERE ar.status = 'pending'
        ORDER BY ar.created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении ожидающих запросов:', error);
      throw error;
    }
  }

  // Получение всех запросов
  static async findAll(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT ar.*, u.telegram_id, u.first_name, u.last_name, u.username
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        ORDER BY ar.created_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении всех запросов:', error);
      throw error;
    }
  }

  // Обновление запроса
  static async update(id, updates) {
    try {
      await database.update('access_requests',
        { id },
        updates
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении запроса:', error);
      throw error;
    }
  }

  // Одобрение запроса
  static async approve(id, adminId) {
    try {
      await database.update('access_requests',
        { id },
        {
          status: 'approved',
          admin_id: adminId,
          decision_date: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при одобрении запроса:', error);
      throw error;
    }
  }

  // Отклонение запроса
  static async reject(id, adminId) {
    try {
      await database.update('access_requests',
        { id },
        {
          status: 'rejected',
          admin_id: adminId,
          decision_date: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при отклонении запроса:', error);
      throw error;
    }
  }

  // Удаление запроса
  static async delete(id) {
    try {
      await database.execute('DELETE FROM access_requests WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении запроса:', error);
      throw error;
    }
  }

  // Подсчет запросов по статусу
  static async countByStatus(status) {
    try {
      const result = await database.get(
        'SELECT COUNT(*) as count FROM access_requests WHERE status = ?',
        [status]
      );
      
      return result.count;
    } catch (error) {
      console.error('Ошибка при подсчете запросов по статусу:', error);
      throw error;
    }
  }

  // Получение статистики запросов
  static async getStats() {
    try {
      const stats = await database.query(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(decision_date, NOW()))) as avg_decision_hours
        FROM access_requests
      `);
      
      return stats[0] || {};
    } catch (error) {
      console.error('Ошибка при получении статистики запросов:', error);
      throw error;
    }
  }

  // Получение недавних решений
  static async getRecentDecisions(limit = 10) {
    try {
      return await database.query(`
        SELECT ar.*, u.first_name, u.last_name, u.username, 
               a.first_name as admin_first_name, a.last_name as admin_last_name
        FROM access_requests ar
        JOIN users u ON ar.user_id = u.id
        LEFT JOIN users a ON ar.admin_id = a.id
        WHERE ar.status IN ('approved', 'rejected')
          AND ar.decision_date IS NOT NULL
        ORDER BY ar.decision_date DESC
        LIMIT ?
      `, [limit]);
    } catch (error) {
      console.error('Ошибка при получении недавних решений:', error);
      throw error;
    }
  }

  // Проверка, есть ли ожидающий запрос у пользователя
  static async hasPendingRequest(userId) {
    try {
      const request = await database.get(
        'SELECT id FROM access_requests WHERE user_id = ? AND status = "pending"',
        [userId]
      );
      
      return !!request;
    } catch (error) {
      console.error('Ошибка при проверке ожидающего запроса:', error);
      throw error;
    }
  }

  // Получение истории запросов пользователя
  static async getUserHistory(userId, limit = 10) {
    try {
      return await database.query(`
        SELECT ar.*, a.first_name as admin_first_name, a.last_name as admin_last_name
        FROM access_requests ar
        LEFT JOIN users a ON ar.admin_id = a.id
        WHERE ar.user_id = ?
        ORDER BY ar.created_at DESC
        LIMIT ?
      `, [userId, limit]);
    } catch (error) {
      console.error('Ошибка при получении истории запросов пользователя:', error);
      throw error;
    }
  }
}

module.exports = AccessRequest;