
export interface DateFormatOptions {
  [key: string]: any;
  locale?: string;
  timezone?: string;
  hour12?: boolean;
}

export interface DateDiff {
  [key: string]: any;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
  totalDays: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  totalMilliseconds: number;
}

export interface BusinessDaysOptions {
  [key: string]: any;
  weekends?: number[];
  holidays?: Date[];
}

export interface DateRange {
  [key: string]: any;
  start: Date;
  end: Date;
}

export class DateUtils {
  private static readonly MILLISECONDS_PER_SECOND = 1000;
  private static readonly MILLISECONDS_PER_MINUTE = 60 * 1000;
  private static readonly MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
  private static readonly MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

  public static now(): Date {
    return new Date();
  }

  public static today(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }

  public static tomorrow(): Date {
    const date = this.today();
    date.setDate(date.getDate() + 1);
    return date;
  }

  public static yesterday(): Date {
    const date = this.today();
    date.setDate(date.getDate() - 1);
    return date;
  }

  public static create(
    year: number,
    month: number,
    day: number,
    hour: number = 0,
    minute: number = 0,
    second: number = 0,
    millisecond: number = 0
  ): Date {
    return new Date(year, month - 1, day, hour, minute, second, millisecond);
  }

  public static fromTimestamp(timestamp: number): Date {
    return new Date(timestamp);
  }

