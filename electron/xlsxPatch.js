const JSZip = require('jszip');

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detectCellTag(sheetXml) {
  return sheetXml.includes('<x:c ') ? { open: 'x:c', close: 'x:c', ns: 'x:' } : { open: 'c', close: 'c', ns: '' };
}

function cellContent(patch, ns) {
  if (patch.type === 'number') return `<${ns}v>${Number(patch.value) || 0}</${ns}v>`;
  return `<${ns}is><${ns}t>${escapeXml(patch.value)}</${ns}t></${ns}is>`;
}

function cellAttrs(existingAttrs, patch) {
  const styleMatch = existingAttrs.match(/\ss="(\d+)"/);
  const style = styleMatch ? ` s="${styleMatch[1]}"` : '';
  const typeAttr = patch.type === 'string' ? ' t="inlineStr"' : '';
  return `${style}${typeAttr}`;
}

function patchCell(sheetXml, patch, tag) {
  const ref = patch.ref;
  const cTag = tag.open.replace(':', '\\:');
  const emptyCell = new RegExp(`<${cTag} r="${ref}"([^/>]*)/>`);
  const fullCell = new RegExp(`<${cTag} r="${ref}"([^>]*)>(?!/)([\\s\\S]*?)<\\/${cTag}>`);
  const content = cellContent(patch, tag.ns);
  const buildCell = (attrs) => `<${tag.open} r="${ref}"${cellAttrs(attrs, patch)}>${content}</${tag.close}>`;

  if (emptyCell.test(sheetXml)) {
    return sheetXml.replace(emptyCell, (_m, attrs) => buildCell(attrs));
  }
  if (fullCell.test(sheetXml)) {
    return sheetXml.replace(fullCell, (_m, attrs) => buildCell(attrs));
  }
  return sheetXml;
}

async function patchXlsxSheet(buffer, sheetPath, patches) {
  const zip = await JSZip.loadAsync(buffer);
  let sheetXml = await zip.file(sheetPath).async('string');
  const tag = detectCellTag(sheetXml);
  const rowsBefore = (sheetXml.match(/<(?:x:)?row /g) || []).length;

  for (const patch of patches) {
    sheetXml = patchCell(sheetXml, patch, tag);
  }

  const rowsAfter = (sheetXml.match(/<(?:x:)?row /g) || []).length;
  if (rowsAfter !== rowsBefore) {
    throw new Error(`시트 XML 손상 (${rowsBefore}행 → ${rowsAfter}행)`);
  }

  zip.file(sheetPath, sheetXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

module.exports = { patchXlsxSheet };
