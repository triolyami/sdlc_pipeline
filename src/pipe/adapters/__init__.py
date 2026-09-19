"""Adapter registry. `pipe run --mock` swaps agent CLIs for mock."""
from . import devin, opencode, shell, human, mock

REGISTRY = {
    "devin": devin.run,
    "opencode": opencode.run,
    "shell": shell.run,
    "human": human.run,
    "mock": mock.run,
}

MOCK_OVERRIDES = {"devin": "mock", "opencode": "mock"}
