const database = require('../database/connection');

class Warehouse {
  // Создание товара на складе
  static async create(itemData) {
    try {
      const result = await database.insert('warehouse', {
        sku: itemData.sku,
        name: itemData.name,
        quantity: itemData.quantity || 0,
        min_quantity: itemData.min_quantity || 10,
        location: itemData.location || null,
        last_updated: new Date()
      });
      
      return result.insertId;
    } catch (error) {
      console.error('Ошибка при создании товара на складе:', error);
      throw error;
    }
  }

  // Поиск товара по ID
  static async findById(id) {
    try {
      return await database.get(
        'SELECT * FROM warehouse WHERE id = ?',
        [id]
      );
    } catch (error) {
      console.error('Ошибка при поиске товара по ID:', error);
      throw error;
    }
  }

  // Поиск товара по SKU
  static async findBySku(sku) {
    try {
      return await database.get(
        'SELECT * FROM warehouse WHERE sku = ?',
        [sku]
      );
    } catch (error) {
      console.error('Ошибка при поиске товара по SKU:', error);
      throw error;
    }
  }

  // Получение всех товаров
  static async findAll(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM warehouse 
        ORDER BY 
          CASE WHEN quantity < min_quantity THEN 0 ELSE 1 END,
          quantity ASC,
          name
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении всех товаров:', error);
      throw error;
    }
  }

  // Получение товаров с низким запасом
  static async findLowStock(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM warehouse 
        WHERE quantity < min_quantity
        ORDER BY quantity ASC, name
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении товаров с низким запасом:', error);
      throw error;
    }
  }

  // Получение товаров, которых нет в наличии
  static async findOutOfStock(limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM warehouse 
        WHERE quantity = 0
        ORDER BY name
        LIMIT ? OFFSET ?
      `, [limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении товаров, которых нет в наличии:', error);
      throw error;
    }
  }

  // Обновление товара
  static async update(id, updates) {
    try {
      await database.update('warehouse',
        { id },
        {
          ...updates,
          last_updated: new Date()
        }
      );
      
      return true;
    } catch (error) {
      console.error('Ошибка при обновлении товара:', error);
      throw error;
    }
  }

  // Обновление количества товара
  static async updateQuantity(id, quantityChange, reason = 'manual') {
    try {
      // Получаем текущее количество
      const item = await this.findById(id);
      if (!item) {
        throw new Error('Товар не найден');
      }
      
      const newQuantity = item.quantity + quantityChange;
      
      if (newQuantity < 0) {
        throw new Error('Количество не может быть отрицательным');
      }
      
      await database.update('warehouse',
        { id },
        {
          quantity: newQuantity,
          last_updated: new Date()
        }
      );
      
      // Логируем изменение
      await database.insert('warehouse_log', {
        warehouse_id: id,
        old_quantity: item.quantity,
        new_quantity: newQuantity,
        quantity_change: quantityChange,
        reason: reason,
        changed_at: new Date()
      });
      
      return newQuantity;
    } catch (error) {
      console.error('Ошибка при обновлении количества товара:', error);
      throw error;
    }
  }

  // Пополнение запаса
  static async restock(id, amount, reason = 'restock') {
    return await this.updateQuantity(id, Math.abs(amount), reason);
  }

  // Списание со склада
  static async removeStock(id, amount, reason = 'sale') {
    return await this.updateQuantity(id, -Math.abs(amount), reason);
  }

  // Удаление товара
  static async delete(id) {
    try {
      await database.execute('DELETE FROM warehouse WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Ошибка при удалении товара:', error);
      throw error;
    }
  }

  // Поиск товаров
  static async search(query, limit = 20) {
    try {
      const searchTerm = `%${query}%`;
      
      return await database.query(`
        SELECT * FROM warehouse 
        WHERE sku LIKE ? OR name LIKE ? OR location LIKE ?
        ORDER BY name
        LIMIT ?
      `, [searchTerm, searchTerm, searchTerm, limit]);
    } catch (error) {
      console.error('Ошибка при поиске товаров:', error);
      throw error;
    }
  }

  // Получение статистики склада
  static async getStats() {
    try {
      const stats = await database.query(`
        SELECT 
          COUNT(*) as total_items,
          SUM(quantity) as total_quantity,
          SUM(CASE WHEN quantity < min_quantity THEN 1 ELSE 0 END) as low_stock_items,
          SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as out_of_stock,
          SUM(min_quantity) as total_min_quantity,
          AVG(quantity) as avg_quantity,
          MIN(quantity) as min_quantity_in_stock,
          MAX(quantity) as max_quantity_in_stock,
          COUNT(DISTINCT location) as unique_locations
        FROM warehouse
      `);
      
      return stats[0] || {};
    } catch (error) {
      console.error('Ошибка при получении статистики склада:', error);
      throw error;
    }
  }

  // Подсчет товаров
  static async count(where = {}) {
    try {
      let query = 'SELECT COUNT(*) as count FROM warehouse WHERE 1=1';
      const params = [];
      
      if (where.low_stock !== undefined && where.low_stock) {
        query += ' AND quantity < min_quantity';
      }
      
      if (where.out_of_stock !== undefined && where.out_of_stock) {
        query += ' AND quantity = 0';
      }
      
      const result = await database.get(query, params);
      return result.count;
    } catch (error) {
      console.error('Ошибка при подсчете товаров:', error);
      throw error;
    }
  }

  // Получение товаров по местоположению
  static async findByLocation(location, limit = 50, offset = 0) {
    try {
      return await database.query(`
        SELECT * FROM warehouse 
        WHERE location = ?
        ORDER BY name
        LIMIT ? OFFSET ?
      `, [location, limit, offset]);
    } catch (error) {
      console.error('Ошибка при получении товаров по местоположению:', error);
      throw error;
    }
  }

  // Получение уникальных местоположений
  static async getUniqueLocations() {
    try {
      const locations = await database.query(`
        SELECT DISTINCT location 
        FROM warehouse 
        WHERE location IS NOT NULL 
        ORDER BY location
      `);
      
      return locations.map(row => row.location);
    } catch (error) {
      console.error('Ошибка при получении уникальных местоположений:', error);
      throw error;
    }
  }

  // Получение истории изменений товара
  static async getItemHistory(itemId, limit = 20) {
    try {
      return await database.query(`
        SELECT * FROM warehouse_log 
        WHERE warehouse_id = ?
        ORDER BY changed_at DESC
        LIMIT ?
      `, [itemId, limit]);
    } catch (error) {
      console.error('Ошибка при получении истории изменений товара:', error);
      throw error;
    }
  }

  // Получение наиболее часто используемых товаров
  static async getMostUsed(limit = 10, days = 30) {
    try {
      return await database.query(`
        SELECT w.*, 
               COUNT(wl.id) as change_count,
               SUM(ABS(wl.quantity_change)) as total_movement
        FROM warehouse w
        LEFT JOIN warehouse_log wl ON w.id = wl.warehouse_id
          AND wl.changed_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
        GROUP BY w.id
        ORDER BY total_movement DESC, change_count DESC
        LIMIT ?
      `, [days, limit]);
    } catch (error) {
      console.error('Ошибка при получении наиболее часто используемых товаров:', error);
      throw error;
    }
  }
}

module.exports = Warehouse;