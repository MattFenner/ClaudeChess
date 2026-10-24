# claude-chess

A Claude Code plugin marketplace for chess plugins.

## Plugins

None yet.

## Add the marketplace

At the prompt of a Claude Code terminal session:

```
/plugin marketplace add MattFenner/ClaudeChess
```

Or from a shell:

```bash
claude plugin marketplace add MattFenner/ClaudeChess
```

In the desktop app: click + next to the prompt box, then Plugins, then Add
marketplace with `MattFenner/ClaudeChess`.

Then install a plugin from it with `/plugin install <plugin>@claude-chess`.

## Adding a plugin

Put the plugin in its own folder and list it under `plugins` in
`.claude-plugin/marketplace.json`, with `source` as the folder's path relative
to the repository root (e.g. `"./plugins/my-plugin"`). Check it with:

```bash
claude plugin validate .
```
