const database = require('../database/connection');

class Parcel {
  // Создание посылки
  static async create(parcelData) {
    try {
      const result = await database.insert('parcels', {
        tracking_number: parcelData.tracking_number,
        description: parcelData.description || null,
        supplier: parcelData.supplier || null,
        status: parcelData.status || 'ordered',
        user_id: parcelData.user_id,
        expected_date: parcelData.expected_date || null,
        actual_date: parcelData.actual_date || null,
        notes: parcelData.notes || null,
        created_at: new Date()
      });
      
      return result.insertId;
    } catch (error) {
      console.error('Ошибка при создании посылки:', error);
      throw error;
    }
  }

  // Поиск посылки по ID
  static async findById(id) {
    try {
      return await database.get(
        'SELECT p.*, u.first_name, u.last_name, u.telegram_id FROM parcels p JOIN users u ON p.user_id = u.id WHERE p.id = ?',
        [id]
      );
    } catch (error) {
      console.error('Ошибка при поиске посылки по ID:', error);
      throw error;
    }
  }

  // Поиск посылки по трек-номеру
  static async findByTrackingNumber(trackingNumber) {
    try {
      return await database.get(
        'SELECT p.*, u.first_name, u.last_name FROM parcels p JOIN users u ON p.user_id = u.id WHERE p.tracking_number = ?',
        [trackingNumber]
      );
    } catch (error) {
      console.error('Ошибка при поиске посылки по трек-номеру:', error);
      throw error;
    }
  }

  // Получение посылок пользователя
  static async findByUserId(userId, options = {}) {
    try {
      let query = `
        SELECT * FROM parcels 
        WHERE user_id = ?
      `;
      const params = [userId];
      
      if (options.status) {
        query += ' AND status = ?';
        params.push(options.status);
      }
      
      if (options.supplier) {
        query += ' AND supplier = ?';
        params.push(options.supplier);
      }
      
      query += ' ORDER BY created_at DESC';
      
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);
      }
      
      if (options.offset) {
        query += ' OFFSET ?';
        params.push(options.offset);
      }
      
      return await database.query(query, params);
    } catch (error) {
      console.error('Ошибка при получении посылок пользователя:', error);
      throw error;
    }
  }

  // Обновление посылки
  static async update(id, updates) {
    try {
      await database.update('parcels',
        { id },
        {
          ...updates,
          updated_at: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении посылки:', error);
      throw error;
    }
  }

  // Обновление статуса посылки
  static async updateStatus(id, status) {
    try {
      const updateData = {
        status: status,
        updated_at: new Date()
      };
      
      // Если статус "получен", устанавливаем фактическую дату
      if (status === 'received') {
        updateData.actual_date = new Date();
      }
      
      await database.update('parcels',
        { id },
        updateData
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении статуса посылки:', error);
      throw error;
    }
  }

  // Удаление посылки
  static async delete(id) {
    try {
      await database.execute('DELETE FROM parcels WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении посылки:', error);
      throw error;
    }
  }

  // Получение всех посылок
  static async findAll(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT p.*, u.first_name, u.last_name 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        ORDER BY p.created_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении всех посылок:', error);
      throw error;
    }
  }

  // Поиск посылок
  static async search(query, userId = null, limit = 20) {
    try {
      const searchTerm = `%${query}%`;
      let sql = `
        SELECT p.*, u.first_name, u.last_name 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        WHERE (p.tracking_number LIKE ? OR p.description LIKE ? OR p.supplier LIKE ?)
      `;
      const params = [searchTerm, searchTerm, searchTerm];
      
      if (userId) {
        sql += ' AND p.user_id = ?';
        params.push(userId);
      }
      
      sql += ' ORDER BY p.created_at DESC LIMIT ?';
      params.push(limit);
      
      return await database.query(sql, params);
    } catch (error) {
      console.error('Ошибка при поиске посылок:', error);
      throw error;
    }
  }

  // Получение статистики посылок
  static async getStats(userId = null) {
    try {
      let query = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) as ordered,
          SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
          SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
          SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) as arrived,
          SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received,
          COUNT(DISTINCT supplier) as unique_suppliers,
          AVG(DATEDIFF(COALESCE(actual_date, NOW()), created_at)) as avg_delivery_days
        FROM parcels
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
      console.error('Ошибка при получении статистики посылок:', error);
      throw error;
    }
  }

  // Получение посылок по статусу
  static async findByStatus(status, limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT p.*, u.first_name, u.last_name 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.status = ? 
        ORDER BY p.created_at DESC 
        LIMIT ? OFFSET ?
      `, [status, limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении посылок по статусу:', error);
      throw error;
    }
  }

  // Получение посылок по поставщику
  static async findBySupplier(supplier, limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT p.*, u.first_name, u.last_name 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.supplier = ? 
        ORDER BY p.created_at DESC 
        LIMIT ? OFFSET ?
      `, [supplier, limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении посылок по поставщику:', error);
      throw error;
    }
  }

  // Получение посылок, которые скоро прибудут
  static async getSoonArriving(days = 3, limit = 20) {
    try {
      return await database.query(`
        SELECT p.*, u.first_name, u.last_name, u.telegram_id 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.status IN ('in_transit', 'shipped')
          AND p.expected_date IS NOT NULL
          AND p.expected_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY)
        ORDER BY p.expected_date
        LIMIT ?
      `, [days, limit]);
    } catch (error) {
      console.error('Ошибка при получении посылок, которые скоро прибудут:', error);
      throw error;
    }
  }

  // Получение просроченных посылок
  static async getOverdue(limit = 20) {
    try {
      return await database.query(`
        SELECT p.*, u.first_name, u.last_name 
        FROM parcels p 
        JOIN users u ON p.user_id = u.id 
        WHERE p.expected_date IS NOT NULL
          AND p.expected_date < CURDATE()
          AND p.status != 'received'
        ORDER BY p.expected_date
        LIMIT ?
      `, [limit]);
    } catch (error) {
      console.error('Ошибка при получении просроченных посылок:', error);
      throw error;
    }
  }

  // Подсчет посылок
  static async count(where = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM parcels WHERE 1=1';
      const params = [];
      
      if (where.user_id) {
        query += ' AND user_id = ?';
        params.push(where.user_id);
      }
      
      if (where.status) {
        query += ' AND status = ?';
        params.push(where.status);
      }
      
      if (where.supplier) {
        query += ' AND supplier = ?';
        params.push(where.supplier);
      }
      
      const result = await database.get(query, params);
      return result.count;
    } catch (error) {
      console.error('Ошибка при подсчете посылок:', error);
      throw error;
    }
  }

  // Получение уникальных поставщиков
  static async getUniqueSuppliers(userId = null) {
    try {
      let query = 'SELECT DISTINCT supplier FROM parcels WHERE supplier IS NOT NULL';
      const params = [];
      
      if (userId) {
        query += ' AND user_id = ?';
        params.push(userId);
      }
      
      query += ' ORDER BY supplier';
      
      const result = await database.query(query, params);
      return result.map(row => row.supplier);
    } catch (error) {
      console.error('Ошибка при получении уникальных поставщиков:', error);
      throw error;
    }
  }
}

module.exports = Parcel;