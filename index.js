#!/usr/bin/env node
import fs from 'node:fs'
import process from 'node:process'
import { parse, print } from 'maml-ast'

const NULL = { type: 'Null', value: null }

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

void (async function main() {
  let flagHelp = false
  const args = []
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') flagHelp = true
    else args.push(arg)
  }

  if (flagHelp || (args.length === 0 && process.stdin.isTTY)) {
    return printUsage()
  }

  const theme = process.stdout.isTTY
    ? ['', '1;34', '32', '36', '35', '38;5;243']
    : ['', '', '', '', '', '']
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

  let input
  let filename
  if (args.length > 0) {
    filename = isFile(fs, args[0])
      ? args.shift()
      : isFile(fs, args.at(-1))
        ? args.pop()
        : undefined
    if (filename) {
      input = fs.readFileSync(filename, 'utf8')
    }
  }
  if (input === undefined) {
    input = await readStdin()
  }

  const doc = parse(input)
  reduce(doc, args, colors, filename)
})()

function parseSteps(path) {
  const steps = []
  const re = /\.([a-zA-Z_][a-zA-Z_0-9]*)|\.?\[(\d+)]|\.?\[]/g
  let m
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) steps.push({ type: 'prop', name: m[1] })
    else if (m[2] !== undefined) steps.push({ type: 'index', index: Number(m[2]) })
    else steps.push({ type: 'iter' })
  }
  return steps
}

// Wrap value nodes into a synthetic Array node so output stays valid MAML.
function arrayNode(values) {
  return {
    type: 'Array',
    elements: values.map((value) => ({
      value,
      leadingComments: [],
      trailingComment: null,
      emptyLineBefore: false,
    })),
    danglingComments: [],
  }
}

// Descend one step into a node, returning the child's value node. When
// `lenient` is set (during iteration), missing properties or indices yield
// null instead of throwing, matching jq's behaviour.
function descend(current, step, lenient) {
  if (current.type === 'Document') current = current.value
  if (lenient && current.type === 'Null') return NULL
  if (step.type === 'prop') {
    if (current.type !== 'Object')
      throw new Error(`Cannot access .${step.name} on ${current.type}`)
    const prop = current.properties.find((p) => p.key.value === step.name)
    if (!prop) {
      if (lenient) return NULL
      throw new Error(`Property "${step.name}" not found`)
    }
    return prop.value
  } else {
    if (current.type !== 'Array')
      throw new Error(`Cannot access [${step.index}] on ${current.type}`)
    const el = current.elements[step.index]
    if (!el) {
      if (lenient) return NULL
      throw new Error(`Index ${step.index} out of bounds`)
    }
    return el.value
  }
}

function query(node, path) {
  let nodes = [node]
  let iterated = false
  for (const step of parseSteps(path)) {
    if (step.type === 'iter') {
      const next = []
      for (let current of nodes) {
        if (current.type === 'Document') current = current.value
        if (current.type !== 'Array')
          throw new Error(`Cannot iterate [] on ${current.type}`)
        for (const el of current.elements) next.push(el.value)
      }
      nodes = next
      iterated = true
    } else {
      nodes = nodes.map((current) => descend(current, step, iterated))
    }
  }
  return iterated ? arrayNode(nodes) : nodes[0]
}

// Assign a parsed maml value to the node at `path`, mutating in place.
function assign(node, path, valueText) {
  const steps = parseSteps(path)
  if (steps.length === 0) throw new Error('Cannot assign to root')
  if (steps.some((s) => s.type === 'iter'))
    throw new Error('Cannot assign through [] iteration')

  let value = parse(valueText)
  if (value.type === 'Document') value = value.value

  let current = node
  for (let k = 0; k < steps.length - 1; k++)
    current = descend(current, steps[k])
  if (current.type === 'Document') current = current.value

  const last = steps[steps.length - 1]
  if (last.type === 'prop') {
    if (current.type !== 'Object')
      throw new Error(`Cannot access .${last.name} on ${current.type}`)
    const prop = current.properties.find((p) => p.key.value === last.name)
    if (!prop) throw new Error(`Property "${last.name}" not found`)
    prop.value = value
  } else {
    if (current.type !== 'Array')
      throw new Error(`Cannot access [${last.index}] on ${current.type}`)
    const el = current.elements[last.index]
    if (!el) throw new Error(`Index ${last.index} out of bounds`)
    el.value = value
  }

  return node
}

function reduce(json, args, colors, filename) {
  let i,
    code,
    output = json
  for ([i, code] of args.entries())
    try {
      if (code === 'save') {
        if (!filename)
          throw new Error(
            'Specify a file as the first argument to be able to save: mx file.json ...',
          )
        fs.writeFileSync(filename, print(output) + '\n')
      } else {
        const m = code.match(/^(\.[^=\s]*)\s*=\s*([\s\S]+)$/)
        if (m) output = assign(output, m[1], m[2])
        else output = query(output, code)
      }
    } catch (err) {
      printErr(err)
    }

  console.log(print(output, { colors }))

  function printErr(err) {
    let pre = args.slice(0, i).join(' ')
    let post = args.slice(i + 1).join(' ')
    if (pre.length > 20) pre = '...' + pre.substring(pre.length - 20)
    if (post.length > 20) post = post.substring(0, 20) + '...'
    console.error(
      `\n  ${pre} ${code} ${post}\n` +
        `  ${' '.repeat(pre.length + 1)}${'^'.repeat(code.length)}\n` +
        `\n${err.stack || err}`,
    )
    process.exit(1)
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

function printUsage() {
  const usage = `Usage
  mx [flags] [code...]

Flags
  -h, --help    print help`
  console.log(usage)
}
