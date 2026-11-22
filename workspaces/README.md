# workspaces/ — private, git-ignored

One folder per real business: `workspaces/<workspace-id>/config.json`, `context.md`, `data/`, `outputs/`.
Everything here except this README and `_template/` is ignored by git: real prospects, client configurations and commercial data never reach the public repository.

- Copy `_template/config.json`, then run `/outbound-setup` to replace **every** value with your own. The template's dictionary, offers and reps are fictional formats, not content.
- One workspace = one commercial entity. The engine refuses to mix records from different `workspaceId`s.
