require('dotenv').config();
const { Telegraf, session } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// Простой логинг
bot.use(async (ctx, next) => {
  if (ctx.message?.text) {
    console.log(`\n📨 ${ctx.from.id}: "${ctx.message.text}"`);
  }
  await next();
});

// Глобальный обработчик ВСЕХ текстовых сообщений
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  console.log(`>>> Обработка текста: "${text}"`);
  
  // Обработка команд
  if (text.startsWith('/')) {
    await handleCommand(ctx, text);
    return;
  }
  
  // Обработка кнопок по содержанию текста
  await handleButton(ctx, text);
});

// Функция обработки команд
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
      
    case '/requests':
      await handleRequests(ctx);
      break;
      
    case '/stats':
      await handleAdminStats(ctx);
      break;
      
    default:
      await ctx.reply(`Неизвестная команда: ${text}`);
  }
}

// Функция обработки кнопок (ИСПРАВЛЕННАЯ ЛОГИКА)
async function handleButton(ctx, text) {
  console.log(`>>> Кнопка: "${text}"`);
  
  // Убираем эмодзи и лишние пробелы для анализа
  const cleanText = text
    .replace(/[^\w\s\u0400-\u04FF]/gu, '') // Убираем все не-буквы, не-цифры, не-пробелы и не-кириллицу
    .trim()
    .toLowerCase();
  
  console.log(`>>> Очищенный текст: "${cleanText}"`);
  
  // Сначала проверяем отмену (используем оригинальный текст)
  if (text === '❌ Отмена' || cleanText.includes('отмен')) {
    console.log('>>> Определено как: Отмена');
    
    // Если есть активная сессия добавления посылки
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
    } else {
      await ctx.reply('❌ Отмена. Возвращаюсь в главное меню.', {
        reply_markup: {
          keyboard: [
            ['📦 Мои посылки', '➕ Добавить посылку'],
            ['🏪 Склад', '🔔 Напоминания'],
            ['📊 Статистика', '🆘 Помощь']
          ],
          resize_keyboard: true
        }
      });
    }
    return;
  }
  
  // Проверяем содержание текста (исправленная логика приоритетов)
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
  else if (cleanText.includes('назад')) {
    console.log('>>> Определено как: Назад');
    await handleStart(ctx); // Возврат в главное меню
  }
  else {
    console.log('>>> Не распознано, спрашиваем что делать');
    await ctx.reply(`Не понимаю: "${text}". Используйте кнопки меню или /help`);
  }
}

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
    
    // Отправляем меню с кнопками
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
       ORDER BY p.created_at DESC
       LIMIT 10`,
      [user.id]
    );
    
    if (parcels.length === 0) {
      await ctx.reply(
        '📭 У вас еще нет посылок.\n\n' +
        'Нажмите "➕ Добавить посылку" чтобы добавить первую посылку для отслеживания.'
      );
    } else {
      let message = `📦 Ваши посылки (${parcels.length}):\n\n`;
      
      parcels.forEach((parcel, index) => {
        message += `${index + 1}. ${parcel.tracking_number}\n`;
        message += `   Описание: ${parcel.description || 'нет'}\n`;
        message += `   Статус: ${parcel.status_text}\n`;
        if (parcel.expected_date) {
          message += `   Ожидается: ${parcel.expected_date}\n`;
        }
        message += '\n';
      });
      
      await ctx.reply(message);
    }
    
  } catch (error) {
    console.error('Ошибка в handleMyParcels:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке посылок');
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
  
  try {
    const User = require('./models/User');
    const user = await User.findByTelegramId(ctx.from.id);
    
    if (!user || !user.is_active) {
      return ctx.reply('⛔ Доступ запрещен. Отправьте /zapros');
    }
    
    const db = require('./database/connection');
    const reminders = await db.query(
      `SELECT r.*, p.tracking_number, p.description 
       FROM reminders r 
       JOIN parcels p ON r.parcel_id = p.id 
       WHERE r.user_id = ? AND r.is_sent = FALSE 
       ORDER BY r.reminder_date ASC 
       LIMIT 10`,
      [user.id]
    );
    
    if (reminders.length === 0) {
      await ctx.reply('🔔 У вас нет активных напоминаний');
      return;
    }
    
    let message = '🔔 Ваши напоминания:\n\n';
    
    reminders.forEach((reminder, index) => {
      message += `${index + 1}. Посылка: ${reminder.tracking_number}\n`;
      message += `   Дата: ${new Date(reminder.reminder_date).toLocaleDateString('ru-RU')}\n`;
      if (reminder.message) {
        message += `   Сообщение: ${reminder.message}\n`;
      }
      message += '\n';
    });
    
    await ctx.reply(message);
    
  } catch (error) {
    console.error('Ошибка в handleReminders:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
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
    `/help - Эта справка\n\n` +
    `💡 *Совет:* Все функции доступны через меню кнопок.`;
  
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

// ========== ОБРАБОТКА ВВОДА ДАННЫХ ДЛЯ ПОСЫЛОК ==========

// Обработчик для ввода данных (должен быть ДО общего обработчика text)
bot.on('message', async (ctx) => {
  // Проверяем, не идет ли процесс добавления посылки
  if (ctx.session?.parcelStep && ctx.message?.text) {
    console.log(`>>> Ввод данных посылки [шаг: ${ctx.session.parcelStep}]: "${ctx.message.text}"`);
    await handleParcelInput(ctx);
    return; // Важно: возвращаемся, чтобы общий обработчик не сработал
  }
});

// Функция обработки ввода данных посылки
async function handleParcelInput(ctx) {
  const text = ctx.message.text;
  const step = ctx.session.parcelStep;
  const data = ctx.session.parcelData || {};
  
  console.log(`>>> Обработка ввода [${step}]: "${text}"`);
  
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
        
        await ctx.reply('📝 Введите описание посылки (что это за товар):');
        break;
        
      case 'description':
        data.description = text;
        ctx.session.parcelStep = 'supplier';
        ctx.session.parcelData = data;
        
        await ctx.reply('🏢 Введите название поставщика (например: AliExpress, Banggood):');
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

// ========== АДМИНИСТРАТОРСКИЕ ФУНКЦИИ ==========

async function handleRequests(ctx) {
  console.log('>>> Функция handleRequests (админ)');
  
  // Проверка прав
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply('⛔ У вас нет прав администратора');
  }
  
  try {
    const AccessRequest = require('./models/AccessRequest');
    const requests = await AccessRequest.getPending();
    
    if (requests.length === 0) {
      await ctx.reply('📭 Нет ожидающих запросов на доступ');
      return;
    }
    
    for (const request of requests) {
      const message = 
        `📋 Запрос #${request.id}\n\n` +
        `👤: ${request.first_name} ${request.last_name || ''}\n` +
        `📛: @${request.username || 'нет'}\n` +
        `🆔: ${request.telegram_id}\n` +
        `📅: ${new Date(request.created_at).toLocaleString('ru-RU')}`;
      
      await ctx.reply(message, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Одобрить', callback_data: `approve_${request.id}` },
              { text: '❌ Отклонить', callback_data: `reject_${request.id}` }
            ]
          ]
        }
      });
    }
    
  } catch (error) {
    console.error('Ошибка в handleRequests:', error);
    await ctx.reply('❌ Произошла ошибка при загрузке запросов');
  }
}

