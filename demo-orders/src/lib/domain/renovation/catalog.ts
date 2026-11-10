export type RenovationSectionKey = "interior" | "house";

export type RenovationItemDef = {
  id: string;
  label: string;
};

export type RenovationBlockDef = {
  id: string;
  section: RenovationSectionKey;
  title: string;
  items: RenovationItemDef[];
};

export const RENOVATION_SECTION_LABELS: Record<RenovationSectionKey, string> = {
  interior: "Ремонт",
  house: "Дом и участок",
};

/** Work stages printed in the KP; not priced separately. */
export const RENOVATION_WORK_STAGES: string[] = [
  "Проектировка дома и планировка мебели",
  "Демонтаж и подготовка помещений",
  "Перегородки и необходимые строительные работы",
  "Электрика, отопление, водоснабжение и канализация",
  "Штукатурка стен и стяжка пола",
  "Гидроизоляция санузлов",
  "Подготовка потолков и стен",
  "Укладка плитки и напольных покрытий",
  "Покраска стен и монтаж потолков",
  "Установка дверей",
  "Монтаж кухни и встроенной мебели",
  "Установка сантехники, светильников и розеток",
  "Шторы, мебель, декор и уборка",
];

function item(id: string, label: string): RenovationItemDef {
  return { id, label };
}

