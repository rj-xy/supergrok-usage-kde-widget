# AGENTS.md

This repo is public. Never commit sensitive data to it.

- No API keys, tokens, credentials, private keys, emails, real names,
  account/tier/subscription IDs, or anything copied from a live API response
  that is tied to a real account.
- Test fixtures must use obviously fake values (`test-key-123`,
  `dev@example.com`, `12345678901234567`, …), never redacted-looking but
  real values.
- When probing a live API during development, keep raw responses out of the
  repo; only generalized shapes and fake examples may be committed.
