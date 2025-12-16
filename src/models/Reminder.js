const database = require('../database/connection');

class Reminder {
  // Создание напоминания
  static async create(reminderData) {
    try {
      const result = await database.insert('reminders', {
        parcel_id: reminderData.parcel_id,
        user_id: reminderData.user_id,
        reminder_date: reminderData.reminder_date,
        message: reminderData.message || null,
        is_sent: false,
        created_at: new Date()
      });
      
      return result.insertId;
    } catch (error) {
      console.error('Ошибка при создании напоминания:', error);
      throw error;
    }
  }

  // Поиск напоминания по ID
  static async findById(id) {
    try {
      return await database.get(`
        SELECT r.*, p.tracking_number, p.description, u.telegram_id, u.first_name
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.id = ?
      `, [id]);
    } catch (error) {
      console.error('Ошибка при поиске напоминания по ID:', error);
      throw error;
    }
  }

  // Получение напоминаний пользователя
  static async findByUserId(userId, options = {}) {
    try {
      let query = `
        SELECT r.*, p.tracking_number, p.description
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        WHERE r.user_id = ?
      `;
      const params = [userId];
      
      if (options.is_sent !== undefined) {
        query += ' AND r.is_sent = ?';
        params.push(options.is_sent);
      }
      
      if (options.parcel_id) {
        query += ' AND r.parcel_id = ?';
        params.push(options.parcel_id);
      }
      
      query += ' ORDER BY r.reminder_date, r.created_at';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }
      
      return await database.query(query, params);
    } catch (error) {
      console.error('Ошибка при получении напоминаний пользователя:', error);
      throw error;
    }
  }

  // Получение напоминаний для посылки
  static async findByParcelId(parcelId, userId = null) {
    try {
      let query = `
        SELECT r.*
        FROM reminders r
        WHERE r.parcel_id = ?
      `;
      const params = [parcelId];
      
      if (userId) {
        query += ' AND r.user_id = ?';
        params.push(userId);
      }
      
      query += ' ORDER BY r.reminder_date';
      
      return await database.query(query, params);
    } catch (error) {
      console.error('Ошибка при получении напоминаний для посылки:', error);
      throw error;
    }
  }

  // Получение активных напоминаний (не отправленных)
  static async findActive(limit = 50) {
    try {
      return await database.query(`
        SELECT r.*, p.tracking_number, p.description, u.telegram_id, u.first_name
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.is_sent = FALSE
          AND r.reminder_date <= CURDATE()
        ORDER BY r.reminder_date
        LIMIT ?
      `, [limit]);
    } catch (error) {
      console.error('Ошибка при получении активных напоминаний:', error);
      throw error;
    }
  }

  // Получение предстоящих напоминаний
  static async findUpcoming(days = 7, limit = 50) {
    try {
      return await database.query(`
        SELECT r.*, p.tracking_number, p.description, u.telegram_id, u.first_name
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.is_sent = FALSE
          AND r.reminder_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY r.reminder_date
        LIMIT ?
      `, [days, limit]);
    } catch (error) {
      console.error('Ошибка при получении предстоящих напоминаний:', error);
      throw error;
    }
  }

  // Обновление напоминания
  static async update(id, updates) {
    try {
      await database.update('reminders',
        { id },
        updates
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении напоминания:', error);
      throw error;
    }
  }

  // Отметка напоминания как отправленного
  static async markAsSent(id) {
    try {
      await database.update('reminders',
        { id },
        {
          is_sent: true,
          sent_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при отметке напоминания как отправленного:', error);
      throw error;
    }
  }

  // Удаление напоминания
  static async delete(id) {
    try {
      await database.execute('DELETE FROM reminders WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении напоминания:', error);
      throw error;
    }
  }

  // Удаление напоминаний пользователя
  static async deleteByUserId(userId) {
    try {
      await database.execute('DELETE FROM reminders WHERE user_id = ?', [userId]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении напоминаний пользователя:', error);
      throw error;
    }
  }

  // Удаление напоминаний посылки
  static async deleteByParcelId(parcelId) {
    try {
      await database.execute('DELETE FROM reminders WHERE parcel_id = ?', [parcelId]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении напоминаний посылки:', error);
      throw error;
    }
  }

  // Подсчет напоминаний
  static async count(where = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM reminders WHERE 1=1';
      const params = [];
      
      if (where.user_id) {
        query += ' AND user_id = ?';
        params.push(where.user_id);
      }
      
      if (where.parcel_id) {
        query += ' AND parcel_id = ?';
        params.push(where.parcel_id);
      }
      
      if (where.is_sent !== undefined) {
        query += ' AND is_sent = ?';
        params.push(where.is_sent);
      }
      
      const result = await database.get(query, params);
      return result.count;
    } catch (error) {
      console.error('Ошибка при подсчете напоминаний:', error);
      throw error;
    }
  }

  // Получение статистики напоминаний
  static async getStats(userId = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN is_sent = TRUE THEN 1 ELSE 0 END) as sent,
          SUM(CASE WHEN is_sent = FALSE THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN reminder_date < CURDATE() AND is_sent = FALSE THEN 1 ELSE 0 END) as overdue
        FROM reminders
        WHERE 1=1
      `;
      const params = [];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      const result = await database.get(query, params);
      return result || {};
    } catch (error) {
      console.error('Ошибка при получении статистики напоминаний:', error);
      throw error;
    }
  }

  // Проверка, существует ли напоминание на эту дату для посылки
  static async existsForDate(parcelId, userId, reminderDate) {
    try {
      const reminder = await database.get(`
        SELECT id FROM reminders 
        WHERE parcel_id = ? 
          AND user_id = ? 
          AND DATE(reminder_date) = DATE(?)
      `, [parcelId, userId, reminderDate]);
      
      return !!reminder;
    } catch (error) {
      console.error('Ошибка при проверке существования напоминания:', error);
      throw error;
    }
  }

  // Получение напоминаний для отправки (крон задача)
  static async getForSending(limit = 100) {
    try {
      return await database.query(`
        SELECT r.*, p.tracking_number, p.description, u.telegram_id, u.first_name, u.notifications_enabled
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.is_sent = FALSE
          AND r.reminder_date <= CURDATE()
          AND u.notifications_enabled = TRUE
        ORDER BY r.reminder_date, r.created_at
        LIMIT ?
      `, [limit]);
    } catch (error) {
      console.error('Ошибка при получении напоминаний для отправки:', error);
      throw error;
    }
  }

  // Обновление даты напоминания
  static async updateDate(id, newDate) {
    try {
      await database.update('reminders',
        { id },
        {
          reminder_date: newDate,
          is_sent: false,
          sent_at: null
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении даты напоминания:', error);
      throw error;
    }
  }
}

module.exports = Reminder;