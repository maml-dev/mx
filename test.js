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
