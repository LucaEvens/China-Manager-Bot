require('dotenv').config();
const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// ========== ФУНКЦИИ ОБРАБОТКИ ==========

async function handleStart(ctx) {
  console.log('>>> Функция handleStart');
  
  try {
    const User = require('./models/User');
    let user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
      const userData = {
        telegram_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || 'Пользователь',
        last_name: ctx.from.last_name || null
      };
      user = await User.create(userData);
    }
    
    const message = user.is_active 
      ? `✅ Добро пожаловать, ${user.first_name}!`
      : `👋 Привет, ${user.first_name}! Отправьте /zapros для доступа.`;
    
    await ctx.reply(message, {
      reply_markup: {
        keyboard: [
          ['📦 Мои посылки', '➕ Добавить посылку'],
          ['🏪 Склад', '🔔 Напоминания'],
          ['📊 Статистика', '🆘 Помощь']
        ],
        resize_keyboard: true
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleStart:', error);
    await ctx.reply('Ошибка при запуске. Попробуйте снова.');
  }
}

async function handleAddParcel(ctx) {
  console.log('>>> Функция handleAddParcel');
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros для получения доступа');
    }
    
    // Начинаем процесс добавления
    ctx.session = ctx.session || {};
    ctx.session.parcelStep = 'tracking';
    ctx.session.parcelData = {};
    
    await ctx.reply(
      '📦 Добавление новой посылки:\n\n' +
      'Введите трек-номер посылки:',
      {
        reply_markup: {
          keyboard: [['❌ Отмена']],
          resize_keyboard: true
        }
      }
    );
    
  } catch (error) {
    console.error('Ошибка в handleAddParcel:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

async function handleMyParcels(ctx) {
  console.log('>>> Функция handleMyParcels');
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros для получения доступа');
    }
    
    const db = require('./database/connection');
    const parcels = await db.query(
      `SELECT p.*, u.first_name as user_name,
         CASE p.status
           WHEN 'ordered' THEN '🛒 Заказано'
           WHEN 'shipped' THEN '🚚 Отправлено'
           WHEN 'in_transit' THEN '✈️ В пути'
           WHEN 'arrived' THEN '📦 Прибыло'
           WHEN 'received' THEN '✅ Получено'
           ELSE p.status
         END as status_text
       FROM parcels p
       LEFT JOIN users u ON p.user_id = u.id
       ORDER BY p.created_at DESC
       LIMIT 10`
    );
    
    if (parcels.length === 0) {
      await ctx.reply(
        '📭 Нет посылок в системе.\n\n' +
        'Нажмите "➕ Добавить посылку" чтобы добавить первую посылку для отслеживания.'
      );
      return;
    }
    
    let message = `📦 Все посылки в системе (${parcels.length}):\n\n`;
    
    parcels.forEach((parcel, index) => {
      const userInfo = parcel.user_name ? `👤 ${parcel.user_name}` : '';
      message += `${index + 1}. ${parcel.tracking_number}\n`;
      message += `   Описание: ${parcel.description || 'нет'}\n`;
      message += `   Статус: ${parcel.status_text}\n`;
      if (parcel.supplier) {
        message += `   Поставщик: ${parcel.supplier}\n`;
      }
      if (parcel.expected_date) {
        message += `   Ожидается: ${parcel.expected_date}\n`;
      }
      if (userInfo) {
        message += `   ${userInfo}\n`;
      }
      message += '\n';
    });
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: [[
          { text: '✏️ Изменить статус', callback_data: 'change_parcel_status' }
        ]]
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleMyParcels:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке посылок');
  }
}

// Добавьте эти функции в файл

// Функция выбора посылки для изменения статуса
async function handleChangeParcelStatus(ctx) {
  console.log('>>> Функция handleChangeParcelStatus');
  
  try {
    const db = require('./database/connection');
    const parcels = await db.query(
      `SELECT p.id, p.tracking_number, p.description, p.status
       FROM parcels p
       ORDER BY p.created_at DESC
       LIMIT 10`
    );
    
    if (parcels.length === 0) {
      await ctx.reply('📭 Нет посылок для изменения статуса');
      return;
    }
    
    let message = '📦 Выберите посылку для изменения статуса:\n\n';
    
    parcels.forEach((parcel, index) => {
      const statusEmoji = {
        'ordered': '🛒',
        'shipped': '🚚',
        'in_transit': '✈️',
        'arrived': '📦',
        'received': '✅'
      }[parcel.status] || '📦';
      
      message += `${index + 1}. ${statusEmoji} ${parcel.tracking_number}\n`;
      if (parcel.description) {
        message += `   ${parcel.description}\n`;
      }
      message += `   Текущий статус: ${parcel.status}\n\n`;
    });
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: parcels.map(parcel => [
          { 
            text: `${parcel.tracking_number}`, 
            callback_data: `select_parcel_${parcel.id}` 
          }
        ])
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleChangeParcelStatus:', error);
    await ctx.reply('❌ Ошибка загрузки посылок');
  }
}

// Функция выбора нового статуса
async function handleSelectParcelStatus(ctx, parcelId) {
  console.log(`>>> Функция handleSelectParcelStatus для посылки ${parcelId}`);
  
  try {
    const db = require('./database/connection');
    const [parcel] = await db.query(
      'SELECT tracking_number, description, status FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    if (!parcel) {
      await ctx.reply('❌ Посылка не найдена');
      return;
    }
    
    const statusOptions = [
      { text: '🛒 Заказано', value: 'ordered' },
      { text: '🚚 Отправлено', value: 'shipped' },
      { text: '✈️ В пути', value: 'in_transit' },
      { text: '📦 Прибыло', value: 'arrived' },
      { text: '✅ Получено', value: 'received' }
    ];
    
    const message = 
      `📦 Посылка: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'нет'}\n` +
      `📊 Текущий статус: ${parcel.status}\n\n` +
      `Выберите новый статус:`;
    
    await ctx.reply(message, {
      reply_markup: {
        inline_keyboard: statusOptions.map(status => [
          { 
            text: status.text, 
            callback_data: `update_status_${parcelId}_${status.value}` 
          }
        ])
      }
    });
    
  } catch (error) {
    console.error('Ошибка в handleSelectParcelStatus:', error);
    await ctx.reply('❌ Ошибка');
  }
}

// Функция обновления статуса
async function handleUpdateParcelStatus(ctx, parcelId, newStatus) {
  console.log(`>>> Обновление статуса посылки ${parcelId} на ${newStatus}`);
  
  try {
    const db = require('./database/connection');
    
    // Обновляем статус
    await db.execute(
      'UPDATE parcels SET status = ? WHERE id = ?',
      [newStatus, parcelId]
    );
    
    // Получаем обновленные данные
    const [parcel] = await db.query(
      'SELECT tracking_number, description FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    const statusText = {
      'ordered': '🛒 Заказано',
      'shipped': '🚚 Отправлено',
      'in_transit': '✈️ В пути',
      'arrived': '📦 Прибыло',
      'received': '✅ Получено'
    }[newStatus] || newStatus;
    
    await ctx.reply(
      `✅ Статус посылки обновлен!\n\n` +
      `📦 Посылка: ${parcel.tracking_number}\n` +
      `📝 Описание: ${parcel.description || 'нет'}\n` +
      `🔄 Новый статус: ${statusText}`
    );
    
    // Уведомляем пользователя, который добавил посылку (если это не текущий пользователь)
    const [parcelOwner] = await db.query(
      'SELECT user_id FROM parcels WHERE id = ?',
      [parcelId]
    );
    
    if (parcelOwner && parcelOwner.user_id) {
      const [user] = await db.query(
        'SELECT telegram_id, first_name FROM users WHERE id = ?',
        [parcelOwner.user_id]
      );
      
      if (user && user.telegram_id !== ctx.from.id) {
        try {
          await bot.telegram.sendMessage(
            user.telegram_id,
            `📦 Статус вашей посылки изменен!\n\n` +
            `🔢 Трек-номер: ${parcel.tracking_number}\n` +
            `📝 Описание: ${parcel.description || 'нет'}\n` +
            `🔄 Новый статус: ${statusText}\n` +
            `👤 Изменил: ${ctx.from.first_name}`
          );
        } catch (error) {
          console.error('Не удалось уведомить владельца посылки:', error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('Ошибка обновления статуса:', error);
    await ctx.reply('❌ Ошибка обновления статуса');
  }
}


async function handleWarehouse(ctx) {
  console.log('>>> Функция handleWarehouse');
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros');
    }
    
    const db = require('./database/connection');
    const items = await db.query(
      'SELECT * FROM warehouse ORDER BY quantity ASC LIMIT 20'
    );
    
    if (items.length === 0) {
      await ctx.reply('🏪 Склад пуст');
      return;
    }
    
    let message = '🏪 Товары на складе:\n\n';
    
    items.forEach((item, index) => {
      const status = item.quantity <= item.min_quantity ? '⚠️' : '✅';
      message += `${index + 1}. ${status} ${item.name}\n`;
      message += `   SKU: ${item.sku}\n`;
      message += `   Количество: ${item.quantity} (мин: ${item.min_quantity})\n`;
      if (item.location) {
        message += `   Место: ${item.location}\n`;
      }
      message += '\n';
    });
    
    const lowStock = items.filter(item => item.quantity <= item.min_quantity).length;
    if (lowStock > 0) {
      message += `\n⚠️ Внимание: ${lowStock} товаров с низким остатком!`;
    }
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Ошибка в handleWarehouse:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке склада');
  }
}

async function handleReminders(ctx) {
  console.log('>>> Функция handleReminders');
  await ctx.reply('🔔 Функция напоминаний в разработке...');
}

async function handleStatistics(ctx) {
  console.log('>>> Функция handleStatistics');
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros');
    }
    
    const db = require('./database/connection');
    const [parcelsCount] = await db.query(
      'SELECT COUNT(*) as count FROM parcels WHERE user_id = ?',
      [user.id]
    );
    
    const [remindersCount] = await db.query(
      'SELECT COUNT(*) as count FROM reminders WHERE user_id = ? AND is_sent = FALSE',
      [user.id]
    );
    
    const message = 
      `📊 Ваша статистика:\n\n` +
      `👤 Пользователь: ${user.first_name}\n` +
      `📅 Регистрация: ${new Date(user.created_at).toLocaleDateString('ru-RU')}\n\n` +
      `📦 Посылки:\n` +
      `   • Отслеживается: ${parcelsCount.count}\n\n` +
      `🔔 Напоминания:\n` +
      `   • Активных: ${remindersCount.count}`;
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Ошибка в handleStatistics:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

async function handleHelp(ctx) {
  console.log('>>> Функция handleHelp');
  
  const message = 
    `🆘 Помощь и инструкция:\n\n` +
    `📦 *Мои посылки* - просмотр всех отслеживаемых посылок\n` +
    `➕ *Добавить посылку* - добавить новую посылку для отслеживания\n` +
    `🏪 *Склад* - просмотр товаров на складе и остатков\n` +
    `🔔 *Напоминания* - просмотр установленных напоминаний\n` +
    `📊 *Статистика* - ваша личная статистика\n\n` +
    `📞 *Команды:*\n` +
    `/start - Начать работу / обновить меню\n` +
    `/zapros - Запросить доступ к функциям\n` +
    `/help - Эта справка`;
  
  await ctx.reply(message);
}

async function handleZapros(ctx) {
  console.log('>>> Функция handleZapros');
  
  try {
    const User = require('./models/User');
    const AccessRequest = require('./models/AccessRequest');
    
    let user = await User.findByTelegramId(ctx.from.id);
    
    if (!user) {
      const userData = {
        telegram_id: ctx.from.id,
        username: ctx.from.username || null,
        first_name: ctx.from.first_name || 'Пользователь',
        last_name: ctx.from.last_name || null
      };
      user = await User.create(userData);
    }
    
    // Проверяем активный запрос
    const existingRequest = await AccessRequest.findByUser(user.id);
    
    if (existingRequest) {
      await ctx.reply('📨 Ваш запрос уже отправлен и ожидает рассмотрения администратором.');
      return;
    }
    
    // Создаем новый запрос
    await AccessRequest.create(user.id);
    
    // Отправляем уведомление админу
    const ADMIN_ID = process.env.ADMIN_ID;
    if (ADMIN_ID) {
      try {
        const adminMessage = 
          `📨 НОВЫЙ ЗАПРОС НА ДОСТУП!\n\n` +
          `👤 Пользователь: ${user.first_name} ${user.last_name || ''}\n` +
          `📛 ${user.username ? '@' + user.username : 'без username'}\n` +
          `🆔 ID: ${user.telegram_id}\n` +
          `📅 Дата: ${new Date().toLocaleString('ru-RU')}\n\n` +
          `Для обработки используйте команду /requests`;
        
        await bot.telegram.sendMessage(ADMIN_ID, adminMessage, {
          reply_markup: {
            inline_keyboard: [[
              { text: '📋 Просмотреть запросы', callback_data: 'view_requests' }
            ]]
          }
        });
        
        console.log(`✅ Уведомление отправлено администратору ${ADMIN_ID}`);
        
      } catch (error) {
        console.error('Ошибка отправки уведомления админу:', error.message);
      }
    }
    
    await ctx.reply(
      '✅ Запрос на доступ успешно отправлен!\n\n' +
      'Администратор получил уведомление и скоро рассмотрит вашу заявку.\n' +
      'Вы получите сообщение когда доступ будет предоставлен.\n\n' +
      'А пока можете отправить /start для возврата в меню.'
    );
    
  } catch (error) {
    console.error('Ошибка в handleZapros:', error);
    await ctx.reply('❌ Произошла ошибка при отправке запроса. Попробуйте позже.');
  }
}

async function handleParcelInput(ctx) {
  const text = ctx.message.text;
  const step = ctx.session.parcelStep;
  const data = ctx.session.parcelData || {};
  
  console.log(`>>> Ввод данных посылки [шаг: ${step}]: "${text}"`);
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
      await ctx.reply('⛔ Сессия прервана. Нет доступа.');
      return;
    }
    
    const db = require('./database/connection');
    
    switch (step) {
      case 'tracking':
        // Проверяем уникальность трек-номера
        const existing = await db.query(
          'SELECT id FROM parcels WHERE tracking_number = ?',
          [text]
        );
        
        if (existing.length > 0) {
          await ctx.reply('❌ Посылка с таким трек-номером уже существует. Введите другой трек-номер:');
          return;
        }
        
        data.tracking_number = text;
        ctx.session.parcelStep = 'description';
        ctx.session.parcelData = data;
        
        await ctx.reply('📝 Введите описание посылки (что это за товар):', {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        });
        break;
        
      case 'description':
        data.description = text;
        ctx.session.parcelStep = 'supplier';
        ctx.session.parcelData = data;
        
        await ctx.reply('🏢 Введите название поставщика (например: AliExpress, Banggood):', {
          reply_markup: {
            keyboard: [['❌ Отмена']],
            resize_keyboard: true
          }
        });
        break;
        
      case 'supplier':
        data.supplier = text;
        
        // Сохраняем посылку
        await db.execute(`
          INSERT INTO parcels (tracking_number, description, supplier, user_id, status)
          VALUES (?, ?, ?, ?, 'ordered')
        `, [data.tracking_number, data.description, data.supplier, user.id]);
        
        // Очищаем сессию
        delete ctx.session.parcelStep;
        delete ctx.session.parcelData;
        
        await ctx.reply(
          `✅ Посылка успешно добавлена!\n\n` +
          `🔢 Трек-номер: ${data.tracking_number}\n` +
          `📝 Описание: ${data.description}\n` +
          `🏢 Поставщик: ${data.supplier}\n\n` +
          `Теперь вы можете отслеживать её статус в "📦 Мои посылки"`,
          {
            reply_markup: {
              keyboard: [
                ['📦 Мои посылки', '➕ Добавить посылку'],
                ['🏪 Склад', '🔔 Напоминания'],
                ['📊 Статистика', '🆘 Помощь']
              ],
              resize_keyboard: true
            }
          }
        );
        break;
    }
    
  } catch (error) {
    console.error('Ошибка при добавлении посылки:', error);
    await ctx.reply('❌ Произошла ошибка при сохранении посылки. Попробуйте снова.');
    
    // Очищаем сессию при ошибке
    delete ctx.session?.parcelStep;
    delete ctx.session?.parcelData;
  }
}

async function handleCommand(ctx, text) {
  console.log(`>>> Команда: ${text}`);
  
  switch (text.toLowerCase()) {
    case '/start':
      await handleStart(ctx);
      break;
      
    case '/zapros':
      await handleZapros(ctx);
      break;
      
    case '/help':
      await ctx.reply('Помощь: /start - начать, /zapros - запрос доступа');
      break;
      
    default:
      await ctx.reply(`Неизвестная команда: ${text}. Используйте /help`);
  }
}

// ========== ИСПРАВЛЕННАЯ ФУНКЦИЯ ОБРАБОТКИ КНОПОК ==========

async function handleButton(ctx, text) {
  const cleanText = text
    .replace(/[^\w\s\u0400-\u04FF]/gu, '')
    .trim()
    .toLowerCase();
  
  console.log(`>>> Очищенный текст: "${cleanText}"`);
  
  // Сначала проверяем отмену (по оригинальному тексту)
  if (text === '❌ Отмена') {
    console.log('>>> ОТМЕНА (по точному совпадению)');
    
    if (ctx.session?.parcelStep) {
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
      
      await ctx.reply('❌ Добавление посылки отменено.', {
        reply_markup: {
          keyboard: [
            ['📦 Мои посылки', '➕ Добавить посылку'],
            ['🏪 Склад', '🔔 Напоминания'],
            ['📊 Статистика', '🆘 Помощь']
          ],
          resize_keyboard: true
        }
      });
      return; // Важно: return чтобы не обрабатывалось дальше
    }
  }
  
  // Основные кнопки (только если это не отмена)
  if (cleanText.includes('добав')) {
    console.log('>>> Определено как: Добавить посылку');
    await handleAddParcel(ctx);
  } 
  else if (cleanText.includes('посыл')) {
    console.log('>>> Определено как: Мои посылки');
    await handleMyParcels(ctx);
  }
  else if (cleanText.includes('склад')) {
    console.log('>>> Определено как: Склад');
    await handleWarehouse(ctx);
  }
  else if (cleanText.includes('напомин')) {
    console.log('>>> Определено как: Напоминания');
    await handleReminders(ctx);
  }
  else if (cleanText.includes('статистик')) {
    console.log('>>> Определено как: Статистика');
    await handleStatistics(ctx);
  }
  else if (cleanText.includes('помощ')) {
    console.log('>>> Определено как: Помощь');
    await handleHelp(ctx);
  }
  else {
    console.log('>>> Не распознано');
    await ctx.reply(`Не понимаю: "${text}". Используйте кнопки меню.`);
  }
}

// ========== ИСПРАВЛЕННЫЙ ПОРЯДОК ОБРАБОТЧИКОВ ==========

// 1. Сначала обработчик ВСЕХ сообщений для вывода в лог
bot.use(async (ctx, next) => {
  if (ctx.message?.text) {
    console.log(`\n📨 ${ctx.from.id}: "${ctx.message.text}"`);
  }
  await next();
});

// 2. Обработчик для ввода данных посылки (должен быть ПЕРВЫМ)
bot.on('message', async (ctx, next) => {
  // Если есть активная сессия добавления посылки
  if (ctx.session?.parcelStep && ctx.message?.text) {
    const text = ctx.message.text;
    
    // ПРОВЕРЯЕМ ОТМЕНУ СРАЗУ
    if (text === '❌ Отмена') {
      console.log('>>> Отмена в обработчике message');
      delete ctx.session.parcelStep;
      delete ctx.session.parcelData;
      
      await ctx.reply('❌ Добавление посылки отменено.', {
        reply_markup: {
          keyboard: [
            ['📦 Мои посылки', '➕ Добавить посылку'],
            ['🏪 Склад', '🔔 Напоминания'],
            ['📊 Статистика', '🆘 Помощь']
          ],
          resize_keyboard: true
        }
      });
      return; // Не идем дальше
    }
    
    // Если не отмена, обрабатываем как ввод данных
    console.log(`>>> Ввод данных посылки [${ctx.session.parcelStep}]: "${text}"`);
    await handleParcelInput(ctx);
    return; // Не идем дальше
  }
  await next();
});

// 3. Обработчик команд
bot.on('text', async (ctx, next) => {
  const text = ctx.message.text;
  
  if (text.startsWith('/')) {
    console.log(`>>> Команда: ${text}`);
    await handleCommand(ctx, text);
    return; // Не идем дальше
  }
  
  await next();
});

// 4. Обработчик кнопок (последний в цепочке)
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  console.log(`>>> Кнопка/текст: "${text}"`);
  await handleButton(ctx, text);
});


