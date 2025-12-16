const database = require('../database/connection');

class User {
  // Создание пользователя
  static async create(userData) {
    try {
      const result = await database.insert('users', {
        telegram_id: userData.telegram_id,
        username: userData.username || null,
        first_name: userData.first_name,
        last_name: userData.last_name || null,
        is_active: userData.is_active || false,
        is_admin: userData.is_admin || false,
        notifications_enabled: userData.notifications_enabled !== false,
        language: userData.language || null,
        timezone: userData.timezone || null,
        created_at: new Date()
      });
      
      return result.insertId;
    } catch (error) {
      console.error('Ошибка при создании пользователя:', error);
      throw error;
    }
  }

  // Поиск пользователя по Telegram ID
  static async findByTelegramId(telegramId) {
    try {
      return await database.get(
        'SELECT * FROM users WHERE telegram_id = ?',
        [telegramId]
      );
    } catch (error) {
      console.error('Ошибка при поиске пользователя:', error);
      throw error;
    }
  }

  // Поиск пользователя по ID
  static async findById(id) {
    try {
      return await database.get(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('Ошибка при поиске пользователя по ID:', error);
      throw error;
    }
  }

  // Обновление пользователя
  static async update(id, updates) {
    try {
      await database.update('users',
        { id },
        {
          ...updates,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении пользователя:', error);
      throw error;
    }
  }

  // Удаление пользователя
  static async delete(id) {
    try {
      await database.execute('DELETE FROM users WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении пользователя:', error);
      throw error;
    }
  }

  // Получение всех пользователей
  static async findAll(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM users 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении пользователей:', error);
      throw error;
    }
  }

  // Получение активных пользователей
  static async findActive(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM users 
        WHERE is_active = TRUE 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении активных пользователей:', error);
      throw error;
    }
  }

  // Получение администраторов
  static async findAdmins() {
    try {
      return await database.query(
        'SELECT * FROM users WHERE is_admin = TRUE'
      );
    } catch (error) {
      console.error('Ошибка при получении администраторов:', error);
      throw error;
    }
  }

  // Подсчет пользователей
  static async count(where = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
      const params = [];
      
      if (where.is_active !== undefined) {
        query += ' AND is_active = ?';
        params.push(where.is_active);
      }
      
      if (where.is_admin !== undefined) {
        query += ' AND is_admin = ?';
        params.push(where.is_admin);
      }
      
      const result = await database.get(query, params);
      return result.count;
    } catch (error) {
      console.error('Ошибка при подсчете пользователей:', error);
      throw error;
    }
  }

  // Получение статистики пользователя
  static async getUserStats(userId) {
    try {
      const stats = await database.query(`
        SELECT 
          (SELECT COUNT(*) FROM parcels WHERE user_id = ?) as total_parcels,
          (SELECT COUNT(*) FROM parcels WHERE user_id = ? AND status = 'received') as received_parcels,
          (SELECT COUNT(*) FROM access_requests WHERE user_id = ?) as total_requests,
          (SELECT MAX(created_at) FROM parcels WHERE user_id = ?) as last_parcel_date
      `, [userId, userId, userId, userId]);
      
      return stats[0] || {};
    } catch (error) {
      console.error('Ошибка при получении статистики пользователя:', error);
      throw error;
    }
  }

  // Активация пользователя
  static async activateUser(id) {
    try {
      await database.update('users',
        { id },
        {
          is_active: true,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при активации пользователя:', error);
      throw error;
    }
  }

  // Деактивация пользователя
  static async deactivateUser(id) {
    try {
      await database.update('users',
        { id },
        {
          is_active: false,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при деактивации пользователя:', error);
      throw error;
    }
  }

  // Назначение администратором
  static async makeAdmin(id) {
    try {
      await database.update('users',
        { id },
        {
          is_admin: true,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при назначении администратором:', error);
      throw error;
    }
  }

  // Снятие прав администратора
  static async removeAdmin(id) {
    try {
      await database.update('users',
        { id },
        {
          is_admin: false,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при снятии прав администратора:', error);
      throw error;
    }
  }

  // Поиск пользователей по имени или username
  static async search(query, limit = 20) {
    try {
      const searchTerm = `%${query}%`;
      
      return await database.query(`
        SELECT * FROM users 
        WHERE first_name LIKE ? 
           OR last_name LIKE ? 
           OR username LIKE ?
        ORDER BY created_at DESC 
        LIMIT ?
      `, [searchTerm, searchTerm, searchTerm, limit]);
    } catch (error) {
      console.error('Ошибка при поиске пользователей:', error);
      throw error;
    }
  }

  // Получение последних активных пользователей
  static async getRecentlyActive(days = 7, limit = 20) {
    try {
      return await database.query(`
        SELECT * FROM users 
        WHERE updated_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        ORDER BY updated_at DESC 
        LIMIT ?
      `, [days, limit]);
    } catch (error) {
      console.error('Ошибка при получении недавно активных пользователей:', error);
      throw error;
    }
  }
}

module.exports = User;