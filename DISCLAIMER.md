# Disclaimer

**Not affiliated with TypeSafe.** Jev Civilizations is an independent demonstration project. It is not
affiliated with, sponsored by, or endorsed by TypeSafe or the developers of the Jev model. "TypeSafe" and "Jev"
are names or trademarks of their respective owners and are used only to identify the API this software calls.

**Your API key, your costs.** Live play sends requests to TypeSafe's API using a key *you* provide. You are
responsible for obtaining that key, complying with TypeSafe's terms of service and usage policies, and any charges
incurred. A typical turn uses on the order of 10,000–12,000 input tokens; match length and retries change the total.
Keep your key server-side only (see `SECURITY.md`); never commit it.

**Model output.** Tribe decisions in live games come from a third-party AI model. The game executes the model's
highest-probability legal action exactly as returned; the maintainers make no claim that these decisions are optimal,
consistent between runs, or representative of how the model behaves in other contexts. The decision inspector shows
the exact input and output so you can judge for yourself. Mock-mode games use a local test policy and are labeled
"Mock simulation"; they are not Jev output.

**Fiction.** The tribes, events, and rules are fictional game mechanics. They make no claims about real societies,
cultures, ecology, history, or biological evolution.

**No warranty.** The software is provided "as is", without warranty of any kind, as stated in `LICENSE`. It is a
demonstration, not production-hardened infrastructure: the supported deployment is a single Node.js instance with
local SQLite storage, and the operator is responsible for securing, backing up, and monitoring any deployment.

**Data.** The app stores game state and anonymous session identifiers (hashed) in a local SQLite file. It does not
collect personal information, use analytics, or contact any service other than the TypeSafe API. Exports contain
game data and the exact model requests and responses, but never keys, cookies, or session identifiers.