// ========== CALLBACK ОБРАБОТЧИКИ ДЛЯ ИЗМЕНЕНИЯ СТАТУСА ==========

// Обработчик кнопки "Изменить статус"
bot.action('change_parcel_status', async (ctx) => {
  console.log('>>> Callback: change_parcel_status');
  await ctx.answerCbQuery();
  await handleChangeParcelStatus(ctx);
});

// Обработчик выбора посылки
bot.action(/^select_parcel_(\d+)$/, async (ctx) => {
  const parcelId = ctx.match[1];
  console.log(`>>> Callback: select_parcel_${parcelId}`);
  await ctx.answerCbQuery();
  await handleSelectParcelStatus(ctx, parcelId);
});

// Обработчик обновления статуса
bot.action(/^update_status_(\d+)_(.+)$/, async (ctx) => {
  const parcelId = ctx.match[1];
  const newStatus = ctx.match[2];
  console.log(`>>> Callback: update_status_${parcelId}_${newStatus}`);
  await ctx.answerCbQuery();
  await handleUpdateParcelStatus(ctx, parcelId, newStatus);
});

// Обработчик обновления списка
bot.action('refresh_parcels', async (ctx) => {
  console.log('>>> Callback: refresh_parcels');
  await ctx.answerCbQuery();
  await handleMyParcels(ctx);
});

