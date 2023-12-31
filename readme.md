**Описание**

Делает заданное колличество свапов используя https://liquidswap.com/.
При каждом свапе выбирается случайная пара. Чтобы скрипт работал, на кошельке достаточно чтобы был только токен аптос.
Все остальные токены он купит сам.
Можно задать задержку между свапами / апрувами, случайную сумму свапа, случайный минимальный баланс.
Подробнее о конфигурации ниже.

**Конфигурация скрипта**

Пример конфиг файла - `aptos-liquid-swap/resource/config/aptos/.properties.example`.
Копируем `aptos-liquid-swap/resource/config/aptos/.properties` и вставляем свои значения:
* `SID_PHRASES_FILE` - полный путь к файлу с сид фразами или приватниками. Формат: каждая новая строка - новая фраза / приватник.

[Опционально] Файл с адресами которые будем использовать -
`aptos-liquid-swap/resource/config/aptos/wallets.txt`.
Если оставить пустым, то будут использованы все кошельки из `SID_PHRASES_FILE`.

* `MIN_DELAY_BETWEEN_SWAPS_SECONDS` - минимальная задержка между свапами
* `MAX_DELAY_BETWEEN_SWAPS_SECONDS` - максимальная задержка между свапами
* `MIN_REGISTER_TOKEN_DELAY_SECONDS` - минимальная задержка между апрувом токена
* `MAX_REGISTER_TOKEN_DELAY_SECONDS` - максимальная задержка между апрувом токена
* `MIN_SWAPS_PER_ACCOUNT` - минимальное колличество свапов на кошелек
* `MAX_SWAPS_PER_ACCOUNT` - максимальное колличество свапов на кошелек


* `APTOS_BALANCE_MIN` - минимальный баланс в аптос который оставляем на коше
* `APTOS_BALANCE_MAX` - максимальный баланс в аптос который оставляем на коше

Чтобы после частого запуска скрипта баланс на кошелькая не сходился к одному значению,
перед каждым свапом будет выбран случайный минимальный баланс в аптос токене.
Если текущий баланс меньше выбранного, свап будет произведен из случайного токена в аптос.

* `SWAP_MIN_PERCENT` - сколько минимально свапаем в % от баланса
* `SWAP_MAX_PERCENT` - сколько максимально свапаем в % от баланса
* `SLIPPAGE_MIN_PERCENT` - мин slippage
* `SLIPPAGE_MAX_PERCENT` - макс slippage


* `MIN_GAS_AMOUNT` - минимальный газ
* `MAX_GAS_AMOUNT` - максимальный газ

Минимальный газ лучше чтобы начинался с 2500. Максимальный может быть любым, но если токенов не будет хватать - транза отклонится.

* `MIN_GAS_PRICE` = минимальный газ фи
* `MAX_GAS_PRICE` = максимальный газ фи
* `RPC` - rpc аптоса
* `LOG_FILE_PER_EXECUTION` - логировать ли каждый запуск в отдельный файл. Используется для тестирования скрипта. Оставляем значение по умолчанию.

**Перед первым запуском в командной строке делаем**
```
npm install
```

**Запустить скрипт**
```
npm run aptos
```

**Обсудить / вопросы / пожелания**

https://t.me/web3_toolkit
