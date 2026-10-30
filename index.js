const ZKLib = require('node-zklib');

const DEVICE_IP = 'yourip';
const DEVICE_PORT = port;
const MY_DEVICE_USER_ID = 'yournumber';

const device = new ZKLib(
  DEVICE_IP,
  DEVICE_PORT,
  10000,
  4000
);

// Convert date to YYYY-MM-DD using IST
function getDateKey(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

// Convert date to YYYY-MM
function getMonthKey(date) {
  return getDateKey(date).slice(0, 7);
}

// Format milliseconds as hours and minutes
function formatDuration(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours}h ${minutes}m`;
}

// Format time in IST
function formatTime(date) {
  return new Date(date).toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Calculate working duration by pairing punches
function calculateDuration(records, now, includeOngoing = false) {
  let totalMilliseconds = 0;

  for (let i = 0; i < records.length; i += 2) {
    const punchIn = new Date(records[i].recordTime);

    // Completed IN → OUT pair
    if (records[i + 1]) {
      const punchOut = new Date(records[i + 1].recordTime);

      totalMilliseconds += punchOut - punchIn;
    }
    // Still working: count until now, but only for today
    else if (includeOngoing) {
      totalMilliseconds += now - punchIn;
    }
  }

  return totalMilliseconds;
}

// FUNCTION 1: Today's attendance and total hours
function getTodayHours(records, now = new Date()) {
  const today = getDateKey(now);

  const todayRecords = records
    .filter(record => getDateKey(new Date(record.recordTime)) === today)
    .sort((a, b) =>
      new Date(a.recordTime) - new Date(b.recordTime)
    );

  console.log('\n========== TODAY ATTENDANCE ==========');
  console.log('Date:', today);

  if (todayRecords.length === 0) {
    console.log('No punches recorded today.');
    return;
  }

  const firstPunchIn = todayRecords[0];

  // If odd number of punches, the latest one is an unmatched IN
  const isCurrentlyWorking = todayRecords.length % 2 !== 0;

  const lastPunchOut = isCurrentlyWorking
    ? todayRecords[todayRecords.length - 2]
    : todayRecords[todayRecords.length - 1];

  console.log('Punch In:', formatTime(firstPunchIn.recordTime));

  console.log(
    'Punch Out:',
    lastPunchOut
      ? formatTime(lastPunchOut.recordTime)
      : 'Not punched out yet'
  );

  const totalMilliseconds = calculateDuration(
    todayRecords,
    now,
    true
  );

  console.log('Total Hours:', formatDuration(totalMilliseconds));

  if (isCurrentlyWorking) {
    console.log('Status: Currently working (based on punch pairing)');
  } else {
    console.log('Status: Last punch is paired');
  }

  console.log('Total Punches:', todayRecords.length);
}

// FUNCTION 2: Total working hours for current month
function getMonthlyHours(records, now = new Date()) {
  const currentMonth = getMonthKey(now);

  const monthlyRecords = records
    .filter(record =>
      getMonthKey(new Date(record.recordTime)) === currentMonth
    );

  // Group punches by day
  const dailyRecords = {};

  for (const record of monthlyRecords) {
    const date = getDateKey(new Date(record.recordTime));

    if (!dailyRecords[date]) {
      dailyRecords[date] = [];
    }

    dailyRecords[date].push(record);
  }

  let monthlyMilliseconds = 0;

  for (const [date, dayRecords] of Object.entries(dailyRecords)) {
    dayRecords.sort((a, b) =>
      new Date(a.recordTime) - new Date(b.recordTime)
    );

    // Count an unmatched punch only if it belongs to today
    const includeOngoing = date === getDateKey(now);

    monthlyMilliseconds += calculateDuration(
      dayRecords,
      now,
      includeOngoing
    );
  }

  console.log('\n========== MONTHLY ATTENDANCE ==========');
  console.log('Month:', currentMonth);
  console.log('Total Working Hours:', formatDuration(monthlyMilliseconds));
  console.log('Total Days With Punches:', Object.keys(dailyRecords).length);
}

async function main() {
  try {
    console.log('Connecting to ZKTeco...');

    await device.createSocket();

    console.log('Connected successfully.');

    const result = await device.getAttendances();

    if (result.err) {
      throw result.err;
    }

    const myRecords = (result.data || [])
      .filter(record =>
        String(record.deviceUserId) === MY_DEVICE_USER_ID
      );

    console.log('Your attendance records:', myRecords.length);

    const now = new Date();

    getTodayHours(myRecords, now);
    getMonthlyHours(myRecords, now);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    try {
      await device.disconnect();
      console.log('\nDisconnected from device.');
    } catch (error) {
      console.error('Disconnect error:', error.message);
    }
  }
}

main();
