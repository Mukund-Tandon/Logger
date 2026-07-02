/**
 * Format a single event as a Server-Sent Events frame (Phase 1.4).
 * `event: <type>\n` + `data: <json>\n\n`. Pure/testable.
 *
 * @param {{type: string, [k: string]: any}} event
 * @returns {string}
 */
function formatSSE(event) {
  const type = event && event.type ? event.type : 'message';
  return `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}

module.exports = { formatSSE };
