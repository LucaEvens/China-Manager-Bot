const db = require('../database/connection');
const config = require('../config');

class NotificationSystem {
  constructor(bot) {
    this.bot = bot;
  }

  // Отправка уведомления пользователю
  async sendToUser(userId, message, options = {}) {
    try {
      await this.bot.telegram.sendMessage(userId, message, {
        parse_mode: 'Markdown',
        ...options
      });
      return true;
    } catch (error) {
      console.error(`Ошибка отправки пользователю ${userId}:`, error.message);
      return false;
    }
  }

  // Отправка уведомления администратору
  async sendToAdmin(message, options = {}) {
    if (!config.ADMIN_ID) {
      console.warn('ADMIN_ID не установлен в .env');
      return false;
    }

    try {
      await this.bot.telegram.sendMessage(config.ADMIN_ID, message, {
        parse_mode: 'Markdown',
        ...options
      });
      return true;
    } catch (error) {
      console.error('Ошибка отправки админу:', error.message);
      return false;
    }
  }

  // Уведомление о новой посылке
  async notifyNewParcel(userId, parcelData) {
    const user = await db.get(
      'SELECT first_name FROM users WHERE telegram_id = ?',
      [userId]
    );

    const message = 
      `📦 *Новая посылка добавлена!*\n\n` +
      `👤 Пользователь: ${user?.first_name || 'Неизвестный'}\n` +
      `🔢 Трек-номер: ${parcelData.tracking_number}\n` +
      `📝 Описание: ${parcelData.description || 'Не указано'}\n` +
      `🏢 Поставщик: ${parcelData.supplier || 'Не указан'}\n` +
      `📅 Добавлено: ${new Date().toLocaleDateString('ru-RU')}`;

    return await this.sendToUser(userId, message);
  }