  public static fromISOString(isoString: string): Date {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      throw new Error(`Invalid ISO string: ${isoString}`);
    }
    return date;
  }

  public static parse(dateString: string, format: string): Date {
    const tokens: Record<string, { regex: RegExp; parser: (match: string) => number }> = {
      'YYYY': { regex: /\d{4}/, parser: (match) => parseInt(match, 10) },
      'YY': { regex: /\d{2}/, parser: (match) => 2000 + parseInt(match, 10) },
      'MM': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      'M': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'DD': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      'D': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'HH': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      'H': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'hh': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      'h': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'mm': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      'm': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'ss': { regex: /\d{2}/, parser: (match) => parseInt(match, 10) },
      's': { regex: /\d{1,2}/, parser: (match) => parseInt(match, 10) },
      'SSS': { regex: /\d{3}/, parser: (match) => parseInt(match, 10) },
      'A': { regex: /AM|PM/, parser: () => 0 },
      'a': { regex: /am|pm/, parser: () => 0 }
    };

    let year = new Date().getFullYear();
    let month = 1;
    let day = 1;
    let hour = 0;
    let minute = 0;
    let second = 0;
    let millisecond = 0;
    let isPM = false;
    let is12Hour = false;

    let pattern = format;
    let remaining = dateString;

    const sortedTokens = Object.keys(tokens).sort((a, b) => b.length - a.length);

    for (const token of sortedTokens) {
      const index = pattern.indexOf(token);
      if (index === -1) continue;

      const prefix = pattern.substring(0, index);
      const suffix = pattern.substring(index + token.length);

      const prefixIndex = prefix ? remaining.indexOf(prefix) : 0;
      remaining = remaining.substring(prefixIndex + prefix.length);

      const tokenInfo = tokens[token];
      if (!tokenInfo) continue;

      const match = remaining.match(tokenInfo.regex);
      if (!match || !match[0]) {
        throw new Error(`Failed to parse date: ${dateString} with format: ${format}`);
      }

      const value = tokenInfo.parser(match[0]);

      switch (token) {
        case 'YYYY':
        case 'YY':
          year = value;
          break;
        case 'MM':
        case 'M':
          month = value;
          break;
        case 'DD':
        case 'D':
          day = value;
          break;
        case 'HH':
        case 'H':
          hour = value;
          break;
        case 'hh':
        case 'h':
          hour = value;
          is12Hour = true;
          break;
        case 'mm':
        case 'm':
          minute = value;
          break;
        case 'ss':
        case 's':
          second = value;
          break;
        case 'SSS':
          millisecond = value;
          break;
        case 'A':
        case 'a':
          isPM = match[0].toUpperCase() === 'PM';
          break;
      }

      remaining = remaining.substring(match[0].length);
      pattern = suffix;
    }

    if (is12Hour) {
      if (isPM && hour !== 12) {
        hour += 12;
      } else if (!isPM && hour === 12) {
        hour = 0;
      }
    }

    return this.create(year, month, day, hour, minute, second, millisecond);
  }

  public static format(date: Date, format: string, options: DateFormatOptions = {}): string {
    const { locale, timezone } = options;

    let adjustedDate = date;
    if (timezone) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      const parts = formatter.formatToParts(date);
      const dateParts: Record<string, string> = {};
      
      parts.forEach(part => {
        dateParts[part.type] = part.value;
      });

      adjustedDate = new Date(
        `${dateParts['year']}-${dateParts['month']}-${dateParts['day']}T${dateParts['hour']}:${dateParts['minute']}:${dateParts['second']}`
      );
    }

    const pad = (n: number, length: number = 2): string => 
      String(n).padStart(length, '0');

    const getWeekOfYear = (d: Date): number => {
      const startOfYear = new Date(d.getFullYear(), 0, 1);
      const days = Math.floor((d.getTime() - startOfYear.getTime()) / this.MILLISECONDS_PER_DAY);
      return Math.ceil((days + startOfYear.getDay() + 1) / 7);
    };

    const dayOfWeek = adjustedDate.getDay();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayNamesLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    const replacements: Record<string, string> = {
      'YYYY': String(adjustedDate.getFullYear()),
      'YY': String(adjustedDate.getFullYear()).slice(-2),
      'MM': pad(adjustedDate.getMonth() + 1),
      'M': String(adjustedDate.getMonth() + 1),
      'DD': pad(adjustedDate.getDate()),
      'D': String(adjustedDate.getDate()),
      'HH': pad(adjustedDate.getHours()),
      'H': String(adjustedDate.getHours()),
      'hh': pad(adjustedDate.getHours() % 12 || 12),
      'h': String(adjustedDate.getHours() % 12 || 12),
      'mm': pad(adjustedDate.getMinutes()),
      'm': String(adjustedDate.getMinutes()),
      'ss': pad(adjustedDate.getSeconds()),
      's': String(adjustedDate.getSeconds()),
      'SSS': pad(adjustedDate.getMilliseconds(), 3),
      'SS': pad(Math.floor(adjustedDate.getMilliseconds() / 10)),
      'S': String(Math.floor(adjustedDate.getMilliseconds() / 100)),
      'A': adjustedDate.getHours() >= 12 ? 'PM' : 'AM',
      'a': adjustedDate.getHours() >= 12 ? 'pm' : 'am',
      'W': String(getWeekOfYear(adjustedDate)),
      'WW': pad(getWeekOfYear(adjustedDate)),
      'E': dayNames[dayOfWeek] || '',
      'EEEE': dayNamesLong[dayOfWeek] || '',
      'MMM': adjustedDate.toLocaleDateString(locale || 'en-US', { month: 'short' }),
      'MMMM': adjustedDate.toLocaleDateString(locale || 'en-US', { month: 'long' }),
      'Z': this.getTimezoneOffsetString(adjustedDate),
      'ZZ': this.getTimezoneOffsetString(adjustedDate).replace(':', '')
    };

    const sortedKeys = Object.keys(replacements).sort((a, b) => b.length - a.length);
    
    let result = format;
    for (const key of sortedKeys) {
      const replacement = replacements[key];
      if (replacement !== undefined) {
        result = result.replace(new RegExp(key, 'g'), replacement);
      }
    }

    return result;
  }

  private static getTimezoneOffsetString(date: Date): string {
    const offset = -date.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }

  public static toISOString(date: Date): string {
    return date.toISOString();
  }

  public static toTimestamp(date: Date): number {
    return date.getTime();
  }

  public static toUnixTimestamp(date: Date): number {
    return Math.floor(date.getTime() / 1000);
  }

  public static fromUnixTimestamp(timestamp: number): Date {
    return new Date(timestamp * 1000);
  }

  public static add(date: Date, amount: number, unit: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'): Date {
    const result = new Date(date);

    switch (unit) {
      case 'year':
        result.setFullYear(result.getFullYear() + amount);
        break;
      case 'month':
        result.setMonth(result.getMonth() + amount);
        break;
      case 'day':
        result.setDate(result.getDate() + amount);
        break;
      case 'hour':
        result.setHours(result.getHours() + amount);
        break;
      case 'minute':
        result.setMinutes(result.getMinutes() + amount);
        break;
      case 'second':
        result.setSeconds(result.getSeconds() + amount);
        break;
      case 'millisecond':
        result.setMilliseconds(result.getMilliseconds() + amount);
        break;
    }

    return result;
  }

  public static subtract(date: Date, amount: number, unit: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'): Date {
    return this.add(date, -amount, unit);
  }

  public static addDays(date: Date, days: number): Date {
    return this.add(date, days, 'day');
  }

  public static addMonths(date: Date, months: number): Date {
    return this.add(date, months, 'month');
  }

  public static addYears(date: Date, years: number): Date {
    return this.add(date, years, 'year');
  }

  public static addHours(date: Date, hours: number): Date {
    return this.add(date, hours, 'hour');
  }

  public static addMinutes(date: Date, minutes: number): Date {
    return this.add(date, minutes, 'minute');
  }

  public static addSeconds(date: Date, seconds: number): Date {
    return this.add(date, seconds, 'second');
  }

  public static addMilliseconds(date: Date, milliseconds: number): Date {
    return this.add(date, milliseconds, 'millisecond');
  }

  public static isEqual(date1: Date, date2: Date): boolean {
    return date1.getTime() === date2.getTime();
  }

  public static isBefore(date1: Date, date2: Date): boolean {
    return date1.getTime() < date2.getTime();
  }

  public static isAfter(date1: Date, date2: Date): boolean {
    return date1.getTime() > date2.getTime();
  }

  public static isBeforeOrEqual(date1: Date, date2: Date): boolean {
    return date1.getTime() <= date2.getTime();
  }

  public static isAfterOrEqual(date1: Date, date2: Date): boolean {
    return date1.getTime() >= date2.getTime();
  }

  public static isBetween(date: Date, start: Date, end: Date, inclusive: boolean = true): boolean {
    if (inclusive) {
      return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
    }
    return date.getTime() > start.getTime() && date.getTime() < end.getTime();
  }

  public static isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  public static isSameMonth(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth();
  }

  public static isSameYear(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear();
  }

  public static isToday(date: Date): boolean {
    return this.isSameDay(date, new Date());
  }

  public static isTomorrow(date: Date): boolean {
    return this.isSameDay(date, this.tomorrow());
  }

  public static isYesterday(date: Date): boolean {
    return this.isSameDay(date, this.yesterday());
  }

  public static isFuture(date: Date): boolean {
    return date.getTime() > Date.now();
  }

  public static isPast(date: Date): boolean {
    return date.getTime() < Date.now();
  }

  public static isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  public static isWeekday(date: Date): boolean {
    return !this.isWeekend(date);
  }

  public static isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  }

  public static diff(date1: Date, date2: Date): DateDiff {
    const diffMs = Math.abs(date1.getTime() - date2.getTime());
    
    const totalMilliseconds = diffMs;
    const totalSeconds = Math.floor(diffMs / this.MILLISECONDS_PER_SECOND);
    const totalMinutes = Math.floor(diffMs / this.MILLISECONDS_PER_MINUTE);
    const totalHours = Math.floor(diffMs / this.MILLISECONDS_PER_HOUR);
    const totalDays = Math.floor(diffMs / this.MILLISECONDS_PER_DAY);

    let years = 0;
    let months = 0;
    let days = 0;
    
    const startDate = date1 < date2 ? date1 : date2;
    const endDate = date1 < date2 ? date2 : date1;
    
    years = endDate.getFullYear() - startDate.getFullYear();
    months = endDate.getMonth() - startDate.getMonth();
    days = endDate.getDate() - startDate.getDate();
    
    if (days < 0) {
      months--;
      const prevMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 0);
      days += prevMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    const remainingMs = diffMs % this.MILLISECONDS_PER_DAY;
    const hours = Math.floor(remainingMs / this.MILLISECONDS_PER_HOUR);
    const minutes = Math.floor((remainingMs % this.MILLISECONDS_PER_HOUR) / this.MILLISECONDS_PER_MINUTE);
    const seconds = Math.floor((remainingMs % this.MILLISECONDS_PER_MINUTE) / this.MILLISECONDS_PER_SECOND);
    const milliseconds = remainingMs % this.MILLISECONDS_PER_SECOND;

    return {
      years,
      months,
      days,
      hours,
      minutes,
      seconds,
      milliseconds,
      totalDays,
      totalHours,
      totalMinutes,
      totalSeconds,
      totalMilliseconds
    };
  }

  public static diffInDays(date1: Date, date2: Date): number {
    return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / this.MILLISECONDS_PER_DAY);
  }

  public static diffInHours(date1: Date, date2: Date): number {
    return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / this.MILLISECONDS_PER_HOUR);
  }

  public static diffInMinutes(date1: Date, date2: Date): number {
    return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / this.MILLISECONDS_PER_MINUTE);
  }

  public static diffInSeconds(date1: Date, date2: Date): number {
    return Math.floor(Math.abs(date1.getTime() - date2.getTime()) / this.MILLISECONDS_PER_SECOND);
  }

  public static diffInMilliseconds(date1: Date, date2: Date): number {
    return Math.abs(date1.getTime() - date2.getTime());
  }

  public static getYear(date: Date): number {
    return date.getFullYear();
  }

  public static getMonth(date: Date): number {
    return date.getMonth() + 1;
  }

  public static getDay(date: Date): number {
    return date.getDate();
  }

  public static getHour(date: Date): number {
    return date.getHours();
  }

  public static getMinute(date: Date): number {
    return date.getMinutes();
  }

  public static getSecond(date: Date): number {
    return date.getSeconds();
  }

  public static getMillisecond(date: Date): number {
    return date.getMilliseconds();
  }

  public static getDayOfWeek(date: Date): number {
    return date.getDay();
  }

  public static getDayOfYear(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / this.MILLISECONDS_PER_DAY);
  }

  public static getWeekOfYear(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / this.MILLISECONDS_PER_DAY;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  public static getQuarter(date: Date): number {
    return Math.floor(date.getMonth() / 3) + 1;
  }

  public static getDaysInMonth(year: number, month: number): number {
    return new Date(year, month, 0).getDate();
  }

  public static getDaysInYear(year: number): number {
    return this.isLeapYear(year) ? 366 : 365;
  }

  public static setYear(date: Date, year: number): Date {
    const result = new Date(date);
    result.setFullYear(year);
    return result;
  }

  public static setMonth(date: Date, month: number): Date {
    const result = new Date(date);
    result.setMonth(month - 1);
    return result;
  }

  public static setDay(date: Date, day: number): Date {
    const result = new Date(date);
    result.setDate(day);
    return result;
  }

  public static setHour(date: Date, hour: number): Date {
    const result = new Date(date);
    result.setHours(hour);
    return result;
  }

  public static setMinute(date: Date, minute: number): Date {
    const result = new Date(date);
    result.setMinutes(minute);
    return result;
  }

  public static setSecond(date: Date, second: number): Date {
    const result = new Date(date);
    result.setSeconds(second);
    return result;
  }

  public static setMillisecond(date: Date, millisecond: number): Date {
    const result = new Date(date);
    result.setMilliseconds(millisecond);
    return result;
  }

  public static startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  public static endOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  public static startOfWeek(date: Date, startDay: number = 0): Date {
    const result = new Date(date);
    const day = result.getDay();
    const diff = (day < startDay ? 7 : 0) + day - startDay;
    result.setDate(result.getDate() - diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  public static endOfWeek(date: Date, startDay: number = 0): Date {
    const result = this.startOfWeek(date, startDay);
    result.setDate(result.getDate() + 6);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  public static startOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  public static endOfMonth(date: Date): Date {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1, 0);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  public static startOfQuarter(date: Date): Date {
    const result = new Date(date);
    const quarter = this.getQuarter(date);
    result.setMonth((quarter - 1) * 3, 1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  public static endOfQuarter(date: Date): Date {
    const result = new Date(date);
    const quarter = this.getQuarter(date);
    result.setMonth(quarter * 3, 0);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  public static startOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(0, 1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  public static endOfYear(date: Date): Date {
    const result = new Date(date);
    result.setMonth(11, 31);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  public static addBusinessDays(date: Date, days: number, options: BusinessDaysOptions = {}): Date {
    const { weekends = [0, 6], holidays = [] } = options;

    const result = new Date(date);
    const increment = days > 0 ? 1 : -1;
    let remaining = Math.abs(days);

    while (remaining > 0) {
      result.setDate(result.getDate() + increment);
      
      if (!this.isBusinessDay(result, { weekends, holidays })) {
        continue;
      }
      remaining--;
    }

    return result;
  }

  public static isBusinessDay(date: Date, options: BusinessDaysOptions = {}): boolean {
    const { weekends = [0, 6], holidays = [] } = options;

    if (weekends.includes(date.getDay())) {
      return false;
    }

    return !holidays.some(holiday => this.isSameDay(date, holiday));
  }

  public static getBusinessDaysBetween(start: Date, end: Date, options: BusinessDaysOptions = {}): number {
    const { weekends = [0, 6], holidays = [] } = options;

    let count = 0;
    const current = new Date(start);
    const endTime = end.getTime();

    while (current.getTime() <= endTime) {
      if (this.isBusinessDay(current, { weekends, holidays })) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }

    return count;
  }

  public static nextBusinessDay(date: Date, options: BusinessDaysOptions = {}): Date {
    return this.addBusinessDays(date, 1, options);
  }

  public static previousBusinessDay(date: Date, options: BusinessDaysOptions = {}): Date {
    return this.addBusinessDays(date, -1, options);
  }

  public static createRange(start: Date, end: Date): DateRange {
    if (start > end) {
      throw new Error('Start date must be before or equal to end date');
    }
    return { start, end };
  }

  public static isInRange(date: Date, range: DateRange): boolean {
    return date >= range.start && date <= range.end;
  }

  public static getDatesInRange(range: DateRange, step: number = 1, unit: 'day' | 'month' | 'year' = 'day'): Date[] {
    const dates: Date[] = [];
    const current = new Date(range.start);

    while (current <= range.end) {
      dates.push(new Date(current));
      
      switch (unit) {
        case 'day':
          current.setDate(current.getDate() + step);
          break;
        case 'month':
          current.setMonth(current.getMonth() + step);
          break;
        case 'year':
          current.setFullYear(current.getFullYear() + step);
          break;
      }
    }

    return dates;
  }

  public static mergeRanges(ranges: DateRange[]): DateRange[] {
    if (ranges.length <= 1) return ranges;

    const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: DateRange[] = [];
    
    if (sorted.length > 0) {
      const firstRange = sorted[0];
      if (firstRange) {
        merged.push({ ...firstRange });
      }
      
      for (let i = 1; i < sorted.length; i++) {
        const current = sorted[i];
        const last = merged[merged.length - 1];

        if (current && last && current.start <= last.end) {
          last.end = new Date(Math.max(last.end.getTime(), current.end.getTime()));
        } else if (current) {
          merged.push({ ...current });
        }
      }
    }

    return merged;
  }

  public static intersectRanges(range1: DateRange, range2: DateRange): DateRange | null {
    const start = new Date(Math.max(range1.start.getTime(), range2.start.getTime()));
    const end = new Date(Math.min(range1.end.getTime(), range2.end.getTime()));

    if (start <= end) {
      return { start, end };
    }

    return null;
  }

  public static convertTimezone(date: Date, fromTimezone: string, toTimezone: string): Date {
    const fromFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: fromTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const fromParts = fromFormatter.formatToParts(date);
    const fromDate = this.partsToDate(fromParts);

    const toFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: toTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const toParts = toFormatter.formatToParts(date);
    const toDate = this.partsToDate(toParts);

    const offsetDiff = toDate.getTime() - fromDate.getTime();

    return new Date(date.getTime() + offsetDiff);
  }

  private static partsToDate(parts: Intl.DateTimeFormatPart[]): Date {
    const dateParts: Record<string, string> = {};
    
    parts.forEach(part => {
      dateParts[part.type] = part.value;
    });

    return new Date(
      parseInt(dateParts['year'] || '0', 10),
      parseInt(dateParts['month'] || '1', 10) - 1,
      parseInt(dateParts['day'] || '1', 10),
      parseInt(dateParts['hour'] || '0', 10),
      parseInt(dateParts['minute'] || '0', 10),
      parseInt(dateParts['second'] || '0', 10)
    );
  }

  public static getTimezoneNames(): string[] {
    if (typeof Intl !== 'undefined' && 
        'supportedValuesOf' in Intl && 
        typeof (Intl as any).supportedValuesOf === 'function') {
      try {
        return (Intl as any).supportedValuesOf('timeZone');
      } catch (e) {
      }
    }
    
    return [
      'UTC',
      'America/New_York',
      'America/Chicago',
      'America/Denver',
      'America/Los_Angeles',
      'America/Anchorage',
      'America/Honolulu',
      'Europe/London',
      'Europe/Paris',
      'Europe/Berlin',
      'Europe/Moscow',
      'Asia/Dubai',
      'Asia/Kolkata',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Asia/Seoul',
      'Australia/Sydney',
      'Pacific/Auckland'
    ];
  }

  public static getTimezoneOffsetMinutes(timezone: string, date: Date = new Date()): number {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short'
    });

    const parts = formatter.formatToParts(date);
    const timezoneName = parts.find(part => part.type === 'timeZoneName')?.value || '';

    const match = timezoneName.match(/GMT([+-]\d+)/);
    if (match && match[1]) {
      return parseInt(match[1], 10) * 60;
    }

    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    
    return (tzDate.getTime() - utcDate.getTime()) / this.MILLISECONDS_PER_MINUTE;
  }

  public static relative(date: Date, baseDate: Date = new Date(), locale: string = 'en-US'): string {
    const diff = date.getTime() - baseDate.getTime();
    const absDiff = Math.abs(diff);
    const isPast = diff < 0;

    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    let value: number;
    let unit: string;

    if (seconds < 60) {
      value = seconds;
      unit = 'second';
    } else if (minutes < 60) {
      value = minutes;
      unit = 'minute';
    } else if (hours < 24) {
      value = hours;
      unit = 'hour';
    } else if (days < 30) {
      value = days;
      unit = 'day';
    } else if (months < 12) {
      value = months;
      unit = 'month';
    } else {
      value = years;
      unit = 'year';
    }

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    return rtf.format(isPast ? -value : value, unit as any);
  }

  public static isValidDate(date: any): date is Date {
    return date instanceof Date && !isNaN(date.getTime());
  }

  public static isValidDateString(dateString: string): boolean {
    const date = new Date(dateString);
    return this.isValidDate(date);
  }

  public static getCalendarMonth(year: number, month: number): Date[][] {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = this.startOfWeek(firstDay);
    const endDate = this.endOfWeek(lastDay);

    const weeks: Date[][] = [];
    let week: Date[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      week.push(new Date(current));
      
      if (week.length === 7) {
        weeks.push(week);
        week = [];
      }

      current.setDate(current.getDate() + 1);
    }

    return weeks;
  }

  public static getCalendarYear(year: number): Date[][][] {
    const months: Date[][][] = [];
    
    for (let month = 1; month <= 12; month++) {
      months.push(this.getCalendarMonth(year, month));
    }

    return months;
  }

  public static calculateAge(birthDate: Date, referenceDate: Date = new Date()): {
    years: number;
    months: number;
    days: number;
  } {
    let years = referenceDate.getFullYear() - birthDate.getFullYear();
    let months = referenceDate.getMonth() - birthDate.getMonth();
    let days = referenceDate.getDate() - birthDate.getDate();

    if (days < 0) {
      months--;
      const lastMonth = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
      days += lastMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }

  public static getAgeInYears(birthDate: Date, referenceDate: Date = new Date()): number {
    const age = this.calculateAge(birthDate, referenceDate);
    return age.years;
  }

  public static formatDuration(milliseconds: number, options: {
    format?: 'long' | 'short';
    units?: Array<'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'millisecond'>;
    separator?: string;
    locale?: string;
  } = {}): string {
    const {
      format = 'long',
      units = ['day', 'hour', 'minute', 'second'],
      separator = ' '
    } = options;

    const parts: string[] = [];
    let remaining = milliseconds;

    const unitValues = {
      year: 365 * 24 * 60 * 60 * 1000,
      month: 30 * 24 * 60 * 60 * 1000,
      day: 24 * 60 * 60 * 1000,
      hour: 60 * 60 * 1000,
      minute: 60 * 1000,
      second: 1000,
      millisecond: 1
    };

    const unitLabels = {
      long: {
        year: ['year', 'years'],
        month: ['month', 'months'],
        day: ['day', 'days'],
        hour: ['hour', 'hours'],
        minute: ['minute', 'minutes'],
        second: ['second', 'seconds'],
        millisecond: ['millisecond', 'milliseconds']
      },
      short: {
        year: 'y',
        month: 'mo',
        day: 'd',
        hour: 'h',
        minute: 'm',
        second: 's',
        millisecond: 'ms'
      }
    };

    for (const unit of units) {
      const value = Math.floor(remaining / unitValues[unit]);
      if (value > 0) {
        remaining %= unitValues[unit];
        
        if (format === 'long') {
          const label = unitLabels.long[unit][value === 1 ? 0 : 1];
          parts.push(`${value} ${label}`);
        } else {
          parts.push(`${value}${unitLabels.short[unit]}`);
        }
      }
    }

    return parts.length > 0 ? parts.join(separator) : '0' + (format === 'long' ? ' seconds' : 's');
  }

  public static toUTC(date: Date): Date {
    return new Date(Date.UTC(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds()
    ));
  }

  public static fromUTC(date: Date): Date {
    return new Date(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    );
  }

  public static clone(date: Date): Date {
    return new Date(date.getTime());
  }

  public static formatDateTime(date: Date, format: string = 'YYYY-MM-DD HH:mm:ss'): string {
    return this.format(date, format);
  }

  public static min(...dates: Date[]): Date {
    return new Date(Math.min(...dates.map(d => d.getTime())));
  }

  public static max(...dates: Date[]): Date {
    return new Date(Math.max(...dates.map(d => d.getTime())));
  }

  public static sort(dates: Date[], ascending: boolean = true): Date[] {
    return [...dates].sort((a, b) => {
      const diff = a.getTime() - b.getTime();
      return ascending ? diff : -diff;
    });
  }

  public static uniqueDays(dates: Date[]): Date[] {
    const seen = new Set<string>();
    const unique: Date[] = [];

    for (const date of dates) {
      const key = this.format(date, 'YYYY-MM-DD');
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(date);
      }
    }

    return unique;
  }
}
