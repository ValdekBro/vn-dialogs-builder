/**
 * Усі тексти інтерфейсу в одному місці (ARCHITECTURE.md, 2.7).
 * Інтерфейс лише українською, але так потім легко додати інші мови.
 */
export const t = {
  appName: "VNami",
  loading: "Завантаження…",

  projects: {
    title: "Проєкти",
    create: "Новий проєкт",
    namePlaceholder: "Назва проєкту",
    createConfirm: "Створити",
    cancel: "Скасувати",
    empty: "Ще немає жодного проєкту. Створіть перший.",
    scenes: (n: number) => `${n} ${plural(n, "сцена", "сцени", "сцен")}`,
    updated: (ms: number) => `змінено ${new Date(ms).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" })}`,
    rename: "Перейменувати",
    duplicate: "Дублювати",
    delete: "Видалити",
    deleteConfirm: (name: string) => `Видалити проєкт «${name}»? Файл буде переміщено в кошик.`,
    tooNew: "Створено новішою версією застосунку. Оновіть застосунок, щоб відкрити.",
    invalid: "Файл пошкоджено, відкрити неможливо.",
    open: "Відкрити",
    switchTo: "Перемкнути проєкт",
    allProjects: "Усі проєкти",
  },

  agent: {
    button: "Агент (MCP)",
    statusOff: "Агент не підключений",
    statusOn: "Агент підключений",
    statusBusy: (tool: string) => `Агент працює: ${tool}`,
    statusError: "MCP-сервер не запустився",
    title: "Підключити AI-агента",
    intro:
      "VNami має вбудований MCP-сервер: агент (Claude Code, Cursor тощо) може читати й писати діалоги у відкритому проєкті. Видалення агент робить лише після вашого підтвердження.",
    running: "Сервер працює",
    stopped: "Сервер не працює",
    promptLabel: "Найпростіше — надішліть цей промпт своєму агенту, він підключиться сам:",
    prompt: (command: string, json: string) =>
      [
        "Підключи MCP-сервер VNami — це мій локальний редактор розгалужених діалогів для візуальних новел (працює лише поки застосунок відкритий).",
        "",
        "Якщо ти Claude Code — виконай у терміналі (якщо сервер vnami вже є, спершу `claude mcp remove vnami`):",
        command,
        "",
        "Якщо ти інший клієнт (Cursor, Windsurf…) — додай сервер у свій конфіг MCP:",
        json,
        "",
        "Новий MCP-сервер з'явиться лише в новій сесії: після підключення скажи мені перезапустити сесію (або перепідключити через /mcp). У новій сесії виклич get_project і коротко розкажи, що зараз у проєкті.",
      ].join("\n"),
    manual: "Або вручну:",
    claudeCode: "Claude Code — виконайте в терміналі:",
    otherClients: "Інші клієнти (Cursor, Windsurf…) — додайте в конфіг MCP:",
    url: "Адреса",
    token: "Токен",
    showToken: "Показати токен",
    hideToken: "Сховати токен",
    copy: "Скопіювати",
    copied: "Скопійовано",
    timeoutHint:
      "Агент чекає на ваше підтвердження видалення до 2 хвилин. Якщо клієнт обриває виклик раніше, збільште його таймаут (у Claude Code — змінна MCP_TOOL_TIMEOUT=180000).",
    onlyWhileOpen: "Сервер доступний лише поки VNami відкрита, і лише з цього комп'ютера.",
    tryIt: "Спробуйте попросити агента:",
    example: "«Прочитай проєкт і допиши сцену „Ранок“: ГГ іде по воду й зустрічає Бена. Дай гравцю вибір, як відповісти».",
    close: "Закрити",
  },

  approval: {
    heading: "Агент просить підтвердження",
    reason: "Причина",
    approve: "Підтвердити",
    reject: "Відхилити",
    show: "Показати",
    timeLeft: (s: number) => `${s} с`,
  },

  update: {
    available: (v: string) => `Доступна нова версія ${v}`,
    whatsNew: "Що нового",
    install: "Оновити",
    download: "Завантажити",
    downloadHint: "Відкриється сторінка релізу: завантажте .dmg і перетягніть VNami у «Програми» замість старої версії. Проєкти збережуться.",
    later: "Нагадати пізніше",
    downloading: (v: string, p: number) => `Завантаження версії ${v}… ${p}%`,
    installing: "Зберігаю проєкт і перезапускаюсь…",
    failed: "Не вдалося оновити.",
    manual: "Завантажити вручну",
    check: "Перевірити оновлення",
    checking: "Перевіряю…",
    latest: (v: string) => `У вас остання версія (${v})`,
    checkFailed: "Не вдалося перевірити оновлення. Перевірте з'єднання з інтернетом.",
    unsupportedDev: "Оновлення працюють лише у встановленій версії застосунку.",
    unsupportedPlatform: "Оновлення є лише у Windows- і Mac-версіях. Нові версії — на сторінці релізів.",
    version: (v: string) => `VNami ${v}`,
  },

  views: {
    label: "Розділи проєкту",
    builder: "Діалоги",
    characters: "Персонажі",
    project: "Про проєкт",
  },

  project: {
    name: "Назва проєкту",
    lore: "Опис лору",
    loreHint: "Світ, історія, тон оповіді. Агент читає це перед тим, як писати діалоги.",
    lorePlaceholder: "Маленьке містечко біля моря. Останній рік школи…",
    stats: {
      scenes: "Сцен",
      characters: "Персонажів",
      lines: "Реплік",
      issues: "Помилок",
    },
  },

  scenes: {
    title: "Сцени",
    add: "Додати сцену",
    name: "Назва сцени",
    defaultName: (n: number) => `Сцена ${n}`,
    description: "Опис сцени",
    descriptionPlaceholder: "Короткий опис сцени (необов'язково)",
    empty: "У проєкті немає сцен.",
    errors: (n: number) => `Помилок у сцені: ${n}`,
  },

  characters: {
    title: "Персонажі",
    add: "Додати персонажа",
    newName: "Новий персонаж",
    author: "вбудований",
    name: "Ім'я",
    color: "Колір",
    description: "Опис та історія",
    descriptionHint: "Хто це, що з ним відбувалося, чого прагне.",
    descriptionPlaceholder: "Однокласниця героя, мріє стати художницею…",
    speechStyle: "Стиль мовлення",
    speechStyleHint: "Як говорить: темп, лексика, улюблені слова. Агент дотримується цього, коли пише репліки.",
    speechStylePlaceholder: "Говорить швидко, багато емоцій, часто жартує…",
    lines: (n: number) => `Репліки: ${n}`,
    noLines: "У цього персонажа ще немає реплік.",
    delete: "Видалити персонажа",
    deleteConfirm: (name: string, n: number) =>
      `Видалити персонажа «${name}»? Його репліки (${n}) залишаться без персонажа й будуть позначені червоним.`,
  },

  canvas: {
    addFirst: "Додати перший блок",
    start: "старт",
    emptyText: "Порожній текст",
    noCharacter: "Без персонажа",
    addLine: "Варіант",
    linePlaceholder: "Текст репліки…",
    choicePlaceholder: (n: number) => `Варіант ${n}…`,
    draftHint: "Enter — зберегти · Shift+Enter — новий рядок · Esc — скасувати",
    pickCharacter: "Хто говорить?",
    filterCharacters: "Пошук персонажа…",
    createCharacter: (name: string) => `+ Створити персонажа «${name}»`,
    tip: {
      character: "Змінити персонажа",
      makeStart: "Зробити стартовим",
      remove: "Видалити блок",
      addLine: "Додати варіант вибору",
      addLineDraft: "Ще варіант (вибір)",
      removeLine: "Видалити варіант",
      editText: "Подвійний клік — редагувати",
      newBlock: "Новий блок",
      end: "Кінець сцени",
      finish: "Далі: з'єднати з блоком, перейти до сцени або кінець",
      openScene: (name: string) => `Відкрити сцену «${name}»`,
      removeTransition: "Прибрати перехід",
      removeEnd: "Прибрати кінець",
      insert: "Вставити блок",
      disconnect: "Відключити",
      zoomIn: "Наблизити",
      zoomOut: "Віддалити",
      fit: "Вмістити все",
      drag: "Перетягнути блок",
      unpin: "Повернути на авторозкладку",
      autoLayout: "Авторозкладка: повернути всі блоки на місця",
    },
    endLabel: "КІНЕЦЬ",
    finish: {
      toScene: "Перейти на початок сцени",
      link: "З'єднати з блоком",
      noScenes: "Інших сцен поки немає",
      newScene: "Нова сцена",
      end: "Кінець історії",
      label: "Далі",
    },
    deleted: (n: number) => (n === 1 ? "Блок видалено" : `Видалено блоків: ${n}`),
    undo: "Скасувати",
  },

  history: {
    undo: "Скасувати",
    redo: "Повторити",
    undoWhat: (label: string | null) => (label ? `Скасувати: ${label}` : "Нічого скасовувати"),
    redoWhat: (label: string | null) => (label ? `Повторити: ${label}` : "Нічого повторювати"),
  },

  save: {
    saved: "Збережено",
    dirty: "Є зміни…",
    saving: "Збереження…",
    error: "Не вдалося зберегти",
  },

  errors: {
    generic: "Щось пішло не так",
  },
};

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
