const database = require('../database/connection');

module.exports = {
  // Отправка уведомления пользователю
  sendNotification: async (bot, telegramId, message, options = {}) => {
    try {
      // Проверяем, включены ли уведомления у пользователя
      const user = await database.get(
        'SELECT * FROM users WHERE telegram_id = ? AND notifications_enabled = TRUE',
        [telegramId]
      );
      
      if (!user) {
        console.log(`Пользователь ${telegramId} отключил уведомления или не найден`);
        return false;
      }
      
      // Отправляем уведомление
      await bot.sendMessage(telegramId, message, options);
      
      // Логируем отправку уведомления
      await database.insert('notification_log', {
        user_id: user.id,
        type: options.type || 'system',
        message: typeof message === 'string' ? message : JSON.stringify(message),
        sent_at: new Date()
      });
      
      console.log(`Уведомление отправлено пользователю ${telegramId}`);
      return true;
      
    } catch (error) {
      console.error(`Ошибка при отправке уведомления пользователю ${telegramId}:`, error.message);
      
      // Если пользователь заблокировал бота, отмечаем его как неактивного
      if (error.response && error.response.statusCode === 403) {
        try {
          await database.update('users',
            { telegram_id: telegramId },
            { notifications_enabled: false, updated_at: new Date() }
          );
          console.log(`Пользователь ${telegramId} заблокировал бота, уведомления отключены`);
        } catch (dbError) {
          console.error('Ошибка при обновлении статуса пользователя:', dbError);
        }
      }
      
      return false;
    }
  },
  
  // Отправка уведомления о изменении статуса посылки
  sendParcelStatusNotification: async (bot, parcelId, newStatus, oldStatus = null) => {
    try {
      // Получаем информацию о посылке и пользователе
      const parcel = await database.get(`
        SELECT p.*, u.telegram_id, u.first_name, u.notifications_enabled
        FROM parcels p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `, [parcelId]);
      
      if (!parcel || !parcel.notifications_enabled) {
        return false;
      }
      
      const statusEmoji = getStatusEmoji(newStatus);
      const statusText = getStatusText(newStatus);
      
      const message = `
📦 <b>Статус посылки обновлен!</b>

<b>Трек-номер:</b> ${parcel.tracking_number}
<b>Описание:</b> ${parcel.description || 'Без описания'}
${oldStatus ? `<b>Предыдущий статус:</b> ${getStatusText(oldStatus)}\n` : ''}
<b>Новый статус:</b> ${statusEmoji} ${statusText}

<b>Дата обновления:</b> ${new Date().toLocaleString('ru-RU')}
      `;
      
      return await module.exports.sendNotification(bot, parcel.telegram_id, message, {
        parse_mode: 'HTML',
        type: 'parcel_status'
      });
      
    } catch (error) {
      console.error('Ошибка при отправке уведомления о статусе посылки:', error);
      return false;
    }
  },
  
  // Отправка уведомления о низком запасе
  sendLowStockNotification: async (bot, itemId) => {
    try {
      // Получаем информацию о товаре
      const item = await database.get('SELECT * FROM warehouse WHERE id = ?', [itemId]);
      
      if (!item) {
        return false;
      }
      
      // Получаем администраторов
      const admins = await database.query(
        'SELECT telegram_id FROM users WHERE is_admin = TRUE AND notifications_enabled = TRUE'
      );
      
      if (admins.length === 0) {
        return false;
      }
      
      const percentage = Math.round((item.quantity / item.min_quantity) * 100);
      const stockLevel = item.quantity <= 0 ? '❌ Нет в наличии' : 
                        item.quantity < item.min_quantity * 0.3 ? '🔴 Критический' :
                        item.quantity < item.min_quantity * 0.5 ? '🟠 Низкий' : '🟡 Внимание';
      
      const message = `
⚠️ <b>Товар с низким запасом!</b>

<b>Название:</b> ${item.name}
<b>SKU:</b> ${item.sku}
<b>В наличии:</b> ${item.quantity} из ${item.min_quantity} (${percentage}%)
<b>Уровень запаса:</b> ${stockLevel}
<b>Необходимо докупить:</b> ${item.min_quantity - item.quantity} шт.
${item.location ? `<b>Местоположение:</b> ${item.location}\n` : ''}
<b>Дата проверки:</b> ${new Date().toLocaleString('ru-RU')}
      `;
      
      let sentCount = 0;
      for (const admin of admins) {
        const sent = await module.exports.sendNotification(bot, admin.telegram_id, message, {
          parse_mode: 'HTML',
          type: 'low_stock'
        });
        if (sent) sentCount++;
      }
      
      return sentCount > 0;
      
    } catch (error) {
      console.error('Ошибка при отправке уведомления о низком запасе:', error);
      return false;
    }
  },
  
  // Отправка уведомления о скором прибытии посылки
  sendParcelArrivalNotification: async (bot, parcelId, daysUntilArrival) => {
    try {
      const parcel = await database.get(`
        SELECT p.*, u.telegram_id, u.first_name, u.notifications_enabled
        FROM parcels p
        JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
      `, [parcelId]);
      
      if (!parcel || !parcel.notifications_enabled || !parcel.expected_date) {
        return false;
      }
      
      const expectedDate = new Date(parcel.expected_date);
      
      const message = `
📦 <b>Посылка скоро прибудет!</b>

<b>Трек-номер:</b> ${parcel.tracking_number}
<b>Описание:</b> ${parcel.description || 'Без описания'}
<b>Ожидаемая дата прибытия:</b> ${expectedDate.toLocaleDateString('ru-RU')}
<b>Осталось дней:</b> ${daysUntilArrival}

<b>Текущий статус:</b> ${getStatusEmoji(parcel.status)} ${getStatusText(parcel.status)}

<i>Будьте готовы к получению посылки!</i>
      `;
      
      return await module.exports.sendNotification(bot, parcel.telegram_id, message, {
        parse_mode: 'HTML',
        type: 'parcel_arrival'
      });
      
    } catch (error) {
      console.error('Ошибка при отправке уведомления о прибытии посылки:', error);
      return false;
    }
  },
  
  // Отправка ежедневного отчета
  sendDailyReport: async (bot, telegramId) => {
    try {
      const user = await database.get(`
        SELECT u.*,
               (SELECT COUNT(*) FROM parcels p WHERE p.user_id = u.id AND p.status != 'received') as active_parcels,
               (SELECT COUNT(*) FROM warehouse w WHERE w.quantity < w.min_quantity) as low_stock_items
        FROM users u
        WHERE u.telegram_id = ? AND u.notifications_enabled = TRUE
      `, [telegramId]);
      
      if (!user) {
        return false;
      }
      
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Получаем посылки, добавленные вчера
      const newParcels = await database.query(`
        SELECT COUNT(*) as count
        FROM parcels
        WHERE user_id = ? AND DATE(created_at) = DATE(?)
      `, [user.id, yesterday]);
      
      // Получаем посылки, изменившие статус вчера
      const updatedParcels = await database.query(`
        SELECT COUNT(*) as count
        FROM parcels
        WHERE user_id = ? AND DATE(updated_at) = DATE(?) AND DATE(created_at) != DATE(updated_at)
      `, [user.id, yesterday]);
      
      const message = `
📊 <b>Ежедневный отчет</b>

<b>Дата:</b> ${today.toLocaleDateString('ru-RU')}

<b>📦 Ваши посылки:</b>
Активные посылки: ${user.active_parcels || 0}
Новых посылок вчера: ${newParcels[0]?.count || 0}
Обновленных статусов: ${updatedParcels[0]?.count || 0}

<b>📊 Склад:</b>
Товаров с низким запасом: ${user.low_stock_items || 0}

<b>📈 Статистика за вчера:</b>
Все изменения успешно сохранены.

<i>Хорошего дня! 🚀</i>
      `;
      
      return await module.exports.sendNotification(bot, telegramId, message, {
        parse_mode: 'HTML',
        type: 'daily_report'
      });
      
    } catch (error) {
      console.error('Ошибка при отправке ежедневного отчета:', error);
      return false;
    }
  },
  
  // Массовая рассылка (для администраторов)
  sendBroadcast: async (bot, message, userFilter = {}) => {
    try {
      let query = 'SELECT telegram_id FROM users WHERE notifications_enabled = TRUE';
      const params = [];
      
      if (userFilter.is_active !== undefined) {
        query += ' AND is_active = ?';
        params.push(userFilter.is_active);
      }
      
      if (userFilter.is_admin !== undefined) {
        query += ' AND is_admin = ?';
        params.push(userFilter.is_admin);
      }
      
      const users = await database.query(query, params);
      
      if (users.length === 0) {
        return { success: 0, failed: 0, total: 0 };
      }
      
      let success = 0;
      let failed = 0;
      
      for (const user of users) {
        try {
          await bot.sendMessage(user.telegram_id, message, {
            parse_mode: 'HTML'
          });
          success++;
        } catch (error) {
          console.error(`Ошибка при рассылке пользователю ${user.telegram_id}:`, error.message);
          failed++;
        }
        
        // Небольшая задержка, чтобы не превысить лимиты Telegram
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return {
        success,
        failed,
        total: users.length
      };
      
    } catch (error) {
      console.error('Ошибка при массовой рассылке:', error);
      return { success: 0, failed: 0, total: 0 };
    }
  }
};

// Вспомогательные функции
function getStatusEmoji(status) {
  const emojiMap = {
    'ordered': '🛒',
    'shipped': '🚚',
    'in_transit': '🚛',
    'arrived': '🏠',
    'received': '✅'
  };
  return emojiMap[status] || '📦';
}

function getStatusText(status) {
  const textMap = {
    'ordered': 'Заказан',
    'shipped': 'Отправлен',
    'in_transit': 'В пути',
    'arrived': 'Прибыл',
    'received': 'Получен'
  };
  return textMap[status] || status;
}