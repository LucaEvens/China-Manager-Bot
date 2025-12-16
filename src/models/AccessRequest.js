const db = require('../database/connection');

class AccessRequest {
  static async create(userId) {
    const result = await db.execute(`
      INSERT INTO access_requests (user_id) VALUES (?)
    `, [userId]);
    
    return result.insertId;
  }

  static async getPending() {
    return await db.query(`
      SELECT ar.*, u.telegram_id, u.username, u.first_name, u.last_name
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.status = 'pending'
      ORDER BY ar.created_at DESC
    `);
  }

  static async updateStatus(requestId, status, adminId) {
    await db.execute(`
      UPDATE access_requests 
      SET status = ?, admin_id = ?, decision_date = NOW()
      WHERE id = ?
    `, [status, adminId, requestId]);
  }

  static async findByUser(userId) {
    return await db.get(`
      SELECT * FROM access_requests 
      WHERE user_id = ? AND status = 'pending'
      ORDER BY created_at DESC 
      LIMIT 1
    `, [userId]);
  }

  // Безопасное создание с проверкой
  static async safeCreate(userId) {
    // Проверяем, нет ли уже активного запроса
    const existing = await this.findByUser(userId);
    if (existing) {
      return existing.id;
    }
    
    return await this.create(userId);
  }
}

module.exports = AccessRequest;