async function handleAdminStats(ctx) {
  console.log('>>> Функция handleAdminStats');
  
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return ctx.reply('⛔ У вас нет прав администратора');
  }
  
  try {
    const db = require('./database/connection');
    const [
      totalUsers,
      activeUsers,
      pendingRequests,
      totalParcels,
      warehouseStats
    ] = await Promise.all([
      db.query('SELECT COUNT(*) as count FROM users'),
      db.query('SELECT COUNT(*) as count FROM users WHERE is_active = TRUE'),
      db.query("SELECT COUNT(*) as count FROM access_requests WHERE status = 'pending'"),
      db.query('SELECT COUNT(*) as count FROM parcels'),
      db.query('SELECT COUNT(*) as total, SUM(CASE WHEN quantity <= min_quantity THEN 1 ELSE 0 END) as low FROM warehouse')
    ]);
    
    const stats = 
      `📊 СТАТИСТИКА СИСТЕМЫ\n\n` +
      `👥 Пользователи:\n` +
      `   • Всего: ${totalUsers[0].count}\n` +
      `   • Активных: ${activeUsers[0].count}\n` +
      `   • Ожидающих доступ: ${pendingRequests[0].count}\n\n` +
      `📦 Посылки:\n` +
      `   • Отслеживается: ${totalParcels[0].count}\n\n` +
      `🏪 Склад:\n` +
      `   • Товаров всего: ${warehouseStats[0].total || 0}\n` +
      `   • Мало на остатках: ${warehouseStats[0].low || 0}`;
    
    await ctx.reply(stats);
  } catch (error) {
    console.error('Ошибка в handleAdminStats:', error);
    await ctx.reply('❌ Произошла ошибка');
  }
}

