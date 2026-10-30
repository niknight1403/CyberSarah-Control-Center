/** Calendar-day publishing in an IANA time zone, across DST boundaries.
 * Fail closed on nonexistent/invalid wall-clock times rather than silently
 * delivering a post at an unexpected local hour.
 */
const fields = (date: Date, timeZone: string) => {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year:"numeric",month:"2-digit",day:"2-digit",
    hour:"2-digit",minute:"2-digit",hourCycle:"h23",
  });
  const parts = formatter.formatToParts(date);
  const value = (key: string) => Number(parts.find(part => part.type === key)?.value);
  return {year:value("year"),month:value("month"),day:value("day"),
    hour:value("hour"),minute:value("minute")};
};
export function zonedCampaignSlot(startAt: Date, campaignDay: number, hour: number, timeZone: string): Date {
  if (!Number.isFinite(startAt.getTime()) || !Number.isSafeInteger(campaignDay) || campaignDay < 1 ||
    !Number.isSafeInteger(hour) || hour < 0 || hour > 23) throw new RangeError("Ungültige Publishing-Zeit.");
  const local = fields(startAt,timeZone); // invalid IANA zone throws here.
  const calendar = new Date(Date.UTC(local.year,local.month-1,local.day+campaignDay-1,hour,0,0));
  const wanted = calendar.getTime();
  let guess = wanted;
  for(let i=0;i<5;i++){
    const at = fields(new Date(guess),timeZone);
    const asUtc = Date.UTC(at.year,at.month-1,at.day,at.hour,at.minute);
    const delta = wanted-asUtc;
    if(delta===0)return new Date(guess);
    guess+=delta;
  }
  throw new RangeError("Lokale Publishing-Zeit ist wegen Sommerzeitwechsel nicht verfügbar.");
}
