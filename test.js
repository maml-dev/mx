import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function mx(input, ...args) {
  return spawnSync('node', ['index.js', ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })
}

let tmpCounter = 0
function tmpFile(content) {
  const file = path.join(os.tmpdir(), `mx-test-${process.pid}-${tmpCounter++}.json`)
  fs.writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content))
  return file
}

describe('print', () => {
  test('object', () => {
    const { stdout } = mx({ greeting: 'hello world' })
    assert.equal(stdout, '{\n  "greeting": "hello world"\n}\n')
  })

  test('array', () => {
    const { stdout } = mx([1, 2, 3])
    assert.equal(stdout, '[\n  1\n  2\n  3\n]\n')
  })
})

describe('query', () => {
  test('.prop', () => {
    const { stdout } = mx({ name: 'hello' }, '.name')
    assert.equal(stdout, '"hello"\n')
  })

  test('.prop.nested', () => {
    const { stdout } = mx({ a: { b: 'value' } }, '.a.b')
    assert.equal(stdout, '"value"\n')
  })

  test('.array[index]', () => {
    const { stdout } = mx([10, 20, 30], '.[1]')
    assert.equal(stdout, '20\n')
  })

  test('.prop.array[index]', () => {
    const { stdout } = mx({ items: [10, 20, 30] }, '.items[1]')
    assert.equal(stdout, '20\n')
  })

  test('.prop.array[index].value', () => {
    const { stdout } = mx(
      { data: { list: [{ x: 1 }, { x: 2 }] } },
      '.data.list[1].x',
    )
    assert.equal(stdout, '2\n')
  })

  test('nested objects', () => {
    const { stdout } = mx({ a: { b: { c: { d: 42 } } } }, '.a.b.c.d')
    assert.equal(stdout, '42\n')
  })

  test('returns sub-object', () => {
    const { stdout } = mx({ a: { b: 1 } }, '.a')
    assert.equal(stdout, '{\n  "b": 1\n}\n')
  })

  test('returns sub-array', () => {
    const { stdout } = mx({ a: [1, 2] }, '.a')
    assert.equal(stdout, '[\n  1\n  2\n]\n')
  })
})

describe('iterate', () => {
  test('.[] returns all elements', () => {
    const { stdout } = mx([1, 2, 3], '.[]')
    assert.equal(stdout, '[\n  1\n  2\n  3\n]\n')
  })

  test('.[].prop maps over array', () => {
    const { stdout } = mx([{ name: 'a' }, { name: 'b' }], '.[].name')
    assert.equal(stdout, '[\n  "a"\n  "b"\n]\n')
  })

  test('.prop[].nested maps over nested array', () => {
    const { stdout } = mx({ users: [{ name: 'a' }, { name: 'b' }] }, '.users[].name')
    assert.equal(stdout, '[\n  "a"\n  "b"\n]\n')
  })

  test('chained [] flattens', () => {
    const { stdout } = mx([{ tags: ['a', 'b'] }, { tags: ['c'] }], '.[].tags[]')
    assert.equal(stdout, '[\n  "a"\n  "b"\n  "c"\n]\n')
  })

  test('missing property yields null while iterating', () => {
    const { stdout } = mx([{ name: 'a' }, { none: 1 }], '.[].name')
    assert.equal(stdout, '[\n  "a"\n  null\n]\n')
  })

  test('empty array yields empty array', () => {
    const { stdout } = mx([], '.[]')
    assert.equal(stdout, '[]\n')
  })

  test('mapping over empty array yields empty array', () => {
    const { stdout } = mx({ users: [] }, '.users[].name')
    assert.equal(stdout, '[]\n')
  })

  test('null propagates through deeper access', () => {
    const { stdout } = mx([{ a: { b: 1 } }, { x: 1 }], '.[].a.b')
    assert.equal(stdout, '[\n  1\n  null\n]\n')
  })

  test('out-of-bounds index yields null while iterating', () => {
    const { stdout } = mx([[1], [2, 3]], '.[][1]')
    assert.equal(stdout, '[\n  null\n  3\n]\n')
  })

  test('.[][] flattens two levels', () => {
    const { stdout } = mx([[1, 2], [3]], '.[][]')
    assert.equal(stdout, '[\n  1\n  2\n  3\n]\n')
  })

  test('error on type mismatch while iterating', () => {
    const { status, stderr } = mx([1, 2], '.[].name')
    assert.equal(status, 1)
    assert.match(stderr, /Cannot access .name on Integer/)
  })

  test('error iterating non-array', () => {
    const { status, stderr } = mx({ a: 1 }, '.[]')
    assert.equal(status, 1)
    assert.match(stderr, /Cannot iterate \[] on Object/)
  })

  test('error assigning through []', () => {
    const { status, stderr } = mx([{ x: 1 }], '.[].x = 5')
    assert.equal(status, 1)
    assert.match(stderr, /Cannot assign through \[] iteration/)
  })

  // File input runs synchronously (no stdin await), so it exercises the
  // null-yielding lenient path during module load — guards the NULL TDZ bug.
  test('lenient null works with file input', () => {
    const file = tmpFile([{ name: 'a' }, { none: 1 }])
    const { status, stdout } = mx('', file, '.[].name')
    assert.equal(status, 0)
    assert.equal(stdout, '[\n  "a"\n  null\n]\n')
  })
})

describe('assign', () => {
  test('replaces scalar', () => {
    const { stdout } = mx({ a: 1 }, '.a = 42')
    assert.equal(stdout, '{\n  "a": 42\n}\n')
  })

  test('no spaces around =', () => {
    const { stdout } = mx({ a: 1 }, '.a=42')
    assert.equal(stdout, '{\n  "a": 42\n}\n')
  })

  test('replaces nested with array', () => {
    const { stdout } = mx({ a: { b: 0 } }, '.a.b = [1, 2, 3]')
    assert.equal(stdout, '{\n  "a": {\n    "b": [\n      1\n      2\n      3\n    ]\n  }\n}\n')
  })

  test('replaces array element', () => {
    const { stdout } = mx({ a: [10, 20, 30] }, '.a[0] = 99')
    assert.equal(stdout, '{\n  "a": [\n    99\n    20\n    30\n  ]\n}\n')
  })

  test('error on missing property', () => {
    const { status, stderr } = mx({ a: 1 }, '.nope = 1')
    assert.equal(status, 1)
    assert.match(stderr, /Property "nope" not found/)
  })
})

describe('save', () => {
  test('writes result back to file', () => {
    const file = tmpFile({ a: 1, b: { c: [10, 20, 30] } })
    const { stdout } = mx('', file, '.b.c[0] = 99', 'save')
    const onDisk = fs.readFileSync(file, 'utf8')
    assert.equal(onDisk, '{\n  "a": 1\n  "b": {\n    "c": [\n      99\n      20\n      30\n    ]\n  }\n}\n')
    assert.equal(onDisk, stdout)
  })

  test('saves narrowed subtree', () => {
    const file = tmpFile({ a: 1, b: { c: 2 } })
    mx('', file, '.b', 'save')
    assert.equal(fs.readFileSync(file, 'utf8'), '{\n  "c": 2\n}\n')
  })

  test('error without file', () => {
    const { status, stderr } = mx({ a: 1 }, 'save')
    assert.equal(status, 1)
    assert.match(stderr, /Specify a file/)
  })
})