  // Уведомление о низком остатке
  async notifyLowStock(item) {
    const message = 
      `⚠️ *ВНИМАНИЕ: Низкий остаток товара!*\n\n` +
      `📦 Товар: ${item.name}\n` +
      `🔢 SKU: ${item.sku}\n` +
      `📊 Текущий остаток: ${item.quantity}\n` +
      `📈 Минимальный: ${item.min_quantity}\n` +
      `📍 Место: ${item.location || 'Не указано'}\n\n` +
      `*Рекомендуется пополнить запасы!*`;

    // Отправляем админу
    await this.sendToAdmin(message);
    
    // Отправляем всем активным пользователям (опционально)
    const activeUsers = await db.query(
      'SELECT telegram_id FROM users WHERE is_active = TRUE'
    );

    let sentCount = 0;
    for (const user of activeUsers) {
      const success = await this.sendToUser(user.telegram_id, message);
      if (success) sentCount++;
      // Задержка чтобы не превысить лимиты
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return sentCount;
  }

  // Уведомление о смене статуса посылки
  async notifyParcelStatusChange(userId, parcelId, oldStatus, newStatus) {
    const statusNames = {
      'ordered': '🛒 Заказано',
      'shipped': '🚚 Отправлено',
      'in_transit': '✈️ В пути',
      'arrived': '📦 Прибыло',
      'received': '✅ Получено'
    };

    const parcel = await db.get(
      `SELECT p.tracking_number, p.description 
       FROM parcels p 
       WHERE p.id = ?`,
      [parcelId]
    );

    if (!parcel) return false;

    const message = 
      `📦 *Статус посылки изменен!*\n\n` +
      `🔢 Трек-номер: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'Не указано'}\n` +
      `📊 Статус: ${statusNames[oldStatus] || oldStatus} → ${statusNames[newStatus] || newStatus}\n` +
      `📅 Время: ${new Date().toLocaleString('ru-RU')}`;

    return await this.sendToUser(userId, message);
  }

  // Уведомление о запросе доступа (админу)
  async notifyAccessRequest(userData) {
    const message = 
      `📨 *НОВЫЙ ЗАПРОС НА ДОСТУП!*\n\n` +
      `👤 Пользователь: ${userData.first_name} ${userData.last_name || ''}\n` +
      `📛 Username: @${userData.username || 'нет'}\n` +
      `🆔 Telegram ID: ${userData.telegram_id}\n` +
      `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
      `Для обработки используйте /requests`;

    return await this.sendToAdmin(message, {
      reply_markup: {
        inline_keyboard: [[
          {
            text: '📋 Просмотреть запросы',
            callback_data: 'view_requests'
          }
        ]]
      }
    });
  }

  // Массовая рассылка
  async broadcast(message, options = {}) {
    const activeUsers = await db.query(
      'SELECT telegram_id, first_name FROM users WHERE is_active = TRUE'
    );

    let results = {
      total: activeUsers.length,
      success: 0,
      failed: 0,
      errors: []
    };

    for (const user of activeUsers) {
      try {
        const userMessage = 
          `📢 *Сообщение от администратора*\n\n` +
          `${message}\n\n` +
          `---\n` +
          `_Сообщение отправлено ${new Date().toLocaleDateString('ru-RU')}_`;

        await this.bot.telegram.sendMessage(user.telegram_id, userMessage, {
          parse_mode: 'Markdown',
          ...options
        });

        results.success++;
        // Задержка чтобы не превысить лимиты Telegram (30 сообщений в секунду)
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId: user.telegram_id,
          name: user.first_name,
          error: error.message
        });
        console.error(`Не удалось отправить пользователю ${user.telegram_id}:`, error.message);
      }
    }

    return results;
  }

  // Ежедневный отчет
  async sendDailyReport() {
    try {
      // Статистика за день
      const today = new Date().toISOString().split('T')[0];
      
      const [
        newUsers,
        newParcels,
        lowStockItems
      ] = await Promise.all([
        db.query(
          'SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = ?',
          [today]
        ),
        db.query(
          'SELECT COUNT(*) as count FROM parcels WHERE DATE(created_at) = ?',
          [today]
        ),
        db.query(
          'SELECT COUNT(*) as count FROM warehouse WHERE quantity <= min_quantity'
        )
      ]);

      const message = 
        `📊 *ЕЖЕДНЕВНЫЙ ОТЧЕТ*\n` +
        `📅 ${new Date().toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n` +
        `👥 Новые пользователи: ${newUsers[0].count}\n` +
        `📦 Новые посылки: ${newParcels[0].count}\n` +
        `⚠️ Товаров с низким остатком: ${lowStockItems[0].count}\n\n` +
        `📈 Всего активных пользователей: ${(await db.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'))[0].count}\n` +
        `📦 Всего отслеживаемых посылок: ${(await db.query('SELECT COUNT(*) as count FROM parcels'))[0].count}`;

      return await this.sendToAdmin(message);
    } catch (error) {
      console.error('Ошибка отправки ежедневного отчета:', error);
      return false;
    }
  }

  // Уведомление об истечении срока доставки
  async notifyDeliveryExpiring() {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const expiringParcels = await db.query(`
        SELECT p.*, u.telegram_id, u.first_name
        FROM parcels p
        JOIN users u ON p.user_id = u.id
        WHERE p.expected_date = ? 
          AND p.status NOT IN ('received', 'arrived')
          AND u.is_active = TRUE
      `, [tomorrowStr]);

      for (const parcel of expiringParcels) {
        const message = 
          `⚠️ *НАПОМИНАНИЕ О ДОСТАВКЕ*\n\n` +
          `📦 Посылка: ${parcel.tracking_number}\n` +
          `📝 Описание: ${parcel.description || 'Не указано'}\n` +
          `🏢 Поставщик: ${parcel.supplier || 'Не указан'}\n` +
          `📅 Ожидаемая доставка: ЗАВТРА (${parcel.expected_date})\n` +
          `📊 Текущий статус: ${parcel.status}\n\n` +
          `*Пожалуйста, проверьте статус посылки!*`;

        await this.sendToUser(parcel.telegram_id, message);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      return expiringParcels.length;
    } catch (error) {
      console.error('Ошибка отправки уведомлений об истечении срока:', error);
      return 0;
    }
  }
}

module.exports = NotificationSystem;