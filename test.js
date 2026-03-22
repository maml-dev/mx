import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

function mx(input, ...args) {
  return spawnSync('node', ['index.js', ...args], {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
  })
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