export const RENOVATION_BLOCKS: RenovationBlockDef[] = [
  {
    id: "rough_works",
    section: "interior",
    title: "Черновые работы",
    items: [
      item("rough_works.plaster", "Штукатурка стен"),
      item("rough_works.leveling", "Выравнивание стен и углов"),
      item("rough_works.screed", "Стяжка пола"),
      item("rough_works.bath_waterproof", "Гидроизоляция ванной комнаты"),
      item("rough_works.soundproof", "Шумоизоляция при необходимости"),
      item("rough_works.insulation", "Утепление внутренних конструкций, если требуется"),
      item("rough_works.prep", "Подготовка стен и потолков"),
      item("rough_works.cracks", "Заделка трещин и других дефектов"),
    ],
  },
  {
    id: "electrical",
    section: "interior",
    title: "Электрика",
    items: [
      item("electrical.panel", "Электрический щит и автоматы"),
      item("electrical.sockets", "Розетки во всех комнатах"),
      item("electrical.tv_net", "Выводы для телевизоров и интернета"),
      item("electrical.appliance", "Розетки для холодильника, духовки и другой техники"),
      item("electrical.ac", "Выводы для кондиционеров"),
      item("electrical.ceiling_light", "Освещение потолка"),
      item("electrical.accent_light", "Подсветка ниш, штор и мебели"),
      item("electrical.switches", "Выключатели у входов и возле кроватей"),
      item("electrical.smart_home", "Подготовка электрики для умного дома при необходимости"),
    ],
  },
  {
    id: "plumbing_heating",
    section: "interior",
    title: "Отопление, вода и канализация",
    items: [
      item("plumbing_heating.boiler", "Котёл или другой источник отопления"),
      item("plumbing_heating.radiators", "Радиаторы либо тёплый пол"),
      item("plumbing_heating.heating_pipes", "Трубы отопления"),
      item("plumbing_heating.water", "Разводка холодной и горячей воды"),
      item("plumbing_heating.sewage", "Канализация"),
      item("plumbing_heating.collectors", "Коллекторы и запорная арматура"),
      item("plumbing_heating.filters", "Фильтры для воды"),
      item("plumbing_heating.heater", "Водонагреватель, если необходим"),
      item("plumbing_heating.ventilation", "Вытяжная вентиляция"),
      item("plumbing_heating.outlets", "Подготовка выводов для душа, ванны, унитазов и раковин"),
    ],
  },
  {
    id: "kitchen",
    section: "interior",
    title: "Кухня",
    items: [
      item("kitchen.set", "Кухонный гарнитур"),
      item("kitchen.countertop", "Столешница"),
      item("kitchen.backsplash", "Фартук"),
      item("kitchen.sink", "Мойка и смеситель"),
      item("kitchen.appliances", "Встроенная техника"),
      item("kitchen.hardware", "Выдвижные системы и качественная фурнитура"),
      item("kitchen.light", "Подсветка рабочей зоны"),
    ],
  },
  {
    id: "furniture",
    section: "interior",
    title: "Мебель",
    items: [
      item("furniture.wardrobes", "Шкафы и гардеробные"),
      item("furniture.hallway", "Мебель в прихожую"),
      item("furniture.tv_unit", "Тумба под телевизор"),
      item("furniture.bath", "Мебель для ванных комнат"),
      item("furniture.beds", "Кровати и прикроватные тумбы"),
      item("furniture.desks", "Комоды и рабочие столы"),
    ],
  },
  {
    id: "bathroom",
    section: "interior",
    title: "Санузел",
    items: [
      item("bathroom.waterproof", "Гидроизоляция"),
      item("bathroom.tile", "Керамогранит"),
      item("bathroom.shower_bath", "Душевая зона или ванна"),
      item("bathroom.installation", "Инсталляция для подвесного унитаза"),
      item("bathroom.sink", "Раковина и смеситель"),
      item("bathroom.mirror", "Зеркало с подсветкой"),
      item("bathroom.cabinets", "Встроенные шкафчики"),
      item("bathroom.towel_rail", "Полотенцесушитель"),
      item("bathroom.ventilation", "Вентиляция"),
      item("bathroom.partitions", "Душевые перегородки"),
    ],
  },
  {
    id: "finish_decor",
    section: "interior",
    title: "Двери, свет и декор",
    items: [
      item("finish_decor.doors", "Входная и межкомнатные двери"),
      item("finish_decor.chandeliers", "Люстры и потолочные светильники"),
      item("finish_decor.spots", "Точечные светильники"),
      item("finish_decor.sconces", "Настенные бра"),
      item("finish_decor.curtains", "Карнизы и шторы"),
      item("finish_decor.baseboards", "Плинтусы"),
      item("finish_decor.mirrors", "Зеркала"),
      item("finish_decor.panels", "Декоративные панели"),
      item("finish_decor.soft", "Мягкая мебель"),
      item("finish_decor.dining", "Обеденный стол и стулья"),
      item("finish_decor.decor", "Ковры и предметы декора"),
    ],
  },
  {
    id: "facade",
    section: "house",
    title: "Фасад здания",
    items: [item("facade.main", "Фасад здания")],
  },
  {
    id: "roof",
    section: "house",
    title: "Крыша",
    items: [item("roof.main", "Крыша")],
  },
  {
    id: "drips",
    section: "house",
    title: "Отливы",
    items: [item("drips.main", "Отливы")],
  },
  {
    id: "terrace",
    section: "house",
    title: "Терраса",
    items: [item("terrace.main", "Терраса")],
  },
  {
    id: "railings",
    section: "house",
    title: "Перила",
    items: [item("railings.main", "Перила")],
  },
  {
    id: "lighting",
    section: "house",
    title: "Освещение",
    items: [
      item("lighting.outdoor", "Освещение наружное"),
      item("lighting.indoor", "Освещение внутреннее"),
    ],
  },
  {
    id: "stairs",
    section: "house",
    title: "Лестница",
    items: [item("stairs.main", "Лестница")],
  },
  {
    id: "windows",
    section: "house",
    title: "Окна",
    items: [item("windows.main", "Окна")],
  },
  {
    id: "doors_house",
    section: "house",
    title: "Двери",
    items: [item("doors_house.main", "Двери")],
  },
  {
    id: "drainage",
    section: "house",
    title: "Дренаж и гидроизоляция",
    items: [item("drainage.main", "Дренаж и гидроизоляция")],
  },
  {
    id: "landscaping",
    section: "house",
    title: "Озеленение",
    items: [item("landscaping.main", "Озеленение")],
  },
  {
    id: "gates",
    section: "house",
    title: "Ворота",
    items: [item("gates.main", "Ворота")],
  },
  {
    id: "canopy",
    section: "house",
    title: "Навес",
    items: [item("canopy.main", "Навес")],
  },
  {
    id: "paving",
    section: "house",
    title: "Брусчатка",
    items: [item("paving.main", "Брусчатка")],
  },
  {
    id: "outbuildings",
    section: "house",
    title: "Постройки",
    items: [item("outbuildings.main", "Постройки")],
  },
  {
    id: "bathhouse",
    section: "house",
    title: "Баня",
    items: [item("bathhouse.main", "Баня")],
  },
  {
    id: "interior_finish",
    section: "house",
    title: "Внутренняя отделка",
    items: [
      item("interior_finish.livkas", "Ливкас"),
      item("interior_finish.plaster", "Штукатурка"),
      item("interior_finish.paint", "Покраска"),
    ],
  },
  {
    id: "plumbing_house",
    section: "house",
    title: "Сантехника",
    items: [item("plumbing_house.main", "Сантехника")],
  },
  {
    id: "electrical_house",
    section: "house",
    title: "Электрика",
    items: [item("electrical_house.main", "Электрика")],
  },
  {
    id: "stretch_ceilings",
    section: "house",
    title: "Натяжные потолки",
    items: [item("stretch_ceilings.main", "Натяжные потолки")],
  },
];

export function getRenovationBlock(id: string): RenovationBlockDef | undefined {
  return RENOVATION_BLOCKS.find((b) => b.id === id);
}

export function getRenovationItem(
  blockId: string,
  itemId: string,
): RenovationItemDef | undefined {
  return getRenovationBlock(blockId)?.items.find((i) => i.id === itemId);
}

export function findRenovationItemLabel(itemId: string): string | null {
  for (const block of RENOVATION_BLOCKS) {
    const found = block.items.find((i) => i.id === itemId);
    if (found) return found.label;
  }
  return null;
}
