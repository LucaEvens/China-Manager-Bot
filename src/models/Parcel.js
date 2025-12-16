const db = require('../database/connection');

class Parcel {
  static async findByTrackingNumber(trackingNumber) {
    return await db.get(
      'SELECT * FROM parcels WHERE tracking_number = ?',
      [trackingNumber]
    );
  }

  static async findByUserId(userId) {
    return await db.query(
      `SELECT p.*, 
         CASE p.status
           WHEN 'ordered' THEN '🛒 Заказано'
           WHEN 'shipped' THEN '🚚 Отправлено'
           WHEN 'in_transit' THEN '✈️ В пути'
           WHEN 'arrived' THEN '📦 Прибыло'
           WHEN 'received' THEN '✅ Получено'
           ELSE p.status
         END as status_text
       FROM parcels p
       WHERE p.user_id = ?
       ORDER BY p.created_at DESC`,
      [userId]
    );
  }

  static async create(parcelData) {
    const result = await db.execute(`
      INSERT INTO parcels 
      (tracking_number, description, supplier, user_id, status, expected_date, notes)
      VALUES (?, ?, ?, ?, 'ordered', ?, ?)
    `, [
      parcelData.tracking_number,
      parcelData.description,
      parcelData.supplier,
      parcelData.user_id,
      parcelData.expected_date || null,
      parcelData.notes || null
    ]);
    
    return { id: result.insertId, ...parcelData };
  }

  static async updateStatus(parcelId, status) {
    await db.execute(
      'UPDATE parcels SET status = ? WHERE id = ?',
      [status, parcelId]
    );
  }

  static async delete(parcelId) {
    await db.execute('DELETE FROM parcels WHERE id = ?', [parcelId]);
  }

  static async getStatistics() {
    return await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'ordered' THEN 1 ELSE 0 END) as ordered,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) as shipped,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
        SUM(CASE WHEN status = 'arrived' THEN 1 ELSE 0 END) as arrived,
        SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) as received
      FROM parcels
    `);
  }
}

module.exports = Parcel;