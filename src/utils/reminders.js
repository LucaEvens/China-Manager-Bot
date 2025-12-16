const cron = require('cron');
const database = require('../database/connection');
const { sendNotification, sendDailyReport, sendLowStockNotification } = require('./notifications');

module.exports = {
  // Настройка всех напоминаний
  setupReminders: (bot) => {
    console.log('⏰ Настройка напоминаний...');
    
    // Ежедневный отчет в 9:00
    const dailyReportJob = new cron.CronJob(
      '0 9 * * *', // Каждый день в 9:00
      async () => {
        console.log('📊 Запуск ежедневного отчета...');
        await module.exports.sendDailyReports(bot);
      },
      null,
      true,
      'Europe/Moscow'
    );
    
    // Проверка низкого запаса каждый день в 10:00
    const lowStockCheckJob = new cron.CronJob(
      '0 10 * * *', // Каждый день в 10:00
      async () => {
        console.log('⚠️ Проверка низкого запаса...');
        await module.exports.checkLowStock(bot);
      },
      null,
      true,
      'Europe/Moscow'
    );
    
    // Проверка посылок каждый день в 11:00
    const parcelCheckJob = new cron.CronJob(
      '0 11 * * *', // Каждый день в 11:00
      async () => {
        console.log('📦 Проверка посылок...');
        await module.exports.checkParcels(bot);
      },
      null,
      true,
      'Europe/Moscow'
    );
    
    // Проверка пользовательских напоминаний каждые 30 минут
    const userRemindersJob = new cron.CronJob(
      '*/30 * * * *', // Каждые 30 минут
      async () => {
        console.log('⏰ Проверка пользовательских напоминаний...');
        await module.exports.checkUserReminders(bot);
      },
      null,
      true,
      'Europe/Moscow'
    );
    
    console.log('✅ Напоминания настроены');
    
    return {
      dailyReportJob,
      lowStockCheckJob,
      parcelCheckJob,
      userRemindersJob
    };
  },
  
  // Отправка ежедневных отчетов всем пользователям
  sendDailyReports: async (bot) => {
    try {
      const users = await database.query(
        'SELECT telegram_id FROM users WHERE is_active = TRUE AND notifications_enabled = TRUE'
      );
      
      let sentCount = 0;
      for (const user of users) {
        try {
          await sendDailyReport(bot, user.telegram_id);
          sentCount++;
          
          // Небольшая задержка между отправками
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Ошибка при отправке отчета пользователю ${user.telegram_id}:`, error.message);
        }
      }
      
      console.log(`✅ Ежедневные отчеты отправлены ${sentCount} пользователям`);
      
    } catch (error) {
      console.error('Ошибка при отправке ежедневных отчетов:', error);
    }
  },
  
  // Проверка низкого запаса
  checkLowStock: async (bot) => {
    try {
      // Получаем товары с низким запасом
      const lowStockItems = await database.query(`
        SELECT * FROM warehouse 
        WHERE quantity < min_quantity
          AND (last_low_stock_notification IS NULL 
               OR last_low_stock_notification < DATE_SUB(NOW(), INTERVAL 7 DAY))
      `);
      
      if (lowStockItems.length === 0) {
        console.log('✅ Нет товаров с низким запасом для уведомления');
        return;
      }
      
      console.log(`⚠️ Найдено ${lowStockItems.length} товаров с низким запасом`);
      
      let notifiedCount = 0;
      for (const item of lowStockItems) {
        try {
          const notified = await sendLowStockNotification(bot, item.id);
          if (notified) {
            // Обновляем дату последнего уведомления
            await database.update('warehouse',
              { id: item.id },
              { last_low_stock_notification: new Date() }
            );
            notifiedCount++;
          }
        } catch (error) {
          console.error(`Ошибка при уведомлении о товаре ${item.id}:`, error);
        }
      }
      
      console.log(`✅ Уведомления отправлены для ${notifiedCount} товаров`);
      
    } catch (error) {
      console.error('Ошибка при проверке низкого запаса:', error);
    }
  },
  
  // Проверка посылок
  checkParcels: async (bot) => {
    try {
      // Проверяем посылки, которые скоро должны прибыть (в течение 3 дней)
      const soonArrivingParcels = await database.query(`
        SELECT p.*, u.telegram_id, u.notifications_enabled
        FROM parcels p
        JOIN users u ON p.user_id = u.id
        WHERE p.status IN ('in_transit', 'shipped')
          AND p.expected_date IS NOT NULL
          AND p.expected_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 DAY)
          AND u.notifications_enabled = TRUE
          AND (p.last_arrival_notification IS NULL 
               OR p.last_arrival_notification < DATE_SUB(NOW(), INTERVAL 1 DAY))
      `);
      
      if (soonArrivingParcels.length === 0) {
        console.log('✅ Нет посылок, которые скоро прибудут');
        return;
      }
      
      console.log(`📦 Найдено ${soonArrivingParcels.length} посылок, которые скоро прибудут`);
      
      let notifiedCount = 0;
      for (const parcel of soonArrivingParcels) {
        try {
          const expectedDate = new Date(parcel.expected_date);
          const today = new Date();
          const daysUntilArrival = Math.ceil((expectedDate - today) / (1000 * 60 * 60 * 24));
          
          if (daysUntilArrival >= 0 && daysUntilArrival <= 3) {
            const message = `
📦 <b>Посылка скоро прибудет!</b>

<b>Трек-номер:</b> ${parcel.tracking_number}
<b>Описание:</b> ${parcel.description || 'Без описания'}
<b>Ожидаемая дата прибытия:</b> ${expectedDate.toLocaleDateString('ru-RU')}
<b>Осталось дней:</b> ${daysUntilArrival}

<i>Будьте готовы к получению посылки!</i>
            `;
            
            const sent = await sendNotification(bot, parcel.telegram_id, message, {
              parse_mode: 'HTML',
              type: 'parcel_arrival_reminder'
            });
            
            if (sent) {
              // Обновляем дату последнего уведомления
              await database.update('parcels',
                { id: parcel.id },
                { last_arrival_notification: new Date() }
              );
              notifiedCount++;
            }
          }
        } catch (error) {
          console.error(`Ошибка при уведомлении о посылке ${parcel.id}:`, error);
        }
      }
      
      console.log(`✅ Уведомления отправлены для ${notifiedCount} посылок`);
      
    } catch (error) {
      console.error('Ошибка при проверке посылок:', error);
    }
  },
  
  // Проверка пользовательских напоминаний
  checkUserReminders: async (bot) => {
    try {
      // Получаем напоминания, которые нужно отправить
      const reminders = await database.query(`
        SELECT r.*, p.tracking_number, p.description, u.telegram_id, u.notifications_enabled
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.is_sent = FALSE
          AND r.reminder_date <= CURDATE()
          AND u.notifications_enabled = TRUE
        ORDER BY r.reminder_date
        LIMIT 50
      `);
      
      if (reminders.length === 0) {
        return;
      }
      
      console.log(`⏰ Найдено ${reminders.length} напоминаний для отправки`);
      
      let sentCount = 0;
      for (const reminder of reminders) {
        try {
          const message = `
⏰ <b>Напоминание о посылке</b>

<b>Трек-номер:</b> ${reminder.tracking_number}
<b>Описание:</b> ${reminder.description || 'Без описания'}
${reminder.message ? `<b>Сообщение:</b> ${reminder.message}\n` : ''}

<b>Дата напоминания:</b> ${new Date(reminder.reminder_date).toLocaleDateString('ru-RU')}
          `;
          
          const sent = await sendNotification(bot, reminder.telegram_id, message, {
            parse_mode: 'HTML',
            type: 'user_reminder'
          });
          
          if (sent) {
            // Отмечаем напоминание как отправленное
            await database.update('reminders',
              { id: reminder.id },
              { is_sent: true, sent_at: new Date() }
            );
            sentCount++;
          }
        } catch (error) {
          console.error(`Ошибка при отправке напоминания ${reminder.id}:`, error);
        }
      }
      
      if (sentCount > 0) {
        console.log(`✅ Отправлено ${sentCount} напоминаний`);
      }
      
    } catch (error) {
      console.error('Ошибка при проверке пользовательских напоминаний:', error);
    }
  },
  
  // Создание напоминания для пользователя
  createReminder: async (userId, parcelId, reminderDate, message = null) => {
    try {
      await database.insert('reminders', {
        user_id: userId,
        parcel_id: parcelId,
        reminder_date: reminderDate,
        message: message,
        is_sent: false,
        created_at: new Date()
      });
      
      console.log(`✅ Напоминание создано для пользователя ${userId}, посылка ${parcelId}`);
      return true;
      
    } catch (error) {
      console.error('Ошибка при создании напоминания:', error);
      return false;
    }
  },
  
  // Получение напоминаний пользователя
  getUserReminders: async (userId) => {
    try {
      const reminders = await database.query(`
        SELECT r.*, p.tracking_number, p.description
        FROM reminders r
        JOIN parcels p ON r.parcel_id = p.id
        WHERE r.user_id = ?
        ORDER BY r.reminder_date, r.is_sent
      `, [userId]);
      
      return reminders;
      
    } catch (error) {
      console.error('Ошибка при получении напоминаний пользователя:', error);
      return [];
    }
  },
  
  // Удаление напоминания
  deleteReminder: async (reminderId, userId) => {
    try {
      const result = await database.execute(
        'DELETE FROM reminders WHERE id = ? AND user_id = ?',
        [reminderId, userId]
      );
      
      return result.affectedRows > 0;
      
    } catch (error) {
      console.error('Ошибка при удалении напоминания:', error);
      return false;
    }
  },
  
  // Обновление напоминания
  updateReminder: async (reminderId, userId, updates) => {
    try {
      // Проверяем, принадлежит ли напоминание пользователю
      const reminder = await database.get(
        'SELECT * FROM reminders WHERE id = ? AND user_id = ?',
        [reminderId, userId]
      );
      
      if (!reminder) {
        return false;
      }
      
      await database.update('reminders',
        { id: reminderId },
        {
          ...updates,
          updated_at: new Date()
        }
      );
      
      return true;
      
    } catch (error) {
      console.error('Ошибка при обновлении напоминания:', error);
      return false;
    }
  }
};