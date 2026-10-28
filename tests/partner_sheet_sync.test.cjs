const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function fixture(existing = []) {
  const metadata = [...existing];
  const calls = [];
  const fresh = '00000000-0000-4000-8000-000000000001';
  const key = 'IROUN_PARTNER_SOURCE_UID_V2';
  const context = vm.createContext({
    Date,
    Utilities: { getUuid: () => fresh },
    SpreadsheetApp: { DeveloperMetadataVisibility: { PROJECT: 'PROJECT' } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps_script/partner_sheet_sync.gs'), 'utf8'), context);
  const sheet = {
    getMaxColumns: () => 14,
    getRange(...args) {
      // Reproduce Google's rejection of finite rectangles for row metadata.
      assert.equal(args.length, 1, 'metadata requires a whole-row A1 range');
      assert.match(args[0], /^\d+:\d+$/);
      calls.push(args[0]);
      return {
        getDeveloperMetadata: () => metadata,
        addDeveloperMetadata(k, value, visibility) {
          assert.equal(k, key);
          assert.equal(visibility, 'PROJECT');
          metadata.push({ getKey: () => k, getValue: () => value, remove() {} });
        },
      };
    },
  };
  return { context, sheet, calls, metadata, fresh, key };
}

test('new rows create a UID using a true whole-row range', () => {
  const f = fixture();
  const used = new Set();
  assert.equal(f.context.sourceUid_(f.sheet, 7, used), f.fresh);
  assert.deepEqual(f.calls, ['7:7']);
  assert.equal(used.has(f.fresh), true);
});

test('a moved row keeps its existing UID instead of generating another order', () => {
  const uid = '00000000-0000-4000-8000-000000000099';
  const f = fixture([{ getKey: () => 'IROUN_PARTNER_SOURCE_UID_V2', getValue: () => uid }]);
  assert.equal(f.context.sourceUid_(f.sheet, 18, new Set()), uid);
  assert.equal(f.metadata.length, 1);
});

test('a duplicate UID within one scan is replaced on the copied row', () => {
  const uid = '00000000-0000-4000-8000-000000000099';
  let removed = false;
  const f = fixture([{ getKey: () => 'IROUN_PARTNER_SOURCE_UID_V2', getValue: () => uid, remove: () => { removed = true; } }]);
  assert.equal(f.context.sourceUid_(f.sheet, 19, new Set([uid])), f.fresh);
  assert.equal(removed, true);
});

test('Korean date text is accepted but impossible dates are rejected', () => {
  const f = fixture();
  assert.equal(f.context.dateString_('2026. 11. 4.', {}), '2026-11-04');
  assert.equal(f.context.dateString_('2026-02-30', {}), '');
});
