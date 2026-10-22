// A date and time in Philippine time, like the rest of the app:
// "Oct 22, 2026, 2:41 PM".
export default function formatDate(value) {
  return new Date(value).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}
