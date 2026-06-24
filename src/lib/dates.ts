// Native replacements for the date-fns functions we use.
// Eliminates a 36 MB dependency from the build.

const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const MONTHS_3    = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const DAYS_FULL   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
const DAYS_3      = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const DAYS_1      = ['S','M','T','W','T','F','S']

// Supports the subset of date-fns format tokens actually used in this codebase:
// yyyy  MM  dd  d  EEEE  EEEEE  EEE  MMMM  MMM  HH  mm  h  a
export function format(date: Date, pattern: string): string {
  const y   = date.getFullYear()
  const mo  = date.getMonth()
  const day = date.getDate()
  const H   = date.getHours()
  const m   = date.getMinutes()
  const dow = date.getDay()
  return pattern.replace(/EEEEE|EEEE|EEE|MMMM|MMM|MM|yyyy|HH|dd|mm|h|a|d/g, (t) => {
    switch (t) {
      case 'EEEEE': return DAYS_1[dow]
      case 'EEEE':  return DAYS_FULL[dow]
      case 'EEE':   return DAYS_3[dow]
      case 'MMMM':  return MONTHS_FULL[mo]
      case 'MMM':   return MONTHS_3[mo]
      case 'MM':    return String(mo + 1).padStart(2, '0')
      case 'yyyy':  return String(y)
      case 'HH':    return String(H).padStart(2, '0')
      case 'dd':    return String(day).padStart(2, '0')
      case 'mm':    return String(m).padStart(2, '0')
      case 'h':     { const h12 = H % 12; return String(h12 === 0 ? 12 : h12) }
      case 'a':     return H >= 12 ? 'PM' : 'AM'
      case 'd':     return String(day)
      default:      return t
    }
  })
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate()
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date())
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime()
}

export function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

export function startOfWeek(d: Date, opts: { weekStartsOn?: 0 | 1 } = {}): Date {
  const ws = opts.weekStartsOn ?? 0
  const r  = new Date(d)
  const diff = (r.getDay() - ws + 7) % 7
  r.setDate(r.getDate() - diff)
  r.setHours(0, 0, 0, 0)
  return r
}

export function endOfWeek(d: Date, opts: { weekStartsOn?: 0 | 1 } = {}): Date {
  const r = startOfWeek(d, opts)
  r.setDate(r.getDate() + 6)
  r.setHours(23, 59, 59, 999)
  return r
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d); r.setMonth(r.getMonth() + n); return r
}

export function subMonths(d: Date, n: number): Date {
  return addMonths(d, -n)
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

export function subDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() - n); return r
}

export function eachDayOfInterval({ start, end }: { start: Date; end: Date }): Date[] {
  const days: Date[] = []
  const cur = startOfDay(start)
  const last = startOfDay(end).getTime()
  while (cur.getTime() <= last) {
    days.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}
