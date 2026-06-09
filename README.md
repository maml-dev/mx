# mx

MAML cli tool. `mx` pretty-prints, queries, and edits [MAML](https://maml.dev) files.

## Install

```bash
npm i -g mx
```

Or run without installing:

```bash
npx mx data.maml
```

## Usage

```
mx [file] [code...]
```

Pipe input or pass a file:

```bash
cat data.maml | mx
mx data.maml
```

## Query

Drill into data with dot notation:

```
.prop            access property
.prop.nested     nested access
.[0]             array index
.items[2].name   mixed access
```

```bash
mx data.maml .users[0].name
cat data.maml | mx .config.server.port
```

## Edit

Assign a MAML value to any path:

```bash
mx data.maml '.config.port = 8080'
mx data.maml '.users[0].roles = ["admin", "dev"]'
```

Edits print to stdout. Add `save` to write back to the file:

```bash
mx data.maml '.config.port = 8080' save
```

## License

[MIT](LICENSE)
