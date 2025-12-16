module.exports = {
  // Главное меню
  mainMenu: () => ({
    reply_markup: {
      keyboard: [
        ['📦 Мои посылки', '➕ Добавить посылку'],
        ['📊 Склад', '🔍 Найти товар'],
        ['⚙️ Настройки', '📢 Уведомления'],
        ['📚 Помощь', '📊 Статистика']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  // Меню администратора
  adminMenu: () => ({
    reply_markup: {
      keyboard: [
        ['👥 Пользователи', '⏳ Запросы доступа'],
        ['📦 Все посылки', '📊 Управление складом'],
        ['📢 Рассылка', '📊 Статистика'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  // Меню настроек
  settingsMenu: () => ({
    reply_markup: {
      keyboard: [
        ['👤 Профиль', '🔔 Уведомления'],
        ['🌐 Язык', '🕐 Часовой пояс'],
        ['🔐 Безопасность', '📊 Статистика'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  // Меню посылок
  parcelsMenu: () => ({
    reply_markup: {
      keyboard: [
        ['📋 Список посылок', '🔍 Отследить посылку'],
        ['🔄 Обновить статус', '⏰ Напоминания'],
        ['📊 Статистика', '🔍 Поиск'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  // Меню склада
  warehouseMenu: () => ({
    reply_markup: {
      keyboard: [
        ['📋 Состояние склада', '⚠️ Низкий запас'],
        ['🔍 Поиск товара', '📊 Статистика'],
        ['➕ Добавить товар', '✏️ Редактировать'],
        ['🏠 Главное меню']
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  }),

  // Кнопка "Назад в начало"
  backToStart: () => ({
    reply_markup: {
      keyboard: [
        ['/start']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  }),

  // Кнопка "Отмена"
  cancelButton: () => ({
    reply_markup: {
      keyboard: [
        ['❌ Отмена']
      ],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  }),

  // Инлайн клавиатура для подтверждения
  confirmKeyboard: (confirmText = '✅ Подтвердить', cancelText = '❌ Отмена') => ({
    inline_keyboard: [
      [
        { text: confirmText, callback_data: 'confirm_action' },
        { text: cancelText, callback_data: 'cancel_action' }
      ]
    ]
  }),

  // Инлайн клавиатура для статусов посылок
  parcelStatusKeyboard: (parcelId) => ({
    inline_keyboard: [
      [
        { text: '🛒 Заказан', callback_data: `set_status:${parcelId}:ordered` },
        { text: '🚚 Отправлен', callback_data: `set_status:${parcelId}:shipped` }
      ],
      [
        { text: '🚛 В пути', callback_data: `set_status:${parcelId}:in_transit` },
        { text: '🏠 Прибыл', callback_data: `set_status:${parcelId}:arrived` }
      ],
      [
        { text: '✅ Получен', callback_data: `set_status:${parcelId}:received` }
      ]
    ]
  }),

  // Инлайн клавиатура для уведомлений
  notificationsKeyboard: (notificationsEnabled = true) => ({
    inline_keyboard: [
      [
        { 
          text: notificationsEnabled ? '🔕 Выключить' : '🔔 Включить', 
          callback_data: notificationsEnabled ? 'disable_notifications' : 'enable_notifications' 
        }
      ],
      [
        { text: '📦 Посылки', callback_data: 'parcel_notifications' },
        { text: '📊 Склад', callback_data: 'warehouse_notifications' }
      ],
      [
        { text: '⏰ Напоминания', callback_data: 'reminder_settings' }
      ]
    ]
  }),

  // Инлайн клавиатура для языков
  languageKeyboard: () => ({
    inline_keyboard: [
      [
        { text: '🇷🇺 Русский', callback_data: 'set_language:ru' },
        { text: '🇺🇸 English', callback_data: 'set_language:en' }
      ],
      [
        { text: '🇨🇳 中文', callback_data: 'set_language:zh' },
        { text: '🇪🇸 Español', callback_data: 'set_language:es' }
      ]
    ]
  }),

  // Инлайн клавиатура для часовых поясов
  timezoneKeyboard: () => ({
    inline_keyboard: [
      [
        { text: 'GMT+2', callback_data: 'set_timezone:2' },
        { text: 'GMT+3', callback_data: 'set_timezone:3' },
        { text: 'GMT+4', callback_data: 'set_timezone:4' }
      ],
      [
        { text: 'GMT+5', callback_data: 'set_timezone:5' },
        { text: 'GMT+6', callback_data: 'set_timezone:6' },
        { text: 'GMT+7', callback_data: 'set_timezone:7' }
      ],
      [
        { text: 'GMT+8', callback_data: 'set_timezone:8' },
        { text: 'GMT+9', callback_data: 'set_timezone:9' },
        { text: 'GMT+10', callback_data: 'set_timezone:10' }
      ]
    ]
  }),

  // Инлайн клавиатура для пагинации
  paginationKeyboard: (currentPage, totalPages, prefix = 'page') => ({
    inline_keyboard: [
      [
        { 
          text: '⬅️ Назад', 
          callback_data: currentPage > 1 ? `${prefix}:${currentPage - 1}` : `${prefix}:${currentPage}`,
          ...(currentPage <= 1 && { disabled: true })
        },
        { 
          text: `${currentPage} / ${totalPages}`, 
          callback_data: 'current_page'
        },
        { 
          text: 'Вперед ➡️', 
          callback_data: currentPage < totalPages ? `${prefix}:${currentPage + 1}` : `${prefix}:${currentPage}`,
          ...(currentPage >= totalPages && { disabled: true })
        }
      ]
    ]
  }),

  // Инлайн клавиатура для выбора даты
  dateKeyboard: (date = new Date()) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    
    const keyboard = [];
    let row = [];
    
    // Добавляем заголовок с месяцем и годом
    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                       'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    
    keyboard.push([
      { text: '⬅️', callback_data: `prev_month:${year}:${month}` },
      { text: `${monthNames[month]} ${year}`, callback_data: 'current_month' },
      { text: '➡️', callback_data: `next_month:${year}:${month}` }
    ]);
    
    // Добавляем дни недели
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    keyboard.push(dayNames.map(day => ({ text: day, callback_data: 'day_header' })));
    
    // Добавляем дни месяца
    for (let i = 1; i <= daysInMonth; i++) {
      const dayDate = new Date(year, month, i);
      const dayOfWeek = dayDate.getDay();
      const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      
      if (i === 1 && adjustedDayOfWeek > 0) {
        row = Array(adjustedDayOfWeek).fill({ text: ' ', callback_data: 'empty' });
      }
      
      row.push({ 
        text: i.toString(), 
        callback_data: `select_date:${year}-${month + 1}-${i}` 
      });
      
      if (row.length === 7 || i === daysInMonth) {
        if (row.length < 7) {
          row = [...row, ...Array(7 - row.length).fill({ text: ' ', callback_data: 'empty' })];
        }
        keyboard.push(row);
        row = [];
      }
    }
    
    // Добавляем кнопку сегодня
    const today = new Date();
    if (today.getFullYear() === year && today.getMonth() === month) {
      keyboard.push([
        { text: '🗓️ Сегодня', callback_data: `select_date:${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}` }
      ]);
    }
    
    return {
      inline_keyboard: keyboard
    };
  },

  // Инлайн клавиатура для быстрых действий
  quickActionsKeyboard: () => ({
    inline_keyboard: [
      [
        { text: '📦 Добавить посылку', callback_data: 'quick_add_parcel' },
        { text: '📊 Проверить склад', callback_data: 'quick_check_warehouse' }
      ],
      [
        { text: '🔔 Тест уведомления', callback_data: 'quick_test_notification' },
        { text: '📋 Отчет', callback_data: 'quick_report' }
      ]
    ]
  }),

  // Удалить клавиатуру
  removeKeyboard: () => ({
    reply_markup: {
      remove_keyboard: true
    }
  }),

  // Показать клавиатуру
  showKeyboard: (keyboardArray) => ({
    reply_markup: {
      keyboard: keyboardArray,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  })
};