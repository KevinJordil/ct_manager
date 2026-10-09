/** Quote spreadsheet cells and prevent names from being evaluated as formulas. */
export function csvCell(value) {
  let text = String(value ?? '')
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

export function journalCsv(entries, t) {
  const columns = ['when', 'plate', 'model', 'movement', 'holder', 'recordedBy']
  const rows = [columns.map(key => t(`log.columns.${key}`))]
  for (const entry of entries) {
    const holder = entry.action === 'transferred' && entry.from
      ? t('log.fromTo', { from: entry.from, to: entry.name }) : entry.name
    rows.push([entry.at?.replace('T', ' '), entry.vehiclePlate, entry.vehicleName,
      t(`log.actions.${entry.action}`), holder, entry.recordedBy])
  }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n')
}
