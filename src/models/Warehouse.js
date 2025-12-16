const db = require('../database/connection');

class Warehouse {
  static async findBySku(sku) {
    return await db.get('SELECT * FROM warehouse WHERE sku = ?', [sku]);
  }

  static async search(term) {
    return await db.query(`
      SELECT * FROM warehouse 
      WHERE sku LIKE ? OR name LIKE ?
      ORDER BY name ASC
    `, [`%${term}%`, `%${term}%`]);
  }

  static async getAll(limit = 50) {
    return await db.query(`
      SELECT * FROM warehouse 
      ORDER BY 
        CASE WHEN quantity <= min_quantity THEN 0 ELSE 1 END,
        quantity ASC
      LIMIT ?
    `, [limit]);
  }

  static async getLowStock() {
    return await db.query(
      'SELECT * FROM warehouse WHERE quantity <= min_quantity ORDER BY quantity ASC'
    );
  }

  static async create(itemData) {
    const result = await db.execute(`
      INSERT INTO warehouse (sku, name, quantity, min_quantity, location)
      VALUES (?, ?, ?, ?, ?)
    `, [
      itemData.sku,
      itemData.name,
      itemData.quantity || 0,
      itemData.min_quantity || 10,
      itemData.location || null
    ]);
    
    return { id: result.insertId, ...itemData };
  }

  static async updateQuantity(sku, quantity) {
    await db.execute(
      'UPDATE warehouse SET quantity = ? WHERE sku = ?',
      [quantity, sku]
    );
  }

  static async update(itemId, updates) {
    const fields = [];
    const values = [];
    
    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
    
    values.push(itemId);
    
    await db.execute(
      `UPDATE warehouse SET ${fields.join(', ')} WHERE id = ?`,
      values
    );
  }

  static async delete(sku) {
    await db.execute('DELETE FROM warehouse WHERE sku = ?', [sku]);
  }

  static async getStatistics() {
    const stats = await db.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(quantity) as total_quantity,
        SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) as low_stock_count,
        SUM(CASE WHEN quantity <= min_quantity THEN min_quantity - quantity ELSE 0 END) as need_to_order
      FROM warehouse
    `);
    
    return stats[0];
  }
}

module.exports = Warehouse;