-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Хост: 127.0.0.1
-- Время создания: Дек 16 2025 г., 06:40
-- Версия сервера: 10.4.32-MariaDB
-- Версия PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- База данных: `chmb`
--

-- --------------------------------------------------------

--
-- Структура таблицы `access_requests`
--

CREATE TABLE `access_requests` (
  `id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `admin_id` int(11) DEFAULT NULL,
  `decision_date` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `access_requests`
--

INSERT INTO `access_requests` (`id`, `user_id`, `status`, `admin_id`, `decision_date`, `created_at`) VALUES
(4, 5, 'rejected', 2147483647, '2025-12-15 15:11:35', '2025-12-15 15:11:25'),
(5, 5, 'approved', 2147483647, '2025-12-15 15:13:23', '2025-12-15 15:11:47'),
(6, 6, 'approved', 2147483647, '2025-12-15 15:17:52', '2025-12-15 15:17:47');

-- --------------------------------------------------------

--
-- Структура таблицы `parcels`
--

CREATE TABLE `parcels` (
  `id` int(11) NOT NULL,
  `tracking_number` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `supplier` varchar(255) DEFAULT NULL,
  `status` enum('ordered','shipped','in_transit','arrived','received') DEFAULT 'ordered',
  `user_id` int(11) NOT NULL,
  `expected_date` date DEFAULT NULL,
  `actual_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `parcels`
--

INSERT INTO `parcels` (`id`, `tracking_number`, `description`, `supplier`, `status`, `user_id`, `expected_date`, `actual_date`, `notes`, `created_at`, `updated_at`) VALUES
(1, 'RU123456789CN', 'Смартфоны Xiaomi', 'AliExpress', 'in_transit', 2, NULL, NULL, NULL, '2025-12-15 14:49:23', '2025-12-15 14:49:23'),
(2, 'RU987654321CN', 'Наушники TWS', 'Banggood', 'shipped', 2, NULL, NULL, NULL, '2025-12-15 14:49:23', '2025-12-15 14:49:23'),
(3, '124', 'Ну крч да', '168', 'received', 5, NULL, NULL, NULL, '2025-12-15 16:06:21', '2025-12-15 16:15:01'),
(4, 'Но', '❌ Отмена', '❌ Отмена', 'received', 5, NULL, NULL, NULL, '2025-12-15 16:06:57', '2025-12-15 16:14:48');

-- --------------------------------------------------------

--
-- Структура таблицы `reminders`
--

CREATE TABLE `reminders` (
  `id` int(11) NOT NULL,
  `parcel_id` int(11) NOT NULL,
  `user_id` int(11) NOT NULL,
  `reminder_date` date NOT NULL,
  `message` text DEFAULT NULL,
  `is_sent` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `telegram_id` bigint(20) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 0,
  `is_admin` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `users`
--

INSERT INTO `users` (`id`, `telegram_id`, `username`, `first_name`, `last_name`, `is_active`, `is_admin`, `created_at`, `updated_at`) VALUES
(1, 7693177416, 'admin', 'Администратор', NULL, 1, 1, '2025-12-15 14:49:23', '2025-12-15 14:49:23'),
(2, 123456789, 'test_user', 'Тестовый', NULL, 1, 0, '2025-12-15 14:49:23', '2025-12-15 14:49:23'),
(5, 1340551121, 'luca_evens', 'Luca', 'Evens', 1, 0, '2025-12-15 15:11:23', '2025-12-15 15:13:23'),
(6, 6143406800, NULL, 'Александр', NULL, 1, 0, '2025-12-15 15:17:30', '2025-12-15 15:17:52');

-- --------------------------------------------------------

--
-- Структура таблицы `warehouse`
--

CREATE TABLE `warehouse` (
  `id` int(11) NOT NULL,
  `sku` varchar(100) NOT NULL,
  `name` varchar(255) NOT NULL,
  `quantity` int(11) DEFAULT 0,
  `min_quantity` int(11) DEFAULT 10,
  `location` varchar(100) DEFAULT NULL,
  `last_updated` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `warehouse`
--

INSERT INTO `warehouse` (`id`, `sku`, `name`, `quantity`, `min_quantity`, `location`, `last_updated`) VALUES
(1, 'SKU001', 'Смартфон Xiaomi Redmi Note 12', 50, 10, 'A-1', '2025-12-15 14:49:23'),
(2, 'SKU002', 'Наушники Bluetooth TWS', 5, 10, 'B-2', '2025-12-15 14:49:23'),
(3, 'SKU003', 'Power Bank 20000mAh', 25, 15, 'C-3', '2025-12-15 14:49:23'),
(4, 'SKU004', 'Кабель USB-C 2м', 100, 50, 'D-4', '2025-12-15 14:49:23'),
(5, 'SKU005', 'Чехол для iPhone', 2, 20, 'E-5', '2025-12-15 14:49:23');

--
-- Индексы сохранённых таблиц
--

--
-- Индексы таблицы `access_requests`
--
ALTER TABLE `access_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_created_at` (`created_at`);

--
-- Индексы таблицы `parcels`
--
ALTER TABLE `parcels`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `tracking_number` (`tracking_number`),
  ADD KEY `idx_tracking_number` (`tracking_number`),
  ADD KEY `idx_status` (`status`),
  ADD KEY `idx_user_id` (`user_id`),
  ADD KEY `idx_expected_date` (`expected_date`);

--
-- Индексы таблицы `reminders`
--
ALTER TABLE `reminders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `parcel_id` (`parcel_id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_reminder_date` (`reminder_date`),
  ADD KEY `idx_is_sent` (`is_sent`);

--
-- Индексы таблицы `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `telegram_id` (`telegram_id`),
  ADD KEY `idx_telegram_id` (`telegram_id`),
  ADD KEY `idx_is_active` (`is_active`);

--
-- Индексы таблицы `warehouse`
--
ALTER TABLE `warehouse`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `sku` (`sku`),
  ADD KEY `idx_sku` (`sku`),
  ADD KEY `idx_quantity` (`quantity`);

--
-- AUTO_INCREMENT для сохранённых таблиц
--

--
-- AUTO_INCREMENT для таблицы `access_requests`
--
ALTER TABLE `access_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `parcels`
--
ALTER TABLE `parcels`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `reminders`
--
ALTER TABLE `reminders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `warehouse`
--
ALTER TABLE `warehouse`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- Ограничения внешнего ключа сохраненных таблиц
--

--
-- Ограничения внешнего ключа таблицы `access_requests`
--
ALTER TABLE `access_requests`
  ADD CONSTRAINT `access_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `parcels`
--
ALTER TABLE `parcels`
  ADD CONSTRAINT `parcels_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `reminders`
--
ALTER TABLE `reminders`
  ADD CONSTRAINT `reminders_ibfk_1` FOREIGN KEY (`parcel_id`) REFERENCES `parcels` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `reminders_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
