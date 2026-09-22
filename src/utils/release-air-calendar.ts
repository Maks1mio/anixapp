import { SCHEDULE_DAYS, type ScheduleDay } from './schedule';
import { formatReleaseEpisodes } from './release-card';

/** Anixart `broadcast`: 0 нет, 1 пн … 7 вс. */
export type AirWeekdayKey =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export type AirEpisodeKind = 'aired' | 'today' | 'next' | 'late' | 'upcoming';

export type AirEpisodeSlot = {
  episode: number;
  date: Date;
  day: number;
  month: string;
  monthLong: string;
  kind: AirEpisodeKind;
  label: string;
};

export type ReleaseAirCalendarMode = 'episodes' | 'schedule';

export type ReleaseAirCalendarModel = {
  weekdayKey: AirWeekdayKey;
  weekdayLabel: string;
  everyLabel: string;
  fromSchedule: boolean;
  mode: ReleaseAirCalendarMode;
  hint: string;
  episodes: AirEpisodeSlot[];
  released: number;
  total: number | null;
  progressLabel: string;
  progressRatio: number;
  nextEpisode: AirEpisodeSlot | null;
};

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const EVERY_LABEL: Record<AirWeekdayKey, string> = {
  monday: 'Каждый понедельник',
  tuesday: 'Каждый вторник',
  wednesday: 'Каждую среду',
  thursday: 'Каждый четверг',
  friday: 'Каждую пятницу',
  saturday: 'Каждую субботу',
  sunday: 'Каждое воскресенье',
};

/** У длинных сериалов и пауз «каждый» врёт — день эфира, а не история серий. */
const USUALLY_LABEL: Record<AirWeekdayKey, string> = {
  monday: 'Обычно по понедельникам',
  tuesday: 'Обычно по вторникам',
  wednesday: 'Обычно по средам',
  thursday: 'Обычно по четвергам',
  friday: 'Обычно по пятницам',
  saturday: 'Обычно по субботам',
  sunday: 'Обычно по воскресеньям',
};

const BROADCAST_TO_KEY: Record<number, AirWeekdayKey> = {
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
  7: 'sunday',
};

const KEY_TO_JS_DAY: Record<AirWeekdayKey, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const MAX_EPISODE_SLOTS = 26;
const UNKNOWN_UPCOMING = 4;
const SCHEDULE_UPCOMING = 6;
const DAY_MS = 86_400_000;

export const AIR_WEEKDAY_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

export const MONTHS_NOMINATIVE = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function calendarDateFromUnix(sec: number): Date | null {
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const raw = new Date(sec * 1000);
  if (Number.isNaN(raw.getTime())) return null;
  if (raw.getUTCHours() === 0 && raw.getUTCMinutes() === 0 && raw.getUTCSeconds() === 0) {
    return new Date(raw.getUTCFullYear(), raw.getUTCMonth(), raw.getUTCDate());
  }
  return startOfLocalDay(raw);
}

function alignToWeekday(from: Date, jsWeekday: number, direction: 'next' | 'prev'): Date {
  const day = startOfLocalDay(from);
  const delta = direction === 'next'
    ? (jsWeekday - day.getDay() + 7) % 7
    : -((day.getDay() - jsWeekday + 7) % 7);
  return addDays(day, delta);
}

/** Ближайший нужный день недели: понедельник при эфире в вс не прыгает на +6 дней вперёд. */
function alignToWeekdayNearest(from: Date, jsWeekday: number): Date {
  const day = startOfLocalDay(from);
  const next = alignToWeekday(day, jsWeekday, 'next');
  const prev = alignToWeekday(day, jsWeekday, 'prev');
  const toNext = next.getTime() - day.getTime();
  const toPrev = day.getTime() - prev.getTime();
  return toNext < toPrev ? next : prev;
}

export function weekdayKeyFromBroadcast(broadcast: unknown): AirWeekdayKey | null {
  if (typeof broadcast !== 'number' || !Number.isInteger(broadcast)) return null;
  return BROADCAST_TO_KEY[broadcast] ?? null;
}

export function weekdayKeyFromScheduleDay(day: ScheduleDay | null | undefined): AirWeekdayKey | null {
  if (!day) return null;
  return SCHEDULE_DAYS.some((item) => item.key === day.key) ? day.key as AirWeekdayKey : null;
}

