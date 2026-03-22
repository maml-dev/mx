#!/usr/bin/env node
import fs from 'node:fs'
import process from 'node:process'
import { parse, print } from 'maml-ast'

void (function main() {
  let flagHelp = false
  const args = []
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') flagHelp = true
    else args.push(arg)
  }

  if (flagHelp || (args.length === 0 && process.stdin.isTTY)) {
    return printUsage()
  }

  const theme = themes(process.stdout.isTTY ? process.env.FX_THEME || '1' : '0')
  const color = (x) => (str) => {
    if (theme[x] === '') return str
    return `\x1b[${theme[x]}m${str}\x1b[0m`
  }
  const colors = {
    string: color(2),
    number: color(3),
    boolean: color(4),
    null: color(5),
    key: color(1),
    comment: color(5),
    bracket: color(0),
    colon: color(0),
  }

  let fd = 0 // stdin
  if (args.length > 0) {
    let filename = isFile(fs, args[0])
      ? args.shift()
      : isFile(fs, args.at(-1))
        ? args.pop()
        : false
    if (filename) {
      globalThis.__file__ = filename
      fd = fs.openSync(filename, 'r')
    }
  }

  const doc = parse(fs.readFileSync(fd, 'utf8'))
  reduce(doc, args, colors)
})()

function query(node, path) {
  const steps = []
  const re = /\.([a-zA-Z_][a-zA-Z_0-9]*)|\.?\[(\d+)]/g
  let m
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) steps.push({ type: 'prop', name: m[1] })
    else steps.push({ type: 'index', index: Number(m[2]) })
  }

  let current = node
  for (const step of steps) {
    // Unwrap Document node
    if (current.type === 'Document') current = current.value

    if (step.type === 'prop') {
      if (current.type !== 'Object')
        throw new Error(`Cannot access .${step.name} on ${current.type}`)
      const prop = current.properties.find((p) => p.key.value === step.name)
      if (!prop) throw new Error(`Property "${step.name}" not found`)
      current = prop.value
    } else {
      if (current.type !== 'Array')
        throw new Error(`Cannot access [${step.index}] on ${current.type}`)
      const el = current.elements[step.index]
      if (!el) throw new Error(`Index ${step.index} out of bounds`)
      current = el.value
    }
  }

  return current
}

function reduce(json, args, colors) {
  let i,
    code,
    jsCode,
    output = json
  for ([i, code] of args.entries())
    try {
      jsCode = code
      if (/^\.[a-zA-Z_\[.]/.test(code) || code === '.') {
        output = query(output, code)
      } else {
        const fn = (x) => x
        output = run(output, fn)
      }
    } catch (err) {
      printErr(err)
    }

  if (typeof output === 'undefined') console.error('undefined')
  else if (typeof output === 'string') console.log(output)
  else console.log(print(output, { colors }))

  function printErr(err) {
    let pre = args.slice(0, i).join(' ')
    let post = args.slice(i + 1).join(' ')
    if (pre.length > 20) pre = '...' + pre.substring(pre.length - 20)
    if (post.length > 20) post = post.substring(0, 20) + '...'
    console.error(
      `\n  ${pre} ${code} ${post}\n` +
        `  ${' '.repeat(pre.length + 1)}${'^'.repeat(code.length)}\n` +
        (jsCode !== code ? `\n${jsCode}\n` : ``) +
        `\n${err.stack || err}`,
    )
    process.exit(1)
  }
}

function run(json, code) {
  const fn = code.call(json)

  return apply(fn, json)

  function apply(fn, ...args) {
    if (typeof fn === 'function') return fn(...args)
    return fn
  }

  function save(x) {
    if (!globalThis.__file__)
      throw new Error(
        'Specify a file as the first argument to be able to save: fx file.json ...',
      )
    fs.writeFileSync(globalThis.__file__, JSON.stringify(x, null, 2))
    return x
  }
}

function isFile(fs, path) {
  try {
    const stat = fs.statSync(path, { throwIfNoEntry: false })
    return stat !== undefined && stat.isFile()
  } catch (err) {
    return false
  }
}

function stringify(value, theme) {
  function color(id, str) {
    if (theme[id] === '') return str
    return `\x1b[${theme[id]}m${str}\x1b[0m`
  }

  function getIndent(level) {
    return ' '.repeat(2 * level)
  }

  function stringifyValue(value, level = 0) {
    if (typeof value === 'string') {
      return color(2, JSON.stringify(value))
    } else if (typeof value === 'number') {
      return color(3, `${value}`)
    } else if (typeof value === 'bigint') {
      return color(3, `${value}`)
    } else if (typeof value === 'boolean') {
      return color(4, `${value}`)
    } else if (value === null || typeof value === 'undefined') {
      return color(5, `null`)
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        return color(0, `[]`)
      }
      const items = value
        .map((v) => getIndent(level + 1) + stringifyValue(v, level + 1))
        .join(color(0, ',') + '\n')
      return (
        color(0, '[') + '\n' + items + '\n' + getIndent(level) + color(0, ']')
      )
    } else if (typeof value === 'object') {
      const keys = Object.keys(value)
      if (keys.length === 0) {
        return color(0, '{}')
      }
      const entries = keys
        .map(
          (key) =>
            getIndent(level + 1) +
            color(1, `"${key}"`) +
            color(0, ': ') +
            stringifyValue(value[key], level + 1),
        )
        .join(color(0, ',') + '\n')
      return (
        color(0, '{') + '\n' + entries + '\n' + getIndent(level) + color(0, '}')
      )
    }
    throw new Error(`Unsupported value type: ${typeof value}`)
  }

  return stringifyValue(value)
}

function themes(id) {
  const themes = {
    0: ['', '', '', '', '', ''],
    1: ['', '1;34', '32', '36', '35', '38;5;243'],
    2: ['', '32', '34', '36', '35', '38;5;243'],
    3: ['', '95', '93', '96', '31', '38;5;243'],
    4: ['', '38;5;50', '38;5;39', '38;5;98', '38;5;205', '38;5;243'],
    5: ['', '38;5;230', '38;5;221', '38;5;209', '38;5;209', '38;5;243'],
    6: ['', '38;5;69', '38;5;78', '38;5;221', '38;5;203', '38;5;243'],
    7: ['', '1;38;5;42', '1;38;5;213', '1;38;5;201', '1;38;5;201', '38;5;243'],
    8: ['', '1;38;5;51', '38;5;195', '38;5;123', '38;5;50', '38;5;243'],
    9: ['', '1;38;5;39', '38;5;49', '38;5;220', '38;5;205', '38;5;243'],
    '🔥': [
      '1;38;5;208',
      '1;38;5;202',
      '38;5;214',
      '38;5;202',
      '38;5;196',
      '38;5;243',
    ],
    '🔵': ['1;38;5;33', '38;5;33', '', '', '', ''],
    '🟣': ['', '1;38;5;141', '38;5;183', '38;5;219', '38;5;81', '38;5;243'],
    '🥝': [
      '38;5;179',
      '1;38;5;154',
      '38;5;82',
      '38;5;226',
      '38;5;226',
      '38;5;230',
    ],
  }
  return themes[id] || themes['1']
}

function printUsage() {
  const usage = `Usage
  mx [flags] [code...]

Flags
  -h, --help    print help`
  console.log(usage)
}
