// "romar06.rdc@gmail.com" -> "ro********c@gmail.com": enough for the owner to
// recognise the address without showing it to whoever holds the phone.
function maskEmail(email) {
  const at = email.lastIndexOf('@'), local = email.slice(0, at);
  const head = local.length > 4 ? 2 : 1, tail = local.length > 4 ? 1 : 0;
  return local.slice(0, head) + '*'.repeat(Math.max(1, local.length - head - tail)) + local.slice(local.length - tail) + email.slice(at);
}

module.exports = { maskEmail };
