const schedule = require('node-schedule');
const db = require('../database/connection');

class ReminderSystem {
  constructor(bot) {
    this.bot = bot;
    this.jobs = new Map();
  }

  async init() {
    console.log('🔔 Инициализация системы напоминаний...');
    
    // Загружаем активные напоминания из БД
    const reminders = await db.query(`
      SELECT r.*, u.telegram_id 
      FROM reminders r
      JOIN users u ON r.user_id = u.id
      WHERE r.is_sent = FALSE AND r.reminder_date >= CURDATE()
    `);

    for (const reminder of reminders) {
      this.scheduleReminder(reminder);
    }

    console.log(`✅ Напоминаний загружено: ${reminders.length}`);
  }

  scheduleReminder(reminder) {
    const reminderDate = new Date(reminder.reminder_date);
    
    // Создаем задание на нужную дату
    const job = schedule.scheduleJob(reminderDate, async () => {
      try {
        await this.sendReminder(reminder);
      } catch (error) {
        console.error('Ошибка отправки напоминания:', error);
      }
    });

    this.jobs.set(reminder.id, job);
  }

  async sendReminder(reminder) {
    try {
      const parcel = await db.query(
        'SELECT tracking_number, description FROM parcels WHERE id = ?',
        [reminder.parcel_id]
      );

      if (parcel.length > 0) {
        const message = 
          `🔔 НАПОМИНАНИЕ!\n\n` +
          `Посылка: ${parcel[0].tracking_number}\n` +
          `Описание: ${parcel[0].description || 'нет'}\n\n` +
          `${reminder.message || 'Проверьте статус посылки'}`;

        await this.bot.telegram.sendMessage(reminder.telegram_id, message);

        // Помечаем как отправленное
        await db.execute(
          'UPDATE reminders SET is_sent = TRUE WHERE id = ?',
          [reminder.id]
        );

        // Удаляем задание
        const job = this.jobs.get(reminder.id);
        if (job) {
          job.cancel();
          this.jobs.delete(reminder.id);
        }
      }
    } catch (error) {
      console.error('Ошибка отправки напоминания:', error);
    }
  }

  async addReminder(userId, parcelId, reminderDate, message = '') {
    try {
      const result = await db.execute(`
        INSERT INTO reminders (user_id, parcel_id, reminder_date, message)
        VALUES (?, ?, ?, ?)
      `, [userId, parcelId, reminderDate, message]);

      const reminderId = result.insertId;
      
      // Создаем новое задание
      const reminder = {
        id: reminderId,
        user_id: userId,
        parcel_id: parcelId,
        reminder_date: reminderDate,
        message: message
      };
      
      this.scheduleReminder(reminder);
      
      return reminderId;
    } catch (error) {
      console.error('Ошибка добавления напоминания:', error);
      throw error;
    }
  }

  cancelReminder(reminderId) {
    const job = this.jobs.get(reminderId);
    if (job) {
      job.cancel();
      this.jobs.delete(reminderId);
    }
  }
}

module.exports = ReminderSystem;