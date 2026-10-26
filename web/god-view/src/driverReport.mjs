// A driver's trip records as a PDF, downloaded from their account's page in
// God view: who they are (name, mobile number, email, plate, TODA, status),
// their rating, their totals for the time frame the admin chose, and each trip
// booked in it. Built from /api/admin/accounts/<id>?days=<days> by pdf.mjs.
import { A4, createPdf, fitText, textWidth } from './pdf.mjs';
import { cancellationLabel, formatDistance, formatPhone, statusLabel } from './model.mjs';

// Dates and times in the pilot's time zone, whatever the admin's computer uses.
const ZONE = 'Asia/Manila';
const dayFormat = new Intl.DateTimeFormat('en-PH', { timeZone: ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('en-PH', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const day = value => dayFormat.format(new Date(value));
const time = value => timeFormat.format(new Date(value));

// The standard PDF fonts have no ₱, so fares read "PHP 1,250.50".
export const pesos = fare => Number.isFinite(fare) ? `PHP ${fare.toLocaleString('en-PH', { maximumFractionDigits: 2 })}` : '—';

// A driver's status as the PDF names it: Registered (approved by an admin,
// or from before approval), Pending (waiting for an admin to check them
// against their TODA's list) or Suspended. note says more.
export function driverStanding(account) {
  if (account.approval === 'Suspended') {
    return { label: 'Suspended', note: [account.terminatedAt ? `Since ${day(account.terminatedAt)}` : '', account.terminationReason].filter(Boolean).join(' · ') || 'Cannot sign in or take bookings' };
  }
  if (account.approval === 'Pending') return { label: 'Pending', note: "Waiting for an admin to check the TODA's list" };
  return { label: 'Registered', note: 'Approved to take bookings' };
}

// "indanggo-ana-cruz-trips-last-7-days-2026-10-27.pdf"
export function reportFilename(account, days, generatedAt) {
  const name = account.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'driver';
  return `indanggo-${name}-trips-last-${days}-days-${isoDay.format(new Date(generatedAt))}.pdf`;
}

const COLORS = { ink: '#20352f', muted: '#78857f', line: '#e4eae6', band: '#123c32', bandText: '#cfe0d6', soft: '#f4f6f5', head: '#eef2ef', stripe: '#f8faf9',
  green: '#1c825f', amber: '#a17836', red: '#b4443a' };
const STANDING_COLORS = { Registered: ['#e6f2ec', '#1c6b4c'], Pending: ['#fbf3e2', COLORS.amber], Suspended: ['#fcebe8', COLORS.red] };
const STATUS_COLORS = { Completed: COLORS.green, Cancelled: COLORS.red, Ongoing: COLORS.amber, 'No driver': COLORS.muted };
const MARGIN = 40, WIDTH = A4.width - 2 * MARGIN, ROW = 26, BOTTOM = A4.height - 60;
const COLUMNS = [['Booked', 58], ['Trip', 64], ['Route', 130], ['Passenger', 76], ['Fare', 56], ['Status', 70], ['Rating', WIDTH - 454]];

// "Friendly +2": a rating's first quick tag, and how many more it has.
const tagsNote = tags => tags.length > 1 ? `${tags[0]} +${tags.length - 1}` : tags[0] || '';

// Each trip's row: per column, a main line and a note under it.
function tripCells(trip) {
  const completed = trip.status === 'Completed', ended = ['Completed', 'Cancelled'].includes(trip.status);
  const rating = trip.rating
    ? [{ text: `${trip.rating.stars} / 5`, font: 'bold' }, trip.rating.flagged ? { text: 'Safety report', color: COLORS.red } : { text: tagsNote(trip.rating.tags) }]
    : [{ text: trip.with && ended ? 'Not rated' : '—', color: COLORS.muted }, null];
  return [
    [{ text: day(trip.date) }, { text: time(trip.date) }],
    [{ text: trip.id }, { text: Number.isFinite(trip.distanceMeters) ? formatDistance(trip.distanceMeters) : '' }],
    [{ text: trip.pickup }, { text: `to ${trip.destination}` }],
    [{ text: trip.with || '—', color: trip.with ? COLORS.ink : COLORS.muted }, { text: trip.passengers ? `${trip.passengers} passenger${trip.passengers === 1 ? '' : 's'}` : '' }],
    [{ text: pesos(trip.fare), color: completed ? COLORS.ink : COLORS.muted }, { text: completed ? '' : trip.status === 'Ongoing' ? 'Not yet earned' : 'Not earned' }],
    [{ text: trip.status, font: 'bold', color: STATUS_COLORS[trip.status] || COLORS.ink },
      { text: trip.status === 'Cancelled' ? cancellationLabel(trip) : trip.status === 'Ongoing' ? statusLabel({ status: trip.stage }) : '' }],
    rating,
  ];
}

// data: an account's trip history for a period (admin.js history()), of a
// driver. generatedAt: the server's time now. Returns the file and its name.
export function driverReport(data, { generatedAt }) {
  const { account, summary, trips, period } = data, days = period.days;
  const pdf = createPdf({ title: `${account.name} – trip records, last ${days} days` });
  const periodLabel = `Last ${days} days`, range = `${day(period.since)} – ${day(generatedAt)}`;
  const standing = driverStanding(account);
  const label = (value, x, top) => pdf.text(value.toUpperCase(), x, top, { font: 'bold', size: 7, color: COLORS.muted });

  // The band, the driver, and their details.
  pdf.addPage();
  pdf.rect(0, 0, A4.width, 72, { fill: COLORS.band });
  pdf.text('IndangGO', MARGIN, 33, { font: 'bold', size: 17, color: '#ffffff' });
  pdf.text('Driver trip records', MARGIN, 51, { size: 9.5, color: COLORS.bandText });
  pdf.text(periodLabel, A4.width - MARGIN, 33, { font: 'bold', size: 11, color: '#ffffff', align: 'right' });
  pdf.text(range, A4.width - MARGIN, 51, { size: 9, color: COLORS.bandText, align: 'right' });
  const name = fitText(account.name, WIDTH - 110, 'bold', 20);
  pdf.text(name, MARGIN, 110, { font: 'bold', size: 20 });
  const [chipFill, chipText] = STANDING_COLORS[standing.label];
  const chipX = MARGIN + textWidth(name, 'bold', 20) + 10, chipWidth = textWidth(standing.label, 'bold', 8.5) + 16;
  pdf.rect(chipX, 95, chipWidth, 18, { fill: chipFill });
  pdf.text(standing.label, chipX + chipWidth / 2, 107.5, { font: 'bold', size: 8.5, color: chipText, align: 'center' });
  pdf.text(['Driver account', account.joined ? `Joined ${day(account.joined)}` : ''].filter(Boolean).join(' · '), MARGIN, 128, { size: 9, color: COLORS.muted });

  const rated = trips.filter(trip => trip.rating), periodAverage = rated.length ? rated.reduce((sum, trip) => sum + trip.rating.stars, 0) / rated.length : null;
  const rating = account.rating?.average ?? null;
  const half = WIDTH / 2, gridTop = 142;
  const details = [
    [['Mobile number', formatPhone(account.id)], ['Plate number', account.plate || 'None given']],
    [['Email', account.email || 'None given'], ['TODA', account.toda || 'None given']],
    [['Status', standing.label, standing.note],
      ['Rating', rating === null ? 'No ratings yet' : `${rating.toFixed(1)} out of 5 · ${account.rating.count} rating${account.rating.count === 1 ? '' : 's'}`,
        periodAverage === null ? 'No ratings in this period' : `In this period: ${periodAverage.toFixed(1)} from ${rated.length} rating${rated.length === 1 ? '' : 's'}`]],
  ];
  const gridHeight = details.length * 40 + 16;
  pdf.rect(MARGIN, gridTop, WIDTH, gridHeight, { stroke: COLORS.line });
  pdf.line(MARGIN + half, gridTop + 12, MARGIN + half, gridTop + gridHeight - 12);
  details.forEach((row, index) => row.forEach(([title, value, note], column) => {
    const x = MARGIN + column * half + 14, top = gridTop + 18 + index * 40, width = half - 28;
    label(title, x, top);
    pdf.text(fitText(value, width, 'regular', 10.5), x, top + 14, { size: 10.5 });
    if (note) pdf.text(fitText(note, width, 'regular', 8), x, top + 26, { size: 8, color: COLORS.muted });
  }));

  // The totals for the period.
  const tilesTop = gridTop + gridHeight + 16, tileWidth = (WIDTH - 3 * 8) / 4;
  const tiles = [
    ['Total trips', String(summary.trips), summary.ongoing ? `${summary.ongoing} still ongoing` : 'Booked in this period'],
    ['Completed', String(summary.completed), 'Reached the destination'],
    ['Cancelled', String(summary.cancelled + summary.noDriver), 'Passenger, driver or admin'],
    ['Fares earned', pesos(summary.fares), 'From completed trips'],
  ];
  tiles.forEach(([title, value, note], index) => {
    const x = MARGIN + index * (tileWidth + 8);
    pdf.rect(x, tilesTop, tileWidth, 60, { fill: COLORS.soft });
    label(title, x + 12, tilesTop + 17);
    pdf.text(fitText(value, tileWidth - 24, 'bold', 16), x + 12, tilesTop + 38, { font: 'bold', size: 16 });
    pdf.text(fitText(note, tileWidth - 24, 'regular', 7.5), x + 12, tilesTop + 51, { size: 7.5, color: COLORS.muted });
  });

  // The trips, newest first, under a header repeated on each page.
  const headingTop = tilesTop + 88;
  pdf.text('Trip records', MARGIN, headingTop, { font: 'bold', size: 12 });
  pdf.text(`${trips.length} trip${trips.length === 1 ? '' : 's'} · times are when each was booked, in Philippine time`, A4.width - MARGIN, headingTop, { size: 8, color: COLORS.muted, align: 'right' });
  const tableHeader = top => {
    pdf.rect(MARGIN, top, WIDTH, 20, { fill: COLORS.head });
    let x = MARGIN;
    for (const [title, width] of COLUMNS) { label(title, x + 5, top + 13); x += width; }
    return top + 20;
  };
  let top = headingTop + 10;
  if (!trips.length) {
    pdf.rect(MARGIN, top, WIDTH, 48, { stroke: COLORS.line });
    pdf.text(`No trips were booked with this driver in the last ${days} days.`, A4.width / 2, top + 28, { size: 9.5, color: COLORS.muted, align: 'center' });
  } else top = tableHeader(top);
  trips.forEach((trip, index) => {
    if (top + ROW > BOTTOM) {
      pdf.addPage();
      pdf.text('IndangGO · Driver trip records', MARGIN, 40, { font: 'bold', size: 8, color: COLORS.green });
      pdf.text(`${account.name} · ${periodLabel} · ${range}`, A4.width - MARGIN, 40, { size: 8, color: COLORS.muted, align: 'right' });
      top = tableHeader(52);
    }
    if (index % 2) pdf.rect(MARGIN, top, WIDTH, ROW, { fill: COLORS.stripe });
    let x = MARGIN;
    tripCells(trip).forEach(([main, note], column) => {
      const width = COLUMNS[column][1] - 8;
      pdf.text(fitText(main.text, width, main.font || 'regular', 8.5), x + 5, top + 11, { font: main.font || 'regular', size: 8.5, color: main.color || COLORS.ink });
      if (note?.text) pdf.text(fitText(note.text, width, 'regular', 7), x + 5, top + 21, { size: 7, color: note.color || COLORS.muted });
      x += COLUMNS[column][1];
    });
    top += ROW;
    pdf.line(MARGIN, top, MARGIN + WIDTH, top);
  });
  // The server lists at most its newest 500 trips; the totals cover them all.
  if (summary.trips > trips.length) {
    if (top + 20 > BOTTOM) { pdf.addPage(); top = 40; }
    pdf.text(`Showing the newest ${trips.length} of ${summary.trips} trips; the totals above cover them all.`, MARGIN, top + 16, { size: 8, color: COLORS.muted });
  }

  // When it was made, that it is private, and the page, on every page.
  const generated = `Generated ${day(generatedAt)}, ${time(generatedAt)} (Philippine time) from IndangGO God view.`;
  for (let page = 1; page <= pdf.pageCount; page += 1) {
    pdf.usePage(page);
    pdf.line(MARGIN, A4.height - 46, A4.width - MARGIN, A4.height - 46);
    pdf.text(generated, MARGIN, A4.height - 33, { size: 7.5, color: COLORS.muted });
    pdf.text('Contains personal information. Keep it private and share it only with people who need it.', MARGIN, A4.height - 23, { size: 7.5, color: COLORS.muted });
    pdf.text(`Page ${page} of ${pdf.pageCount}`, A4.width - MARGIN, A4.height - 33, { size: 7.5, color: COLORS.muted, align: 'right' });
  }
  return { bytes: pdf.toBytes(), filename: reportFilename(account, days, generatedAt) };
}
