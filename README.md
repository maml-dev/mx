# mx

MAML CLI tool. Pretty-print and query [MAML](https://maml.dev) files.

## Install

```
npm i -g mx
```

Or run directly:

```
npx mx data.maml
```

## Usage

```
mx [file] [query]
```

Pipe or pass a file:

```bash
cat data.maml | mx
mx data.maml
```

Query nested data with dot notation:

```bash
mx data.maml .users[0].name
cat data.maml | mx .config.server.port
```

## Queries

```
.prop            access property
.prop.nested     nested access
.[0]             array index
.items[2].name   mixed access
```

## License

[MIT](LICENSE)