export function weekdayKeyFromDate(date: Date): AirWeekdayKey {
  return (['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const)[date.getDay()];
}

function slotLabel(kind: AirEpisodeKind): string {
  switch (kind) {
    case 'aired': return 'вышла';
    case 'today': return 'сегодня';
    case 'next': return 'следующая';
    case 'late': return 'ждём';
    default: return 'скоро';
  }
}

export function formatAirDateLong(date: Date): string {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()] ?? ''}`.trim();
}

export function airDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function lowerFirstRu(text: string): string {
  if (!text) return text;
  return text.charAt(0).toLocaleLowerCase('ru') + text.slice(1);
}

export function formatAirTriggerLabel(model: ReleaseAirCalendarModel, fallback = 'Выходит'): string {
  const next = model.nextEpisode;
  const verb = /анонс/i.test(fallback) ? 'Выйдет' : 'Выходит';
  const cadence = lowerFirstRu(EVERY_LABEL[model.weekdayKey] ?? model.everyLabel);
  const withCadence = (head: string) => (cadence ? `${head}, ${cadence}` : head);
  if (!next) return cadence ? `${verb} ${cadence}` : (fallback || verb);
  if (next.kind === 'today') return withCadence(`${verb} сегодня`);
  if (next.kind === 'late') return withCadence(`Ждём ${formatAirDateLong(next.date)}`);
  return withCadence(`${verb} ${formatAirDateLong(next.date)}`);
}

export function formatAirSlotTip(
  slot: AirEpisodeSlot,
  mode: ReleaseAirCalendarMode = 'episodes',
): string {
  const date = `${slot.day} ${slot.monthLong}`;
  if (mode === 'schedule') {
    if (slot.kind === 'today') {
      return slot.episode > 0
        ? `Сегодня день выхода · ориентир ${slot.episode} эп`
        : 'Сегодня день выхода';
    }
    if (slot.kind === 'next') {
      return slot.episode > 0
        ? `Следующая · ${date} · ориентир ${slot.episode} эп`
        : `Следующая · ${date}`;
    }
    return `${date} · день выхода · пауза возможна`;
  }
  switch (slot.kind) {
    case 'aired': return `${slot.episode} эп вышла · ${date}`;
    case 'today': return `${slot.episode} эп выходит сегодня`;
    case 'next': return `${slot.episode} эп · следующая · ${date}`;
    case 'late': return `${slot.episode} эп · ждём · ${date}`;
    default: return `${slot.episode} эп · ${date}`;
  }
}

export type AirMonthCell = {
  date: Date;
  inMonth: boolean;
  today: boolean;
  slot: AirEpisodeSlot | null;
};

export function buildAirMonthGrid(
  year: number,
  month: number,
  slots: AirEpisodeSlot[],
  now?: Date,
): AirMonthCell[] {
  const byKey = new Map(slots.map((slot) => [airDateKey(slot.date), slot]));
  const first = new Date(year, month, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = addDays(first, -mondayOffset);
  const today = startOfLocalDay(now ?? new Date());
  const cells: AirMonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = addDays(start, i);
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      today: date.getTime() === today.getTime(),
      slot: byKey.get(airDateKey(date)) ?? null,
    });
  }
  return cells;
}

function makeSlot(episode: number, date: Date, kind: AirEpisodeKind): AirEpisodeSlot {
  return {
    episode,
    date,
    day: date.getDate(),
    month: MONTHS_SHORT[date.getMonth()] ?? '',
    monthLong: MONTHS_GENITIVE[date.getMonth()] ?? '',
    kind,
    label: slotLabel(kind),
  };
}

function hasHiatus(firstDate: Date, now: Date, released: number): boolean {
  if (released <= 0) return false;
  const weeksElapsed = Math.round((now.getTime() - firstDate.getTime()) / (7 * DAY_MS)) + 1;
  return weeksElapsed > released + 2;
}

function useScheduleMode(input: {
  released: number;
  totalKnown: number | null;
  firstDate: Date;
  now: Date;
}): boolean {
  if (input.released > MAX_EPISODE_SLOTS) return true;
  if (input.totalKnown != null && input.totalKnown > MAX_EPISODE_SLOTS) return true;
  return hasHiatus(input.firstDate, input.now, input.released);
}

export function buildReleaseAirCalendar(input: {
  weekdayKey: AirWeekdayKey | null;
  fromSchedule: boolean;
  airedOnDate?: number | null;
  episodesReleased?: number | null;
  episodesTotal?: number | null;
  now?: Date;
}): ReleaseAirCalendarModel | null {
  const weekdayKey = input.weekdayKey;
  if (!weekdayKey) return null;

  const jsWeekday = KEY_TO_JS_DAY[weekdayKey];
  const now = startOfLocalDay(input.now ?? new Date());
  const released = Math.max(0, asPositiveInt(input.episodesReleased) ?? 0);
  const totalKnown = asPositiveInt(input.episodesTotal);
  if (!input.fromSchedule && released > 0 && totalKnown != null && released >= totalKnown) {
    return null;
  }

  const airedStart = calendarDateFromUnix(input.airedOnDate ?? 0);
  let firstDate: Date;
  if (airedStart) {
    firstDate = alignToWeekdayNearest(airedStart, jsWeekday);
  } else if (released > 0) {
    const thisWeek = alignToWeekday(now, jsWeekday, 'prev');
    firstDate = addDays(thisWeek, -7 * (released - 1));
  } else {
    firstDate = alignToWeekday(now, jsWeekday, 'next');
  }

  const scheduleMode = useScheduleMode({ released, totalKnown, firstDate, now });
  const weekdayMeta = SCHEDULE_DAYS.find((day) => day.key === weekdayKey);
  const everyLabel = scheduleMode ? USUALLY_LABEL[weekdayKey] : EVERY_LABEL[weekdayKey];
  const progressTotal = totalKnown ?? Math.max(released, 1);
  const base = {
    weekdayKey,
    weekdayLabel: weekdayMeta?.label ?? everyLabel,
    everyLabel,
    fromSchedule: input.fromSchedule,
    released,
    total: totalKnown,
    progressLabel: formatReleaseEpisodes(released || null, totalKnown),
    progressRatio: progressTotal > 0 ? Math.min(1, released / progressTotal) : 0,
  };

  if (scheduleMode) {
    const start = alignToWeekday(now, jsWeekday, 'next');
    const episodes: AirEpisodeSlot[] = [];
    for (let i = 0; i < SCHEDULE_UPCOMING; i += 1) {
      const date = addDays(start, 7 * i);
      const isFirst = i === 0;
      let kind: AirEpisodeKind;
      if (date.getTime() === now.getTime()) kind = 'today';
      else if (isFirst) kind = 'next';
      else kind = 'upcoming';
      episodes.push(makeSlot(isFirst ? released + 1 : 0, date, kind));
    }
    const nextEpisode = episodes.find((slot) => slot.kind === 'today' || slot.kind === 'next') ?? episodes[0] ?? null;
    return {
      ...base,
      mode: 'schedule',
      hint: 'Паузы не отмечаем — только ближайшие дни',
      episodes,
      nextEpisode,
    };
  }

  const slotCount = Math.min(
    MAX_EPISODE_SLOTS,
    totalKnown ?? Math.max(released + UNKNOWN_UPCOMING, released || 1),
  );
  if (slotCount <= 0) return null;
  if (slotCount <= 1 && !input.fromSchedule) return null;

  if (released > 0) {
    const latestAirDay = alignToWeekday(now, jsWeekday, 'prev');
    const latestReleasedDate = addDays(firstDate, 7 * (released - 1));
    if (latestReleasedDate.getTime() > latestAirDay.getTime()) {
      firstDate = addDays(latestAirDay, -7 * (released - 1));
    }
  }

  const nextUnreleased = released + 1;
  const episodes: AirEpisodeSlot[] = [];
  for (let episode = 1; episode <= slotCount; episode += 1) {
    const date = addDays(firstDate, 7 * (episode - 1));
    const dateMs = date.getTime();
    const nowMs = now.getTime();
    const releasedOnAnixart = episode <= released;
    let kind: AirEpisodeKind;
    if (releasedOnAnixart && dateMs <= nowMs) {
      kind = 'aired';
    } else if (dateMs === nowMs) {
      kind = 'today';
    } else if (dateMs < nowMs) {
      kind = 'late';
    } else if (episode === nextUnreleased) {
      kind = 'next';
    } else {
      kind = 'upcoming';
    }
    episodes.push(makeSlot(episode, date, kind));
  }

  const nextEpisode = episodes.find((slot) => slot.kind === 'today' || slot.kind === 'next' || slot.kind === 'late') ?? null;
  return {
    ...base,
    mode: 'episodes',
    hint: '',
    episodes,
    nextEpisode,
  };
}
