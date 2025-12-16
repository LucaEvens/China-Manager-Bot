const { Markup } = require('telegraf');

module.exports = {
  // Клавиатура для админа (запросы доступа)
  adminRequestKeyboard(requestId) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Одобрить', `approve_${requestId}`),
        Markup.button.callback('❌ Отклонить', `reject_${requestId}`)
      ]
    ]);
  },

  // Главное меню пользователя
  mainUserKeyboard() {
    return Markup.keyboard([
      ['📦 Мои посылки', '➕ Добавить посылку'],
      ['📊 Склад', '🔔 Напоминания'],
      ['📊 Статистика', '🆘 Помощь']
    ]).resize();
  },

  // Клавиатура статусов посылок
  parcelStatusKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🛒 Заказано', 'status_ordered'),
        Markup.button.callback('🚚 Отправлено', 'status_shipped')
      ],
      [
        Markup.button.callback('✈️ В пути', 'status_in_transit'),
        Markup.button.callback('📦 Прибыло', 'status_arrived')
      ],
      [
        Markup.button.callback('✅ Получено', 'status_received')
      ]
    ]);
  },

  // Клавиатура для действий с посылкой
  parcelActionsKeyboard(parcelId) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✏️ Редактировать', `edit_parcel_${parcelId}`),
        Markup.button.callback('🗑️ Удалить', `delete_parcel_${parcelId}`)
      ],
      [
        Markup.button.callback('🔔 Напомнить', `remind_parcel_${parcelId}`)
      ]
    ]);
  }
};