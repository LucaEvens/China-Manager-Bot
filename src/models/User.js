const db = require('../database/connection');

class User {
  static async findByTelegramId(telegramId) {
    return await db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId]);
  }

  static async create(userData) {
    // Преобразуем undefined в null
    const cleanData = {
      telegram_id: userData.telegram_id,
      username: userData.username || null,  // ← ИСПРАВЛЕНО
      first_name: userData.first_name,
      last_name: userData.last_name || null // ← ИСПРАВЛЕНО
    };
    
    const result = await db.execute(`
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES (?, ?, ?, ?)
    `, [
      cleanData.telegram_id,
      cleanData.username,
      cleanData.first_name,
      cleanData.last_name
    ]);
    
    return { id: result.insertId, ...cleanData };
  }

  static async updateStatus(userId, isActive) {
    await db.execute(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [isActive, userId]
    );
  }

  static async getActiveUsers() {
    return await db.query(
      'SELECT * FROM users WHERE is_active = TRUE ORDER BY created_at DESC'
    );
  }

  // Новый метод для безопасного обновления
  static async update(telegramId, updates) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value === null ? null : value);
      }
    }
    
    values.push(telegramId);
    
    await db.execute(
      `UPDATE users SET ${fields.join(', ')} WHERE telegram_id = ?`,
      values
    );
  }
}

module.exports = User;