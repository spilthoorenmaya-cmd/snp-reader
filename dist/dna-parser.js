/**
 * Pure, privacy-preserving parsers for 23andMe and MyHeritage text exports.
 * No network, DOM, storage, or raw-DNA logging.
 */
const NO_CALLS = new Set(['--', '00']);
const GENOTYPE = /^(?:[ACGT]{1,2}|--|00|II|DD|ID|DI)$/;
const RSID = /^rs[1-9]\d*$/i;
const CHROMOSOME = /^(?:[1-9]|1\d|2[0-2]|X|Y|MT|M)$/i;

export function normalizeGenotype(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!GENOTYPE.test(raw)) return null;
  // Heterozygous calls are unphased: "CA" and "AC" mean the same thing.
  return /^[ACGT]{2}$/.test(raw) ? [...raw].sort().join('') : raw;
}
export function normalizeChromosome(value) {
  const chr = String(value ?? '').trim().replace(/^chr/i, '').toUpperCase();
  return chr === 'M' ? 'MT' : CHROMOSOME.test(chr) ? chr : null;
}
export function isCalledDiploidSnp(genotype) {
  return /^[ACGT]{2}$/.test(String(genotype || ''));
}
export function isNoCall(genotype) {
  return NO_CALLS.has(String(genotype || '').toUpperCase());
}
export function parseDelimited(line, delimiter) {
  if (delimiter !== ',') return line.split(delimiter).map(x => x.trim());
  const out = [];
  let value = '', inside = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inside && line[i + 1] === '"') { value += '"'; i++; }
      else inside = !inside;
    } else if (line[i] === ',' && !inside) {
      out.push(value.trim()); value = '';
    } else value += line[i];
  }
  if (inside) throw Error('Malformed CSV: unclosed quoted field.');
  out.push(value.trim());
  return out;
}
const headerName = s => String(s || '').trim().replace(/^#\s*/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
function parseBuild(comment) {
  const match = comment.match(/\b(?:genome\s+)?(?:build|grch)\s*[:=#-]?\s*(3[78])\b/i);
  return match?.[1] ?? '';
}
function detectDelimiter(line) {
  if (line.includes('\t')) return '\t';
  if (line.includes(',')) return ',';
  // Some exports are space-delimited; do not split arbitrary free-form text.
  if (/^(?:#\s*)?rsid\s+chromosome\s+position\s+/i.test(line)) return /\s+/;
  return null;
}
/**
 * Returns {records: Map, format, build, skipped, duplicates, conflicts}.
 * Conflicting duplicate rsIDs are discarded, never silently overwritten.
 */
export function parseDNA(text) {
  if (typeof text !== 'string') throw Error('Expected a raw DNA text file.');
  const records = new Map(), conflicted = new Set();
  let delimiter = null, header = null, format = '', build = '';
  let skipped = 0, duplicates = 0, conflicts = 0, started = false;
  for (const raw of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const found = parseBuild(line);
      if (found) {
        if (build && build !== found) build = ''; // Ambiguous build: do not infer.
        else if (!build) build = found;
      }
      if (!/^#\s*rsid(?:\s|,|\t)/i.test(line)) continue;
    }
    const candidate = line.replace(/^#\s*(?=rsid(?:\s|,|\t))/i, '');
    if (!delimiter) delimiter = detectDelimiter(candidate);
    if (!delimiter) {
      if (!started) throw Error('Unrecognized format: expected a 23andMe/MyHeritage tab- or comma-separated raw DNA file.');
      skipped++; continue;
    }
    let columns;
    try { columns = parseDelimited(candidate, delimiter); }
    catch { skipped++; continue; }
    if (columns.length < 4) { skipped++; continue; }
    const names = columns.map(headerName);
    if (names[0] === 'rsid' && names.includes('chromosome') && names.includes('position')) {
      header = names;
      const alleleColumns = names.includes('allele1') && names.includes('allele2');
      if (!alleleColumns && !names.includes('genotype') && !names.includes('result')) {
        throw Error('DNA header is missing genotype/result or allele1/allele2 columns.');
      }
      format = alleleColumns ? 'MyHeritage 5-column' : delimiter === ',' ? 'MyHeritage CSV' : '23andMe / TSV';
      started = true;
      continue;
    }
    started = true;
    let id, chr, pos, genotype;
    if (header) {
      const at = name => columns[header.indexOf(name)];
      id = at('rsid'); chr = at('chromosome'); pos = at('position');
      genotype = header.includes('genotype') ? at('genotype')
        : header.includes('result') ? at('result')
        : String(at('allele1') ?? '') + String(at('allele2') ?? '');
    } else {
      [id, chr, pos, genotype] = columns;
      format ||= delimiter === ',' ? 'CSV' : '23andMe / TSV';
    }
    id = String(id ?? '').trim().toLowerCase();
    const chromosome = normalizeChromosome(chr);
    const position = String(pos ?? '').trim();
    const call = normalizeGenotype(genotype);
    if (!RSID.test(id) || !chromosome || !/^[1-9]\d*$/.test(position) || !call) {
      skipped++; continue;
    }
    if (conflicted.has(id)) { duplicates++; continue; }
    const entry = {id, chr: chromosome, pos: position, genotype: call};
    const previous = records.get(id);
    if (previous) {
      duplicates++;
      if (previous.chr !== entry.chr || previous.pos !== entry.pos || previous.genotype !== entry.genotype) {
        records.delete(id); conflicted.add(id); conflicts++;
      }
      continue;
    }
    records.set(id, entry);
  }
  if (!records.size) throw Error('No valid rsID genotype rows found. Check your original 23andMe or MyHeritage raw DNA export.');
  return {records, format, build, skipped, duplicates, conflicts};
}