// Обработчик фильтрации (можно расширить позже)
bot.action('filter_parcels', async (ctx) => {
  console.log('>>> Callback: filter_parcels');
  await ctx.answerCbQuery();
  
  const inlineKeyboard = [
    [
      { text: '🛒 Заказанные', callback_data: 'filter_status_ordered' },
      { text: '🚚 Отправленные', callback_data: 'filter_status_shipped' }
    ],
    [
      { text: '✈️ В пути', callback_data: 'filter_status_in_transit' },
      { text: '📦 Прибывшие', callback_data: 'filter_status_arrived' }
    ],
    [
      { text: '✅ Полученные', callback_data: 'filter_status_received' },
      { text: '📋 Все', callback_data: 'filter_status_all' }
    ]
  ];
  
  await ctx.reply('Выберите статус для фильтрации:', {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  });
});


// ========== ЗАПУСК ==========

bot.launch().then(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 БОТ УСПЕШНО ЗАПУЩЕН!');
  console.log('='.repeat(60));
  console.log('📱 Отправьте /start для начала работы');
  console.log('🎯 Все кнопки должны работать корректно');
  console.log('='.repeat(60));
}).catch(err => {
  console.error('❌ ОШИБКА ЗАПУСКА БОТА:', err);
  process.exit(1);
});

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('\n🛑 Остановка бота...');
  bot.stop('SIGINT');
  process.exit(0);
});