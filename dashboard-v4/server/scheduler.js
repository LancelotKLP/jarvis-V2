// ============================================================
// SCHEDULER — Par user, ciblage agent
// ============================================================

const userdata = require('./userdata');
const router = require('./router');

function shouldRunNow(s, now) {
  if (!s.enabled) return false;
  const lastRun = s.lastRun || 0;
  const minSinceLast = (now - lastRun) / 60000;
  if (minSinceLast < 0.9) return false;

  if (s.type === 'once') return now >= s.datetime && lastRun < s.datetime;

  const date = new Date(now);
  const hhmm = date.getHours().toString().padStart(2, '0') + ':' +
               date.getMinutes().toString().padStart(2, '0');
  if (s.pattern === 'daily') return hhmm === s.time && minSinceLast > 1;
  if (s.pattern === 'weekly') {
    return s.weekdays?.includes(date.getDay()) && hhmm === s.time && minSinceLast > 1;
  }
  if (s.pattern === 'hourly') return date.getMinutes() === 0 && minSinceLast > 1;
  if (s.pattern === 'custom') return minSinceLast >= s.intervalMinutes;
  return false;
}

function tick() {
  const now = Date.now();
  const all = userdata.getAllEnabledSchedules();
  for (const s of all) {
    if (shouldRunNow(s, now)) {
      if (!s.targetAgentId) continue;
      console.log(`⏰ Schedule (user ${s.userId}) → ${s.message.substring(0, 60)}`);
      router.send({
        targetAgentId: s.targetAgentId,
        authorId: s.userId,
        message: s.message,
      });
      userdata.setScheduleLastRun(s.id, now);
      if (s.type === 'once') userdata.disableSchedule(s.id);
    }
  }
}

function start() {
  console.log('⏰ Scheduler démarré');
  function next() {
    const now = new Date();
    const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    setTimeout(() => { tick(); setInterval(tick, 60000); }, ms);
  }
  next();
}

module.exports = { start };
