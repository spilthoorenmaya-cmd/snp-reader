import {test} from 'node:test';import {strict as assert} from 'node:assert';
// The module's UI bindings are intentionally browser-only. Extract just the pure parser for testing.
import {readFileSync} from 'node:fs';import vm from 'node:vm';
const source=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8');
const parserSource=source.slice(source.indexOf('function splitCsv'),source.indexOf('async function unzip')).replace('export function parseDNA','function parseDNA');
const context=vm.createContext({Map,Error});vm.runInContext(parserSource+';globalThis.parseDNA=parseDNA',context);const parseDNA=context.parseDNA;
test('23andMe tab-separated genotype file',()=>{const r=parseDNA('# build 37\n# rsid\tchromosome\tposition\tgenotype\nrs1815739\t11\t66328095\tCT\nrs1800562\t6\t26093141\t--');assert.equal(r.records.get('rs1815739').genotype,'CT');assert.equal(r.records.get('rs1800562').genotype,'--');assert.equal(r.build,'37')});
test('MyHeritage CSV with result column',()=>{const r=parseDNA('# MyHeritage\nRSID,CHROMOSOME,POSITION,RESULT\n"rs4988235","2","136608646","AG"');assert.equal(r.records.get('rs4988235').genotype,'AG');assert.equal(r.format,'MyHeritage CSV')});
test('MyHeritage tab-separated 5 columns',()=>{const r=parseDNA('rsid\tchromosome\tposition\tallele1\tallele2\nrs1815739\t11\t66328095\tC\tT');assert.equal(r.records.get('rs1815739').genotype,'CT')});
test('reject unsupported input',()=>assert.throws(()=>parseDNA('hello world')));