// ========== CALLBACK ОБРАБОТЧИКИ ==========

bot.action('view_requests', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return;
  }
  
  // Вызываем функцию обработки запросов
  await handleRequests(ctx);
});

bot.action(/^approve_(\d+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  
  await ctx.answerCbQuery();
  
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return;
  }
  
  console.log(`>>> Одобрение запроса #${requestId}`);
  
  try {
    const db = require('./database/connection');
    const AccessRequest = require('./models/AccessRequest');
    const User = require('./models/User');
    
    // Получаем информацию о запросе
    const request = await db.get(`
      SELECT ar.*, u.telegram_id, u.first_name
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.id = ?
    `, [requestId]);
    
    if (!request) {
      return;
    }
    
    // Обновляем статус запроса
    await AccessRequest.updateStatus(requestId, 'approved', ctx.from.id);
    
    // Активируем пользователя
    await User.updateStatus(request.user_id, true);
    
    // Отправляем уведомление пользователю
    try {
      await bot.telegram.sendMessage(
        request.telegram_id,
        `🎉 Поздравляем, ${request.first_name}!\n\n` +
        'Ваш запрос на доступ ОДОБРЕН!\n\n' +
        'Теперь вы можете пользоваться всеми функциями бота.\n' +
        'Отправьте /start для получения меню.',
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
      
      console.log(`✅ Уведомление отправлено пользователю ${request.telegram_id}`);
    } catch (error) {
      console.error(`❌ Ошибка отправки пользователю: ${error.message}`);
    }
    
    await ctx.editMessageText(`✅ Запрос #${requestId} одобрен`);
    
  } catch (error) {
    console.error('Ошибка в approve:', error);
    await ctx.editMessageText('❌ Ошибка при обработке запроса');
  }
});

bot.action(/^reject_(\d+)$/, async (ctx) => {
  const requestId = ctx.match[1];
  
  await ctx.answerCbQuery();
  
  if (ctx.from.id.toString() !== process.env.ADMIN_ID) {
    return;
  }
  
  console.log(`>>> Отклонение запроса #${requestId}`);
  
  try {
    const db = require('./database/connection');
    const AccessRequest = require('./models/AccessRequest');
    
    // Получаем информацию о запросе
    const request = await db.get(`
      SELECT ar.*, u.telegram_id, u.first_name
      FROM access_requests ar
      JOIN users u ON ar.user_id = u.id
      WHERE ar.id = ?
    `, [requestId]);
    
    if (!request) {
      return;
    }
    
    // Обновляем статус запроса
    await AccessRequest.updateStatus(requestId, 'rejected', ctx.from.id);
    
    // Отправляем уведомление пользователю
    try {
      await bot.telegram.sendMessage(
        request.telegram_id,
        `❌ Ваш запрос на доступ отклонен администратором.`
      );
    } catch (error) {
      console.error(`❌ Ошибка отправки пользователю: ${error.message}`);
    }
    
    await ctx.editMessageText(`❌ Запрос #${requestId} отклонен`);
    
  } catch (error) {
    console.error('Ошибка в reject:', error);
    await ctx.editMessageText('❌ Ошибка при обработке запроса');
  }
});

// ========== ЗАПУСК ==========

bot.launch().then(() => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 БОТ УСПЕШНО ЗАПУЩЕН!');
  console.log('='.repeat(60));
  console.log(`👑 Администратор: ${process.env.ADMIN_ID || 'не установлен'}`);
  console.log(`📊 База данных: chmb`);
  console.log('='.repeat(60));
  console.log('\n📋 Инструкция:');
  console.log('   1. Отправьте /start - получите меню');
  console.log('   2. Нажимайте кнопки - все должны работать');
  console.log('   3. Для доступа: /zapros');
  console.log('   4. Админ: /requests и /stats');
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